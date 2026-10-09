# 小何/Grok 文字历史持久化

测服通过 `candidate-h5.mjs` 的 audit 回调保存 `direct-voice-audit.jsonl`；正式 H5 未传入 audit 写入器，因此直接模型的闲聊文字只传给浏览器，原有生产数据库拉取无法覆盖这些记录。

本补丁把现有 user/assistant transcript 回调连接到专用私有文字日志。记录包含服务端时间、进程 captureId、单调 sequence、voiceSessionId、本人 sessionKey、provider 和预约的 model（标注 modelSource=voice_reservation），以及文字 delta/final。新增 call.created 与已有 call.closed 给出边界。模型配置不冒充实际最终 response 元数据。旧进程未保存的历史无法追补；测服参考必须保留 candidate 来源，不能混入线上数据集。

真实启动默认保存到 `${OPENCLAW_STATE_DIR}/state/voice-transcripts/<上海日期>.jsonl`；没有 state 环境变量时基于 config 所在目录，也可用 `RTC_H5_TRANSCRIPT_DIR` 覆盖为绝对私有目录。目录 0700、文件 0600，日志仅服务端可读，不作为 H5 静态资源暴露。只白名单保存公开文字和会话身份：没有 PCM、媒体、原始 protocol、工具参数/结果、凭据或内部 reasoning。保留未完成片段以覆盖打断后没有 final 的情况。

写入异步排队，不在播放路径 await 磁盘；待写队列有界，溢出保存 record.gap，IO 错误只报告无内容的错误代码，避免记录故障打断通话。正常退出先 dispose 原通话，再等待待写文字完成。追加文件拒绝 symlink/非私有文件。日常同步需明确报告 gap 与未写完尾行，不能称完整覆盖。

本地验证：76 项相关检查通过、零 skip，包括两个 provider 的原协议文字回调 → 会话身份 → 私有日志集成、流式片段/完整句、跨日/重启追加、孤儿回调、IO 故障、背压缺口、发布文件清单和平台 catalog。没有新增付费通话或物理设备验收。独立私有 Cron 读取器已适配同一 JSONL schema，并验证两 provider、来源隔离、尾行未写完和水位去重。

当前未合入/未部署本补丁。合入授权后只发布独立 H5 电话服务，在空闲窗口切换；无需 Gateway 或 Worker 重启，也不改变前端 UI、头像、音频、任务路由。上线后用新自然通话核对记录真实出现，再核对 Cron 拉取；服务 active 或本地测试不是生产数据覆盖证明。共享 VLab 的对齐与发布文件校验沿原 H5 发布流程执行。
