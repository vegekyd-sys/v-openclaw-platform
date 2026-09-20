# Load-test task templates.
#
# Every step is read-only and bounded (fixed time windows, no recursive scans,
# no full-tree du) — the load under test is the agent pipeline, not the host's
# disk. Multi-step by design: Stage A's 3-step tasks finished in ~30-60s, well
# short of the 1-3 / 3-5 minute shapes real work takes.
SHORT = [                                    # target 1-3 min
    ("health-triage",
     "帮我做个快速体检，三步：\n"
     "1. 现在这一刻 V 的 load average、可用内存、根分区剩余空间；\n"
     "2. openclaw-gateway 和 nightshift-workboard 两个 unit 的状态和重启次数；\n"
     "3. 最近 5 分钟日志里有没有 error/warning，有就归类。\n"
     "最后一句话给我总体结论：正常还是要注意。"),
    ("mem-vs-now",
     "两步对比：\n"
     "1. 搜一下我们记忆里关于 worker 内存回收的记录，说清楚当时定的阈值和判定方式；\n"
     "2. 用 gateway call vlab.workers.status 看现在 worker 池的实际情况。\n"
     "然后判断：现在的状态符合当时的设计预期吗？说结论和理由。"),
    ("channel-audit",
     "三步：\n"
     "1. 看飞书通道最近 5 分钟收发了多少条消息；\n"
     "2. 看 telegram 通道同期的情况；\n"
     "3. 搜一下记忆里关于飞书消息可靠性的记录。\n"
     "对照着说：记忆里记的问题现在还在不在？"),
]
LONG = [                                     # target 3-5 min
    ("dropin-forensics",
     "帮我把 gateway 的 drop-in 结构理清楚，这几步都要做：\n"
     "1. 列出 /etc/systemd/system/openclaw-gateway.service.d/ 下所有文件，按字典序；\n"
     "2. 找出字典序最后那个，读它的内容；\n"
     "3. 用 systemctl show 看现在实际生效的 ExecStart 和 Environment；\n"
     "4. 对比 2 和 3，确认最后那个 drop-in 的设置确实生效了；\n"
     "5. 搜一下记忆里关于 drop-in 层层覆盖的记录。\n"
     "最后给我一段总结：这个结构现在有什么风险，怎么避免看走眼。"),
    ("perf-chain",
     "把首字延迟这条链从头到尾核一遍：\n"
     "1. 搜记忆，找出我们记的首字延迟根因和修复；\n"
     "2. 看现在公网出带宽实际是多少（10 秒采样 /proc/net/dev 的 eth0 即可）；\n"
     "3. 看最近 10 分钟 gateway 日志里 firsttext-metrics 的 model-call-enter 有多少次；\n"
     "4. 用 systemctl 确认 nightshift-workboard 跑的是哪个 release；\n"
     "5. 综合判断：修复现在还在生效吗？给证据。"),
    ("release-read",
     "研究一个文件，步骤如下：\n"
     "1. 列出 /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/source/lab/release-files/ 下前 15 个文件名；\n"
     "2. 挑一个名字里带 deepseek 的，读它的前 40 行；\n"
     "3. 说明这个文件是干什么的、关键逻辑是什么；\n"
     "4. 再看一眼 core/node_modules/@openclaw/ai/dist/ 下有没有同名文件，说明两者什么关系。\n"
     "最后用三句话总结你的发现。"),
]
