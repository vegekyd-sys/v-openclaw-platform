# V 系统盘每日镜像

V 每天 05:20 CST（随机延后 0–10 分钟）对系统盘做一次 Lighthouse 在线镜像，只保留最新 3 份。V 不停机。镜像名前缀 `v-daily-`，任务只增删这个前缀的镜像。

- 脚本：`scripts/v-daily-image.py`，装在 V 的 `/opt/v-sentinel/daily-image.py`
- 单元：`systemd/v-daily-image.{service,timer}`
- 安装：`scripts/install-v-daily-image.sh v`（首次运行是 `--check`，只列出镜像和计划，不做改动）
- 测试：`python3 tests/v-daily-image.test.py`
- 失败告警：走 sentinel 的飞书通道，同一天只发一次

## 为什么要有

2026-09-29 夜班任务在共享 workspace 执行了 `rm -rf work`，删掉约 97 GB。当时没有快照，没有镜像，备份也在同一块盘上，只能在一天后从空闲块里雕刻文件，大部分内容已经被覆盖。事故恢复经过见项目记忆 `v-work-deletion-disk-recovery`。只要有前一天的镜像，work/ 几乎可以原样取回。

## 覆盖范围与费用

- **只覆盖系统盘**（380 GB，`/`，workspace 在这块盘上）。Lighthouse 镜像不包含数据盘；数据盘 `/srv/openclaw-data/disk1` 目前没有备份（2026-09-30 Tianyi 决定先不做）。
- 每个地域 5 个免费自定义镜像，超出后每个 0.01 元/小时。3 份每日镜像加 1 份事故镜像 `lhbp-qs7xf25j`，仍在免费额度内。
- 免费额度被其他镜像占满时，任务会先删最旧的一份每日镜像腾出位置，前提是已有 3 份正常镜像；否则照常创建，超出部分按 0.01 元/小时计费。
- 最多只能回到约 24 小时前的状态。当天新写的文件不在镜像里。

## 两个会导致停机的坑

- `CreateBlueprint` 的 `ForcePowerOff` **默认是 True**，也就是先关机再做镜像。脚本显式传 False，并用断言挡住误改；测试也覆盖了这一点。
- 不要用 Lighthouse「快照回滚」找文件。`ApplyInstanceSnapshot` 会强制关机，并把整块系统盘回滚到快照时刻。

## 从镜像取回文件（不碰生产）

2026-09-30 实际走过一遍，约 40 分钟。

1. **共享到 CVM**：只能在控制台操作（API 里的 `ModifyImageSharePermission` 是反方向的）。轻量控制台 → 镜像 → 新加坡 → 自定义镜像 → 共享 → 云服务器 CVM。共享后在 CVM 侧出现为 `SHARED_IMAGE`。镜像背后的快照属于 Lighthouse 服务账号，不能直接建成云硬盘。
2. **用镜像开一台隔离 CVM**，按量计费，需要在控制台由有支付权限的人点确认（Gateway 那组凭据没有支付权限）：
   - 安全组：入站只放行你自己的真实出口 IP 的 22 端口（以 `$SSH_CONNECTION` 里看到的为准，代理出口 IP 不算），**出站不加任何规则**，即全部拒绝。V 的服务即使起来，也连不到飞书、模型或 Tailscale。
   - 自定义数据（cloud-init）里放 bootcmd：先 `iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT`（V 的 ufw 只放行 tailscale0），再把所有已启用的非系统服务和定时器 `systemctl mask --runtime`。
   - 取消「安全加固」和「云监控」，避免往克隆盘装额外组件；另挂一块数据盘放输出。
3. **登录后**：停掉剩余服务 → `swapoff -a` → `mount -o remount,ro /` → `blockdev --setro`。确认出站确实不通后，再把需要的文件拷到数据盘。腾讯内网软件源 `169.254.0.3` 不受安全组限制，可以用来装工具。
4. **把文件送回 V**：克隆机经本机中转回 V 很慢（只有几十 KB/s）。更好的办法是在安全组里临时放行 V 的公网 IP，由 V 主动去拉，1.6 GB 约 2 分钟；V 端写入用 `ionice -c2 -n7`，不要用 `-c3`，否则会被数据盘上的夜班 IO 饿死。
5. **用完立即删除**临时 CVM、它的云硬盘、临时安全组和密钥对。
