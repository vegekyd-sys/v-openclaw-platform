"""Enrich a usage snapshot on V using session metadata and the owning Feishu app."""
import gzip
import json
import re
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from contextlib import closing
from pathlib import Path

ROOT = Path.home() / ".openclaw"
NO_PERSON = {"未归属", "系统任务"}


def display_name(value):
    return isinstance(value, str) and value.strip() and not re.match(r"^(ou_|oc_|on_)", value)


def session_labels(snapshot, root):
    selected = defaultdict(set)
    for row in snapshot["rows"]:
        if row[2] not in NO_PERSON:
            agent, _, sid = row[3].partition("/")
            selected[agent].add(sid)
    sessions, chats = {}, defaultdict(set)
    for path in (root / "agents").glob("*/agent/openclaw-agent.sqlite"):
        agent = path.parent.parent.name
        ids = sorted(selected.get(agent, ()))
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
            for offset in range(0, len(ids), 300):
                batch = ids[offset:offset+300]
                sql = """SELECT w.session_id,w.session_key,coalesce(c.kind,w.chat_type),w.display_name,c.label,
                         c.peer_id,w.channel,w.account_id FROM session_windows w LEFT JOIN conversations c
                         ON c.conversation_id=w.primary_conversation_id WHERE w.session_id IN ("""
                for sid, key, kind, title, label, peer, channel, account in db.execute(
                        sql + ",".join("?" for _ in batch) + ")", batch):
                    ref = agent + "/" + sid
                    title = re.sub(r"^(feishu:)?(g-)?", "", title or label or "").strip()
                    if re.search(r"(oc_|ou_|om_)[a-zA-Z0-9]+", title):
                        title = ""
                    sessions[ref] = {"kind": kind or "", "title": title[:90]}
                    if (channel in ("feishu", None) and account in ("default", None) and kind in ("group","channel","direct")):
                        match = re.search(r"oc_[0-9a-f]{32}", peer or "") or re.search(r"oc_[0-9a-f]{32}", key or "")
                        if match:
                            chats[match.group()].add(ref)
            targets = [json.loads(k)[2] for k in {r[2] for r in snapshot["rows"] if r[2] not in NO_PERSON}
                       if json.loads(k)[0:2] == ["feishu", "default"]]
            if targets:
                sql = """SELECT DISTINCT w.session_key,c.peer_id,c.native_channel_id,c.delivery_target
                         FROM session_participants sp JOIN session_windows w ON w.session_key=sp.session_key
                         LEFT JOIN conversations c ON c.conversation_id=w.primary_conversation_id
                         WHERE sp.actor_id IN (""" + ",".join("?" for _ in targets) + """)
                         AND json_extract(sp.identity_namespace,'$.pluginId')='feishu'
                         AND json_extract(sp.identity_namespace,'$.accountId')='default'"""
                for key, peer, channel_id, target in db.execute(sql, targets):
                    for value in (peer,channel_id,target,key):
                        match = re.search(r"oc_[0-9a-f]{32}",value or "")
                        if match:
                            chats.setdefault(match.group(),set())
                            break
    return sessions, chats


def api(path, token=None, payload=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request("https://open.feishu.cn/open-apis/" + path, headers=headers,
                                 data=json.dumps(payload).encode() if payload else None)
    with urllib.request.urlopen(req, timeout=12) as res:
        result = json.load(res)
    if result.get("code") != 0:
        raise ValueError("Feishu lookup unavailable")
    return result


def nightshift_sessions(snapshot, root):
    """Join dedicated workboard execution sessions to cards recorded by Night Shift."""
    source = root / "nightshift/nightshift.sqlite"
    if not source.exists():
        return None
    keys = defaultdict(set)
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as db:
        cards = {card for (card,) in db.execute("""
            SELECT card_id FROM stage_runs UNION SELECT card_id FROM content_item_runs
            UNION SELECT json_extract(payload_json,'$.cardId') FROM audit_events
            WHERE type='workboard.card.created'
        """) if card}
        for card, key in db.execute("""
            SELECT json_extract(payload_json,'$.cardId'),json_extract(payload_json,'$.evidence.sessionKey')
            FROM audit_events WHERE type='stage.completion.validated'
        """):
            if card and key and ":subagent:" in key:
                cards.add(card)
                keys[key].add(card)
    with closing(sqlite3.connect((root / "state/openclaw.sqlite").as_uri() + "?mode=ro", uri=True)) as db:
        for run, key in db.execute("""
            SELECT run_id,child_session_key FROM subagent_runs WHERE run_id LIKE 'workboard:%'
            UNION ALL SELECT run_id,child_session_key FROM task_runs WHERE run_id LIKE 'workboard:%'
        """):
            parts = run.split(":")
            if len(parts) == 3 and key and ":subagent:" in key:
                keys[key].add(parts[1])
    wanted = {r[3] for r in snapshot["rows"]}
    refs = defaultdict(set)
    for path in (root / "agents").glob("*/agent/openclaw-agent.sqlite"):
        agent = path.parent.parent.name
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as db:
            for sid, key in db.execute("""
                SELECT session_id,session_key FROM session_windows WHERE session_key LIKE '%:subagent:%'
                UNION ALL SELECT session_id,session_key FROM session_transcript_archives
                WHERE session_key LIKE '%:subagent:%'
            """):
                ref = agent + "/" + sid
                if ref not in wanted:
                    continue
                matches = set(keys.get(key, ()))
                prefix = f"agent:{agent}:subagent:workboard-nightshift-"
                if key.startswith(prefix) and key[len(prefix):] in cards:
                    matches.add(key[len(prefix):])
                refs[ref].update(matches)
    return {ref: next(iter(matches)) for ref, matches in refs.items()
            if len(matches) == 1 and next(iter(matches)) in cards}


def enrich(snapshot, root=ROOT):
    snapshot["nightshift"] = nightshift_sessions(snapshot, root)
    sessions, chats = session_labels(snapshot, root)
    snapshot["sessions"] = sessions
    people = {row[2] for row in snapshot["rows"] if row[2] not in NO_PERSON}
    names = {key: snapshot["names"][key] for key in people if display_name(snapshot["names"].get(key))}
    by_id = {}
    for key in people:
        channel, account, actor = json.loads(key)
        if channel == "feishu" and account in ("", "default") and actor.startswith("ou_"):
            by_id.setdefault(actor, []).append(key)
    source = {key: "会话发送人" for key in names}
    def record(actor, name, origin):
        if display_name(name):
            for key in by_id.get(actor, ()):
                if origin == "飞书通讯录" or key not in names:
                    names[key], source[key] = name.strip(), origin
    try:
        cfg = json.loads((root / "openclaw.json").read_text())["channels"]["feishu"]
        app = cfg.get("accounts", {}).get("default", {})
        token = api("auth/v3/tenant_access_token/internal", payload={
            "app_id": app.get("appId") or cfg["appId"], "app_secret": app.get("appSecret") or cfg["appSecret"]
        })["tenant_access_token"]
        ids = sorted(by_id)
        for i in range(0,len(ids),30):
            params = urllib.parse.urlencode({"user_ids":ids[i:i+30],"user_id_type":"open_id"},doseq=True)
            try:
                for person in api("contact/v3/users/batch?"+params,token)["data"].get("items", []):
                    record(person.get("open_id"),person.get("name"),"飞书通讯录")
            except (OSError, ValueError, KeyError):
                continue
        for chat in chats:
            if all(k in names for keys in by_id.values() for k in keys):
                break
            page = ""
            try:
                while True:
                    params = {"member_id_type":"open_id","page_size":100}
                    if page:
                        params["page_token"] = page
                    data = api("im/v1/chats/"+chat+"/members?"+urllib.parse.urlencode(params),token)["data"]
                    for member in data.get("items", []):
                        record(member.get("member_id"),member.get("name"),"飞书群成员")
                    if not data.get("has_more") or not data.get("page_token"):
                        break
                    page = data["page_token"]
            except (OSError, ValueError, KeyError):
                continue
    except (OSError, ValueError, KeyError):
        pass
    snapshot.update(names=names, nameSources=source)
    return snapshot


if __name__ == "__main__":
    data = json.loads(gzip.decompress(sys.stdin.buffer.read()))
    sys.stdout.buffer.write(gzip.compress(json.dumps(enrich(data),ensure_ascii=False).encode()))
