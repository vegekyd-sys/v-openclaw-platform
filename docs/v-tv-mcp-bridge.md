# 小米电视 MCP：从每会话一条 ssh 改成一个常驻桥接（2026-11-26）

时间均为 CST。背景见 `docs/incidents/2026-11-26-gateway-tasks-max-crash-loop.md`：「每会话 MCP」是 Gateway 任务数的常驻来源之一，`xiaomi-tv-remote` 是其中最大的一项。

## 现状（11-26 19:20 在 V、VLab 上只读实测）

**它是什么**

- V 的 `mcp.servers.xiaomi-tv-remote` 是 stdio 服务，命令为 `ssh vlab /usr/bin/python3 -I /srv/v-ha-lab/tv-mcp/stdio.py`。
- `stdio.py` 只有 33 行，把 stdin/stdout 原样转发到 VLab 上 Home Assistant 容器里的私有 Unix socket `/srv/v-ha-lab/config/.tv-mcp/mcp.sock`（root 0600）。
- 真正的 MCP 服务是 HA 自定义组件 `custom_components/tv_mcp`（`v-xiaomi-tv@1.2.0`，python mcp 1.28.1）：
  - 6 个工具：`tv_command`、`tv_status`（只读）、`tv_play`、`tv_volume`、`tv_pause`、`tv_screen`。
  - 通过 HA 的 Xiaomi Home 集成走**小米云**控制一台电视（did 883821565），不走局域网。
- 内部状态全部是 HA 进程级的全局变量（`last_command` 回执、`cloud_probe`、一把全局锁），**与连接无关**。
  - 每个连接只是一个新的 MCP 会话，工具列表固定。
  - 并发调用撞同一把锁，返回 `TV busy`。
  - 组件对连接数有硬上限：第 257 个连接直接被关掉。
- 放在 VLab 上，是因为小米账号授权和 HA 只在 VLab 的隔离容器里，V 不持有任何电视凭据，也不开 TCP 端口。

**拉起方和数量（V 上同时 99 个 ssh）**

| 拉起方 | 数量 | 父进程 / cgroup |
|---|---|---|
| Codex app-server 线程（/vds、/vcodex） | 82 | `codex`，`agent-shell` |
| Gateway 自己的会话 | 17 | Gateway node，`foreground` |
| /vcc（claude-cli） | 当时 0；近 24 小时 51 次 | `claude`，每次连接约 37 分钟 |

- 存活时间：36 个不到 10 分钟，59 个 10–60 分钟，4 个超过 1 小时。会随会话或线程结束回收，所以数量跟着活跃会话数走。
- V 侧每个 ssh 约 8.8 MB RSS、1 个任务。99 个约占当时 Gateway unit 任务数（1967）的 5%，占 agent-shell `pids.current`（1441）的 6%。

**VLab 侧**

- 每个 V 会话对应 1 个 `sshd: root@notty`（约 10.6 MB）和 1 个 `stdio.py`（约 11.3 MB），合计约 22 MB。
- 99 个会话约 2.2 GB RSS（按 RSS 加总，含共享页，偏高），再加 HA 里 99 个 MCP 会话。
- 离组件的 256 连接上限只差 2.5 倍。

**使用量**

- 11-25、11-26 两天的 Gateway 文件日志里搜不到 `tv_*` 字样。日志不一定记录每次工具名，只作参考。
- 连接在会话（或 Codex 线程）开始时就建立，与这一轮是否用到电视无关，所以连接数跟着活跃会话数走，而不是跟着用量走。

**附带发现（与本改动无关，需要 Tianyi 处理）**

- HA 的小米账号授权从 **11-22 12:37** 起刷新失败。
- 此后 `tv_status` 直连就返回 `mihome api get failed, unauthorized(401)`，电视工具在生产上已经 4 天不可用。
- 需要在 VLab 的 HA 里重新登录小米账号。

## 方案

### 先查原生机制

OpenClaw 9.1 没有「多会话共享一个 stdio MCP 进程」的开关：

- Gateway 和 worker 的会话 MCP 运行时按会话创建（`agent-bundle-mcp-manager`），空闲 TTL 是常量，不可配置。
- Codex 把 `mcp.servers` 投影成线程级 `mcp_servers`（`codex-mcp-config.ts`），每个线程自己起 stdio 子进程。
- claude-cli 每次运行写一份 `--mcp-config`，同样自己起。

但三条链路都原生支持 **url 型（streamable-http）MCP**，客户端在进程内，不起子进程：

- `headers.Authorization: "Bearer ${VAR}"` 在 Gateway/worker 里按配置读取时的 `${}` 替换生效。
- 投影给 Codex 时会变成 `bearer_token_env_var`（或静态 header）。

所以只需要提供**一个** url 端点，不改 OpenClaw 代码。

### 端点放哪里

- **选：V 本机常驻桥接** `scripts/v-tv-mcp-bridge.mjs`，systemd 单元 `v-tv-mcp-bridge.service`。
  - 只绑 `127.0.0.1:18791`，Bearer 鉴权，拒绝带 `Origin` 头或非回环 `Host` 的请求（防 DNS rebinding）。
  - 内部只保持**一条** `ssh vlab python3 stdio.py`（同一条命令，加了 `ServerAliveInterval`），也就是 VLab 上一个 sshd、一个 stdio.py、HA 里一个 MCP 会话。
  - VLab 和 HA 一个字节都不用改，VLab「不开 TCP、不持令牌」的隔离设计保持不变。
  - 桥接跑在 Gateway unit 之外，不计入 Gateway 的 `TasksMax`，也不计入 agent-shell 的 `pids.max`。
- 不选：在 VLab 上开 HTTP。
  - 要改 HA 组件、podman 端口映射，还要重启 HA。
  - 等于把一个带小米云权限的端口开到 tailnet 上。
- 不选：本地 stdio 转发 + ssh ControlMaster。
  - 每会话仍然有一个本地转发进程，V 的任务数问题没解决。

### 桥接做什么、不做什么

- 实现 MCP Streamable HTTP 的无状态子集：
  - `POST /mcp`，单条或批量 JSON-RPC，回 `application/json`。
  - 不发 `Mcp-Session-Id`；`GET`/`DELETE` 回 405（客户端据此不开 SSE 流）。
- `initialize` 和 `ping` 由桥接直接回答，`serverInfo`、`capabilities` 原样取自上游。
  - 协议版本按客户端请求协商，支持 2025-11-25、2025-06-18、2025-03-26、2024-11-05。
- 其余请求（`tools/list`、`tools/call`…）换一个上游 id 原样转发，结果原样返回。
- 功能等价的依据：组件的状态是进程级全局的，同一时刻的并发调用照样撞同一把锁、返回同样的 `TV busy`。
- 上游的生命周期：
  - 懒连接：第一次请求才建立。
  - 上游退出（HA 重启、网络断）时，在途请求返回明确错误，下一次请求自动重连。
  - 连接失败后 2 s 内快速失败，不会被一群会话打成重连风暴。
  - 请求超时且期间上游一个字节都没回，判定为半开连接，主动断开、下次重连。
- 日志每次 `tools/call` 一行：工具名、结果类别、耗时，不记参数。

## 验收结果（11-26 19:30–20:20，VLab candidate + 本机）

### 与现状逐字节一致（真实 HA，只读）

`lab/tv-mcp-bridge-compare.mjs`，在本机用和 V 完全相同的上游命令 `ssh vlab python3 stdio.py`：

- `initialize` 的 `serverInfo`、`capabilities`：直连与桥接一致。
- `tools/list`：直连与桥接**逐字节相同**，6 个工具。
- `tv_status`：两边返回同一个结果。现在都是 401，见上面的附带发现。
- 21 个会话经桥接只起了 1 个上游。除第一次外，其余 20 次 `initialize` 合计 16 ms。

### 三种 runtime 的真实回合

`lab/candidate/tv-mcp-bridge-runtimes.mjs`，VLab candidate，私有 Gateway：

- 每档先用 V 现在的 stdio 配置跑 3 个会话，再用桥接配置跑 3 个。
- 每个会话让 agent 调一次 `tv_status` 并原样贴出结果。
- 进程只统计本 candidate 的 Gateway 进程树。

| runtime | candidate | 旧配置：每会话新增 stdio 进程 | 桥接：每会话新增 | 工具结果 |
|---|---|---|---|---|
| worker（deepseek-flash） | `candidate-73dacad5` | **1**（worker 起） | **0** | 6/6 回合调到并原样贴出 401 结果 |
| /vds（Codex + DeepSeek） | `candidate-cdce7347` | **2**（Gateway 1 + Codex 1） | **0** | 6/6 同上 |
| /vcc（claude-cli） | `candidate-b73feec4` | **2**（Gateway 1 + claude 1） | **0** | 见下 |

- worker 档 Gateway 进程树：旧配置 2→5 个进程、23→26 个线程；桥接下 3 个会话后仍是 2 个进程、23 个线程。
- 三档桥接阶段的上游都只建立 1 次，请求全部经桥接转发。
- 桥接日志里能看到三种客户端各自完成握手：
  - `openclaw-bundle-mcp`：Gateway 和 worker。
  - `codex-mcp-client@0.169.1`：Codex，协商 2025-06-18。
  - `claude-code@2.1.280`：claude-cli，协商 2025-11-25。
- **/vcc 只验证到连接这一步**：
  - VLab 上没有可用的 Claude Code 登录（唯一的 `/root/.claude` 在 2026-06-16 过期），所以模型回合以 `OAuth session expired` 失败。
  - 但 Claude Code 自己的 MCP 日志显示，它带 `Authorization` 头经 `http://127.0.0.1:18791/mcp` 连上了桥接，完成握手、拿到工具列表。
  - 工具调用本身和其他 runtime 走同一个桥接、同一条转发路径。
  - 上 V 后用一轮 /vcc 补验真实调用。
- OpenClaw 自带的 `@modelcontextprotocol/sdk` 1.30.0 客户端也单独测过：3 个客户端共用 1 个上游（单元测试第 11 项，在 VLab 上跑）。

### 热切换（上线和回滚的真实路径）

做法：Gateway 运行中，用官方 `openclaw mcp set` 把 stdio 换成 url，再换回来。

| 场景 | candidate | 结果 |
|---|---|---|
| worker，令牌在切换前才写进 `.env` | `candidate-e610587a` | 通过：worker 是重载后新起的一代，环境里已有令牌 |
| vds，令牌在切换前才写进 `.env` | `candidate-42013fad` | **失败**，见下 |
| vds，令牌在 Gateway 启动时已在 `.env` | `candidate-5a8042c7` | 通过 |
| worker，同上 | `candidate-c355b323` | 通过（前一次 `ef7aa5d2` 有一轮模型没去调工具，重跑通过） |

通过的几次，共同表现：

- `mcp.*` 改动只触发 `dispose-mcp-runtimes` 热重载，日志里没有 `before plugin reload`，`pool is closing` 为 0。
- worker 配置在 3 秒内被 worker 插件从主配置自动派生（`rewrote Worker config, 6 changed path(s)`），池子排空式换代（generation 1→2，回滚后 →3）。不用手改第二份配置。
- 切换后，新会话和切换前就存在的会话都改走桥接，旧的 Gateway 侧 stdio 进程被回收。
- 切换前已开的 **Codex 线程保留它的旧 stdio 进程，直到线程结束**。所以 V 上那 82 个会随线程自然退场，不会立刻归零。
- 回滚同样热生效，下一个新会话回到每会话一个 stdio 进程。

**失败那次的原因（已用桥接的 401 日志坐实）**：

- 令牌在 Gateway 启动之后才写进 `~/.openclaw/.env`。
- Gateway 自己的 MCP 客户端发出的是没展开的字面量 `Bearer ${V_TV_MCP_TOKEN}`（桥接记为 `unauthorized (unexpanded-placeholder)`），被拒，该回合卡到超时。
- 所以**令牌必须在 Gateway 启动时就在它的环境里**。
- 安装脚本的 `switch` 会先查运行中 Gateway 的 `/proc/<pid>/environ`，没有令牌就拒绝切换。11-26 在 V 上只读验证过，这道检查当前会正确拒绝。

### 每会话开销对比（V 与 VLab 两侧）

| | 改前（每个 MCP 连接） | 改后 |
|---|---|---|
| 一个会话对应几个连接 | Gateway/worker 会话 1 个；Codex、claude-cli 会话各 2 个（Gateway 侧 1 + harness 侧 1） | 0 个进程；会话在各自进程内用 HTTP 连本机 |
| V | 每连接 1 个 ssh（约 8.8 MB、1 个任务），计入 Gateway 的 `TasksMax` 或 agent-shell 的 `pids.max` | 每会话 0。另有常驻：桥接 1 个 node（约 57 MB、7 个线程）+ 1 个 ssh，都在 `v-tv-mcp-bridge.service` 里，不计入 Gateway |
| VLab | 每连接 1 个 sshd（约 10.6 MB）+ 1 个 stdio.py（约 11.3 MB），外加 HA 里 1 个 MCP 会话（上限 256） | 常驻 1 个 sshd + 1 个 stdio.py + HA 里 1 个会话 |
| 11-26 19:20 的规模 | V 99 个进程；VLab 约 200 个进程、约 2.2 GB RSS；HA 99 个会话 | V 2 个、VLab 2 个，与会话数无关 |

- 桥接的 node 常驻 RSS 和 7 个线程，是在 VLab 临时实例上量的（同一个 node 22）。
- 工具调用耗时没有变化：VLab 上 `tv_status` 经桥接 131 ms–1.9 s，主要是小米云往返，与直连同一量级。

## 上线步骤（需 Tianyi 批准；本分支未合 dev、未动 V）

1. 合入 dev 后，`scripts/install-v-tv-mcp-bridge.sh install v`：
   - 装 `/opt/v-tv-mcp-bridge/v-tv-mcp-bridge.mjs` 和 `v-tv-mcp-bridge.service`。
   - 在 `~/.openclaw/.env` 追加随机的 `V_TV_MCP_TOKEN`（先备份 `.env`）。
   - 启动桥接，用这个令牌自检 `initialize` 和 `tools/list`。
   - **这一步不改 OpenClaw 配置、不重启 Gateway**，线上行为不变。
2. **等下一次计划内的 Gateway 重启**（任何原因的都行），让令牌经 systemd `EnvironmentFile` 进入 Gateway 环境。不需要专门为此重启。
3. `scripts/install-v-tv-mcp-bridge.sh switch v`：
   - 检查 Gateway 环境里已有令牌，再自检一次桥接。
   - 备份 `openclaw.json`，用官方 `openclaw mcp set` 把 `xiaomi-tv-remote` 换成 url，并列出所有变动的配置路径。在 VLab 上，CLI 写入时还顺带规范化了 `models.providers.*`，要看一眼。
   - **热生效，不重启**。
4. 验收：
   - `install-v-tv-mcp-bridge.sh status v`：两份配置都是 `streamable-http`；每会话 ssh 数只降不升，Codex 旧线程结束后归零。
   - `journalctl -u v-tv-mcp-bridge` 里出现三种客户端的 `initialize`，`unauthorized` 为 0。
   - Gateway 日志有 `config hot reload applied (mcp…`，没有 `before plugin reload`；`vlab.workers.status` 的 workers > 0。
   - 在 V 上分别用默认、/vds、/vcc 各问一次「电视状态」（只读的 `tv_status`）。
   - 小米授权修复前，三者都应原样返回同一个 401 错误。

## 回滚

- `scripts/install-v-tv-mcp-bridge.sh rollback v`：用 `openclaw mcp set` 写回 11-26 的 stdio 原条目，热生效、不重启。下一个新会话就回到每会话一条 ssh。VLab 上验证过。
- 桥接可以留着不用，或 `sudo systemctl disable --now v-tv-mcp-bridge`。
- `.env` 里的令牌留着无害。

## 文件

- `scripts/v-tv-mcp-bridge.mjs`：桥接本体，无依赖。
- `scripts/v-tv-mcp-bridge.test.mjs`：单元测试，CI 在 `tests/vlab-static.sh` 里跑。
- `systemd/v-tv-mcp-bridge.service`、`scripts/install-v-tv-mcp-bridge.sh`：V 上的安装、切换、回滚、状态。
- `lab/tv-mcp-bridge-compare.mjs`：直连与桥接对比，只读。
- `lab/candidate/tv-mcp-bridge-runtimes.mjs` 加 `tv-mcp-bridge-*.plan.json`：三种 runtime 与热切换的 candidate。
- `lab/tv-mcp-bridge-vlab-fixture.sh`：candidate 用的 VLab 临时 root 单元（`up`/`down`），用完已 `down`。

## 没覆盖到的

- /vcc 的真实工具调用：VLab 没有 Claude 登录。
- /vcodex：会复用 V 的 ChatGPT 登录，按惯例不在 candidate 跑。它和 /vds 是同一个 Codex app-server、同一份 `mcp_servers` 投影，只是模型不同。
- systemd 单元在 V 上的加固项（`ProtectHome=read-only` 等）对 ssh 的影响：VLab 上的临时实例用 `systemd-run` 起，没有这些加固。`install` 的自检会在 V 上第一时间暴露问题。
- 共享 VLab Gateway 本身没有配置这个 MCP（只有 V 有），所以不需要在共享 VLab 做集成验收。
