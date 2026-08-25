import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BOOTSTRAP_KEY = "feishu-notifications-v1.bootstrap";
const REVIEW_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class NightShiftNotificationCoordinator {
  constructor({ baseUrl, now = () => new Date(), sender, store }) {
    if (!baseUrl) throw new Error("Night Shift public base URL is required for notifications");
    if (!sender) throw new Error("Night Shift notification sender is required");
    if (!store) throw new Error("Night Shift store is required for notifications");
    this.baseUrl = baseUrl;
    this.now = now;
    this.sender = sender;
    this.store = store;
  }

  async reconcile({ cards, instances, releases }) {
    const releaseBySha = new Map(releases.map((release) => [release.workflowSha256, release]));
    const relevant = instances.filter((instance) => hasNotificationTarget(instance.collaboration));
    if (!this.store.getNotificationMetadata(BOOTSTRAP_KEY)) {
      for (const instance of relevant) {
        this.store.transitionNotificationSubject(`instance:${instance.id}`, instance.status, this.now());
        for (const card of cards.filter((entry) => cardInstanceId(entry) === instance.id)) {
          this.store.transitionNotificationSubject(`card:${card.id}`, card.status, this.now());
        }
      }
      this.store.setNotificationMetadata(BOOTSTRAP_KEY, { completedAt: this.now().toISOString() }, this.now());
      return { bootstrapped: true, delivered: [], queued: [] };
    }

    const queued = [];
    for (const instance of relevant) {
      const release = releaseBySha.get(instance.workflowSha256);
      const settings = release?.manifest?.spec?.notifications ?? release?.spec?.notifications ?? {};
      const projectCards = cards.filter((entry) => cardInstanceId(entry) === instance.id);
      for (const card of projectCards) {
        const transition = this.store.transitionNotificationSubject(`card:${card.id}`, card.status, this.now());
        if (!transition.changed || card.status !== "review" || settings.reviewRequested?.enabled !== true) continue;
        queued.push(this.enqueueReview({ card, generation: transition.generation, instance }));
      }
      const transition = this.store.transitionNotificationSubject(`instance:${instance.id}`, instance.status, this.now());
      if (transition.changed && instance.status === "done" && settings.instanceCompleted?.enabled === true) {
        queued.push(this.enqueueCompletion({ cards: projectCards, generation: transition.generation, instance }));
      }
    }
    const delivered = await this.deliverPending();
    return { bootstrapped: false, delivered, queued };
  }

  enqueueReview({ card, generation, instance }) {
    const token = randomBytes(24).toString("base64url");
    const allowedOpenIds = reviewOpenIds(instance.collaboration);
    const taskUrl = dashboardUrl(this.baseUrl, { card: card.id, view: "board" });
    const presentation = reviewPresentation({ card, instance, taskUrl, token });
    return this.store.enqueueNotification({
      allowedOpenIds,
      cardId: card.id,
      fallbackText: `待审核：${card.title}\n${taskUrl}`,
      instanceId: instance.id,
      kind: "review-requested",
      notificationKey: `review:${card.id}:${generation}`,
      presentation,
      targetChatId: instance.collaboration.sourceChatId,
    }, {
      expiresAt: new Date(this.now().getTime() + REVIEW_TOKEN_TTL_MS).toISOString(),
      token,
    }, this.now());
  }

  enqueueCompletion({ cards, generation, instance }) {
    const projectUrl = dashboardUrl(this.baseUrl, { project: instance.id, view: "workflows" });
    const summary = summarizeCards(cards);
    return this.store.enqueueNotification({
      allowedOpenIds: reviewOpenIds(instance.collaboration),
      fallbackText: `项目已完成：${instance.name}\n${projectUrl}`,
      instanceId: instance.id,
      kind: "instance-completed",
      notificationKey: `complete:${instance.id}:${generation}`,
      presentation: completionPresentation({ instance, projectUrl, summary }),
      targetChatId: instance.collaboration.sourceChatId,
    }, null, this.now());
  }

  async deliverPending() {
    const results = [];
    for (const delivery of this.store.listPendingNotifications()) {
      try {
        const sent = await this.sender.send(delivery);
        this.store.markNotificationDelivered(delivery.id, sent.messageId, this.now());
        this.store.appendEvent({
          instanceId: delivery.instanceId,
          type: "notification.delivered",
          payload: { cardId: delivery.cardId, kind: delivery.kind, messageId: sent.messageId ?? null },
          now: this.now(),
        });
        results.push({ id: delivery.id, ok: true, messageId: sent.messageId ?? null });
      } catch (error) {
        this.store.markNotificationFailed(delivery.id, error.message, this.now());
        this.store.appendEvent({
          instanceId: delivery.instanceId,
          type: "notification.failed",
          payload: { cardId: delivery.cardId, error: error.message, kind: delivery.kind },
          now: this.now(),
        });
        results.push({ error: error.message, id: delivery.id, ok: false });
      }
    }
    return results;
  }
}

export class OpenClawFeishuNotificationSender {
  constructor({
    accountId = process.env.NIGHTSHIFT_FEISHU_ACCOUNT_ID,
    command = process.env.NIGHTSHIFT_OPENCLAW_COMMAND ?? "openclaw",
    configPath = process.env.OPENCLAW_CONFIG_PATH,
    entry = process.env.NIGHTSHIFT_OPENCLAW_ENTRY,
    env = process.env,
    runner = defaultRunner,
  } = {}) {
    this.accountId = accountId;
    this.command = command;
    this.configPath = configPath;
    this.entry = entry;
    this.env = env;
    this.runner = runner;
  }

  async send(delivery) {
    const args = [
      ...(this.entry ? [this.entry] : []),
      "message",
      "send",
      "--channel",
      "feishu",
      "--target",
      delivery.targetChatId,
      "--message",
      delivery.fallbackText,
      "--presentation",
      JSON.stringify(delivery.presentation),
      "--json",
      ...(this.accountId ? ["--account", this.accountId] : []),
    ];
    const output = await this.runner(this.command, args, {
      ...this.env,
      ...(this.configPath ? { OPENCLAW_CONFIG_PATH: this.configPath } : {}),
    });
    const parsed = typeof output === "string" ? JSON.parse(output) : output;
    return { messageId: parsed.messageId ?? parsed.message_id ?? parsed.id ?? null, raw: parsed };
  }
}

export function reviewPresentation({ card, instance, taskUrl, token }) {
  return {
    title: `待你审核 · ${instance.name}`,
    tone: "warning",
    blocks: [
      { type: "text", text: `**${card.title}**\n任务已到人工审核阶段，请确认结果。` },
      { type: "context", text: `Night Shift 原始 Workboard 卡 · ${instance.id}` },
      {
        type: "buttons",
        buttons: [
          { label: "通过", style: "primary", action: { type: "command", command: `/nightshift-review approve ${token}` } },
          { label: "要求修改", style: "secondary", action: { type: "command", command: `/nightshift-review changes ${token}` } },
          { label: "拒绝", style: "danger", action: { type: "command", command: `/nightshift-review reject ${token}` } },
          { label: "打开 Night Shift", url: taskUrl },
        ],
      },
    ],
  };
}

export function completionPresentation({ instance, projectUrl, summary }) {
  return {
    title: `项目已完成 · ${instance.name}`,
    tone: "success",
    blocks: [
      { type: "text", text: `**全部流程已经结束**\n完成 ${summary.done} 项，阻塞 ${summary.blocked} 项。` },
      { type: "context", text: `Night Shift 项目 · ${instance.id}` },
      { type: "buttons", buttons: [{ label: "查看交付", style: "primary", url: projectUrl }] },
    ],
  };
}

export function reviewOpenIds(collaboration = {}) {
  const reviewers = Array.isArray(collaboration.reviewers) ? collaboration.reviewers.filter(Boolean) : [];
  return [...new Set(reviewers.length > 0 ? reviewers : [collaboration.createdByOpenId].filter(Boolean))];
}

function hasNotificationTarget(collaboration = {}) {
  return Boolean(collaboration.sourceChatId && reviewOpenIds(collaboration).length > 0);
}

function summarizeCards(cards) {
  return {
    blocked: cards.filter((card) => card.status === "blocked").length,
    done: cards.filter((card) => card.status === "done").length,
  };
}

function cardInstanceId(card) {
  return card.metadata?.automation?.instanceId ??
    card.labels?.find((entry) => entry.startsWith("instance:"))?.slice("instance:".length) ??
    null;
}

function dashboardUrl(baseUrl, parameters) {
  const url = new URL("/", baseUrl);
  for (const [key, value] of Object.entries(parameters)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

async function defaultRunner(command, args, env) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      encoding: "utf8",
      env,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 20000,
    });
    return stdout;
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? "").trim().slice(0, 2000);
    throw new Error(`Feishu notification delivery failed${detail ? `: ${detail}` : ""}`);
  }
}
