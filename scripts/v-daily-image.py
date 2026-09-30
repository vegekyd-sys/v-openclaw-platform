#!/usr/bin/env python3
"""Daily online image of V's system disk, keeping the newest three. Runs on V.

On 2026-09-29 a Night Shift task ran `rm -rf work` in the shared workspace and
took ~97 GB with it. There was no snapshot, no image and no backup that did not
live on the same disk, so the files had to be carved out of free space a day
later and most of them were gone. A daily image of the system disk (where the
workspace lives) would have held every one of them.

Lighthouse custom images are free for the first five per region, so this keeps
three dailies and leaves room for an incident image. It only ever touches
images whose name starts with PREFIX; anything else in the account is left
alone. Data disks are not in a Lighthouse image; that is a known gap.

The image is taken with the instance running. CreateBlueprint's ForcePowerOff
defaults to True, which shuts the instance down first -- on production that is
an outage -- so this passes False explicitly and refuses to run otherwise.

    ./v-daily-image.py --check   show images and what a run would do; change nothing
    ./v-daily-image.py           create today's image if missing, then prune; alert on failure

Credentials come from TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY in the
environment (the unit loads the Gateway's env file). Nothing is written to disk
except a small state file for alert de-duplication.
"""
import datetime
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

INSTANCE_ID = os.environ.get("V_DAILY_IMAGE_INSTANCE", "lhins-89f5exr5")
REGION = os.environ.get("TENCENTCLOUD_REGION") or "ap-singapore"
PREFIX = "v-daily-"
KEEP = 3
CREATE_TIMEOUT_S = 90 * 60
POLL_S = 60
STATE_PATH = "/var/lib/v-sentinel/daily-image.json"
TZ = datetime.timezone(datetime.timedelta(hours=8))  # Asia/Shanghai, no DST


def call(action, payload, service="lighthouse", version="2020-03-24"):
    """Tencent Cloud API 3.0 (TC3-HMAC-SHA256). Returns Response; raises on API error."""
    sid = os.environ["TENCENTCLOUD_SECRET_ID"]
    key = os.environ["TENCENTCLOUD_SECRET_KEY"]
    host = service + ".tencentcloudapi.com"
    body = json.dumps(payload, separators=(",", ":")).encode()
    ts = int(time.time())
    date = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime("%Y-%m-%d")
    canonical = ("POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:%s\n\n"
                 "content-type;host\n%s" % (host, hashlib.sha256(body).hexdigest()))
    scope = "%s/%s/tc3_request" % (date, service)
    to_sign = "TC3-HMAC-SHA256\n%d\n%s\n%s" % (ts, scope, hashlib.sha256(canonical.encode()).hexdigest())

    def hm(k, m):
        return hmac.new(k, m.encode(), hashlib.sha256).digest()

    sig = hmac.new(hm(hm(hm(("TC3" + key).encode(), date), service), "tc3_request"),
                   to_sign.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request("https://" + host, data=body, headers={
        "Content-Type": "application/json; charset=utf-8", "Host": host,
        "X-TC-Action": action, "X-TC-Version": version, "X-TC-Timestamp": str(ts), "X-TC-Region": REGION,
        "Authorization": "TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=content-type;host, Signature=%s"
                         % (sid, scope, sig)})
    with urllib.request.urlopen(req, timeout=30) as f:
        resp = json.load(f)["Response"]
    if "Error" in resp:
        raise RuntimeError("%s: %s %s" % (action, resp["Error"].get("Code"), resp["Error"].get("Message")))
    return resp


def daily_images():
    """Our images only, oldest first."""
    out = []
    offset = 0
    while True:
        r = call("DescribeBlueprints", {"Offset": offset, "Limit": 100,
                                        "Filters": [{"Name": "blueprint-type", "Values": ["PRIVATE"]}]})
        page = r.get("BlueprintSet") or []
        out += [b for b in page if (b.get("BlueprintName") or "").startswith(PREFIX)]
        offset += len(page)
        if not page or offset >= r.get("TotalCount", 0):
            break
    return sorted(out, key=lambda b: b["BlueprintName"])


def free_quota():
    r = call("DescribeGeneralResourceQuotas", {"ResourceNames": ["FREE_BLUEPRINT"]})
    q = (r.get("GeneralResourceQuotaSet") or [{}])[0]
    return q.get("ResourceQuotaAvailable", 0)


def instance_state():
    r = call("DescribeInstances", {"InstanceIds": [INSTANCE_ID]})
    return r["InstanceSet"][0]["InstanceState"]


def plan(images, today, quota_free):
    """Decide what to do. Pure, so it can be tested without the cloud.

    Returns (create_name or None, [ids to delete before creating], [ids to delete after]).
    Never deletes today's image, never leaves fewer than KEEP-1 older good ones
    before a new one exists, and never touches non-PREFIX images (callers pass
    only ours).
    """
    name = PREFIX + today
    good = [b for b in images if b.get("BlueprintState") == "NORMAL"]  # oldest first
    create = None if any(b["BlueprintName"] == name for b in images) else name
    before = []
    if create and quota_free < 1 and len(good) >= KEEP:
        # Out of free quota: make room, but only out of a full set of good ones.
        before = [good[0]["BlueprintId"]]
    remaining = [b for b in good if b["BlueprintId"] not in before]
    excess = max(0, len(remaining) + (1 if create else 0) - KEEP)
    after = [b["BlueprintId"] for b in remaining[:excess]]
    after += [b["BlueprintId"] for b in images
              if b.get("BlueprintState") in ("CREATEFAILED", "FAILED") and b["BlueprintName"] != name]
    return create, before, after


def wait_normal(blueprint_id):
    deadline = time.time() + CREATE_TIMEOUT_S
    while time.time() < deadline:
        r = call("DescribeBlueprints", {"BlueprintIds": [blueprint_id]})
        b = (r.get("BlueprintSet") or [{}])[0]
        st = b.get("BlueprintState")
        if st == "NORMAL":
            return True, st
        if st not in ("CREATING", "SYNCING", None):
            return False, st
        time.sleep(POLL_S)
    return False, "TIMEOUT"


def create(name):
    params = {"BlueprintName": name, "InstanceId": INSTANCE_ID, "ForcePowerOff": False,
              "Description": "daily online image of V system disk (v-daily-image.timer); keep %d" % KEEP}
    assert params["ForcePowerOff"] is False  # True would shut production down first
    return call("CreateBlueprint", params)["BlueprintId"]


def run(check):
    today = datetime.datetime.now(TZ).strftime("%Y%m%d")
    images = daily_images()
    quota = free_quota()
    todo_create, del_before, del_after = plan(images, today, quota)
    print("instance %s, free image quota left %d" % (INSTANCE_ID, quota))
    for b in images:
        print("  %-20s %-14s %s %s" % (b["BlueprintName"], b["BlueprintId"], b.get("BlueprintState"), b.get("CreatedTime")))
    print("plan: create=%s delete_before=%s delete_after=%s" % (todo_create, del_before, del_after))
    if check:
        return 0, None
    for bid in del_before:
        call("DeleteBlueprints", {"BlueprintIds": [bid]})
    if todo_create:
        if instance_state() != "RUNNING":
            return 1, "实例状态不是 RUNNING，今天不做镜像（%s）" % instance_state()
        bid = create(todo_create)
        ok, st = wait_normal(bid)
        state_after = instance_state()
        if state_after != "RUNNING":
            return 1, "做镜像后实例状态变成 %s（镜像 %s）——立刻检查 V" % (state_after, bid)
        if not ok:
            return 1, "镜像 %s（%s）没有完成：%s；旧镜像未删除" % (todo_create, bid, st)
        print("created %s %s" % (todo_create, bid))
    if del_after:
        call("DeleteBlueprints", {"BlueprintIds": del_after})
        print("deleted %s" % del_after)
    return 0, None


def load_state():
    try:
        with open(STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(s):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(s, f)
    os.replace(tmp, STATE_PATH)


def main():
    check = "--check" in sys.argv[1:]
    try:
        code, problem = run(check)
    except Exception as e:  # API/network/credential failure is itself the alert
        code, problem = 1, "脚本异常：%s" % str(e)[:300]
    if check or not problem:
        if not check:
            save_state({"lastOk": datetime.datetime.now(TZ).isoformat()})
        return code
    print(problem, file=sys.stderr)
    today = datetime.datetime.now(TZ).strftime("%Y-%m-%d")
    st = load_state()
    if st.get("alerted") != today:
        from sentinel import feishu  # noqa: E402  (installed alongside in /opt/v-sentinel)
        text = ("【V 每日镜像失败】%s\n%s\n上次成功：%s\n"
                "手动检查：sudo /usr/bin/python3 /opt/v-sentinel/daily-image.py --check\n"
                "说明：docs/v-daily-image.md" % (today, problem, st.get("lastOk", "无记录")))
        if feishu(text):
            st["alerted"] = today
            save_state(st)
    return code


if __name__ == "__main__":
    sys.exit(main())
