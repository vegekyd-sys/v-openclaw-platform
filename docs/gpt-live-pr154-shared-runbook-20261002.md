# GPT Live PR 154 共享 VLab 运行手册

2026-10-02，用户已明确授权继续开发 PR 154，并接入共享 VLab，跑通后由用户亲自验收。本轮通过独立 PR 候选接入共享，不合入 dev、不部署生产 V。该授权不代表完整实验或用户听觉验收已经通过。

源码分支为 `codex/gpt-live-streaming-call-pr`，工作目录为 `/Users/tianyicai/v-worktrees/gpt-live-streaming-call-pr`，PR 为 [154](https://github.com/vegekyd-sys/v-openclaw-platform/pull/154)。此前未跑通的合入、撤回和回退证据继续保存在[历史试跑记录](gpt-live-shared-trial-20261002.md)，其中的 baseline、lease、PID 和 hash 不直接用于本轮运行。

新版完整 workflow 和 controls 的共享实测目前 **pending**。已有私有样本的父任务恢复证据不能代替提前进度保真、最终数字保真及全部控制案例。最终 source commit、release、hash、receipt 和状态由本轮负责人在本文末尾落定。

用户随后明确共享 VLab 优先交给记忆任务处理线上故障。本任务继续使用独立 candidate，不获取共享 lease、不部署、不重启共享服务；等记忆任务完成并明确交接后再恢复共享接入。私有 v3 的真实 cancel 接口成功后仍出现一次旧 owner 的通用失败播报；该样本保留失败状态。修复以可信取消通知同步撤销 Native 播报资格，并让失效的 voice completion 禁止回落到普通父任务唤醒；真实复验通过前不将取消列为已验收。

取消与多 child 身份轮换修复后的相关回归为 189/189。私有 v4 完整通话的长语音产生了同一 user turn 下两次分阶段委托，第一次先完成随机码，后续走嵌套子任务；固定单父子路径的来源 gate 未通过，保留失败状态，不据此认定产品路径整体失败或强制延迟合法提前委托。独立 cancel v4 完整听到请求但仅口头确认、未 consult；取消按钮未触发，仍属于未覆盖取消。新的通用实时指令要求实际发起工具请求，避免停在口头准备。短单段语音复验仍 pending，验收 gate 不降低。

私有 v5 已实际完成，source `3783217ee392d9bc51d6aabd6bf9db6866770e8b`、clean，candidate `bd901d2d-29d7-4944-b6b2-20ea8c2fd619`、10 overlay、`ok=false/sharedUnchanged=true`。workflow 把生成 1394 与 sleep/date 合成一次 exec，没有指定 child/yield/resume，也没有提前事实链；最终数字与实际时间一致仅证明该直接路径。cancel 的第一次 process.poll 已取得真实 `TESTCODE=7930`，但模型继续 poll，直到最终结果前 179 ms 才公开；Native 字幕晚于 final，提前播报未通过。取消按钮仍未触发，不能据此证明取消修复通过或失败。两用例的真实 RTC、音频和私有进程已清理。下一步应核对用户条件转交、后台阶段指令的实际传递与执行，独立验证真实 pending run 的取消隔离；不降低原完整体验门槛，不把只改音频后偶发成功当稳定验收。

## 操作顺序

1. 在任务 worktree 生成候选产物并完成相应回归；先通过真正 H5 的私有完整案例。冻结并推送同一个 PR commit，确认本机 clean HEAD、PR head 与待部署 artifact 一致。真实用例运行期间不修改其代码、指令或产物。
2. 重新核对共享 runtime、Worker、配置、插件、认证可用性、current、pending 与占用。本轮负责人取得或明确接手 integration lease；不抢占其他任务。历史 baseline 已变化时重新采集和生成 plan，不跳过 before hash 校验。
3. 使用 `lab/gpt-live-pr-deploy.mjs` 的 `package → install → stage → deploy` 流程。任务私有 controller 放在独立受保护目录，全局 controller 与 canonical dev 的字节不变。artifact 显式绑定 owner、PR URL、source commit、baseline、文件 hash、实验指令 hash 和 metadata trace 开关。
4. 在同一次受 lease、operation lock 和 idle fence 保护的 stop window 中安装代码、配置 C1 及 trace 环境，然后启动并核对 readiness 和各项 hash。C0 是此次新鲜现场的原始配置字节；C1 仅更新 `talk.realtime.instructions`。为本轮公开进度来源验收显式使用 `--metadata-trace true`；该开关默认关闭，开启时只记录关联元数据和文本 hash，不能转播工具原始事件、隐藏 reasoning 或凭据。readiness 不等于功能验收。
5. 用 `lab/gpt-live-pr-h5.mjs` 从同一个 clean PR head 创建 H5 快照。它仅监听 `127.0.0.1:26244`，服务端读取现有 Gateway 配置，显式请求 `openai`、`gpt-live-1-codex`、`sol` 和原生 WebRTC；浏览器只交换 SDP。临时 token 与 EnvironmentFile 不进入前端、Git 或公开证据。通过 Tailscale SSH local forward 使用页面，不开放公网入口。
6. 负责人将实际 H5 URL、Gateway PID、runtime 路径、overlay 与 app.js hash、证据目录交给测试。`lab/gpt-live-h5-provenance-smoke.mjs` 和 `lab/gpt-live-h5-control-smoke.mjs` 只测试该入口，不替代 H5 直接创建语音会话；同一共享运行态的真实用例顺序执行，明确记录每次运行的开始、结束与结果。

## 必过验收

| 项目 | 所需真实证据 | 本轮状态 |
| --- | --- | --- |
| 完整委派续传 | 原父任务接受 child spawn 后 yield；交办 ack 保持 pending；child 完成后恢复原父任务；父真实非 yield final 经原 delegation 回到同一有效 Live 会话 | pending |
| 提前进度有真实来源 | 已确认阶段事实的公开 assistant 或 preamble 输出，经因果绑定的 parent 或 accepted child 回调到 native append；callback 发出时间、sequence、run、batch 和文本 hash 可对齐；同一 Live 在真实父 final 之前产生相应字幕及非零播放 PCM | pending |
| 最终结果保真 | Live 最终字幕及实际声音忠实保留后台完整最终结果的随机数字、日期、时间和时区；child 阶段完成不能被当作主任务最终完成 | pending |
| 讲话打断 | 实际麦克风输入发生于 Live 正在说话时，有原生中断或截断及声学停止证据；原后台任务仍 pending，随后能继续回传真实结果 | pending |
| 明确取消 | 用户显式 cancel 后，真实后台控制返回成功并停止该任务；失败必须显示失败，不能仅以按钮点击或字幕确认通过 | pending |
| 关闭及重连 | 旧音频、麦克风和会话关闭；新 owner、generation 与 delegation 不接收旧 run 的迟到进度、final 或重复 completion | pending |

这轮桌面自动化使用的合成用户输入与真实模型输出要分别标注。字幕、RTP 字节、单次 PCM 或独立 exec 成功均不能单独证明完整体验通过。手机浏览器、用户亲耳验收和电话 SIP 是独立状态；本轮不据此承诺当前 native 路由可用 SIP。

## 回退与共享交接

H5 临时服务的 `RuntimeMaxSec=14400` 只限制网页进程最长运行四小时，**不会自动还原共享代码、C1 配置或 trace 开关，也不会释放 lease**。本轮唯一共享负责人负责实际运行、失败恢复和最终交接；其他 agent 不并发写入该运行态。

结束或失败时先关闭本轮 H5 通话，确认麦克风与 WebRTC 清理，停止该临时服务。保留脱敏 receipt 与证据后，仅清理该 commit 对应的 H5 快照和 EnvironmentFile，不删除其他任务目录。helper 中途失败也由负责人核对并清理它已经创建的精确目录和服务。

共享回退必须使用本轮 artifact 和任务私有 controller：

```sh
node lab/gpt-live-pr-deploy.mjs rollback --artifact "$trial_artifact"
```

canonical rollback 不包含本轮 C1 与 trace 事务，不能用于此次成对回退。PR rollback 校验并恢复原始 C0 字节、代码和原 trace 环境，在 stop window 中完成，并复核运行 hash、配置 hash、Gateway readiness、current 与 pending。失败时保留 lease 和 pending 现场，按该事务恢复，不能绕过校验或覆盖他人的新配置。认证文件保持独立，不把有效 access 回滚成历史过期凭据。

确认共享收尾状态后，负责人释放 lease 或与下一位负责人明确交接；若为用户验收暂留候选，同样记录占用、服务期限和回退责任。没有完成交接不能仅因 H5 TTL 到期声称共享已归还。dev 合入与生产上线仍分别等待用户决定。

## 本轮负责人更新栏

| 记录 | 最终值 |
| --- | --- |
| 负责人、lease 和运行时间窗 | pending |
| 已推送 clean PR source commit | pending |
| fresh base release、runtime hash 和配置 C0 hash | pending |
| 本轮 release、artifact hash、代码 overlay hash | pending |
| C1 hash、指令 hash、trace 开关及 drop-in hash | pending |
| H5 app.js hash、临时 service、Gateway PID | pending |
| 私有完整 H5 receipt 与未通过项 | candidate-c545af5f-7323-469e-8964-205997ed8905: ok, sharedUnchanged; random exec 9959, public → native append → prefix → PCM before final 19.369 s; child sleep 8 / date 2026-10-02 21:27:26 CST +0800; automatic parent resume / final numeric match / one final / clean close. Controls pending. Evidence `/tmp/codex-gpt-live-pr154-candidate-20261002-v2/receipt.json`; Native SHA `5a9bf8250097cda118e4141f61b7f9814bc42ad29e245f2df9aac96d3c478a44`. |
| 共享完整 workflow receipt 与公开进度、最终声音证据 | pending |
| controls receipt 与未覆盖项 | pending |
| 用户亲耳验收 | pending |
| 回退或暂留状态、最终 current、pending 和 lease 交接 | pending |
