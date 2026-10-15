# 钉钉群 peer id 大小写保留（OpenClaw 2026.9.1 候选补丁）

2026-10-15 用户要求「走正规流程修」。本候选只改 core 会话键的 peer 折叠规则，不碰连接器、配置、凭据或任何线上状态。仅在隔离副本上测试，**未合入 dev、未应用到生产运行时**。

## 根因（已实测取证）

`CASE_PRESERVING_PEERS` 是 core 中硬编码的白名单；未登记的 channel/peerKind，其 peer id 会被折叠成小写（`normalizeSessionPeerId`）。钉钉 `openConversationId` 是**区分大小写的 base64**（本群真实值 `cidvcoS13FzQXFw5ZNRTUMU2Q==`），折叠后变成 `cidvcos13fzqxfw5znrtumu2q==`，钉钉接口直接拒绝：

```
POST /v1.0/robot/groupMessages/send  ->  HTTP 400 invalid.openConversationId
```

链路证据（2026-10-15 20:50–20:58，journald）：

- 成功：`[DingTalk:SendMedia] {"to":"cidvcoS13FzQXFw5ZNRTUMU2Q=="...}` → `File[Proactive] 发送成功: processQueryKey=...`（入站回复路径携带原始 id）。
- 失败：`[vlab-worker:3/11] [sendMediaToDingTalk] File[Proactive] 发送文件消息失败 ... 400`（主动发送路径的 target 来自会话）。
- 会话存的投递目标即被折叠：`session_status` → `"to":"channel:cidvcos13fzqxfw5znrtumu2q=="`。
- 直接打接口复核：折叠 id → **400 `invalid.openConversationId`**；原始 id → **200 + processQueryKey**（文字与 `sampleFile` 各一次）。与文件名、体积、类型、凭据无关。

影响面不止媒体：同一 session 发起的任何主动群发（含纯文字）都使用这个被折叠的 target。

## 修法

把 `dingtalk-connector` + peerKind `group` 以 `span: "segment"` 登记进 `CASE_PRESERVING_PEERS`，与既有 `signal` 条目同构：

```js
{ channel: "dingtalk-connector", peerKinds: new Set(["group"]), span: "segment", unscoped: true }
```

- 会话键变成 `agent:makaron:dingtalk-connector:group:cidvcoS13FzQXFw5ZNRTUMU2Q==`，由它派生的投递目标恢复正确大小写。
- 只影响该 channel 的 group peer；其他 channel 仍按原规则小写（已测）。
- **不切裂历史会话**：segment-span 通道保留 core 既有的折叠别名回退（`foldedSessionKeyAliasCandidates` / `isConfirmedLoweredLegacyAlias` 对 segment 通道是宽松回退），旧的 `...group:cidvcos13...==` 会话仍按 legacy alias 命中（已测 `requiresFoldedSessionKeyAliasProof` 为 false，且旧键仍可解析）。

## 覆盖范围

必须同时打两处，否则 worker 仍会折叠（本次线上失败即发生在 worker）：

| 文件 | 形态 |
| --- | --- |
| `dist/session-key-*.js` | 未压缩 bundle |
| `dist/worker/worker.mjs` | minified bundle（自带一份 registry） |

patcher 用锚点定位 + 唯一性校验；重复 apply 为 no-op；标记存在但锚点缺失时报错而非静默跳过。

## 验证与边界

隔离副本（`cp -a` 的 181 MiB core，仅 `package.json` + `dist/`），不新建 Gateway、不开端口、不接机器人、不调用模型、不写共享状态：

```sh
cp -a /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core ~/src/dt-patch-core-<ts>
node scripts/patch-openclaw91-dingtalk-peer-case.mjs ~/src/dt-patch-core-<ts> --check
DINGTALK_PATCH_CORE=~/src/dt-patch-core-<ts> node --test tests/patch-openclaw91-dingtalk-peer-case.test.mjs
```

结果：4/4 通过。功能断言覆盖 ① 基线复现折叠 ② apply 后会话键保留原始大小写 ③ feishu 等其他 channel 仍小写 ④ 旧折叠键仍作别名解析 ⑤ 二次 apply no-op ⑥ rollback 后回到基线。SHA-256 前后值见 `acceptance/vlab-patch-manifest.json`。

**未验证（需合入后）**：真实钉钉群在打补丁的运行时里跑一次主动发送；多群/多账号；thread 形态的会话键。

## 合入与回滚

```sh
node scripts/patch-openclaw91-dingtalk-peer-case.mjs <coreRoot> --apply     # 生成 *.v-dingtalk-peer-case-v1.bak
node scripts/patch-openclaw91-dingtalk-peer-case.mjs <coreRoot> --rollback  # 比对备份文件 SHA 后还原，不覆盖后续改动
```

- 目标 core 必须重启 Gateway 才生效；本候选不自行重启、不上线。
- 仅 Tianyi 明确授权后才合入 dev / 应用到生产运行时。
