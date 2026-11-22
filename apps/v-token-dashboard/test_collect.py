import gzip
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from collect import Ledger, collect, token_counts


class UsageTest(unittest.TestCase):
    def test_cache_accounting(self):
        self.assertEqual(token_counts(dict(input=3, output=4, cacheRead=2, cacheWrite=1)), (3,2,1,4,10))
        self.assertEqual(token_counts(dict(input_tokens=6, output_tokens=4, cached_input_tokens=2,
                                           cache_write_input_tokens=1), native=True), (3,2,1,4,10))
        self.assertEqual(token_counts(dict(totalTokens=42)), (0,0,0,0,42))

    def test_rollout_and_mirror_with_group_sender(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            agent = root / "agents/a/agent"
            logs = agent / "codex-home/sessions"
            logs.mkdir(parents=True)
            conn = sqlite3.connect(agent / "openclaw-agent.sqlite")
            conn.executescript("""
                CREATE TABLE session_windows(session_id,channel,account_id,session_key,primary_conversation_id,transcript_updated_at,updated_at);
                CREATE TABLE conversations(conversation_id,channel,account_id,kind,native_direct_user_id);
                CREATE TABLE transcript_events(session_id,seq,event_json);
                CREATE TABLE session_transcript_archives(created_at,session_id,session_key,encoding,archive_blob);
                INSERT INTO session_windows VALUES('sid','feishu','tenant','agent:a:group',NULL,50000,50000);
            """)
            def emit(seq, role, meta, parent=None, **kwargs):
                msg = dict(role=role, provider="provider", model="alias", __openclaw=meta, **kwargs)
                ev = dict(id=str(seq), parentId=str(parent) if parent else None, timestamp=50, message=msg)
                conn.execute("INSERT INTO transcript_events VALUES ('sid',?,?)", (seq,json.dumps(ev)))
            emit(1,"user",dict(senderId="u1",senderName="A"))
            mirror = dict(mirrorOrigin="codex-app-server",mirrorIdentity="turn1:assistant")
            emit(2,"assistant",mirror,1,usage=dict(input=900))
            emit(3,"user",dict(senderId="u2",senderName="B"),2)
            emit(4,"assistant",{},3,usage=dict(input=20,output=5),responseId="unique",responseModel="actual")
            emit(5,"assistant",{},3,usage=dict(input=20,output=5),responseId="unique")
            emit(6,"user",{},5)
            emit(7,"assistant",{},6,usage=dict(input=6))
            emit(8,"assistant",{},3,usage=dict(input=4))  # Branch remains tied to u2.
            emit(9,"assistant",{},3,api="openclaw-transcript",usage=dict(input=99))
            # Archived generations can repeat live and older archived events.
            archived = conn.execute("SELECT event_json FROM transcript_events WHERE seq=4").fetchone()[0]
            archive_only = dict(id="archived", timestamp=50, message=dict(role="assistant", provider="p",
                                model="archive-model", usage=dict(input=9)))
            raw = (archived+"\n"+json.dumps(archive_only)).encode()
            blob = gzip.compress(raw)
            conn.executemany("INSERT INTO session_transcript_archives VALUES(51000,'sid','agent:a:group',?,?)",
                             [("gzip", blob), ("identity", raw)])
            conn.commit()
            conn.close()

            def line(kind, **payload):
                return json.dumps(dict(type=kind, timestamp=50, payload=payload), separators=(",",":"))+"\n"
            content = line("session_meta",id="native",timestamp=20,model_provider="provider")
            content += line("turn_context",turn_id="turn1", model="deepseek")
            content += line("event_msg",type="task_started",turn_id="turn1",started_at=30)
            counter = dict(total_token_usage=dict(input_tokens=70),last_token_usage=dict(input_tokens=70))
            content += line("event_msg",type="token_count",info=counter)
            content += line("token_usage_record",turn_id="turn1",response_id="r1",usage=dict(input_tokens=70,cached_input_tokens=50,output_tokens=3))
            (logs/"a.jsonl").write_text(content)
            (logs/"copy.jsonl").write_text(content)
            report = collect(root,30,60)
            self.assertEqual(report["stats"]["replacedMirrors"],1)
            self.assertEqual(report["stats"]["nativeResponses"],1)
            self.assertEqual(report["stats"]["archiveVersions"],2)
            self.assertEqual(report["stats"]["nativeLegacy"],0)
            self.assertEqual(sum(r[-2] for r in report["rows"]),117)
            totals = {uid:sum(r[-2] for r in report["rows"] if r[2]==uid) for uid in {r[2] for r in report["rows"]}}
            self.assertEqual(sorted(totals.values()), [15,29,73])
            self.assertTrue(any(r[5:11]==["actual",20,0,0,5,25] for r in report["rows"]))
            self.assertTrue(all(r[3]=="a/sid" for r in report["rows"]))
            self.assertIn("未归属",totals)
            self.assertEqual(collect(root,51,60)["rows"],[])

    def test_child_keeps_session_and_only_inherits_unambiguous_launch(self):
        ledger = Ledger(1,100)
        ledger.session_keys["a/sid"] = "agent:a:subagent:child"
        ledger.launches["agent:a:subagent:child"].add(("run",("feishu","person","a/parent")))
        ledger.openclaw["p","r"] = 9,("subagent","未归属","a/sid"),"p","m",(1,2,0,3,6),""
        report = ledger.report()
        self.assertEqual(report["rows"][0][1:4],["feishu","person","a/sid"])
        self.assertEqual(report["workloads"]["a/sid"],"子代理")
        self.assertEqual(report["stats"]["attributedChildren"],1)
        ledger.launches["agent:a:subagent:child"].add(("other",("wecom","other","b/parent")))
        self.assertEqual(ledger.report()["rows"][0][1:4],["内部任务","未归属","a/sid"])

    def test_group_message_without_parent_or_run_cannot_inherit_previous_sender(self):
        ledger = Ledger(1,100)
        window=("s","feishu","tenant","agent:a:feishu:group:x",None,None,"group",None)
        events = [
            {"id":"u","message":{"role":"user","__openclaw":{"senderId":"one"}}},
            {"id":"r","timestamp":5,"message":{"role":"assistant","usage":{"input":7}}}
        ]
        ledger.read_events("a",window,enumerate(map(json.dumps,events)))
        result=ledger.report()
        self.assertEqual(result["rows"][0][2],"未归属")
        self.assertEqual(result["unknownReasons"][0][-2:],["群聊回合缺少唯一发送人",7])

    def test_unmatched_native_and_ambiguous_attribution(self):
        ledger = Ledger(1,100)
        ledger.routes["turn"].update({("feishu","A","a/1"),("wecom","B","b/1")})
        ledger.native["p","r"] = 5,"native/thread","p","m",(3,0,0,0,3),"turn"
        ledger.openclaw["p","r"] = 5,("feishu","A","a/1"),"p","m",(3,0,0,0,3),""
        report = ledger.report()
        self.assertEqual(len(report["rows"]),1)
        self.assertEqual(report["rows"][0][1:4], ["未归属","未归属","native/thread"])
        self.assertEqual(report["stats"]["replacedMirrors"],1)


if __name__ == "__main__":
    unittest.main()
