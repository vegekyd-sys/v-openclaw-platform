#!/bin/sh
# V egress: shape public traffic with CAKE just under the Lighthouse cap, and let
# Tencent-internal traffic through unshaped.
#
# The 60 Mbps cap is a policer on the public network only. 169.254.0.0/16 is
# Tencent's internal service network on this host (the COS internal endpoint,
# the metadata service, package mirrors): it never reaches that policer, but
# the old single CAKE root shaped it to 55 Mbit as well, so archive uploads to
# COS crawled at ~49 Mbit/s (measured 2026-11-28).
#
#   class 1:10  dst 169.254.0.0/16  up to 800 Mbit, fq_codel
#   class 1:20  everything else     CAKE 55 Mbit (unchanged behaviour)
#
# Undo: tc qdisc replace dev eth0 root cake bandwidth 55mbit besteffort triple-isolate rtt 100ms
set -eu
DEV=${1:-eth0}
PUBLIC_MBIT=${PUBLIC_MBIT:-55}
tc qdisc del dev "$DEV" root 2>/dev/null || true   # idempotent: start from an empty tree
tc qdisc add dev "$DEV" root handle 1: htb default 20 r2q 2000
tc class add dev "$DEV" parent 1: classid 1:1 htb rate 10gbit
tc class add dev "$DEV" parent 1:1 classid 1:10 htb rate 800mbit ceil 800mbit
tc class add dev "$DEV" parent 1:1 classid 1:20 htb rate 1gbit ceil 1gbit
tc qdisc add dev "$DEV" parent 1:10 handle 10: fq_codel
tc qdisc add dev "$DEV" parent 1:20 handle 20: cake bandwidth "${PUBLIC_MBIT}mbit" besteffort triple-isolate rtt 100ms
tc filter add dev "$DEV" parent 1: protocol ip prio 1 u32 match ip dst 169.254.0.0/16 flowid 1:10
