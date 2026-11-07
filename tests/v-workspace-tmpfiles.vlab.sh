#!/bin/bash
# Run on a Linux host with systemd >= 250 (vlab91): bash tests/v-workspace-tmpfiles.vlab.sh
# Expect the default "14d" to keep proj-old/read-recently.mp4 and "cmBM:14d" to remove it.
# VLab: verify the workspace/tmp rule with real systemd-tmpfiles on a private ext4 image.
set -euo pipefail
B=/tmp/claude-tmpf-20261107; sudo umount $B/mnt 2>/dev/null || true; sudo rm -rf $B; mkdir -p $B/mnt
truncate -s 64M $B/img; mkfs.ext4 -q -I 256 $B/img
OLD=20251001000000
build() {
  sudo mount -o loop,relatime $B/img $B/mnt
  sudo rm -rf $B/mnt/tmp; sudo mkdir -p $B/mnt/tmp/{proj-old,proj-new,emptydir-old}
  for f in proj-old/read-recently.mp4 proj-old/unzipped-old-mtime.json proj-new/new.json proj-old/untouched.bin; do echo x | sudo tee $B/mnt/tmp/$f >/dev/null; done
  sudo touch -m -d 2024-01-01 $B/mnt/tmp/proj-old/unzipped-old-mtime.json   # old mtime, ctime now (fresh unzip)
  sudo umount $B/mnt
  for f in proj-old/read-recently.mp4 proj-old/untouched.bin; do
    for fld in mtime ctime crtime atime; do sudo debugfs -w -R "set_inode_field /tmp/$f $fld $OLD" $B/img >/dev/null 2>&1; done
  done
  for fld in mtime ctime crtime atime; do sudo debugfs -w -R "set_inode_field /tmp/emptydir-old $fld $OLD" $B/img >/dev/null 2>&1; done
  sudo mount -o loop,relatime $B/img $B/mnt
  sudo cat $B/mnt/tmp/proj-old/read-recently.mp4 >/dev/null     # an agent's recursive read: atime -> now
  sudo ls $B/mnt/tmp/emptydir-old >/dev/null                    # directory listed: dir atime -> now
}
run() { echo "e $B/mnt/tmp - - - $1" | sudo tee $B/test.conf >/dev/null; sudo systemd-tmpfiles --clean $B/test.conf; echo "-- age=$1 left:"; (cd $B/mnt/tmp && sudo find . -mindepth 1 | sort | sed 's/^/   /'); sudo umount $B/mnt; }
build; stat -c '%x | %y | %z | %w  %n' $B/mnt/tmp/proj-old/read-recently.mp4 | sed 's/^/   atime|mtime|ctime|birth: /'
run 14d
build; run cmBM:14d
sudo rm -rf $B
