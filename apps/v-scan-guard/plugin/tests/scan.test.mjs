// The commands are the ones V's agents actually ran (rollouts of 2026-09-17, 09-23, 10-06
// and 11-09; docs/incidents/2026-11-09-recursive-scan.md). BLOCK must be refused, ALLOW must
// run untouched.
import assert from "node:assert/strict";
import { test } from "node:test";

import { compileRoots, findForbiddenScan, protectedRootFor, splitCommands, stripHeredocs } from "../core/scan.js";

const WS = "/home/openclaw/makaron-openclaw/.openclaw-local/workspace";
const INST = "/home/openclaw/.openclaw/nightshift/instances";

const BLOCK = [
  // 11-09 16:40, /vds chat, Codex exec_command (89 s + 52 s Gateway freezes)
  [`grep -rl "chengpian-daily" /home/openclaw/.openclaw 2>/dev/null | grep -v node_modules | head -10`, "/home/openclaw/.openclaw"],
  // 11-09 19:22, Night Shift card, OpenClaw exec (25 GB read)
  [`grep -rl "media-manifest" /home/openclaw/.openclaw/nightshift /home/openclaw/.openclaw/workspace 2>/dev/null | grep -v content-items | head -20`, "/home/openclaw/.openclaw/nightshift"],
  // 11-09 20:19, Night Shift card (37 GB read)
  [`ss -ltn | awk '$4 ~ /:2[0-9]{4}$/'; echo '--- ps'; ps aux | grep -iE 'nightshift|workboard' | grep -v grep | head -20; echo '--- env files'; grep -rl 'NIGHTSHIFT_URL' /home/openclaw/.openclaw 2>/dev/null | head -20`, "/home/openclaw/.openclaw"],
  [`grep -rl "media-manifest" ${INST} 2>/dev/null | grep -v node_modules | head -10`, INST],
  [`grep -rl '"23dc82b8' ${INST} 2>/dev/null | head; echo ---; grep -rln "aeet-en-05" ${INST}/*/content-items 2>/dev/null | head`, INST],
  [`grep -rln "apply-upload" /home/openclaw/releases /home/openclaw/.openclaw/nightshift /home/openclaw/.openclaw/workspace 2>/dev/null | head -20`, "/home/openclaw/.openclaw/nightshift"],
  // 09-23, chat on the codex harness looking for a key
  [`grep -rls MAKARON_SUPABASE_URL /home/openclaw/.openclaw /home/openclaw/.agents /home/openclaw/makaron-openclaw`, "/home/openclaw/.openclaw"],
  [`grep -rl MAKARON_SUPABASE_SERVICE_ROLE_KEY /home/openclaw --include=*`, "/home/openclaw"],
  // 10-06, /vcc searching the session store
  [`rg -l "tmall" /home/openclaw/.openclaw/agents/makaron/sessions`, "/home/openclaw/.openclaw/agents/*/sessions"],
  [`ugrep -r tmall /home/openclaw/.openclaw/agents/makaron/sessions`, "/home/openclaw/.openclaw/agents/*/sessions"],
  // find / du / tree / ls -R
  [`find ${INST} -name frozenInputManifest.json | head -5`, INST],
  [`for f in $(find ${INST} -path '*/handoffs/brief.json' -not -path '*DL-1109-04*' 2>/dev/null); do if grep -q 'SCENE_EDIT' "$f"; then echo "$f"; fi; done | head -4`, INST],
  [`find /home/openclaw -maxdepth 6 -name '*kube*config*' -o -maxdepth 6 -name 'config' -path '*kube*' 2>/dev/null | head -20`, "/home/openclaw"],
  [`find /home/openclaw -iname '*AEET*' -type f 2>/dev/null | grep -i -E 'png|jpg' | head -20`, "/home/openclaw"],
  [`find ~ -name tenant-env.json`, "/home/openclaw"],
  [`find $HOME/.openclaw -name '*.env'`, "/home/openclaw/.openclaw"],
  [`du -sh ${INST}/*`, INST],
  [`du -h --max-depth=1 /home/openclaw/.openclaw | sort -h`, "/home/openclaw/.openclaw"],
  [`tree /home/openclaw/.openclaw/nightshift`, "/home/openclaw/.openclaw/nightshift"],
  [`ls -laR /home/openclaw/.openclaw/nightshift`, "/home/openclaw/.openclaw/nightshift"],
  [`rg --files /home/openclaw/.openclaw | grep cron`, "/home/openclaw/.openclaw"],
  // ancestors are bigger still
  [`grep -r SECRET /`, "/"],
  [`grep -R foo /home`, "/home"],
  // ** globs, os.walk, rglob, anywhere in the text
  [`ls /home/openclaw/.openclaw/**/*.json`, "/home/openclaw/.openclaw"],
  [`python3 - <<'EOF'\nimport glob\nprint(glob.glob('/home/openclaw/.openclaw/**/cron*.json', recursive=True))\nEOF`, "/home/openclaw/.openclaw"],
  [`python3 -c "import os\nfor r,d,f in os.walk('/home/openclaw/.openclaw/nightshift'): pass"`, "/home/openclaw/.openclaw/nightshift"],
  [`python3 -c "from pathlib import Path; print(list(Path('/home/openclaw/.openclaw').rglob('*.json')))"`, "/home/openclaw/.openclaw"],
  [`node -e "require('fs').readdirSync('/home/openclaw/.openclaw', { recursive: true })"`, "/home/openclaw/.openclaw"],
  [`ls ~/.openclaw/nightshift/**`, "/home/openclaw/.openclaw/nightshift"],
  // relative paths after cd, wrappers, nested shells, substitutions
  [`cd /home/openclaw/.openclaw && grep -rn chengpian .`, "/home/openclaw/.openclaw"],
  [`cd ~/.openclaw/nightshift; rg -l media-manifest`, "/home/openclaw/.openclaw/nightshift"],
  [`bash -lc "grep -r foo ~/.openclaw"`, "/home/openclaw/.openclaw"],
  [`sudo -n -u openclaw ionice -c3 nice -n 19 grep -R x /home/openclaw/.openclaw/agents`, "/home/openclaw/.openclaw/agents"],
  [`timeout -s KILL 60 grep -r x /home/openclaw/.openclaw`, "/home/openclaw/.openclaw"],
  [`env FOO=1 grep --recursive x /home/openclaw/.openclaw`, "/home/openclaw/.openclaw"],
  [`grep -d recurse x /home/openclaw/.openclaw`, "/home/openclaw/.openclaw"],
  [`echo "$(grep -r x /home/openclaw/.openclaw)"`, "/home/openclaw/.openclaw"],
  [`X=$(grep -rl x \${HOME}/.openclaw | head -1); echo $X`, "/home/openclaw/.openclaw"],
  [`grep -rn -e foo -e bar /home/openclaw/.openclaw/nightshift/instances/`, INST],
  [`rg -n foo --max-depth 6 /home/openclaw/.openclaw`, "/home/openclaw/.openclaw"],
];

const ALLOW = [
  // the narrowed searches the same agents ran next
  `grep -rl "chengpian-daily" /home/openclaw/.openclaw/cron /home/openclaw/.openclaw/automations /home/openclaw/.openclaw/config* 2>/dev/null | head -10`,
  `grep -rn "request-hash" ${INST}/DL-1109-02 2>/dev/null | head -20`,
  `cd ${INST}/DL-1109-03 && rg -l "requestHash|request-hash|request_hash" . 2>/dev/null | head -20`,
  `grep -rl "media-manifest" ${INST}/*/content-items/*/run-state.json 2>/dev/null | head -5`,
  `grep -rl x ${INST}/DL-1109-0*/content-items 2>/dev/null`,
  `find ${INST} -maxdepth 2 -name 'requirement-snapshot.json' -newermt '2026-11-01' | tail -10`,
  `find /home/openclaw/.openclaw -maxdepth 2 -name "*.log" -newermt "2026-11-08" 2>/dev/null | head -20`,
  `find ${INST}/DL-1109-08 -iname '*AEET*' -o -iname '*logo*' | head -20`,
  `grep -rn -A12 "filter" /home/openclaw/.agents/skills/lark-base/references/lark-base-view.md 2>/dev/null | head -50`,
  `grep -n "media-manifest\\|mediaManifest" -r ~/makaron-openclaw/.openclaw-local/workspace/skills/makaron | head -40`,
  `rg -n foo --max-depth 2 /home/openclaw/.openclaw`,
  `du -sh ${INST}/DL-1109-05`,
  `ls -la /home/openclaw/.openclaw; ls ${INST} | tail -30`,
  `ps aux | grep -iE 'nightshift|workboard' | grep -v grep | head -20`,
  `ss -ltn | awk '$4 ~ /:2[0-9]{4}$/'`,
  `cat ~/.openclaw/openclaw.json | head -40`,
  `grep -c chengpian /home/openclaw/.openclaw/openclaw.json`,
  `node /home/openclaw/releases/nightshift-workboard/5b021df0e7923aac69690f6961eb450f4b07ad28/scripts/nightshiftctl.mjs operations reserve 18318dc8 --request-hash e4e2 2>&1 | tail -20`,
  `cd ${WS} && lark-cli base +record-list --base-token X --table-id Y --format json --limit 200 --as bot 2>/dev/null | head -c 4000`,
  `cd ${WS} && python3 - <<'EOF'\nimport json,subprocess\nrows=[json.loads(l) for l in open('work/chengpian-watch/raw.ndjson')]\nprint(len(rows))\nEOF`,
  `grep -r foo .`,
  `rg TODO`,
  `find . -name '*.json' | head`,
  `grep -rl x $SOME_DIR`,
  `echo "**bold** text" && printf '%s\\n' "/home/openclaw/x"`,
  `sudo -n -u openclaw grep -n x /home/openclaw/.openclaw/openclaw.json`,
  `find /home/openclaw/.openclaw/agents/makaron/agent/codex-home/sessions/2026/11/09 -maxdepth 1 -name '*.jsonl' -newermt '2026-11-09 19:20'`,
];

test("every recorded runaway scan is blocked, naming the root it reaches", () => {
  for (const [cmd, root] of BLOCK) {
    const hit = findForbiddenScan(cmd, { cwd: WS });
    assert.ok(hit, `not blocked: ${cmd}`);
    assert.equal(hit.root, root, `wrong root for: ${cmd}`);
  }
});

test("the narrowed and unrelated commands of the same sessions are allowed", () => {
  for (const cmd of ALLOW) {
    assert.equal(findForbiddenScan(cmd, { cwd: WS }), null, `blocked: ${cmd}`);
  }
});

test("relative paths depend on the working directory", () => {
  assert.ok(findForbiddenScan("grep -r foo .", { cwd: "/home/openclaw/.openclaw" }));
  assert.ok(findForbiddenScan("find . -name x", { cwd: INST }));
  assert.ok(findForbiddenScan("rg foo", { cwd: "/home/openclaw" }));
  assert.equal(findForbiddenScan("grep -r foo .", { cwd: `${INST}/DL-1109-05` }), null);
  assert.equal(findForbiddenScan("grep -r foo .", {}), null, "unknown cwd: cannot judge, let it run");
  assert.ok(findForbiddenScan("cd .. && grep -r foo .", { cwd: "/home/openclaw/.openclaw/nightshift/instances" }));
});

test("roots are configurable and * matches one path segment", () => {
  const compiled = compileRoots(["/data", "/srv/*/state"]);
  assert.equal(protectedRootFor("/data", compiled), "/data");
  assert.equal(protectedRootFor("/", compiled), "/");
  assert.equal(protectedRootFor("/data/x", compiled), null);
  assert.equal(protectedRootFor("/srv/a/state", compiled), "/srv/*/state");
  assert.equal(protectedRootFor("/srv/a", compiled), "/srv/a");
  assert.equal(protectedRootFor("/srv/a/state/x", compiled), null);
  assert.ok(findForbiddenScan("grep -r x /srv/vlab/state", { compiled }));
  assert.equal(findForbiddenScan("grep -r x /home/openclaw/.openclaw", { compiled }), null);
});

test("find and tree depth limit is configurable", () => {
  assert.ok(findForbiddenScan("find /home/openclaw/.openclaw -maxdepth 3 -name x", { findMaxDepth: 2 }));
  assert.equal(findForbiddenScan("find /home/openclaw/.openclaw -maxdepth 3 -name x", { findMaxDepth: 3 }), null);
  assert.equal(findForbiddenScan("tree -L 2 /home/openclaw/.openclaw"), null);
});

test("lexer: heredoc bodies are not shell, quotes and redirections are handled", () => {
  assert.equal(stripHeredocs("cat <<'EOF'\ngrep -r x /\nEOF\necho ok"), "cat <<'EOF'\necho ok");
  assert.deepEqual(splitCommands(`grep -rl "a b" /x 2>/dev/null | head -3`), [["grep", "-rl", "a b", "/x"], ["head", "-3"]]);
  assert.deepEqual(splitCommands(`for f in $(find /x -name y); do echo "$f"; done`), [["find", "/x", "-name", "y"], ["echo", "$f"]]);
});
