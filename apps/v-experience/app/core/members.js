// App logins for people other than the owner. The owner's phone pairs with the
// Gateway as an operator; an operator can read every session, so teammates never
// get that. They get a device credential for the vapp member endpoint
// (member-http.js), which only reaches their own chat with V.
//
// An invite is a one-time token handed out in a Feishu private chat (/app),
// good for ten minutes. Claiming it on a phone creates a device credential
// "<deviceId>.<secret>"; only a hash of each is kept.
import crypto from "node:crypto";

export const INVITE_TTL_MS = 10 * 60_000;
const MAX_DEVICES_PER_USER = 5;

const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const sameHash = (a, b) => typeof a === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * @param {object} deps
 * @param {() => Promise<object|undefined>} deps.load   the saved state, or nothing
 * @param {(state: object) => Promise<void>} deps.save
 */
export function createMembers({ load, save, now = () => Date.now(), random = (bytes) => crypto.randomBytes(bytes).toString("base64url") }) {
  let state;
  const ready = async () => {
    if (!state) {
      const saved = await load().catch(() => undefined);
      state = { invites: Array.isArray(saved?.invites) ? saved.invites : [], devices: saved?.devices && typeof saved.devices === "object" ? saved.devices : {} };
    }
    return state;
  };
  let saving = Promise.resolve();
  const persist = () => (saving = saving.then(() => save(state)).catch(() => {}));
  // lastSeenAt is for the owner's device list; writing it on every request is not worth a disk write.
  let seenTimer;
  const persistSoon = () => {
    if (seenTimer) return;
    seenTimer = setTimeout(() => { seenTimer = undefined; void persist(); }, 60_000);
    seenTimer.unref?.();
  };

  /** A one-time login for this person; returns the token to put in the link. */
  async function issueInvite({ userId, name }) {
    const s = await ready();
    s.invites = s.invites.filter((invite) => invite.expiresAt > now());
    const token = random(24);
    const expiresAt = now() + INVITE_TTL_MS;
    s.invites.push({ hash: hash(token), userId, name, expiresAt });
    await persist();
    return { token, expiresAt };
  }

  /** Uses up an invite and returns the new device's credential; null when unknown, used or expired. */
  async function claim(token, { deviceName = "" } = {}) {
    const s = await ready();
    const wanted = hash(token);
    const index = s.invites.findIndex((invite) => sameHash(invite.hash, wanted));
    if (index < 0) return null;
    const [invite] = s.invites.splice(index, 1);
    if (invite.expiresAt <= now()) {
      await persist();
      return null;
    }
    const deviceId = `m_${random(9)}`;
    const secret = random(32);
    s.devices[deviceId] = { userId: invite.userId, name: invite.name, deviceName: String(deviceName).slice(0, 80), hash: hash(secret), createdAt: now(), lastSeenAt: now() };
    // A person who keeps logging in on new phones keeps only the latest few.
    const theirs = Object.entries(s.devices).filter(([, device]) => device.userId === invite.userId).sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [id] of theirs.slice(0, Math.max(0, theirs.length - MAX_DEVICES_PER_USER))) delete s.devices[id];
    await persist();
    return { credential: `${deviceId}.${secret}`, deviceId, userId: invite.userId, name: invite.name };
  }

  /** The person a credential belongs to, or null. */
  async function authenticate(credential) {
    const s = await ready();
    const [deviceId, secret] = String(credential ?? "").split(".");
    const device = deviceId && secret ? s.devices[deviceId] : undefined;
    if (!device || !sameHash(device.hash, hash(secret))) return null;
    device.lastSeenAt = now();
    persistSoon();
    return { deviceId, userId: device.userId, name: device.name };
  }

  async function revoke(deviceId) {
    const s = await ready();
    const existed = Boolean(s.devices[deviceId]);
    delete s.devices[deviceId];
    if (existed) await persist();
    return existed;
  }

  async function list() {
    const s = await ready();
    return Object.entries(s.devices).map(([deviceId, { hash: _hash, ...device }]) => ({ deviceId, ...device }));
  }

  return { issueInvite, claim, authenticate, revoke, list };
}
