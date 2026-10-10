# /vds 看图撑爆请求体：三种组合对比与根治方案

2026-10-10 15:52 CST · 只读排查（V 只读、DeepSeek 实测在 VLab 主机上发起），未改 V，未合入。

## 结论

1. **Tianyi 的判断成立，而且可以更精确：问题出在 Codex 原生 `view_image`，跟 DeepSeek 无关的部分不出问题。**
   V 上 12 天的 rollout 里，/vds 线程的图片一共 380 MB，其中 **339 MB（89%）来自 Codex 原生 view_image**：最长边可达 2048 px，单张最大 13.4 MB，PNG 原样保留。经 OpenClaw 工具进来的图（browser、computer、read、用户发的图）全部 ≤1200 px、≤0.58 MB，因为 OpenClaw 在工具出口统一缩图。9/29 我们已经给 OpenClaw 自己的 view_image 加了每张 1 MB 的上限（PR #105）。但 Codex 插件的 `filterCodexVisionTools` 会在模型有视觉、原生工具面开启时**把 OpenClaw 的 view_image 删掉，换成 Codex 原生那个**，这道限制就被绕过了。
2. **GPT（/vcodex）用的也是同一个原生 view_image，图片同样原样存进 rollout，它并不免疫。** 它没出事有三个原因：
   - OpenAI 的上限高一个数量级（文档写每请求 512 MB）；
   - ChatGPT 后端走 websocket，同一回合内只发增量，发出去的还是 zstd 压缩过的；
   - V 上 GPT 会话 7 天内最大有效历史只有 18 MB。

   它没有用 file_id，也不是服务端存了图。
3. **DeepSeek 是无状态的，每次请求都得整段重发，上限 48 MiB。** 实测：
   - `store` 被强制成 false，`previous_response_id` 被静默忽略，第二轮答「不知道」；
   - gzip 请求体会被拒；
   - 47 MiB 的请求被接收（返回 400 解析错），49 MiB 返回 413。
4. **大图对 DeepSeek 没有用处。** 按官方文档，每张图最多计 1024 token，服务端会缩到约 1300×1300 的总像素。实测同一张 1080×1920 合成帧：

   | 格式 | 大小 | input_tokens | 读出图中两行字 |
   |---|---|---|---|
   | 原 PNG | 2.0 MB | 约 1035 | ✅ |
   | 长边 1568 的 JPEG | 248 KB | 887 | ✅ |
   | 长边 1024 的 JPEG | 85 KB | 426 | ✅ |

   多传的几 MB 字节换不来任何信息，只会占请求体、挤占上行带宽。
5. **推荐分三层做（方案细节见第 3、4 节）：**
   - 第一层（源头）：/vds 线程关掉 Codex 原生 view_image，放回 OpenClaw 的 view_image（≤1200 px、≤1 MB，参数同样是 `path`）。
   - 第二层（保证不超限）：插件按字节做主动原生压缩，让有效历史永远低于 48 MiB。
   - 第三层（兜底）：413 时换新线程并在同一回合重试。

   第一层就能把这次事故的单次请求从约 50 MB 降到约 2 MB；第二层负责保证不变量；第三层只兜底，不作为主路径。

## 1. 三种组合对比

| | OpenClaw 自己的 harness（vlab-worker，deepseek-flash） | Codex + GPT（/vcodex） | Codex + DeepSeek（/vds） |
|---|---|---|---|
| 看图工具 | OpenClaw `view_image` | Codex 原生 view_image（code mode 里经 `exec` 调用） | Codex 原生 view_image（function 工具） |
| 1080×1920 PNG 进历史的形式 | 缩到 ≤1200 px，再压到 ≤1 MB（`view-image-bytes-cap-v1`），inline base64 | **原样 PNG 字节**，inline base64（`input_image`，detail=high）。≤2048 px 且 ≤2500 patch 时不缩放、不转码 | 同左 |
| 一张图的字节（base64） | ≤1.33 MB，通常 0.1–0.4 MB | 2.7–17.9 MB（8 MB PNG 约 10.7 MB） | 同左；V 上最大一张 13.4 MB |
| 后续请求是否重发 | 整段重发（chat completions 无状态），但发送前有两道裁剪：history-image-prune 只保留最近 3 个已完成回合里的图；computer-frame-prune 在窗口内只留最近 2 条带图的工具结果 | 同一回合内走 websocket 增量（`previous_response_id`），线上日志可见 `responses_websocket` 连到 `wss://chatgpt.com/backend-api/codex/responses`。每回合第一次请求（以及增量不匹配时）整段发送，zstd 压缩。旧图一直留在历史里 | **每次采样都整段 POST**（SSE，`store:false`，不压缩），所有旧图每次都重发 |
| 持久化 | agent DB `transcript_events` 里 inline base64，永久保存 | Codex rollout 原样保存。OpenClaw 镜像**不记录** imageView（只记 4 类原生工具） | 同左 |
| 能否靠压缩去掉旧图 | OpenClaw 自己的溢出 → 压缩路径，E3 每张图按 8192 token 计 | 远程压缩 V2 会丢掉工具输出里的图；按 patch 计 token，容易触发压缩 | 本地压缩要把**整段历史连同所有图**发给模型。Codex 估算每张图约 1.8k token，与字节无关，所以 23 万 token 时不触发压缩；超过 48 MiB 后压缩请求本身也会 413 |
| 请求体上限 | DeepSeek 48 MiB | OpenAI 文档写 512 MB | **DeepSeek 48 MiB（实测）** |
| 7 天实测 | — | 946 次请求，有效历史 p99 17.1 MB，最大 18.2 MB，>25 MB 的 0 次 | 10,431 次请求，p99 14.1 MB，最大 48.4 MB（51 MB 那几次被拒，没留下记录），>25 MB 的 56 次，>40 MB 的 26 次，**7 天共上传 14.3 GB** |

## 2. 证据

### 2.1 图片来源（V，12 天，所有 codex-home 的 rollout）

脚本 `rollout-image-dims.py`：解码每张 data URL 的 PNG/JPEG 头，取尺寸，再按 call_id 对回调用的是哪个工具。

| provider | 来源 | 张数 | 总字节 | 中位 | 最大 | 最长边 |
|---|---|---|---|---|---|---|
| deepseek | **Codex 原生 view_image** | 561 | **339.0 MB** | 278 KB | **13.44 MB** | 2048 |
| deepseek | item_completed / 用户消息 / compacted | 156 | 34 MB | 170–187 KB | 1.86 MB | ≤2048 |
| deepseek | OpenClaw browser/read/computer | 31 | 5.5 MB | 126–180 KB | 0.35 MB | 1200 |
| openai | exec→view_image（原生） | 41 | 17.8 MB | 360 KB | 1.46 MB | 2600 |
| openai | exec 其他 | 31 | 18.5 MB | 332 KB | 2.74 MB | 2048 |
| openai | OpenClaw computer | 75 | 17.6 MB | 247 KB | 0.27 MB | 1200 |

事故线程 01a11e96 的 rollout：
- 文件 111 MB，共 56 张图。
- 第 9 次压缩之后的有效窗口 53.1 MB，其中图片 50.6 MB，共 9 张。
- 举例：第 774 行是 1 张 1.39 MB 的图，第 728 行是 1 张 0.89 MB 的 PNG（1080 宽）。全都是 `function_call_output.output=[{type:"input_image", image_url:"data:image/png;base64,…", detail:"high"}]`。

### 2.2 每次请求的字节和等待时间（V，7 天）

脚本 `rollout-request-bytes.py` 用 rollout 重建每次采样请求时的有效历史字节（上次 compacted 之后）。「等待」是最后一个输入条目到第一个模型条目之间的时间，包含上传、预填和推理。

| 有效历史 | /vds 次数 | 等待 p50 | 等待 p90 |
|---|---|---|---|
| 0–2 MB | 9070 | 2.5 s | 10.2 s |
| 10–20 MB | 88 | 5.7 s | 11.7 s |
| 20–35 MB | 48 | 9.5 s | 13.8 s |
| 35–60 MB | 26 | 15.7 s | 21.6 s |

按 V 出口 45 Mbit 估算，50 MB 的请求光上传就要约 9 s，还会挤占同时段的其他会话（[[v-public-egress-cap]]）。这组数里上传、预填和推理混在一起分不开，单独的上传代价要靠第 5 节的受控对比来量。

### 2.3 GPT 为什么没出事（V 只读）

- `logs_2.sqlite`：`codex_api::endpoint::responses_websocket` 显示 `provider=OpenAI transport="responses_websocket"`，`successfully connected to websocket: wss://chatgpt.com/backend-api/codex/responses`。`codex_core::client` 的 TRACE 偶尔出现 `incremental request failed, items didn't match`，这时退回整段发送。DeepSeek 线程走的是 `codex_api::sse::responses`。
- Codex 源码（rust-v0.159.2）：
  - 增量只在 `provider.supports_websockets` 时开启（`core/src/client.rs:1025-1031`）。内置 openai 是 true，自定义 provider 默认 false。
  - zstd 只在 ChatGPT 登录且 `provider.is_openai()` 时启用（`client.rs:1617-1625`）。
  - `store:false`（`client.rs:997`）。
- 结论：GPT 不是因为图片存成了 file id 或服务端状态才没事，而是上限高、线上发得少、实际会话还没长到那么大。如果 GPT 会话也连着看几十张大 PNG，同样会越积越大。

### 2.4 DeepSeek /v1/responses 实测（VLab 主机，2026-10-10 15:3x CST）

脚本 `deepseek-responses-probe.py`：
- `state`：A 轮 `store:true` 记暗号，返回 `store:false`。B 轮带 `previous_response_id` 问暗号，答「不知道」。`GET /v1/responses/{id}` 返回 404。`Content-Encoding: gzip` 返回 400（按明文 JSON 解析）。
- `size`（用不完整 JSON，不产生 token 费用）：

  | 请求体 | 结果 |
  |---|---|
  | 10 MiB | 400 |
  | 47 MiB（49,283,067 B） | 400 |
  | 49 MiB（51,380,219 B） | **413** `Failed to buffer the request body: length limit exceeded` |
  | 51 MiB | openresty 413 |

  与文档写的 48 MiB（50,331,648 B）一致。
- `image`：见结论第 4 条。文档还写了：每图最多 1024 token；服务端缩到约 1300×1300 总像素；单请求 15 张及以上时单边上限 4096。官方建议大图或重复用的图走 Files API 的 `file_id`，但 Codex 只会发 data URL，用不上。

### 2.5 Codex 0.159.2 源码要点（V 上实际运行的是 `/opt/codex-0.159.2-v`）

- view_image（`core/src/tools/handlers/view_image.rs:176-201`）读文件，原样包成 data URL，缩放交给插入历史时的 `image_preparation.rs`。HIGH_DETAIL 是 2048 px / 2500 patch，限额内就**保留原字节**（`utils/image/src/lib.rs:195-205`），没有任何转 JPEG 或按字节限制的路径。
- 自动压缩的触发依据是 token。本地估算对每张图固定按 `RESIZED_IMAGE_BYTES_ESTIMATE = 7373` 字节（约 1.8k token）计（`history.rs:1048, 1257-1263`）。全仓库没有任何请求体或历史按字节计的保护；413 被归为 `UnexpectedStatus`，不会触发「超窗就压缩」。
- 本地压缩（非 OpenAI provider）会把整段历史连图发出去（`tasks/compact.rs:268-272`）。成功后只留最近的用户消息（20k token）和摘要，**工具输出里的图全部丢弃**。
- 没有「只保留最近 N 张图」的机制。唯一的整体剔除是 catalog 里 `input_modalities:["text"]`，此时会在构造请求时把所有图换成占位文本（`context_manager/normalize.rs:330-377`）。
- 关掉原生 view_image：`[features] view_image = false`（Stable，默认开），注册门与 provider 无关（`spec_plan.rs:1283`）。插件在 ring-zero 受限模式里已经用过这个开关（`CODEX_RING_ZERO_RESTRICTED_FEATURES`）。
- Hook：
  - PreToolUse 的 `updatedInput` 在 Codex 里对 view_image 有效（可以改 `path`），但 OpenClaw 的原生 hook 中继会拒绝一切参数改写（[[codex-refuses-hook-param-rewrite]]）。
  - PostToolUse 只能 block，或用纯文本替换输出，不能换成另一张图；而且 OpenClaw 的 PostToolUse 中继固定返回 noop。

### 2.6 OpenClaw 侧（V 只读）

- OpenClaw 默认缩图上限 1200 px / 5 MB（`image-sanitization-*.js`），view_image 再加每张 1 MB 的上限（`openclaw-tools-BODVdJQD.js`，`view-image-bytes-cap-v1`）。参数 `path` / `paths`（最多 20 张）。
- 插件 `dynamic-tools-BU9tmlYm.js:582`：

  ```js
  function filterCodexVisionTools(tools, params) {
    if (!params.modelHasVision || !params.nativeImageInspectionEnabled) return tools;
    return tools.filter((tool) => tool.name !== "view_image");
  }
  ```

  V 上 `vds-deepseek-flash` 声明了 `input:["text","image"]`，原生工具面又是开的，所以 /vds 拿不到 OpenClaw 的 view_image。
- 动态工具的图走 `convertToolContent` 转成 `inputImage`（data URL）交给 Codex，插件自己不再缩图。
- history-image-prune、computer-frame-prune、E3 都只作用于 OpenClaw 自己发出的请求，碰不到 Codex 线程。
- 413 不会触发换线程：插件只在 `invalid|malformed … image|base64` 或「context window」类错误时清绑定。token 保险丝又被 `v-codex-firsttext-v2` 对 DeepSeek 豁免了。`maxActiveTranscriptBytes` 量的是整个 rollout 文件，而且 V 上没配。
- 事故会话 `2b21b4a0…` 在 OpenClaw 库里共 186.9 MB。切到 /vds 之前，OpenClaw harness 时期有 149 条 view_image 结果，共 87.6 MB（9/29 上限补丁之前，单条最大 5.35 MB）。切到 /vds 之后，镜像里没有一张图。

## 3. 根治方案对比

### a）/vds 关原生 view_image，改用 OpenClaw 的 view_image ← 推荐作为第一层

- **改动**（Codex 插件 dist 补丁，与现有 deepseek 的 5 处补丁同类）：
  - ① 在 `buildCodexRuntimeThreadConfigForRun`（`thread-lifecycle-*.js`）里，provider 是 deepseek 时加 `features.view_image=false`；
  - ② 在 `filterCodexVisionTools` 的调用处，对 deepseek 传 `nativeImageInspectionEnabled:false`，保留 OpenClaw 的 view_image。

  /vcodex 不受影响。
- **效果**：图片在 OpenClaw 工具出口就被压到 ≤1200 px、≤1 MB（通常 0.1–0.4 MB）。这次事故的 9 张图从 50.6 MB 降到约 2–3 MB。
- **不能单靠它的原因**：
  - Codex 历史里的图仍然**永不裁剪**，只是每张变小了。
  - 1 MB 上限下，36 张就够撞上 48 MiB；`paths` 一次最多 20 张。
  - 要让 token 上限（258k）先于字节上限触发，平均每 token 要低于约 195 B，而实测 1024 px JPEG 约 265 B/token，贴着 1 MB 上限的图可达 2 KB/token 以上。

  所以字节上限理论上仍可能先到，需要第二层。
- **首字和成本**：
  - 有图的会话每次请求少传几 MB 到几十 MB，按 45 Mbit 算，每 10 MB 省约 1.8 s。
  - 每张图的 token 从约 1000 降到约 500–600（这是按 1024/1568 实测的推断）。
  - OpenClaw 缩图本身在 Gateway 里做，单张几十毫秒。
- **风险**：
  - 细节损失。9:16 帧会缩到 675×1200 = 0.81 MP，而 DeepSeek 本来会看约 1.69 MP。读小字的场景可能受影响，好在默认模型的 OpenClaw harness 一直是这个规格。
  - 改了线程配置，可能改变线程配置指纹，导致所有 /vds 线程在下一轮各换一次新线程，用 OpenClaw 记录投影接上上下文。这是一次性成本，**顺带能解开现在卡死的那个会话**，需要在 candidate 里核实。
  - 动态工具执行在 Gateway 侧，路径解析和沙箱要核对。

### b）在 Codex 看图前统一压图

| 落点 | 可行性 |
|---|---|
| PreToolUse hook 改 `path` 指向预压的 JPEG | Codex 支持 `updatedInput`，但 OpenClaw 的原生 hook 中继按设计拒绝所有参数改写（10/01 V Browser 就被它拦过）。要放开得改 core dist 的安全逻辑；hook 还要自己落盘临时文件、清理文件。**不推荐**：动的是安全闸门，收益与 a 相同 |
| 插件内包一层 | Codex 原生工具在 app-server 进程里执行，插件拿不到图片字节。不可行 |
| 改 Codex 源码（view_image 转 JPEG，按 DeepSeek 的 1.69 MP 缩） | 最干净，但要自己编译、维护 Codex 二进制，与「源码 fork 升级」路线绑在一起。可以作为长期方向或上游 PR |
| makaron 工作流给预览图（抽帧出 JPEG、拼图出 1024 版） | 便宜，能减少大 PNG 的产生，但管不到任意图片。只做补充 |

### c）DeepSeek 线程按字节裁剪历史 ← 推荐作为第二层（形式是「按字节主动压缩」）

- Codex 没有「旧图换占位」的接口：`thread/inject_items` 只能追加；`thread/resume` 的 `history` 字段标注了 "DO NOT USE"；`input_modalities:["text"]` 会一次剔掉所有图，模型就看不了图了。
- 可落地的做法：插件在每回合**结束后**读绑定 rollout 的有效窗口字节（上次 compacted 之后）。超过阈值（建议 24 MiB，留足压缩请求自身的余量）时，在后台调用原生 `thread/compact/start`。Codex 本地压缩会丢掉工具输出里的所有图。下一回合如果压缩还没跑完，就等它，或者直接换线程。
- **首字**：放在回合之后、后台执行，常态不影响首字。触发时一次压缩要把约 24 MB 和二三十万 token 送给 DeepSeek，大多命中缓存，耗时几十秒，只在超过阈值时发生。有了第一层之后，触发会很少。
- **风险**：
  - 压缩会丢细节，与正常的 token 压缩一样。
  - 与推迟的记忆整理、#277 的压缩互相影响要核对（[[codex-flush-loop-big-history]] 里 ownCompactions 的教训）。
  - 读 rollout 尾部要有界，不能整读 100+ MB。
- 长期方向：在 Codex 源码里实现与 history-image-prune 等价的「只保留最近 N 回合的图 + 字节预算」，用上游 PR 或 fork 落地。

### 兜底：413 时清绑定、换新线程 ← 第三层

- 把 `413` / `Payload Too Large` / `length limit exceeded` 加进插件清绑定的错误判定，换新线程，用有界投影（8 MB）在同一回合重试。日志不要再写成「Auto-compaction failed」。
- 它改变不了本质，图仍然会在新线程里重新积累。但它保证不会出现永久卡死。

## 4. 推荐

**a + c 两层上线，兜底层同批做。** 理由：
- a 用的是现成的、已在默认 harness 上跑了几个月的缩图逻辑，改动只有两处插件补丁，直接把单张图从 MB 级降到百 KB 级，每次请求都受益，并且不让首字变慢。
- c 用 Codex 原生压缩保证「有效历史 < 48 MiB」这个不变量，不依赖每个入口都守规矩。用户消息里的图、`paths` 一次 20 张这类情况都能兜住。
- 兜底只负责「绝不永久卡死」。

**卡死的会话**由 Tianyi 决定：可以等 a 上线后靠指纹换线程自然解开（需在 candidate 验证），也可以现在 `/new`。

## 5. VLab candidate 复现和验收计划（待批准后执行）

**环境**
- `vlab.mjs candidate`，私有 Gateway。把共享 VLab 的 `state/npm` 复制进 candidate 状态目录。
- 先核对 candidate 加载的 Codex 插件和 V 的 `g-b42d646e…` 字节一致，并带着 V 的 5 处 deepseek 补丁。否则会退回未打补丁的版本，或者共享 VLab 那份 `state/npm/projects/openclaw-codex-8902d781d4`（[[vlab-fidelity-gap]]）。
- Codex 用 V 同版本 `/opt/codex-0.159.2-v`。

**量字节的办法**
- candidate 的 codex-home 里，把 `model_providers.deepseek.base_url` 指向本地记录代理 `127.0.0.1:<port>/v1`。代理逐条记下请求体字节、图片张数和字节、到第一个 SSE 字节的时间，再原样转发到 `api.deepseek.com`。
- 这样每次请求的大小和首字直接可量，不用从 rollout 反推。

**夹具**
- 9 张 1080×1920 带噪点的合成 PNG（每张 6–8 MB，不可压缩，模拟真实视频帧），每张印不同的暗号。
- 正向判据：模型必须答对每张的暗号，避免「没看图也通过」（[[acceptance-must-prove-function]]）。

**用例**

| 用例 | 内容 | 判据 |
|---|---|---|
| 基线（V 现状） | /vds 一回合内依次看 9 张 | 请求体按每张约 8–10 MB 增长，第 6–7 张前后复现 413；之后会话每条消息都 413 |
| a | 同样的 9 张 | 不再有原生 view_image，走 OpenClaw view_image；单次请求 < 5 MB；9 个暗号全对；rollout 有效窗口 < 5 MB；记录首字 |
| a + c | 构造 30 张，或把阈值调到 8 MiB 来触发 | 回合后触发原生压缩，下一回合请求体回落；压缩那一轮不阻塞首字 |
| 兜底 | 关掉 a、c，强制 413 | 同一回合内换新线程重试成功，用户收到正常回复 |
| 回归 | /vcodex 看一张图 | 仍走原生 view_image，线程不换 |
| 回归 | OpenClaw harness 看一张图 | 行为不变 |
| 回归 | 已有 /vds 线程升级后的第一轮 | 记录是否换线程，以及投影大小和首字 |

**首字验收**：同一组夹具，基线和修复各跑 5 次，比较 p50 首字和每次请求字节。原则是「修复不让首字变慢」（[[ship-only-verified-no-slowdown]]）。

## 6. 未验证 / 待核

- 改线程配置后，现有 /vds 线程会不会换线程（指纹是否包含 features），需要 candidate 证实。
- OpenClaw view_image 在 Codex 动态工具里的路径解析和沙箱是否与原生一致。
- GPT 每回合第一次请求整段发送这一点，来自源码阅读（每回合新建 `ModelClientSession`），没有在线上抓包证实。
- 「OpenAI 512 MB 上限」来自文档，未实测。

## 复现命令

```sh
# V（只读，root 读 openclaw 用户目录）
scp experiments/vds-image-context/rollout-image-dims.py v:/tmp/ && ssh v 'sudo nice python3 /tmp/rollout-image-dims.py /home/openclaw/.openclaw/agents/makaron/agent/codex-home'
scp experiments/vds-image-context/rollout-request-bytes.py v:/tmp/ && ssh v 'sudo nice python3 /tmp/rollout-request-bytes.py 7 /home/openclaw/.openclaw/agents/makaron/agent/codex-home'
# VLab 主机（用实例 secrets 里的 DEEPSEEK_API_KEY，不打印）
python3 deepseek-responses-probe.py state | size 10 47 49 51 | image a.png b.jpg
```
