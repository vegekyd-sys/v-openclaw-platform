#!/usr/bin/env python3
"""What this V can and cannot do right now, in words the owner understands.

The installer writes ~/.openclaw/v-capabilities.json on every configure:
  {"at": ..., "<capability>": {"on": true} | {"on": false, "reason": ..., "howTo": ...}, "unreachable": [...]}
`reason` and `howTo` are for whoever deployed this machine. This script turns the switched-off
capabilities into one plain paragraph for the owner (`tellOwner`) and keeps the technical part
for the deployer (`forDeployer`). It never prints secrets: the file holds none.

  python3 scripts/v-capabilities.py            JSON: on, off, unreachable, tellOwner, forDeployer
Exit code 0 when the file was read, 3 when there is no file yet (installer too old or not configured).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# The owner's words for each capability being off. Unknown capabilities fall back to their name.
OWNER_WORDS = {
    "memoryVectorSearch": "找记忆现在只能按关键词找，还不能按意思找（你换个说法问同一件事，我可能找不到）",
    "imageUnderstandingXai": "看图片的增强功能没开（普通的看图片不受影响）",
    "makaron": "出图、出视频（Makaron）还没开通",
    "socialSearch": "小红书、抖音、TikTok 这类社媒内容我现在搜不了",
    "voiceTranscription": "你发的语音我现在转不成文字，先打字给我",
    "feishu": "飞书还没接上",
    "groupChats": "群聊还没打开，现在只能在私聊里找我",
    "desktop": "我还不能替你操作电脑和浏览器（在网页上点、填表、下单）",
    "publicLinks": "我做的网页、演示稿还不能生成别人直接打开的链接，会先把文件发给你",
    "nightshift": "夜班（按流程批量生产内容）没开",
}
ORDER = list(OWNER_WORDS)


def capabilities_file() -> Path:
    if os.environ.get("V_CAPABILITIES_FILE"):
        return Path(os.environ["V_CAPABILITIES_FILE"])
    state = os.environ.get("OPENCLAW_STATE_DIR") or "@@STATE_DIR@@"
    if state.startswith("@@"):
        state = str(Path.home() / ".openclaw")
    return Path(state) / "v-capabilities.json"


def main() -> None:
    path = capabilities_file()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        print(json.dumps({"ok": False, "file": str(path), "missing": True, "tellOwner": None,
                          "hint": "没有能力清单：安装器还没 configure 过，或者版本太旧。不要猜，跟主人只说已经确认能用的。"},
                         ensure_ascii=False))
        sys.exit(3)
    caps = {k: v for k, v in data.items() if isinstance(v, dict) and "on" in v}
    on = [k for k in ORDER if caps.get(k, {}).get("on")] + sorted(k for k in caps if k not in ORDER and caps[k].get("on"))
    off = [k for k in ORDER if k in caps and not caps[k].get("on")] + sorted(k for k in caps if k not in ORDER and not caps[k].get("on"))
    unreachable = list(data.get("unreachable") or [])
    lines = [OWNER_WORDS.get(k, k) for k in off if k != "feishu"]
    tell = None
    if lines:
        tell = ("先说清楚这台机器现在还做不了的：" + "；".join(lines)
                + "。这些都可以以后再打开，你想用哪一项就告诉我，我请部署的同事来开。")
    print(json.dumps({
        "ok": True, "file": str(path), "at": data.get("at"), "on": on, "off": off, "unreachable": unreachable,
        "tellOwner": tell,
        "forDeployer": [{"capability": k, "reason": caps[k].get("reason"), "howTo": caps[k].get("howTo")} for k in off],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
