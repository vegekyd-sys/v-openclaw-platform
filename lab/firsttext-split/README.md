# firsttext-split：把生产 V 的 /vds 首字拆成两段

报告：`docs/experiments/firsttext-two-segments-20261119.md`。

所有脚本在本机的工作目录里跑，中间文件（`ft.log`、`ft.json`、`traj.jsonl`、`roll.jsonl`、`joined.json` 等）只放本机临时目录，不进仓库。V 上只读：journal 用 `ionice -c3 nice -n19`，SQLite 用 `mode=ro`，rollout 只读，读完不在活跃期的文件用 `POSIX_FADV_DONTNEED` 退出页缓存。V 上不落任何文件，脚本经 stdin/base64 传过去执行。

| 步骤 | 脚本 | 读什么 |
|---|---|---|
| 1 | （命令见报告附录）→ `parse.py` | V journal 的 `[firsttext-e2e.1]` 行 → `ft.json` |
| 2 | `seg.py` | 按天分段（排除同会话上一轮未结束的消息） |
| 3 | `traj.py`（在 V 上跑） | agent 库 `session_nodes` → `trajectory_runtime_events`（按 session_id+run_id 走索引）取 threadId/turnId/用量 |
| 4 | `roll.py`（在 V 上跑） | Codex rollout：每个回合的 task_started、UserMessage、每次请求的 `token_usage_record`、推理/消息/工具完成时间 |
| 5 | `join.py` → `ana1.py` `ana2.py` `ana3.py` `tf.py` | 模型段拆分、按推理 token/输入/缓存分桶、先调工具的回合 |
| 6 | `hourly.py` `load.py` `base.py` | 入场段按小时、按夜班负载分桶 |
| 7 | `media2.py` | 附件类型（视频/图片）对入场段的影响，需要 journal 里的 `[feishu] downloaded …` 行 |
| 8 | `ttfb.py`（在 V 上跑） | Codex `logs_2.sqlite`（只留约 2 小时）里 DeepSeek 响应头时间 |
| 9 | `dseffort.py` `dsprefill.py`（在 VLab 上跑） | 直连 DeepSeek Responses API：推理档位、缓存前缀大小对首字的影响。密钥只从环境变量读 |
