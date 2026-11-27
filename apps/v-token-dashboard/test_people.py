import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from people import enrich


class PeopleTest(unittest.TestCase):
    def test_only_same_app_exact_ids_are_enriched(self):
        def key(account, actor):
            return json.dumps(["feishu", account, actor])

        first = key("default","ou_first")
        second = key("default","ou_second")
        other_app = key("another","ou_first")
        snapshot = dict(rows=[["day","feishu",id_, "agent/session"] for id_ in (first,second,other_app)],
                        names={first:"ou_first",second:"ou_second",other_app:"ou_first"})
        def fake(path, token=None, payload=None):
            if path.startswith("auth/"):
                return {"tenant_access_token":"test"}
            if path.startswith("contact/"):
                return {"data":{"items":[{"open_id":"ou_first","name":"同名"}]}}
            members = [{"member_id":"ou_never_in_snapshot","name":"无关"}]
            if "page_token=" not in path:
                return {"data":{"items":members,"has_more":True,"page_token":"more"}}
            return {"data":{"items":[{"member_id":"ou_second","name":"同名"}]}}

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/"openclaw.json").write_text(json.dumps({"channels":{"feishu":{"appId":"fake","appSecret":"fake"}}}))
            with patch("people.session_labels", return_value=({},{"oc_test":set()})), patch("people.api",side_effect=fake):
                result = enrich(snapshot,root)
        self.assertEqual(result["names"],{first:"同名",second:"同名"})
        self.assertEqual(result["nameSources"],{first:"飞书通讯录",second:"飞书群成员"})
