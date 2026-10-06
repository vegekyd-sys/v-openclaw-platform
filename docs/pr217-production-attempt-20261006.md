# PR217 生产试发布与保留记录

用户授权恢复之前认可的豆包小何/Grok 原生工具版本。PR217 已合入 dev；本轮冻结源为 `1ee42ed04ee09bee6f09081139cf43e922411dd4`，保留 firsttext-r1 的现有优化。PR228 的混合委派和后续音频修改未进入本产物。

共享 release 为 `voice-native-tools-pr217-firsttext-r1-20261006`，artifact SHA256 `6997c11333b57b3042e7789dec4141d63e060e56d4a123ccef6883dceea6101a`。单一 runtime 目标 `tools-invoke-shared-CjpflNGO.js`，19 个 H5 文件整体 SHA256 `58a85f7cde2b56d547f056c7d2dbcfa37e4a9b78ad340901c573be197578054c`。

共享原 H5/WebSocket 及 provider/speaker PCM 实测：两模型接通问候、memory/web/read、个人日历、取消真实 pending process、自然告别、重拨成功；Grok 连续音频 81.91 秒，小何原 canonical H5 连续音频 74.29 秒，均未触发播放积压。小何工具前提示有真实 PCM。CLI 临时 access-only 配置迁到 Gateway PrivateTmp 可见的数据盘，不改 Gateway 隔离策略。失败样本及暂停的严格插话、最终保真、物理 AEC 仍保留，不称整个实验通过。

生产试发布通过原生 idle fence 排空及受控重启，同一 runtime 文件与 19 个 H5 文件部署到原 `/voice/` 入口，原访问密钥、unit、配置和 tunnel 保留。两模型公网接通问候成功；memory/web/read 的实际工具返回及语音已观察到，但日历所需 exec 被生产凭据代理拒绝。生产 journal 与独立同 H5 身份 tools.invoke 实测确认：`Secret egress proxy requires an admitted agent run instance`。终端 CLI 成功不能替代语音 Gateway 工具成功。共享未开启相同 proxy 环境，所以共享核心通过不足以覆盖这个生产差异。

公网 observer 另有独立错误：期望 wrapper 名 openclaw_tool，而实际 relay 报原工具名 read/exec；因此该整体样本的 deadline FAIL 也保留，不修改成通过。日历失败具有独立后端错误证据，不是仅由这个 observer 错误推断。

本轮生产完整验收未通过。旧 H5 指针/launcher 曾恢复，但运行代码因其他生产任务活跃尚未撤回。用户随后明确要求“你先上着吧，别回退了”：已按精确源码哈希与进程身份终止自己的回退控制器，确认 Gateway 仍是本次已启动的进程；未执行 runtime undo。重新校验原 19 个 H5 文件后恢复新入口，Gateway 没有再次重启，原访问设置与配置不变。这里只声明版本保留，不把日历失败改成通过。五组件 capture 是试发布时的实际磁盘快照，不能替代公网业务验收。共享侧已重新部署同一个已冻结产物，运行 SHA256 为 `2f7d9469fd6cb64decfcdfcd56a6cccf7c16d6216a5a5bc4b18f31e5ccfde66e`；10,063 个文件的实际对齐检查为 ALIGNED，随后归还本任务 lease。生产仍保留本次 Gateway 进程，日历/命令工具的未通过状态没有更改。

后续须给可信语音原生工具建立服务器拥有、可取消/可清理的 admitted run 生命周期，接入现有凭据代理；不能伪造 runId、关闭代理或借用别的任务执行身份。共享复验应覆盖开启代理的生产等价环境，再走同产物的公网日历与通用 exec 复验。当前最终保真/双向音频暂停要求继续保留。
