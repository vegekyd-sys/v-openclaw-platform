# GPT Live one 共享 VLab 试跑

2026-10-02，用户明确授权“合入共享 vlab 试试”。候选已合入 dev，并通过受控产物部署到共享 VLab。完整后台委派验收失败；未执行 accept，未部署生产 V。

## 合入与部署

| 项目 | 精确记录 |
|---|---|
| 候选 commit | `50b36fb8830b7afff16d8ab951ba4ca874b64c79` |
| 合并后 dev commit | `df980cf834309d98225cc1449e3e65e25d53981d` |
| 合并后回归 | 6 个相关测试文件，62/62 通过 |
| 本次 release | `gpt-live-call-20261002-v1` |
| immutable artifact SHA-256 | `d3796bf2cfa18e8491f0dfb65c36bf9c6767d098eeff3e9e047cbbb7409aa82f` |
| 原共享 release | `db91-shrink-reuse-20261002` |
| 部署后 runtime SHA-256 | `8e5e0f05f9faa5769bd5e264eb78b3b8cc243af95c3cf6d7b0049f12118d4a83` |
| 部署后 Gateway PID | `1330113` |
| 语音模型与声音 | `gpt-live-1-codex` / `sol`，原生 WebRTC |
| H5 app.js SHA-256 | `e5271844fb52282aac7337c02945100619ad50e740f89be46430b1c4c5360edd` |

H5 作为临时、仅监听 loopback 的服务运行，使用同一个共享 Gateway，经 Tailscale IPv6 SSH 转发到 Mac。没有新增 Gateway、接入渠道机器人或发布公网入口。H5 明确指定 OpenAI provider；共享 Talk 原有火山/小何 provider 默认值未更改。只为本轮变更了实时语音事实指令，并保留原始配置备份。

共享 OpenAI access 凭据原本过期，本轮仅更新已有同账号 profile 的 access 与 expires，未覆盖 refresh、其他 profile 或认证顺序。凭据与配置备份均在受保护服务器目录，不进入 Git。新的有效凭据不因代码回退而恢复成已过期值。

## 真实 H5 委派案例：失败

运行的是部署后的完整 `index.html` 与 `app.js`。Chrome 使用合成麦克风音频，额外观测器只记录应用自身的 RTC、数据通道、SSE、DOM 和远端 PCM；没有替换业务处理器、向数据通道注入助手答案，或修改共享 runtime。独立 Gateway 连接只读取会话历史。

实际连接、字幕、远端音频播放、结束清理通过：RTC `connected`，数据通道 `open`，audio 正在播放，PCM 非零；结束按钮 `/api/close` 返回 200，PC 关闭，麦克风 tracks ended，remoteAudio 脱离。共享 Gateway PID、配置和三个 overlay 在用例期间没有改变。

完整结果回传没有通过。时间均为 CST：

| 时间 | 事实 |
|---|---|
| 17:53:11.923 | Live 说“后台已经开始等待 8 秒了，我继续等它跑完。” |
| 17:53:13.179 | 父任务的 `sessions_spawn` 才被接受 |
| 17:53:14.977 | 父任务调用 `sessions_yield` |
| 17:53:17.035 | completion relay 报 `missing scope: operator.write` |
| 17:53:21.548 | 测试页结束通话；旧 helper 错把最初 tool.result 当成终态，停止过早 |
| 17:53:26.016 | 子任务才开始实际等待/执行 |
| 17:53:36.915 | 子任务 date 工具返回服务器时间 |
| 17:53:36.928 | 子任务最终文本为 `2026-10-02 17:53:36` |
| 17:53:39.909 | 子任务完成 |
| 17:58:57 | 只读复核：父会话仍没有最终结果 |

第一句进度早于子任务的实际启动，不能认定为真实阶段结果转述。尽管它比首个 H5 tool.result 早 5.132 秒，且期间有 27 个非零 PCM 窗口，这只证明模型提前发声，不能证明内容保真。完整句子分块与提示词不能保证动作时态正确。

权限错误发生在页面结束前，也在子任务完成前，不能归因于 helper 提前关闭。父会话的最后公开文本是 `I'll delegate this to a subagent.`，不是时间结果。旧 helper 的 `manual-required` 时间判定不是通过；本轮始终记失败。新临时 helper 改为等到完整六字段日期回复，未将旧 receipt 修改成通过。

失败录音 42.6 秒；PCM SHA-256 `63bfa21680f4073370918fb0d958057bf4facb97deeabd896932d2b83de679ac`。本机证据目录 `/tmp/codex-gpt-live-call-20261002/shared-h5-1790934747633/`，含 WAV、receipt、DOM、事件与截图。媒体、完整会话和 helper 在 Git 外保存。真人听感与自然讲话打断未验收。

## 两个独立断点

1. OpenAI offer route 使用 plugin auth，HTTP runtime client 的 scopes 为空；sideband 后续回调继承该上下文。Worker completion relay 的 `waitForRun → agent.wait` 要求 `operator.write`，因此失败。现有代码只在最终 delivery 包 completion context，初始等待与 history 读取不在其中。不能靠提高 H5 或浏览器凭据权限修复。
2. 语音 consult harness 在第一次 `runEmbeddedAgent` 返回后即关闭 progress observer 并 cleanup；Talk runner 发送 `tool.result final=true`。父任务 yield 的“已交办”被当成最终结果，原 native delegation 不再等待恢复父任务的真实终态。修复权限后仍缺少这个语音续传绑定。

后续补丁必须在执行前登记原 voice owner、delegation、父 run/session/generation；yield 保留逻辑 consult，复用原子 batch 的父恢复链；只接因果关联的父公开输出与非 yield 终态；关闭、改口和明确取消撤销旧 sink，重复 completion 不重复追加。completion 的 wait/history/delivery 应全程使用生命周期受约束的 host resolver；缺少有效 scope 时拒绝。不能按 sessionKey 接任意下一条 final，不能读取最新消息冒充结果，也不能使用全局权限绕过。

9/11 历史实验使用整套官方 2026.9.4；其测试思路可参考，但没有本地独立 requester-final 补丁可直接移植到当前 9.1 + Worker。因此没有为本轮临时热改共享代码或升级整套依赖。

## 直接工具路径补测

第二个独立 H5 样本明确要求当前父任务直接执行，禁止创建子任务；没有 `sessions_spawn` / `sessions_yield`，实际只有一次 exec：

```sh
sleep 8; date "+%Y-%m-%d %H:%M:%S %Z %z"
```

真实 toolResult 于 18:18:55.339 返回 `2026-10-02 18:18:55 CST +0800`；父 final 于 18:18:55.355 返回同一时间与时区；Live 的最后完整 turn 六字段一致。RTC、实际远端播放、非零 PCM 与结束清理也通过，共享 PID/配置/overlay 均未改变。

严格用例整体退出码仍为 1，保留为未通过：

- 原要求命令 literal `sleep 8; date`，模型给 date 增加了格式参数，所以 exact-command 断言未通过。真实命令与结果已由父会话 history 独立核实，不能把 literal 失败改写成“没有执行 exec”。
- Native 进度前缀为“我正在准备等待测试”，出现在首个 tool.result 前 11.651 秒；前缀后的 20 个非零 PCM 窗口中，首窗早 11.644 秒。但是同句父公开文本的持久化记录晚 159 毫秒，缺少实际 emit 接收边界，无法排除 Live 依据用户的“先说”指令自行确认。持久化时间不等于回调发生时间，也不能单凭这 159 毫秒断言前端早于后台输出。结果记 `ungrounded`，没有将提前发声认定为已验证的后台进度转述。

录音 61.92 秒，PCM SHA-256 `a7f309fbccaf3f279f6267e4ff8e4c9205cf7e062bd00f297ca635085cf34f7b`。证据在本机 `/tmp/codex-gpt-live-call-20261002/shared-h5-direct-1790936276494/`。原失败 receipt 未改写；补充只读 history 证据另存。真人听感未验收。这个样本只证明一次父任务工具结果与 native 转写一致，不覆盖上面的子任务 yield 续传失败，也不证明自然插话能力。

## 收尾

18:28:09.782 CST，正常 `vlab.mjs rollback` 完成，代码恢复父 release，完整 runtime fingerprint 与父版本相同，保留对话与数据库。本次 stage 捕获的是实验配置，所以先在该配置下完成代码回退，再通过同一 lease、operation lock 与 idle fence 恢复原配置 bytes、UID/GID/权限，进行有序重启；没有在共享 runtime 运行补丁脚本。

配置恢复后五个 Worker 均 ready、pending 为 0。为验证实际后台入口，使用 `vlab.mjs test` 建立不向外部渠道投递的专用会话 `agent:makaron:explicit:vlab-dev-gpt-live-rollback-readonly-1790937370924`，run `vlab-dev-1790937370924`。该 run 终态 `ok`；独立 history 记录一次 `exec`、参数 `command: date`，工具返回 `Fri Oct  2 06:36:24 PM CST 2026`，最终回复返回同一时间。此检查证明回退后的普通后台工具路径恢复，不代表失败的 GPT Live 子任务续传已经修复。

18:37:50 CST 最终 CLI 状态：

| 项目 | 收尾状态 |
|---|---|
| 当前 shared release | `db91-shrink-reuse-20261002` |
| 当前 Gateway PID | `1339072` |
| runtime SHA-256 | `bb8b375a338e1fb7b4cfea4d4a79c77232d1317910b15f9206fb6a6e98d9cb73`，与父版本相同 |
| 原配置 SHA-256 | `9a8419243b832116e22b52283457586ed8f1a94e0fb235a095e9f7411ce150c7`，原始 bytes 恢复 |
| 平台对齐标记 | `v.aligned=true`，恢复父版本登记状态；本轮未额外做生产现场 parity 扫描 |
| pending journal / integration lease | 均为 null |
| H5 / 测试 Chrome / Mac SSH 转发 | 均已停止，麦克风和 RTC 已正常关闭 |
| dev 源码与服务器源码镜像 | 保留 `df980cf834309d98225cc1449e3e65e25d53981d` 的合入结果 |
| 实验 release accept | 未执行，完整功能验收失败 |
| 生产 V | 本轮未修改、未部署 |

这轮试跑已结束。后续续传修复应在独立候选中实现并验证，再按本次新补丁的明确合入授权进入共享验收；不能沿用原候选的批准自行合入新增运行时修复。
