// Keep the same CardKit entity/message. Normal stream writes keep targeting
// `content`; the question lives in separate native components.
export function installFeishuAskStream(Session, write, writeNote) {
  const start = Session.prototype.start;
  const replace = Session.prototype.replaceCardContent;
  const update = Session.prototype.updateCardContent;
  const close = Session.prototype.closeWithResult;
  const updateNote = Session.prototype.updateNoteContent;
  const continuation = (session, text) => {
    const prefix = session.vAskPrefix ?? "";
    return prefix && text.startsWith(prefix) ? text.slice(prefix.length).trimStart() || "\u200b" : text || "\u200b";
  };
  Session.prototype.start = async function (...args) {
    await start.apply(this, args);
    this.vAskOptions = args[2] ?? {};
  };
  Session.prototype.vAskUpdate = async function (card, owner) {
    // closeWithResult runs outside the stream's write queue. A late terminal
    // event must wait for its final body/settings writes before patching.
    if (this.closed && this.vAskClosing) await this.vAskClosing.catch(() => {});
    if (owner && owner !== this.vAskOwner) return;
    if (!owner) { owner = Symbol("question"); this.vAskOwner = owner; }
    const state = this.state ?? this.vAskState;
    if (!state?.messageId) throw new Error("No live Feishu stream message");
    if (this.vAskPrefix === undefined) this.vAskPrefix = state.sentText ?? "";
    this.vAskState = state;
    const task = this.queue.then(async () => {
      if (owner !== this.vAskOwner) return;
      const options = this.vAskOptions;
      const elements = [
        ...(this.vAskPrefix ? [{ tag: "markdown", content: this.vAskPrefix }, { tag: "hr" }] : []),
        ...card.body.elements,
        { tag: "markdown", element_id: "content", content: continuation(this, state.sentText ?? "") },
        ...(options.note ? [{ tag: "hr" }, { tag: "markdown", element_id: "note", content: `<font color='grey'>${options.note}</font>` }] : []),
      ];
      const composed = { ...card, config: { ...card.config, streaming_mode: false },
        ...(options.header ? { header: { title: { tag: "plain_text", content: options.header.title }, template: options.header.template ?? "blue" } } : {}),
        body: { ...card.body, elements } };
      await write(this, state, composed);
      this.vAskAttached = true;
    });
    // Keep retry possible after a failed API write without hiding it from caller.
    this.queue = task.catch(() => {});
    await task;
    return { messageId: state.messageId, updateCard: next => this.vAskUpdate(next, owner) };
  };
  Session.prototype.replaceCardContent = function (text, onError) {
    return replace.call(this, this.vAskAttached ? continuation(this, text) : text, onError);
  };
  Session.prototype.updateCardContent = function (text, onError) {
    return this.vAskAttached ? this.replaceCardContent(text, onError) : update.call(this, text, onError);
  };
  Session.prototype.updateNoteContent = function (note) {
    if (!this.vAskAttached || !writeNote) return updateNote?.call(this, note);
    this.vAskOptions.note = note;
    const state = this.state ?? this.vAskState;
    return writeNote(this, state, note).catch(error => this.log?.(`Question note update failed: ${String(error)}`));
  };
  Session.prototype.closeWithResult = function (...args) {
    const pending = close.apply(this, args);
    this.vAskClosing = pending;
    return pending;
  };
}
