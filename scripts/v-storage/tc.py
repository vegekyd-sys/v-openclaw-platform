"""Minimal Tencent Cloud API 3.0 client (TC3-HMAC-SHA256), standard library only.

Same signing as scripts/v-daily-image.py. Credentials come from
TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY in the environment; the
systemd units load them from the Gateway's env file. Nothing here logs or
returns them.
"""
import datetime
import hashlib
import hmac
import json
import os
import time
import urllib.request

REGION = os.environ.get("TENCENTCLOUD_REGION") or "ap-singapore"

VERSIONS = {"lighthouse": "2020-03-24", "billing": "2018-07-09", "monitor": "2018-07-24"}


class ApiError(RuntimeError):
    def __init__(self, action, code, message, request_id):
        super().__init__("%s: %s %s (RequestId %s)" % (action, code, message, request_id))
        self.code = code
        self.request_id = request_id


def call(action, payload, service="lighthouse", region=REGION):
    sid = os.environ["TENCENTCLOUD_SECRET_ID"]
    key = os.environ["TENCENTCLOUD_SECRET_KEY"]
    version = VERSIONS[service]
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
    headers = {
        "Content-Type": "application/json; charset=utf-8", "Host": host,
        "X-TC-Action": action, "X-TC-Version": version, "X-TC-Timestamp": str(ts),
        "Authorization": "TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=content-type;host, Signature=%s"
                         % (sid, scope, sig)}
    if region:
        headers["X-TC-Region"] = region
    req = urllib.request.Request("https://" + host, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as f:
        resp = json.load(f)["Response"]
    if "Error" in resp:
        raise ApiError(action, resp["Error"].get("Code"), resp["Error"].get("Message"), resp.get("RequestId"))
    return resp
