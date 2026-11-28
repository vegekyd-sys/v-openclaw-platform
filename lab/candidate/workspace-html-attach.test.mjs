import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Candidate check for workspace-html-attach-v1 against the VLab runtime (V's dist bytes): the real reply
// media normalizer (reply-media-paths.runtime) with the real VLab config, as a Feishu DM reply from
// makaron. EXPECT_PATCHED=1 runs with lab/release-files/workspace-html-attach swapped in by the plan;
// EXPECT_PATCHED=0 is the baseline on V's unpatched bytes and must reproduce "Delivery failed".
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const data = process.env.VLAB_CANDIDATE_DATA;
const patched = process.env.EXPECT_PATCHED === '1';
const dist = path.join(runtime ?? '', 'openclaw/dist');
const load = async (name) => import(pathToFileURL(path.join(dist, name)).href);
const DECK = '<!doctype html><html><head><meta charset="utf-8"><title>Deck</title></head><body><h1>Makaron deck</h1></body></html>\n';
const FAILED = /Delivery failed/u;

const workspace = path.join(data ?? '', 'whattach-workspace');
const sessionKey = 'agent:makaron:feishu:direct:ou_whattach_candidate';

function config(workspaceDir = workspace) {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  cfg.agents.entries.makaron.workspace = workspaceDir;
  return cfg;
}

// The run's workspace is passed as the reply dispatchers do (agent-runner, dispatch-from-config, chat.send).
async function normalize(media, workspaceDir = workspace) {
  const { n: createReplyMediaPathNormalizer } = await load('reply-media-paths.runtime-B0dVQiC4.js');
  const normalizePayload = createReplyMediaPathNormalizer({ cfg: config(workspaceDir), sessionKey, agentId: 'makaron', workspaceDir, messageProvider: 'feishu', accountId: 'default' });
  return await normalizePayload({ text: 'here it is', mediaUrls: [media] });
}

const staged = (payload) => payload.mediaUrls?.[0] && path.relative(path.join(stateDir, 'media', 'outbound'), fs.realpathSync(payload.mediaUrls[0])).split(path.sep)[0] !== '..';

test.before(() => {
  assert(runtime && stateDir && configPath && data, 'candidate environment');
  fs.mkdirSync(path.join(workspace, 'decks'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'decks', 'makaron-deck.html'), DECK);
});

test('the runtime carries the expected bytes', () => {
  const source = fs.readFileSync(path.join(dist, 'web-media-BGCgwB8q.js'), 'utf8');
  assert.equal(source.includes('workspace-html-attach-v1'), patched);
});

test('a deck the agent wrote into its workspace is delivered (baseline: Delivery failed)', async () => {
  for (const media of [path.join(workspace, 'decks', 'makaron-deck.html'), 'decks/makaron-deck.html']) {
    const out = await normalize(media);
    if (patched) {
      assert.doesNotMatch(out.text, FAILED, media);
      assert(staged(out), `${media} was not staged outbound: ${out.mediaUrls?.[0]}`);
      assert.equal(fs.readFileSync(out.mediaUrls[0], 'utf8'), DECK);
      assert.equal(out.attachments?.[0]?.name, 'makaron-deck.html');
    } else {
      assert.match(out.text, /makaron-deck\.html: Delivery failed/u, media);
      assert.equal(out.mediaUrls, undefined);
    }
  }
});

test('HTML outside the workspace stays refused', async () => {
  const leak = path.join(stateDir, 'agents', 'makaron', 'leak.html');
  fs.mkdirSync(path.dirname(leak), { recursive: true });
  fs.writeFileSync(leak, DECK);
  const link = path.join(workspace, 'innocent.html');
  fs.rmSync(link, { force: true });
  fs.symlinkSync(leak, link);
  const outside = path.join(data, 'elsewhere', 'report.html');
  fs.mkdirSync(path.dirname(outside), { recursive: true });
  fs.writeFileSync(outside, DECK);
  for (const media of [leak, link, outside, path.join(workspace, '..', 'elsewhere', 'report.html')]) {
    const out = await normalize(media);
    assert.match(out.text, FAILED, media);
    assert.equal(out.mediaUrls, undefined, media);
  }
});

test('a workspace that contains the OpenClaw state dir vouches for no HTML', async () => {
  const page = path.join(stateDir, 'page.html');
  fs.writeFileSync(page, DECK);
  const out = await normalize(page, path.dirname(stateDir));
  assert.match(out.text, FAILED);
});

test('non-HTML workspace attachments are unchanged', async () => {
  const png = path.join(workspace, 'dot.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  const out = await normalize(png);
  assert.doesNotMatch(out.text, FAILED);
  assert(staged(out));
});
