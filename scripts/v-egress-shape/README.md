# V egress shaping

Shapes the production host's public egress with CAKE at 55 Mbps, just under the
60 Mbps cap of its Lighthouse plan (45 under the 50 Mbps cap until the
2026-10-21 upgrade to 16C/64G; raised to 55 on 2026-10-23).

    sudo install -m 0755 shape.sh /usr/local/sbin/v-egress-shape.sh
    sudo install -m 0644 v-egress-shape.service /etc/systemd/system/
    sudo systemctl daemon-reload && sudo systemctl enable --now v-egress-shape.service
    # undo: sudo systemctl disable --now v-egress-shape.service

## Why the default queueing never helped

The NIC already ran `mq` with `fq_codel` per queue, which is fair per flow. Its
counters read 0 drops and 0 overlimits: it had never once acted. The 50 Mbps
limit is enforced by a policer outside the host, and a gigabit NIC never builds
a local queue, so there was nothing for fq_codel to schedule. Packets reached
the upstream policer and were dropped without regard to what they were. On
2026-09-21 an agent uploading seven videos ran one process at 54.6 Mbps for
about three minutes, and model request bodies were dropped alongside it.

Shaping to slightly less than the external cap moves the queue onto this host,
where CAKE shares it per flow and lets sparse flows through first. Model
requests are small and short, which is exactly what CAKE favours.

Rate limiting in the application was rejected: the upload script was written by
the agent on the spot, and the next one will be written differently.

## Measured after enabling

A 300MB upload ran for 22 seconds while 200KB requests were timed alongside it:

| | 200KB request p50 | max |
| --- | ---: | ---: |
| idle | 0.07s | 0.10s |
| during bulk upload | 0.10s | 0.46s |

The bulk upload itself still reached 40.6 Mbps. Retransmissions during the test
were 0.06%, against a lifetime 3.5% on this host. There is no same-load run with
shaping disabled: that would mean deliberately saturating production.

If the bandwidth plan changes, change the bandwidth figure with it. A live change needs no
restart: `sudo tc qdisc change dev eth0 parent 1:20 handle 20: cake bandwidth <N>mbit`, then edit the unit
and `systemctl daemon-reload` so a reboot keeps it.

## Tencent-internal traffic bypasses the shaper (2026-11-28)

The single CAKE root shaped everything on eth0, including traffic to 169.254.0.0/16, Tencent's
internal service network where the COS internal endpoint lives. That traffic never reaches the
public 60 Mbps policer, but uploads to COS were held to the 55 Mbit shaper: 512 MiB took 87 s
(49 Mbit/s). `shape.sh` now makes the root an HTB with two classes: 169.254.0.0/16 goes to an
800 Mbit fq_codel class, everything else to the same CAKE 55 Mbit as before.

Measured on V right after the change: the same 512 MiB upload took 12 s (358 Mbit/s), and public
HTTPS requests timed during it stayed at p50 0.173 s / max 0.220 s (0.16–0.20 s before). The class
counters showed the upload in 1:10 and public traffic in 1:20 (CAKE).

Undo: `sudo tc qdisc replace dev eth0 root cake bandwidth 55mbit besteffort triple-isolate rtt 100ms`.
