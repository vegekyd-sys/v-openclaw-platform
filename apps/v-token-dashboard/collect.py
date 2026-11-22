"""Read V's usage on the source host. Stdout contains only compressed usage metadata."""
import argparse
import collections
import datetime as dt
import gzip
import json
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path

BEIJING = dt.timezone(dt.timedelta(hours=8))
UNKNOWN = "未归属"
SYSTEM = "系统任务"


def timestamp(value):
    if isinstance(value, (int, float)):
        return value / 1000 if value > 1e11 else value
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def database(path):
    return closing(sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=3))


def token_counts(usage, native=False):
    def number(key):
        value = usage.get(key, 0)
        if value is None:
            return 0
        if type(value) is not int or value < 0:
            raise ValueError("invalid token counter")
        return value
    if native:
        read, write = number("cached_input_tokens"), number("cache_write_input_tokens")
        plain = number("input_tokens") - read - write
        output, key = number("output_tokens"), "total_tokens"
    else:
        plain, read, write, output = (number(k) for k in ("input", "cacheRead", "cacheWrite", "output"))
        key = "totalTokens"
    parts = (max(0, plain), read, write, output)
    total = number(key) if usage.get(key) is not None else sum(parts)
    return (*parts, total)


class Ledger:
    def __init__(self, start, end):
        self.start, self.end = start, end
        self.openclaw, self.native, self.legacy = {}, {}, {}
        self.routes = collections.defaultdict(set)
        self.names = {}
        self.session_keys = {}
        self.session_kinds = {}
        self.launches = collections.defaultdict(set)
        self.stats = collections.Counter()

    def route(self, channel, account, actor, name, session):
        if actor:
            user = json.dumps([channel, account or "", actor], ensure_ascii=False, separators=(",", ":"))
            self.names[user] = (name or self.names.get(user) or actor)
        else:
            user = SYSTEM if channel == "cron" else UNKNOWN
        return channel or UNKNOWN, user, session

    def read_agent(self, path):
        agent = path.parent.parent.name
        with database(path) as db:
            self.stats["agentDatabases"] += 1
            windows = db.execute("""
                SELECT w.session_id,w.channel,w.account_id,w.session_key,c.channel,c.account_id,
                       c.kind,c.native_direct_user_id
                  FROM session_windows w LEFT JOIN conversations c
                    ON c.conversation_id=w.primary_conversation_id
                 WHERE coalesce(w.transcript_updated_at,w.updated_at)>=?
            """, (self.start * 1000,)).fetchall()
            metadata = {row[0]: row for row in windows}
            for window in windows:
                events = db.execute("SELECT seq,event_json FROM transcript_events WHERE session_id=? ORDER BY seq", (window[0],))
                self.read_events(agent, window, events)
            for sid, key, encoding, blob in db.execute("""
                    SELECT session_id,session_key,encoding,archive_blob FROM session_transcript_archives
                    WHERE created_at>=? ORDER BY created_at DESC
                    """, (self.start * 1000,)):
                if encoding == "zstd":
                    raw = subprocess.run(["zstd", "-qd", "--stdout"], input=blob, stdout=subprocess.PIPE, check=True).stdout
                elif encoding == "gzip":
                    raw = gzip.decompress(blob)
                else:
                    raise ValueError("unsupported transcript archive encoding")
                window = metadata.get(sid, (sid, None, None, key, None, None, None, None))
                self.read_events(agent, window, enumerate(raw.splitlines()))
                self.stats["archiveVersions"] += 1

    def read_events(self, agent, window, events):
        sid, ch, account, key, cch, caccount, kind, peer = window
        kind_key = (key.split(":") + ["", "", ""])[2]
        known_routes = ("cron", "subagent", "dashboard", "feishu", "wecom", "msteams", "telegram", "dingtalk-connector")
        base = ch or cch or (kind_key if kind_key in known_routes else UNKNOWN)
        session = agent + "/" + sid
        self.session_keys[session] = key
        if kind:
            self.session_kinds[session] = kind
        default = self.route(base, account or caccount, peer if kind == "direct" else None, None, session)
        parents, runs = {}, {}
        for seq, raw in events:
            event = json.loads(raw)
            m = event.get("message") or {}
            meta = m.get("__openclaw") or {}
            parent = event.get("parentId")
            route = parents.get(parent, default)
            role = m.get("role")
            mirror = meta.get("mirrorOrigin") == "codex-app-server"
            turn = (meta.get("mirrorIdentity") or "").partition(":")[0] if mirror else ""
            run = meta.get("runId")
            if role == "user":
                ident = meta.get("senderIdentity") or {}
                transport = meta.get("transport") or {}
                actor = meta.get("senderId") if ident.get("senderKind") in (None, "human") else None
                if actor:
                    route = self.route(transport.get("channel") or ident.get("pluginId") or base,
                                       ident.get("accountId") or account or caccount,
                                       actor, meta.get("senderName"), session)
                else:
                    route = default
                if run:
                    runs[run] = route if runs.get(run, route) == route else (base, UNKNOWN, session)
            elif run:
                route = runs.get(run, route)
            if role == "assistant" and m.get("openclawAutomation"):
                route = (base, SYSTEM, session)
            if role == "toolResult" and m.get("toolName") == "sessions_spawn" and not m.get("isError"):
                details = m.get("details") or {}
                child = details.get("childSessionKey")
                if child and details.get("status") == "accepted" and details.get("mode") == "run":
                    self.launches[child].add((details.get("runId"), route))
            if event.get("id"):
                parents[event["id"]] = route
            if turn:
                self.routes[turn].add(route)
            if role != "assistant" or m.get("api") == "openclaw-transcript":
                continue
            ts = timestamp(event.get("timestamp") or m["timestamp"])
            if not self.start <= ts < self.end:
                continue
            counts = token_counts(m.get("usage") or {})
            if not any(counts):
                self.stats["zeroOrMissing"] += 1
                continue
            provider = m.get("provider") or "未知"
            model = m.get("responseModel") or m.get("model") or "未知"
            response = m.get("responseId")
            identity = (provider, response) if response else (("mirror", meta["mirrorIdentity"], provider)
                       if turn else (agent, event.get("id") or (sid, seq), ts))
            self.openclaw.setdefault(identity, (ts, route, provider, model, counts, turn))


    def read_rollout(self, path, agent):
        state = {}
        previous = None
        keys = ("input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens")
        # Skip large tool/output lines before JSON decoding. Only top-level type headers qualify.
        with path.open("rb") as stream:
            for line in stream:
                if not line.endswith(b"\n"):
                    self.stats["partialLines"] += 1
                    break
                if not any(tag in line[:160] for tag in (b'"session_meta"', b'"turn_context"',
                                                        b'"event_msg"', b'"token_usage_record"')):
                    continue
                if b'"event_msg"' in line[:160] and not any(tag in line[:240] for tag in
                        (b'"task_started"', b'"token_count"')):
                    continue
                d = json.loads(line)
                p = d["payload"]
                kind = d["type"]
                ts = timestamp(d["timestamp"])
                if kind == "session_meta":
                    state.update(session=p["id"], born=timestamp(p.get("timestamp") or d["timestamp"]),
                                 fork=bool(p.get("forked_from_id")), provider=p.get("model_provider") or "未知")
                elif kind == "turn_context":
                    state.update(turn=p.get("turn_id"), model=p.get("model") or "未知")
                elif kind == "event_msg" and p.get("type") == "task_started":
                    state.update(turn=p.get("turn_id"), started=timestamp(p.get("started_at") or d["timestamp"]))
                elif kind == "token_usage_record" or (kind == "event_msg" and p.get("type") == "token_count"):
                    turn = p.get("turn_id") or state.get("turn")
                    session = state.get("session")
                    if not turn or not session:
                        continue
                    if kind == "token_usage_record":
                        usage = p.get("usage") or {}
                        dest, rid = self.native, p.get("response_id")
                        if not rid:
                            continue
                    else:
                        info = p.get("info") or {}
                        total = info.get("total_token_usage")
                        if not total:
                            continue
                        reset = not previous or any(total.get(k, 0) < previous.get(k, 0) for k in ("input_tokens", "output_tokens"))
                        usage = (info.get("last_token_usage") or {}) if reset else {
                            k: max(0, total.get(k, 0) - previous.get(k, 0)) for k in keys}
                        previous = total
                        dest, rid = self.legacy, (turn, total.get("input_tokens"), total.get("output_tokens"))
                    if not self.start <= ts < self.end or (state.get("fork") and state.get("started", 0) < state["born"]):
                        continue
                    counts = token_counts(usage, native=True)
                    if counts[-1]:
                        dest.setdefault((state["provider"], rid), (ts, agent + "/" + session,
                                        state["provider"], state.get("model", "未知"), counts, turn))

    def read_home(self, home, agent):
        dbpath = home / "state_5.sqlite"
        if dbpath.is_file():
            with database(dbpath) as conn:
                paths = {Path(r[0]) for r in conn.execute(
                    "SELECT rollout_path FROM threads WHERE updated_at>=?", (self.start,))}
        else:
            paths = {p for folder in ("sessions", "archived_sessions") for p in (home / folder).rglob("*.jsonl")
                     if p.stat().st_mtime >= self.start}
        for path in sorted(paths):
            if not path.is_file():
                self.stats["missingRollouts"] += 1
                continue
            self.read_rollout(path, agent)
            self.stats["rollouts"] += 1

    def report(self):
        groups = collections.defaultdict(lambda: [0] * 6)
        workloads = {}
        inherited = set()
        why = collections.defaultdict(int)

        def add(ts, route, provider, model, counts, reason=None):
            channel, user, session = route
            key = self.session_keys.get(session, "")
            kind = (key.split(":") + ["", "", ""])[2]
            if kind == "subagent" and user == UNKNOWN:
                launches = self.launches.get(key, set())
                if len(launches) == 1:
                    _, (parent_channel, parent_user, _) = next(iter(launches))
                    if parent_user != UNKNOWN and parent_channel != "subagent":
                        channel, user = parent_channel, parent_user
                        inherited.add(session)
            workloads[session] = {"subagent": "子代理", "cron": "定时任务"}.get(kind, "普通会话" if key else "原生会话")
            if channel in ("cron", "subagent"):
                channel = "内部任务"
            route = channel, user, session
            day = dt.datetime.fromtimestamp(ts, BEIJING).date().isoformat()
            if user == UNKNOWN:
                if kind == "subagent":
                    reason = "子代理缺少唯一可追溯的发起人"
                elif self.session_kinds.get(session) in ("group","channel"):
                    reason = "群聊回合缺少唯一发送人"
                reason = reason or "会话缺少可核实的发送人"
                why[(day, channel, session, provider, model, reason)] += counts[-1]
            group = groups[(day, *route, provider, model)]
            for i, value in enumerate((*counts, 1)):
                group[i] += value
            if sum(counts[:4]) != counts[4]:
                self.stats["componentMismatch"] += 1

        exact = {r[-1] for r in self.native.values()}
        covered = set()
        for rows, legacy in ((self.native, False), (self.legacy, True)):
            for ts, session, provider, model, counts, turn in rows.values():
                if legacy and turn in exact:
                    continue
                routes = self.routes.get(turn, set())
                concrete = {r for r in routes if r[1] not in (UNKNOWN, SYSTEM)}
                # A mirrored user/assistant pair can have unequal attribution. Only use
                # a known sender when all copies belong to the same OpenClaw session.
                if len({r[2] for r in routes}) == 1 and len(concrete) == 1:
                    route = next(iter(concrete))
                elif len(routes) == 1:
                    route = next(iter(routes))
                else:
                    route = (UNKNOWN, UNKNOWN, session)
                reason = None
                if not routes:
                    reason = "原生回合找不到对应的 V 会话"
                elif len(routes) > 1 and route[1] == UNKNOWN:
                    reason = "同一原生回合有多个来源"
                add(ts, route, provider, model, counts, reason)
                self.stats["nativeLegacy" if legacy else "nativeResponses"] += 1
                covered.add(turn)
        for identity, (ts, route, provider, model, counts, turn) in self.openclaw.items():
            if (turn and turn in covered) or identity in self.native:
                self.stats["replacedMirrors"] += 1
                continue
            add(ts, route, provider, model, counts)
            self.stats["transcriptResponses"] += 1
        self.stats["attributedChildren"] = len(inherited)
        return dict(start=self.start, end=self.end, stats=self.stats, names=self.names, workloads=workloads,
                    unknownReasons=[[*key, total] for key, total in sorted(why.items())],
                    rows=[[*key, *values] for key, values in sorted(groups.items())])


def collect(root, start, end):
    ledger = Ledger(start, end)
    sources = sorted((root / "agents").glob("*/agent/openclaw-agent.sqlite"))
    if not sources:
        raise RuntimeError("no OpenClaw agent databases")
    for p in sources:
        ledger.read_agent(p)
    for home in sorted((root / "agents").glob("*/agent/codex-home")):
        ledger.read_home(home, home.parent.parent.name)
    return ledger.report()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("start", type=int)
    parser.add_argument("end", type=int)
    parser.add_argument("--root", type=Path, default=Path.home() / ".openclaw")
    args = parser.parse_args()
    snapshot = collect(args.root, args.start, args.end)
    sys.stdout.buffer.write(gzip.compress(json.dumps(snapshot, ensure_ascii=False).encode()))
