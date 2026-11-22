import sqlite3
import tempfile
import unittest
from pathlib import Path

from people import nightshift_sessions


class NightshiftTest(unittest.TestCase):
    def test_only_evidenced_sessions_with_usage_are_mapped(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def create(name, sql):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                with sqlite3.connect(path) as db:
                    db.executescript(sql)
                db.close()
            create("nightshift/nightshift.sqlite", """
                CREATE TABLE stage_runs(card_id);
                CREATE TABLE content_item_runs(card_id);
                CREATE TABLE audit_events(type,payload_json);
                INSERT INTO stage_runs VALUES('n1');
                INSERT INTO audit_events VALUES('workboard.card.created','{"cardId":"n2"}');
                INSERT INTO audit_events VALUES('stage.completion.validated',
                    '{"cardId":"n3","evidence":{"sessionKey":"agent:a:subagent:audited"}}');
            """)
            create("state/openclaw.sqlite", """
                CREATE TABLE task_runs(run_id,child_session_key);
                CREATE TABLE subagent_runs(run_id,child_session_key);
                INSERT INTO task_runs VALUES('workboard:n1:1','agent:a:subagent:dispatch');
                INSERT INTO subagent_runs VALUES('workboard:n1:2','agent:a:subagent:dispatch'),
                    ('workboard:n1:2','agent:a:subagent:conflict'),
                    ('workboard:other:3','agent:a:subagent:conflict');
            """)
            create("agents/a/agent/openclaw-agent.sqlite", """
                CREATE TABLE session_windows(session_id,session_key);
                CREATE TABLE session_transcript_archives(session_id,session_key);
                INSERT INTO session_windows VALUES('live','agent:a:subagent:dispatch'),
                    ('collision','agent:a:subagent:conflict'),('noUsage','agent:a:subagent:dispatch'),
                    ('similar','agent:a:subagent:workboard-nightshift-unrelated'),('chat','agent:a:feishu:group');
                INSERT INTO session_transcript_archives VALUES('archived','agent:a:subagent:workboard-nightshift-n2'),
                    ('old','agent:a:subagent:audited'),('live','agent:a:subagent:dispatch');
            """)
            ids = ['live','archived','old','similar','chat','collision']
            rows = [['day','channel','user','a/'+sid] for sid in ids]
            self.assertEqual(nightshift_sessions(dict(rows=rows), root),
                             {'a/live':'n1','a/archived':'n2','a/old':'n3'})
