# Voice consult 的当前任务范围与紧凑提示词

生产文字复盘发现，普通短问题会携带约 17k 字符包装；进度追问受理后曾恢复数小时前已取消的话题。原始对话、人物资料、模型输入输出均保留私有，不进入 Git。

本候选仅对 `v-voice-gpt-live` 生效：

- 浏览器语音模型继续接收原来的 initialItems；Agent 继续在同一个 canonical session 运行，保留真实历史、身份、工具与权限。
- consult 不再额外重放 initialItems。当前原生 input、transcript_delta、完整用户原句和主机通话控制说明仍逐字保留；不按关键字裁剪用户命令或条件。
- 用紧凑契约替换这一 Voice 路径上的长固定提示，覆盖完整目标、当前任务、顺序/指定子任务、已有授权、真实确认门、公开阶段事实、一手来源/原值/主体/限定，以及真实阻塞。普通问题默认直接回答，用户要求报告时完整交付。
- 其他 Provider 沿原提示构造路径运行。没有改队列、Worker、模型选择、权限或会话生命周期。

Voice 独立仓库的阶段 UI 与交付解析另在 `codex/voice-task-speed-progress-20261015`，本改动不复制其 UI。

## 构建与验证

`node lab/build-voice-consult-scope.mjs` 生成两个版本化产物及 `lab/voice-consult-scope-plan.json`。Talk 基线是已合入 dev 的独立任务生命周期产物；不是当前生产 Talk 已安装这些前置能力的证明。正式发行必须核对前置版本及 before 哈希，不能直接覆盖生产。

- `node --test lab/voice-consult-scope.test.mjs`：仅 standalone Voice 去重、完整请求与来源/确认/阶段条件保留、其他 Provider 保持原历史、幂等与漂移拒绝。
- VLab disposable Candidate：实际产物和真实依赖 import、实际 prompt 构造通过，共享 Gateway PID 未变化。测试 overlay 包含未部署的已合入任务生命周期模块作为前置依赖；不代表共享 Gateway 已集成。
- 同模型真实 API 来源回放采用四个原请求，保留各请求对应来源与必要前序话语。第二轮 8 次调用的包装约 16.9–17.4k→2.8–3.4k 字符，回答生成中位耗时 4.67→2.93 秒。不是检索/排队/语音播放总时延，不是大样本 P95。
- 诊断及后续短追问试验共 24 次调用，保守会话预留约 3.94 美元，小于 5 美元上限；配置返回的 cost=0 不视为实际账单。后续测试仍发现部分短追问生成多余正文，未形成质量不下降验收。

保持候选状态。共享 VLab 的完整 Agent/工具/进度链路及真人原生语音须在获准集成后验证，不以 import、文本来源回放或可见状态代替。合并、上线与重启遵循现有项目授权和发布流程。
