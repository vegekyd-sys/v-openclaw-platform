"""Send reply-suggestion sample cards to one Feishu test chat as the V bot.

Run on V as root: python3 send_cards.py <chat_id> <variant>[,<variant>...]
Reads appId/appSecret from the Gateway config in-process; never prints them.
Clickable buttons use OpenClaw's native ocf1 `k:"quick"` envelope, so a click is
handled by the running Gateway exactly like any existing quick-action button.
"""
import json
import sys
import time
import urllib.request

CONFIG_PATH = "/home/openclaw/.openclaw/openclaw.json"
API = "https://open.feishu.cn/open-apis"

REPLY = (
    "（样例卡｜回复建议展示方案）\n\n"
    "**三种入口里，飞书只有卡片按钮能做到「每条回复动态给建议」。**\n"
    "- 机器人菜单：只支持私聊，内容在开发者后台静态配置\n"
    "- 群菜单：只能放跳转链接，最多 3 个一级菜单\n"
    "- 斜杠命令：整个应用共用一套，不能按回复变化\n\n"
    "所以建议放在回复卡片底部，点击走卡片回调，以点击者身份进入正常入站。"
)
SUGGESTIONS = ["按钮放卡片里还是单独发一条", "群里谁点都行会不会乱", "先在测试群开一周看点击率"]
FOOTER = "Agent: V × Makaron | Model: gpt-6.1-sol | Provider: openai | Runtime: codex"


def http(method, url, body=None, token=None):
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        return json.load(urllib.request.urlopen(req, timeout=20))
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")


def token():
    fs = json.load(open(CONFIG_PATH))["channels"]["feishu"]
    r = http("POST", API + "/auth/v3/tenant_access_token/internal",
             {"app_id": fs["appId"], "app_secret": fs["appSecret"]})
    return r["tenant_access_token"]


def quick(chat_id, text):
    return {"oc": "ocf1", "k": "quick", "a": "v.reply_suggestion", "q": text,
            "c": {"h": chat_id, "e": int(time.time() * 1000) + 6 * 3600 * 1000, "t": "group"}}


def md(text, grey=False):
    return {"tag": "markdown", "content": f"<font color='grey'>{text}</font>" if grey else text}


def button(chat_id, text, width="fill"):
    return {"tag": "button", "text": {"tag": "plain_text", "content": text}, "type": "default",
            "width": width, "size": "medium", "behaviors": [{"type": "callback", "value": quick(chat_id, text)}]}


def card(elements, summary):
    return {"schema": "2.0", "config": {"width_mode": "fill", "update_multi": True, "summary": {"content": summary}},
            "body": {"elements": elements}}


def variant(chat_id, name):
    if name == "in-card-stacked":
        return card([md(REPLY), md("接下来可以说", grey=True)]
                    + [button(chat_id, s) for s in SUGGESTIONS]
                    + [{"tag": "hr"}, md(FOOTER, grey=True)], "回复建议样例 A")
    if name == "in-card-flow":
        cols = [{"tag": "column", "width": "auto", "elements": [button(chat_id, s, width="default")]} for s in SUGGESTIONS]
        return card([md(REPLY), md("接下来可以说", grey=True),
                     {"tag": "column_set", "flex_mode": "flow", "horizontal_spacing": "8px", "columns": cols},
                     {"tag": "hr"}, md(FOOTER, grey=True)], "回复建议样例 B")
    if name == "reply-only":
        return card([md(REPLY.replace("（样例卡｜回复建议展示方案）", "（样例卡｜建议单独另发一条）")), {"tag": "hr"}, md(FOOTER, grey=True)], "样例 D 正文")
    if name == "separate":
        return card([md("接下来可以说", grey=True)] + [button(chat_id, s) for s in SUGGESTIONS], "回复建议")
    if name == "clicked":
        chosen = SUGGESTIONS[1]
        done = [{"tag": "button", "text": {"tag": "plain_text", "content": s}, "type": "primary_filled" if s == chosen else "default",
                 "width": "fill", "size": "medium", "disabled": True, "disabled_tips": {"tag": "plain_text", "content": "已选过"}}
                for s in SUGGESTIONS]
        return card([md(REPLY), md("接下来可以说", grey=True)] + done
                    + [md(f"<font color='grey'>↳ 蔡天懿 发送了「{chosen}」</font>"), {"tag": "hr"}, md(FOOTER, grey=True)],
                    "回复建议样例 A（已点击）")
    if name == "input":
        form = {"tag": "form", "name": "rs_form", "elements": [
            {"tag": "input", "name": "rs_text", "default_value": SUGGESTIONS[1], "width": "fill",
             "placeholder": {"tag": "plain_text", "content": "改一改再发"}},
            {"tag": "button", "text": {"tag": "plain_text", "content": "发送"}, "type": "primary_filled",
             "form_action_type": "submit", "name": "rs_submit",
             "behaviors": [{"type": "callback", "value": quick(chat_id, SUGGESTIONS[1])}]}]}
        return card([md(REPLY), md("接下来可以说（可先改再发）", grey=True), form,
                     {"tag": "hr"}, md(FOOTER, grey=True)], "回复建议样例 C")
    raise SystemExit("unknown variant " + name)


def main():
    chat_id, names = sys.argv[1], sys.argv[2].split(",")
    tok = token()
    for name in names:
        r = http("POST", API + "/im/v1/messages?receive_id_type=chat_id", {
            "receive_id": chat_id, "msg_type": "interactive",
            "content": json.dumps(variant(chat_id, name), ensure_ascii=False)}, tok)
        print(name, r.get("code"), r.get("msg"), (r.get("data") or {}).get("message_id"))


if __name__ == "__main__":
    main()
