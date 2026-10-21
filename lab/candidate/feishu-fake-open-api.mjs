// Local Feishu transport for candidate acceptance. No real app credentials or platform calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {spawnSync} from 'node:child_process';

const parse = x => { try { return typeof x === 'string' ? JSON.parse(x) : x; } catch { return x; } };
export class FakeFeishu {
  constructor({directory, owner, dmChat, chats}) {
    Object.assign(this, {directory, owner, dmChat, chats});
    this.messages = new Map(); this.cards = new Map(); this.uuids = new Map();
    this.requests = []; this.unimplemented = []; this.snapshots = []; this.reactions = new Map(); this.next = 0;
    this.bot = 'ou_00000000000000000000000000000001';
    this.members = new Map();
  }
  async start() {
    fs.mkdirSync(this.directory, {recursive: true, mode: 0o700});
    this.certFile = path.join(this.directory, 'cert.pem');
    const keyFile = path.join(this.directory, 'key.pem');
    const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', keyFile, '-out', this.certFile], {encoding: 'utf8'});
    assert.equal(r.status, 0, 'fake Feishu TLS certificate generation failed');
    this.server = https.createServer({cert: fs.readFileSync(this.certFile), key: fs.readFileSync(keyFile)}, async (req, res) => {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : {};
        const url = new URL(req.url, 'https://127.0.0.1');
        const result = this.handle(req.method, url.pathname, body, url.searchParams);
        res.writeHead(result.code ? 400 : 200, {'content-type': 'application/json'});
        res.end(JSON.stringify(result));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({code: 999, msg: String(e.message)})); }
    });
    await new Promise(r => this.server.listen(0, '127.0.0.1', r));
    this.url = `https://127.0.0.1:${this.server.address().port}`;
    return this;
  }
  close() { return new Promise(resolve => this.server.close(resolve)); }
  materialize(m) {
    const c = parse(m.body.content);
    const card = c?.data?.card_id ?? c?.card_id;
    return card && this.cards.has(card) ? {...m, body: {content: JSON.stringify(this.cards.get(card))}} : structuredClone(m);
  }
  remember(m) { this.snapshots.push({at: Date.now(), message: this.materialize(m)}); return m; }
  list(chat) { return [...this.messages.values()].filter(m => m.chat_id === chat).map(m => this.materialize(m)); }
  post(body, parent) {
    if (body.uuid && this.uuids.has(body.uuid)) return this.messages.get(this.uuids.get(body.uuid));
    const p = parent ? this.messages.get(parent) : null;
    const recipient = body.receive_id;
    const chat = p?.chat_id ?? (recipient === this.owner || recipient === `user:${this.owner}` ? this.dmChat : String(recipient).replace(/^chat:/, ''));
    const m = {message_id: `om_mock_${++this.next}`, chat_id: chat, msg_type: body.msg_type, create_time: String(Date.now()), update_time: String(Date.now()), parent_id: parent ?? '', sender: {sender_type: 'app', id: 'cli_0000000000000000'}, body: {content: body.content ?? '{}'}};
    this.messages.set(m.message_id, m);
    if (body.uuid) this.uuids.set(body.uuid, m.message_id);
    return this.remember(m);
  }
  handle(method, p, b, query = new URLSearchParams()) {
    this.requests.push({at: Date.now(), method, path: p});
    const ok = data => ({code: 0, msg: 'ok', data});
    let m;
    if (/\/(tenant|app)_access_token\/internal$/.test(p)) return {code: 0, msg: 'ok', tenant_access_token: 'mock-tenant-token', app_access_token: 'mock-app-token', expire: 7200};
    if (p === '/open-apis/bot/v3/info') return {code: 0, msg: 'ok', bot: {open_id: this.bot, app_name: 'V Mock', activate_status: 2}};
    if (p === '/open-apis/bot/v1/openclaw_bot/ping') return ok({});
    if ((m = p.match(/^\/open-apis\/im\/v1\/chats\/([^/]+)$/))) return ok({chat_id: m[1], name: this.chats[m[1]] ?? 'Mock room', chat_mode: 'group', chat_type: 'private', owner_id: this.owner, user_count: String(this.members.get(m[1]) ?? 1), bot_count: '1'});
    if (p.startsWith('/open-apis/contact/v3/users/')) return ok({user: {name: 'Mock Owner', open_id: this.owner}});
    if (p === '/open-apis/im/v1/messages' && method === 'POST') return ok(this.post(b));
    if (p === '/open-apis/im/v1/messages' && method === 'GET') return ok({items: this.list(query.get('container_id')), has_more: false});
    if ((m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/reply$/))) return ok(this.post(b, m[1]));
    if ((m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)\/reactions(?:\/([^/]+))?$/))) {
      const all = this.reactions.get(m[1]) ?? new Map(); this.reactions.set(m[1], all);
      if (method === 'POST') { const id = `r_${++this.next}`; all.set(id, {reaction_id: id, operator: {operator_type: 'app'}}); return ok({reaction_id: id}); }
      if (method === 'DELETE') all.delete(m[2]);
      return ok({items: [...all.values()], has_more: false});
    }
    if ((m = p.match(/^\/open-apis\/im\/v1\/messages\/([^/]+)$/))) {
      const msg = this.messages.get(m[1]);
      if (!msg) return {code: 230001, msg: `unknown fake message ${m[1]}`};
      if (method === 'GET') return ok({items: [this.materialize(msg)]});
      msg.body.content = b.content ?? msg.body.content; msg.updated = true; msg.update_time = String(Date.now());
      this.remember(msg); return ok(msg);
    }
    if (p === '/open-apis/cardkit/v1/cards' && method === 'POST') {
      const id = `card_mock_${++this.next}`; this.cards.set(id, parse(b.data) ?? {}); return ok({card_id: id});
    }
    if ((m = p.match(/^\/open-apis\/cardkit\/v1\/cards\/([^/]+)(.*)$/))) {
      const id = m[1], suffix = m[2];
      const card = this.cards.get(id) ?? {};
      if (!suffix && b.card) this.cards.set(id, parse(b.card.data ?? b.card));
      else {
        card.updates ??= {};
        // Keep current elements separately; snapshots retain earlier streaming states.
        if (method === 'DELETE') delete card.updates[suffix];
        else card.updates[suffix] = parse(b.element ?? b.elements ?? b.content ?? b.settings ?? b);
        this.cards.set(id, card);
      }
      for (const msg of this.messages.values()) {
        const ref = parse(msg.body.content);
        if (msg.msg_type === 'interactive' && (ref?.data?.card_id ?? ref?.card_id) === id) this.remember(msg);
      }
      return ok({});
    }
    this.unimplemented.push(`${method} ${p}`);
    return {code: 404, msg: `unimplemented mock endpoint ${method} ${p}`};
  }
}
