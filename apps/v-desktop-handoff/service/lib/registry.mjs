// Handoff registry: who may open the desktop, who may control it, for how long.
//
// A handoff is issued by the agent (through the admin API) for one owner. Its
// link token is only ever stored hashed. Claiming the token from the viewer
// page yields a viewer secret; the WebSocket and the control API use that
// secret. Control is exclusive: taking it closes the previous controller.
import crypto from "node:crypto";

const DEFAULT_LIMITS = Object.freeze({
  claimTtlMs: 10 * 60_000, // link must be opened within this window
  sessionTtlMs: 30 * 60_000, // desktop session ends this long after the first claim
  idleControlMs: 5 * 60_000, // controller demoted to observer after this much silence
  maxViewers: 8, // simultaneous viewers across the whole desktop
  maxClaims: 5, // times one link may be opened (phone + laptop + reload)
});

export const CLOSE_CODES = Object.freeze({
  controlTaken: 4000,
  sessionExpired: 4001,
  revoked: 4002,
  protocolError: 4003,
  viewerReplaced: 4004,
  desktopUnavailable: 4005,
});

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export class HandoffRegistry {
  constructor({ now = Date.now, randomToken = () => crypto.randomBytes(24).toString("base64url"), limits = {}, onAudit = () => {} } = {}) {
    this.now = now;
    this.randomToken = randomToken;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.onAudit = onAudit;
    this.handoffs = new Map(); // id -> handoff
    this.byTokenHash = new Map(); // tokenHash -> id
    this.viewers = new Map(); // viewerSecret -> viewer
    this.controllerSecret = null;
  }

  audit(event, data = {}) {
    this.onAudit({ at: this.now(), event, ...data });
  }

  // ---- issuing (admin API) ----

  issue({ kind = "control", ownerId, sessionKey = null, reason = "", claimTtlMs, sessionTtlMs } = {}) {
    if (!["control", "watch"].includes(kind)) {
      throw new TypeError("kind must be control or watch");
    }
    if (typeof ownerId !== "string" || !ownerId.trim()) {
      throw new TypeError("ownerId is required");
    }
    const claimTtl = Number.isFinite(claimTtlMs) && claimTtlMs > 0 ? Math.min(claimTtlMs, 60 * 60_000) : this.limits.claimTtlMs;
    const sessionTtl = Number.isFinite(sessionTtlMs) && sessionTtlMs > 0 ? Math.min(sessionTtlMs, 4 * 60 * 60_000) : this.limits.sessionTtlMs;
    const token = this.randomToken();
    const id = `h_${crypto.randomBytes(6).toString("hex")}`;
    const handoff = {
      id,
      kind,
      ownerId: ownerId.trim(),
      sessionKey,
      reason: String(reason ?? "").slice(0, 500),
      tokenHash: hashToken(token),
      createdAt: this.now(),
      claimExpiresAt: this.now() + claimTtl,
      sessionTtlMs: sessionTtl,
      sessionExpiresAt: null,
      claims: 0,
      firstClaimedAt: null,
      revokedAt: null,
      endedAt: null,
      endReason: null,
    };
    this.handoffs.set(id, handoff);
    this.byTokenHash.set(handoff.tokenHash, id);
    this.audit("issued", { id, kind, ownerId: handoff.ownerId, sessionKey, reason: handoff.reason });
    return { id, token, kind, claimExpiresAt: handoff.claimExpiresAt, sessionTtlMs: sessionTtl };
  }

  revoke(id, reason = "revoked") {
    const handoff = this.handoffs.get(id);
    if (!handoff) {
      return false;
    }
    if (!handoff.endedAt) {
      this.end(handoff, reason, CLOSE_CODES.revoked);
      handoff.revokedAt = this.now();
    }
    return true;
  }

  end(handoff, reason, closeCode = CLOSE_CODES.sessionExpired) {
    if (handoff.endedAt) {
      return;
    }
    handoff.endedAt = this.now();
    handoff.endReason = reason;
    for (const [secret, viewer] of this.viewers) {
      if (viewer.handoffId === handoff.id) {
        this.detachViewer(secret, closeCode, reason);
      }
    }
    this.audit("ended", { id: handoff.id, reason });
  }

  // ---- claiming (viewer page) ----

  claim(token, { ip = null, userAgent = null } = {}) {
    const id = this.byTokenHash.get(hashToken(token ?? ""));
    const handoff = id ? this.handoffs.get(id) : null;
    if (!handoff) {
      this.audit("claim_rejected", { reason: "unknown_token", ip });
      return { error: "unknown_token" };
    }
    const now = this.now();
    if (handoff.endedAt || handoff.revokedAt) {
      this.audit("claim_rejected", { id, reason: "ended", ip });
      return { error: "ended" };
    }
    if (handoff.claims === 0 && now >= handoff.claimExpiresAt) {
      this.end(handoff, "claim_window_expired");
      return { error: "expired" };
    }
    if (handoff.claims > 0 && handoff.sessionExpiresAt !== null && now >= handoff.sessionExpiresAt) {
      this.end(handoff, "session_expired");
      return { error: "expired" };
    }
    if (handoff.claims >= this.limits.maxClaims) {
      this.audit("claim_rejected", { id, reason: "too_many_claims", ip });
      return { error: "too_many_claims" };
    }
    if (this.activeViewerCount() >= this.limits.maxViewers) {
      this.audit("claim_rejected", { id, reason: "too_many_viewers", ip });
      return { error: "too_many_viewers" };
    }
    handoff.claims += 1;
    if (handoff.firstClaimedAt === null) {
      handoff.firstClaimedAt = now;
      handoff.sessionExpiresAt = now + handoff.sessionTtlMs;
    }
    const secret = this.randomToken();
    const viewer = {
      secret,
      handoffId: id,
      canControl: handoff.kind === "control",
      role: "observer",
      claimedAt: now,
      connectedAt: null,
      lastInputAt: null,
      ip,
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 200) : null,
      link: null, // attached transport {close(code, reason)}
    };
    this.viewers.set(secret, viewer);
    this.audit("claimed", { id, viewer: secret.slice(0, 6), ip, claims: handoff.claims });
    return { viewer: secret, handoffId: id, canControl: viewer.canControl, sessionExpiresAt: handoff.sessionExpiresAt, kind: handoff.kind };
  }

  // ---- transport binding ----

  /** Binds a live WebSocket to a viewer. Replaces an earlier transport for the same viewer. */
  attachViewer(secret, link) {
    const viewer = this.viewers.get(secret);
    if (!viewer) {
      return { error: "unknown_viewer" };
    }
    const handoff = this.handoffs.get(viewer.handoffId);
    if (!handoff || handoff.endedAt || this.now() >= handoff.sessionExpiresAt) {
      if (handoff && !handoff.endedAt) {
        this.end(handoff, "session_expired");
      }
      return { error: "expired" };
    }
    if (viewer.link) {
      const previous = viewer.link;
      viewer.link = null;
      previous.close(CLOSE_CODES.viewerReplaced, "viewer-replaced");
    }
    viewer.link = link;
    viewer.connectedAt = this.now();
    this.audit("connected", { id: handoff.id, viewer: secret.slice(0, 6), role: viewer.role });
    return { viewer, handoff };
  }

  detachViewer(secret, code = 1000, reason = "closed") {
    const viewer = this.viewers.get(secret);
    if (!viewer) {
      return;
    }
    if (this.controllerSecret === secret) {
      this.controllerSecret = null;
      viewer.role = "observer";
      this.audit("control_released", { id: viewer.handoffId, viewer: secret.slice(0, 6), reason });
    }
    const link = viewer.link;
    viewer.link = null;
    if (link) {
      link.close(code, reason);
      this.audit("disconnected", { id: viewer.handoffId, viewer: secret.slice(0, 6), reason });
    }
  }

  viewerDisconnected(secret) {
    const viewer = this.viewers.get(secret);
    if (!viewer) {
      return;
    }
    viewer.link = null;
    if (this.controllerSecret === secret) {
      this.controllerSecret = null;
      viewer.role = "observer";
      this.audit("control_released", { id: viewer.handoffId, viewer: secret.slice(0, 6), reason: "disconnected" });
    }
    this.audit("disconnected", { id: viewer.handoffId, viewer: secret.slice(0, 6), reason: "client" });
  }

  // ---- control ----

  takeControl(secret) {
    const viewer = this.viewers.get(secret);
    if (!viewer) {
      return { error: "unknown_viewer" };
    }
    if (!viewer.canControl) {
      return { error: "watch_only" };
    }
    if (!viewer.link) {
      return { error: "not_connected" };
    }
    const handoff = this.handoffs.get(viewer.handoffId);
    if (!handoff || handoff.endedAt) {
      return { error: "ended" };
    }
    if (this.controllerSecret && this.controllerSecret !== secret) {
      const previous = this.viewers.get(this.controllerSecret);
      if (previous) {
        previous.role = "observer";
        this.audit("control_taken", { id: previous.handoffId, from: this.controllerSecret.slice(0, 6), to: secret.slice(0, 6) });
        const link = previous.link;
        previous.link = null;
        link?.close(CLOSE_CODES.controlTaken, "control-taken");
      }
    }
    this.controllerSecret = secret;
    viewer.role = "controller";
    viewer.lastInputAt = this.now();
    this.audit("control_taken_by", { id: handoff.id, viewer: secret.slice(0, 6) });
    return { role: "controller" };
  }

  releaseControl(secret) {
    const viewer = this.viewers.get(secret);
    if (!viewer) {
      return { error: "unknown_viewer" };
    }
    if (this.controllerSecret === secret) {
      this.controllerSecret = null;
      viewer.role = "observer";
      this.audit("control_released", { id: viewer.handoffId, viewer: secret.slice(0, 6), reason: "released" });
    }
    return { role: "observer" };
  }

  noteInput(secret) {
    const viewer = this.viewers.get(secret);
    if (viewer) {
      viewer.lastInputAt = this.now();
    }
  }

  isController(secret) {
    return this.controllerSecret !== null && this.controllerSecret === secret;
  }

  // ---- housekeeping ----

  tick() {
    const now = this.now();
    for (const handoff of this.handoffs.values()) {
      if (handoff.endedAt) {
        continue;
      }
      if (handoff.claims === 0 && now >= handoff.claimExpiresAt) {
        this.end(handoff, "claim_window_expired");
      } else if (handoff.claims > 0 && now >= handoff.sessionExpiresAt) {
        this.end(handoff, "session_expired");
      }
    }
    if (this.controllerSecret) {
      const controller = this.viewers.get(this.controllerSecret);
      if (controller && now - (controller.lastInputAt ?? 0) >= this.limits.idleControlMs) {
        this.controllerSecret = null;
        controller.role = "observer";
        this.audit("control_released", { id: controller.handoffId, viewer: controller.secret.slice(0, 6), reason: "idle" });
        controller.link?.notify?.({ type: "role", role: "observer", reason: "idle" });
      }
    }
    // Forget viewers of ended handoffs and handoffs ended more than a day ago.
    for (const [secret, viewer] of this.viewers) {
      const handoff = this.handoffs.get(viewer.handoffId);
      if (!handoff || (handoff.endedAt && !viewer.link)) {
        this.viewers.delete(secret);
      }
    }
    for (const [id, handoff] of this.handoffs) {
      if (handoff.endedAt && now - handoff.endedAt > 24 * 60 * 60_000) {
        this.handoffs.delete(id);
        this.byTokenHash.delete(handoff.tokenHash);
      }
    }
  }

  activeViewerCount() {
    let n = 0;
    for (const viewer of this.viewers.values()) {
      if (viewer.link) {
        n += 1;
      }
    }
    return n;
  }

  // ---- views ----

  viewerStatus(secret) {
    const viewer = this.viewers.get(secret);
    if (!viewer) {
      return null;
    }
    const handoff = this.handoffs.get(viewer.handoffId);
    return {
      handoffId: viewer.handoffId,
      role: viewer.role,
      canControl: viewer.canControl,
      connected: Boolean(viewer.link),
      controlledByOther: this.controllerSecret !== null && this.controllerSecret !== secret,
      sessionExpiresAt: handoff?.sessionExpiresAt ?? null,
      ended: Boolean(handoff?.endedAt),
      endReason: handoff?.endReason ?? null,
      viewers: this.activeViewerCount(),
    };
  }

  latestHandoffForSession(sessionKey) {
    let latest = null;
    for (const handoff of this.handoffs.values()) {
      if (handoff.sessionKey === sessionKey && (!latest || handoff.createdAt > latest.createdAt)) {
        latest = handoff;
      }
    }
    return latest ? this.handoffStatus(latest.id) : null;
  }

  handoffStatus(id) {
    const handoff = this.handoffs.get(id);
    if (!handoff) {
      return null;
    }
    const viewers = [...this.viewers.values()].filter((v) => v.handoffId === id);
    const controller = this.controllerSecret ? this.viewers.get(this.controllerSecret) : null;
    return {
      id,
      kind: handoff.kind,
      ownerId: handoff.ownerId,
      sessionKey: handoff.sessionKey,
      reason: handoff.reason,
      createdAt: handoff.createdAt,
      claimExpiresAt: handoff.claimExpiresAt,
      claims: handoff.claims,
      firstClaimedAt: handoff.firstClaimedAt,
      sessionExpiresAt: handoff.sessionExpiresAt,
      connectedViewers: viewers.filter((v) => v.link).length,
      controlActive: Boolean(controller && controller.handoffId === id),
      lastInputAt: viewers.reduce((max, v) => Math.max(max, v.lastInputAt ?? 0), 0) || null,
      ended: Boolean(handoff.endedAt),
      endReason: handoff.endReason,
    };
  }

  state() {
    const controller = this.controllerSecret ? this.viewers.get(this.controllerSecret) : null;
    return {
      at: this.now(),
      controlActive: Boolean(controller),
      controlHandoffId: controller?.handoffId ?? null,
      controlSessionKey: controller ? (this.handoffs.get(controller.handoffId)?.sessionKey ?? null) : null,
      controlLastInputAt: controller?.lastInputAt ?? null,
      viewers: this.activeViewerCount(),
      activeHandoffs: [...this.handoffs.values()].filter((h) => !h.endedAt).map((h) => this.handoffStatus(h.id)),
    };
  }

  exportHandoffs() {
    return [...this.handoffs.values()].map((h) => ({ ...h }));
  }

  importHandoffs(records) {
    for (const record of records ?? []) {
      if (typeof record?.id === "string" && typeof record?.tokenHash === "string" && Number.isFinite(record?.createdAt)) {
        const handoff = { ...record };
        this.handoffs.set(handoff.id, handoff);
        this.byTokenHash.set(handoff.tokenHash, handoff.id);
      }
    }
  }
}
