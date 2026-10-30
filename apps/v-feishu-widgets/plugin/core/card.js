// The chat-side face of a widget: a Feishu card that opens the live page. A card cannot run
// HTML, so it carries what can be read without opening (the snapshot) and the way in.
const APPLINK = "https://applink.feishu.cn/client/web_url/open";

/** Sidebar next to the chat on desktop; Feishu ignores `mode` on phones and opens its in-app web view. */
export function openLinks(url) {
  const pc = `${APPLINK}?mode=sidebar-semi&max_width=900&url=${encodeURIComponent(url)}`;
  return { url: pc, pc_url: pc, ios_url: url, android_url: url };
}

export function widgetCard({ title, url, imageKey, version = 1 }) {
  const elements = [];
  if (imageKey) {
    elements.push({ tag: "img", img_key: imageKey, alt: { tag: "plain_text", content: title }, scale_type: "crop_top", preview: false });
  }
  elements.push({
    tag: "button",
    type: "primary",
    width: "fill",
    text: { tag: "plain_text", content: "打开组件" },
    behaviors: [{ type: "open_url", default_url: openLinks(url).url, pc_url: openLinks(url).pc_url, ios_url: url, android_url: url }],
  });
  if (version > 1) {
    elements.push({ tag: "markdown", content: `<font color='grey'>已更新到第 ${version} 版</font>`, text_size: "notation" });
  }
  return {
    schema: "2.0",
    config: { update_multi: true, width_mode: "fill", summary: { content: `[组件] ${title}` } },
    header: { title: { tag: "plain_text", content: title }, template: "blue" },
    body: { elements },
  };
}
