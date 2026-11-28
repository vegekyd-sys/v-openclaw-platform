"""Minimal Tencent COS (XML API v5) client, standard library only.

Signing follows https://cloud.tencent.com/document/product/436/7778 (q-sign-algorithm=sha1).
Credentials come from TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY. From V the
regional endpoint resolves to Tencent's internal network, so traffic is free and does
not use the public bandwidth.
"""
import base64
import hashlib
import hmac
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

REGION = os.environ.get("V_COS_REGION", "ap-singapore")


def _quote(s):
    return urllib.parse.quote(str(s), safe="-_.~")


def sign(method, path, params, headers, sid, key, now=None, ttl=3600):
    now = int(now or time.time())
    key_time = "%d;%d" % (now - 60, now + ttl)
    sign_key = hmac.new(key.encode(), key_time.encode(), hashlib.sha1).hexdigest()
    p = sorted((_quote(k).lower(), _quote(v)) for k, v in params.items())
    h = sorted((_quote(k).lower(), _quote(v)) for k, v in headers.items())
    http_string = "%s\n%s\n%s\n%s\n" % (method.lower(), path, "&".join("%s=%s" % kv for kv in p),
                                        "&".join("%s=%s" % kv for kv in h))
    to_sign = "sha1\n%s\n%s\n" % (key_time, hashlib.sha1(http_string.encode()).hexdigest())
    sig = hmac.new(sign_key.encode(), to_sign.encode(), hashlib.sha1).hexdigest()
    return ("q-sign-algorithm=sha1&q-ak=%s&q-sign-time=%s&q-key-time=%s&q-header-list=%s"
            "&q-url-param-list=%s&q-signature=%s" % (sid, key_time, key_time, ";".join(k for k, _ in h),
                                                     ";".join(k for k, _ in p), sig))


class CosError(RuntimeError):
    def __init__(self, status, code, message, request_id):
        super().__init__("COS %s %s: %s (RequestId %s)" % (status, code, message, request_id))
        self.status, self.code = status, code


def request(method, bucket, key="", params=None, body=b"", headers=None, region=REGION, timeout=300, stream=False):
    sid = os.environ["TENCENTCLOUD_SECRET_ID"]
    sk = os.environ["TENCENTCLOUD_SECRET_KEY"]
    params = dict(params or {})
    headers = dict(headers or {})
    host = "%s.cos.%s.myqcloud.com" % (bucket, region) if bucket else "service.cos.myqcloud.com"
    path = "/" + key.lstrip("/")
    if body and "Content-MD5" not in headers and not hasattr(body, "read"):
        headers["Content-MD5"] = base64.b64encode(hashlib.md5(body).digest()).decode()
    signed = {"host": host}
    signed.update({k: v for k, v in headers.items() if k.lower() in ("content-md5", "content-type", "content-length")
                   or k.lower().startswith("x-cos-")})
    headers["Authorization"] = sign(method, path, params, signed, sid, sk)
    headers["Host"] = host
    if os.environ.get("TENCENTCLOUD_TOKEN"):
        headers["x-cos-security-token"] = os.environ["TENCENTCLOUD_TOKEN"]
    qs = "&".join(("%s=%s" % (_quote(k), _quote(v))) if v != "" else _quote(k) for k, v in params.items())
    url = "https://%s%s%s" % (host, urllib.parse.quote(path), ("?" + qs) if qs else "")
    req = urllib.request.Request(url, data=body if method in ("PUT", "POST") else None, method=method, headers=headers)
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        if stream:
            return r.status, dict(r.headers), r  # caller reads and closes
        with r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        data = e.read()
        code = msg = rid = ""
        try:
            root = ET.fromstring(data)
            code, msg, rid = (root.findtext("Code") or "", root.findtext("Message") or "", root.findtext("RequestId") or "")
        except ET.ParseError:
            msg = data[:200].decode(errors="replace")
        raise CosError(e.code, code, msg, rid) from None


def xml_text(data, path):
    return ET.fromstring(data).findtext(path)
