# 插件启用判断按配置记忆

状态：Mac 上的单测和等价测试已通过；还没做 VLab candidate A/B；没有合入，没有上 VLab 或 V。

## 问题

`isInstalledPluginEnabled(index, pluginId, config, env)` 每次调用都要重新做两件事：

- 对插件配置跑 `withBundledPluginEnablementCompat` 和 `normalizePluginsConfig`；
- 再算一次 `resolveEffectivePluginActivationState`。

调用它的地方有：插件工具解析、provider 凭据查找（`resolveManifestRuntimeAuthFacts`）、媒体能力可用性、清单可用性。这些地方都是对每个插件各问一次，而 Codex 回合每回合建两次工具（第二次只为生成规格），全部跑在 Gateway 主线程上。

2026-11-08 VLab run2 c10 profile（1 ms 采样，绝对值偏高）：

- **/vds 一臂：** `isInstalledPluginEnabled` 合计 272 ms / 约 10 回合，其中 `normalizePluginsConfig` 145 ms；
- **Worker 一臂：** `normalizePluginsConfig` 只有 24 ms；
- **重叠：** 它也是 `resolveProviderEnvAuthLookupMaps`（184 ms）和 `hasSnapshotCapabilityAvailability`（65 ms）里的大头。

## 改法

记忆键是三样东西：

- 索引记录对象；
- 配置对象；
- 打包 provider 兼容插件的 bundled-discovery 模式（只有这类插件才读）。

答案只取决于这三样，所以按 记录 → 配置 → 模式 记忆。失效靠两条：

- 配置重载会换成新对象，旧缓存自然不再命中。仓库里 pricing、model-catalog、web-fetch 也按配置对象身份缓存，依据同样是配置快照只替换、不原地修改。
- 插件元数据缓存被清空时（`registerPluginMetadataProcessMemoLifecycleClear`），记忆一起清空。

不传 config 的调用仍直接返回 `record.enabled`，不进缓存。

- **源码：** openclaw-versa `versa/plugin-enabled-memo-20261108` @aa8511f40f0，带 vitest 单测，去掉改动后单测失败；现有的 installed-plugin-index 测试（含兼容模式切换）全部通过。
- **开关：** dist 版本多一个开关 `OPENCLAW_V_PLUGIN_ENABLED_MEMO=0`，每次调用时读取，打开它就每次重新计算。

## 风险

如果有代码原地修改配置对象，然后在同一对象上再问启用状态，就会拿到旧答案。版本内已有的按配置身份缓存也依赖同一个前提。versa 插件全量测试（4,711 个）：开不开这个改动，失败的都是同样 26 个（7 个文件），在本机原来就失败，看起来是本机装的插件漏进了测试环境，跟这个改动无关。

## 验证

`lab/plugin-enabled-memo.test.mjs` 做了三件事：

1. 确认 plan 锁定了 V 的原字节和发布字节。
2. 把发布文件里的函数原样取出，依赖换成可计数的替身，然后和 V 原函数逐个比较。比较范围：3 条记录（含兼容插件）、5 种配置（含不传）、两种 discovery 模式来回切换、每种组合重复 3 次。结果全部一致。
3. 同一记录、同一配置只计算一次。配置换成新对象、记忆被清空、开关关闭时，都会重新计算。

## 待做

- 在共享测量台上做 A/B：`AB_ENVS=OPENCLAW_V_PLUGIN_ENABLED_MEMO`，/vds c10。要看三样：每回合主线程 CPU、到首个工具的时间、profile 里 `normalizePluginsConfig` 是否大幅下降。
- 核实 Gateway 里 Codex 回合拿到的 `params.config` 是不是跨回合同一个对象。如果每回合都是新对象，就只能省掉回合内的重复计算。
- 上线前：versa 分支合入 versa/main；捕获 PR 映射 source-map；按线上字节重建。
