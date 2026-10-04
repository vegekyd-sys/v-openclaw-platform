# GPT Live 本人与普通入口

本轮按用户修正，只区分两个入口，不新增角色等级、登录系统或审批流程。

- 普通入口 `/voice/` 直接打开并拨号，默认对方不是 Tianyi。接通后自然问一次是谁，本次通话中记住自报姓名。
- 本人入口 `/voice/?entry=tianyi#access=…` 默认 Tianyi。沿用已有本人分享凭据和 cookie，凭据仍只放 URL fragment，不进入 HTTP 查询或日志。旧带 fragment 的本人链接会自动保留本人入口参数。
- 普通入口自报姓名不改变入口类型。服务端创建带入口标记的独立通话 session；浏览器提交的身份字段不决定入口。
- 每次重新拨号都是新 session。同一通话的后台咨询沿用该 session；入口信息由通话服务传给后台，姓名及完整请求由前端带入。后台沿用既有 redline。

原线上前端 Prompt 中的 V 身份、性格、判断、自我介绍和对话风格进入新版前端。当当前配置已经换成实验 Prompt 时，使用包内固化的同一份 V persona，避免依赖共享配置仍保留旧 Prompt。旧的密集等待播报规则不导入；当前续做、等待播报和挂断工具继续沿用。私人 bootstrap 和旧 Prompt 中的家人示例不作为前端 persona 导入。

普通与本人入口使用各自 cookie 和通话上下文，可同时打开；关闭一通不会关闭另一通。普通 cookie 不能改名用作本人 cookie。本人链接仍是持有链接者使用，不增加声纹身份验证。

开发分支 `codex/gpt-live-caller-links`。仅 Candidate 验证，尚未授权合入 dev、共享 VLab 或 V。候选实际结果另行记录，不能用本地检查替代真实语音验收。此前最终答案保真与双向音频修复保持暂停，原失败记录保留。

## 本轮验证结果

源码 `644adcab3a21cb99dc42890931d85a6db9c5453d` 的隔离 Candidate `candidate-dc628257-fece-4b17-a346-85781ed98d8f` 已结束。统一离线检查 1658/1658、零跳过，PR CI 通过。

- 普通入口真实接通后询问姓名；用户自报小林，完整原始后台记录同时含 visitor 入口和小林。默认 DeepSeek Flash 后台确认了这两项，原 H5/WebRTC 收到并播放回答，原接收音频已导出。
- 本人入口真实开场为“你好呀天意，我在呢。今天想从哪儿开始聊？”，没有询问姓名。后台收到服务端确定的 tianyi/Tianyi 上下文，原接收音频可解码且有实际未静音播放证据。
- 本人那段较长 USER 测试语音被切成两句，后台对前半句作了“问题不明确”的回答。因此只有入口与默认身份传递得到验证，不能把本轮 runner 的 ok receipt 当成所有后台回答或全面体验验收通过。这属于仍暂停的整句音频/回答问题，不追加修复或付费复跑；旧 FAIL 保留。

本轮独立复核记录在私有 `tmp/gpt-live-pr/caller-links-v6-independent-review.json`。它保留原回执、完整当前通话记录、原始语音文件校验值与上述未通过项。只将合成 USER 音频用于输入，没有伪造 assistant、后台结果或 data-channel。

Candidate 自己的 Chrome、Pulse 与临时目录已清理；服务 unit not-found、运行目录不存在。共享 Gateway 前后 PID 都为 1900903，sharedUnchanged=true。本轮没有共享或生产写入。

后续获得集成授权时，需更新两个 Gateway runtime 文件及 H5 服务文件，并受控重启 Gateway 与 H5 才能加载；本轮没有执行这些重启。Web/H5 布局保持原样。
