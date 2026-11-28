# 导入补编（凌晨 0:15 到 7:15，每小时一轮）

规则以 `memory/SCHEMA.md` 为准，所有命令在工作区根目录执行。时间预算 12 分钟，到点就收尾。队列空了的晚上每轮只看一眼就结束，所以这些轮只在刚装好、资料还没整理完的头几个晚上真正干活。

1. `python3 scripts/librarian-daily-queue.py stats`。`import_pending` 为 0：只回复 NO_REPLY，结束。
2. `python3 scripts/librarian-daily-queue.py list --kind import --limit 60`，最多 60 片（实测 30 片约 2 分钟）。每片读原文，合并进已有的 `projects/<slug>/main.md` 或 concept 页（没有合适的才新建，首段按检索友好规范，每条结论带日期和来源），然后 `mark '<id>' --status compiled --note '<目标页路径>'`；没有持久价值的标 `skipped` 并写原因。
   - 标题带「更新版」的是主人改过的文档：按新版改写对应页面，旧说法原样挪进 `history.md`。
   - 会议纪要：只留结论、决定、负责人和截止时间，写进对应项目页，不为每次会议新建一页。
   - 一个客户、一个产品一页（同目录平铺的子页），`main.md` 只留一句话现状和链接。要写的页面已经超过 8000 字，先把它按小节拆成子页：原文原样搬，不改写、不概括，`main.md` 换成一行链接，再往子页里写新内容。
   - **表格和清单不许截断**（结算、名单、报价、排期这类一行一条的内容）：整张原样搬进项目目录下的子页（例如 `projects/<slug>/settlements.md`），一行不少；`main.md` 只写一句「共 N 条，见 [子页](...)」。旧版本的整张表挪进 `history.md`，不要只留前几行。
   - 每份文档至少在目标页留一处来源编号（`<编号>.md`）；`mark` 的 note 写具体页面路径，不写「见各片目标页」。
   - 原文里看到账号密码、密钥：不写进任何页面，标 `skipped`，note 写「含凭据」，在最终回复里提醒主人去处理（只说是哪份文档，不复述内容）。
   - 写入前查 `memory/librarian/expired-rules.json`，登记过的旧说法不许写回。
3. 运行记录：在 `memory/librarian/runs/<今天>.json` 的 `runs[]` 追加一条 `kind: import` 的 run（`label` 写「补编 HH:00」，格式见 SCHEMA「运行记录」），`sources[]` 每片一项。22:00 的质检靠它看过程，不能省。`memory/log.md` 追加一条 compile；`git add -- <具体文件>` 后用 `python3 scripts/librarian-corrections.py commit -m "chore(librarian): <日期> 补编 N 片"` 提交；再跑 `python3 scripts/memory-graph.py`。
4. 只做一轮。还有剩的，下一个整点和今晚 21:00 会接着编，不要自己建定时任务，也不要在这一轮里多编。
5. 最终回复只写 NO_REPLY（进度由 21:00 的整理汇报）。只有两种情况例外：失败，如实写一句原因；看到含凭据的文档，写一句是哪份。

不跑 reconcile、lint、关联，不 sessions_yield，不等子任务。
