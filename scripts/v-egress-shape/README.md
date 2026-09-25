# V egress shaping

Shapes the production host's public egress with CAKE at 45 Mbps, just under the
50 Mbps cap of its Lighthouse plan.

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

If the bandwidth plan changes, change the 45mbit figure with it.
