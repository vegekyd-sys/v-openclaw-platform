# v-experience-session-kind — 后台行显示「会话请求」（Telegram、钉钉、企微）

设计：`docs/inter-session/design.md` §3.7 最后一条、§7.9、§13 第 12 条（marker `v-experience-session-kind-v1`）。

v-session-relay 插件经 `task-bridge-extra-sources`（WP3）往发起方的后台行加入每个在途请求：`{runtime:"session", taskKind:"sessions_send", …}`。不改的话 v-experience 把它叫「后台任务」（可接受的降级）；改后：

```
⏳ 后台 3 项进行中 · 会话请求 2 · 后台命令 1
```

**只改两处**

- `KIND_ORDER` 最前面加「会话请求」：`["会话请求", "子 agent", "后台命令", "生图", "生成视频", "生成音乐", "自动化", "后台任务"]`。飞书卡片（WP4，`V_TASK_STATUS_KIND_ORDER`）应使用同样的顺序。
- `backgroundKind` 在所有 runtime 判断之前：`taskKind === "sessions_send"` 返回「会话请求」。

其余任务的种类、文案、导出都不变（测试逐个对照 V 原字节）。

**三份产物，按 V 线上字节生成**

V 跑的是同一份 v-experience 的三个逐字相同的副本（10/05 `v-experience-channels` 发布，sha256 `5d939fa7…`）。`apps/v-experience/v-experience.mjs` 已经多了 V 没有上线的改动（`noteChannelSend`/「✅ 已发送」，#381 未上 V），所以这里**不**整份复制源码，而是对 V 的捕获字节打补丁（release-artifact-rebase-trap）。同一个函数也作用在源码上，下次整份复制时这个种类不会丢。

| 组件 | 目标（plan target） | before | after |
|---|---|---|---|
| core（Telegram 用） | `openclaw/dist/v-experience.js` | `5d939fa7…` | 见 `manifest.json` |
| 钉钉 | `npm/projects/dingtalk-real-ai-dingtalk-connector-…/dist/v-experience.mjs` | `5d939fa7…` | 同上 |
| 企微 | `extensions/wecom-openclaw-plugin/dist/src/v-experience.mjs` | `5d939fa7…` | 同上 |

- 重新生成：`node lab/release-files/v-experience-session-kind/patch.mjs --write`（三份副本和 `manifest.json`）。
- 测试：`node --test tests/v-experience-session-kind.test.mjs`。
- 单独上线无副作用：没有 `sessions_send` 行时显示与现在完全相同。三份文件在 Gateway 下次启动时生效。
- 注意：`lab/release-noon-20261016.plan.json` 里的 empty-reply 版 v-experience（`a85c1d37…`）同样以 `5d939fa7…` 为 before；两者谁后上线，谁就要按当时 V 的字节重新生成。
