# 小何 / Grok 混合执行候选

PR 217 的直接工具和静默提示修复保持独立待发布。此补丁只在 Candidate 开发、验证，尚未获准合 dev、部署共享 VLab 或 V。

## 执行路径

- 简单请求：语音模型选择 `memory_search`、`web_search`、飞书日历等原生工具；不增加一次后台模型推理。
- 复杂请求：模型调用 `delegate_to_v(question, context)`，完整目标交给当前配置的 Makaron/V 后端，通过标准 `chat.send`、`agent.wait`、`chat` / `agent` 事件承接。
- 后端绑定本人既有飞书 session；每个委派由服务端产生独立 idempotency/run ID。同一电话同时只接一个后台目标，保留现有后端模型、工具策略和授权。
- 后台公开 commentary 的完整句子可以阶段播报，不转发 reasoning、工具原始输出或未完成句子。原有观察器去重，播报最多每十秒一次；等待用户/模型讲话和实际浏览器播放结束。进度使用供应商原生语音事件，小何 `speech_text_buffer.commit`，Grok `force_message`（可打断），不伪造 assistant PCM。
- 最终结果只有匹配 run 的终态或持久化消息才能完成原工具调用；等待时普通插话不调用取消。原工具结果交还语音模型组织最终回复。
- 取消/挂断按 exact run 请求 `chat.abort`，并用 `agent.wait` 观察终止；不能用取消 ack 代替退出证据。确认不了退出时保留责任、阻止新委派；不取消整个个人 session，更不取消别人的 run。迟到结果不能续传。

## 验证范围

本地覆盖直接查询不委派、完整目标一次派发、公开进展筛选/去重、播放期间延期、同时聊天、终态/持久化结果核对、取消/迟到隔离及未确认取消的重试。

真实 Candidate 必须分别验证小何和 Grok：原 H5 用户输入 → 直接记忆工具；复杂请求 → 实际 V run 与多个后台工具 → 阶段供应商 PCM/浏览器播放 → 不需要催促的最终语音；另一个长任务 → 原生取消 → exact run 终态。候选结果独立记录，测试脚本、健康、本地通过不表示真人验收。

当前暂停的最终答案严格保真、双向声学/AEC、旧 barge/父子续传严格门槛不改成通过。本补丁也不宣称所有复杂目标（尤其异步子任务的父子续传）均已验收。后台补充条件和任务跨通话持久化后续单独考虑，普通闲聊不会自动改写后台目标。

Grok 进度语音事件依据 [官方 Speech to Speech 文档](https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech#force-message)。共享和 V 等待用户通知，保持原 `/voice` 链接及 Web/H5 布局。
