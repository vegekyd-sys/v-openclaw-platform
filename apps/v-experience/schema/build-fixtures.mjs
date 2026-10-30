// Writes the V card fixtures from the builders. The V app's tests read the same
// files (copied into v-voice client/VClientTests/Fixtures/vcard/), so a card the
// app cannot draw fails there. Run after changing a builder:
//   node apps/v-experience/schema/build-fixtures.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { linkVCard, questionCard, workCard } from "../v-experience.mjs";

const plan = [
  { step: "读取上周的停顿记录", status: "completed" },
  { step: "按原因归类", status: "in_progress" },
  { step: "写成报告", status: "pending" },
];
const meal = {
  id: "q-meal",
  questions: [{ questionId: "meal", question: "今晚吃什么？", multiSelect: true, options: [{ label: "火锅" }, { label: "寿司", description: "离公司近" }, { label: "面条" }] }],
};
const trip = {
  id: "q-trip",
  questions: [
    { questionId: "day", question: "哪天出发？", options: [{ label: "周六" }, { label: "周日" }] },
    { questionId: "people", question: "几个人？", options: [{ label: "两个人" }, { label: "全家" }] },
  ],
};

export const fixtures = {
  "work-thinking": workCard({ phase: "thinking" }),
  "work-working": workCard({
    phase: "working",
    view: { commentary: ["先看一下上周的停顿记录，再按原因归类。"], status: "🛠️ 运行命令", plan, waitingElsewhere: false },
    background: "⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1",
  }),
  "work-streaming": workCard({ phase: "working", answer: "报告整理好了，共 **7 次**停顿", view: { commentary: [], status: "", plan, waitingElsewhere: false } }),
  "work-waiting": workCard({ phase: "waiting", view: { commentary: [], status: "", plan: [], waitingElsewhere: true } }),
  "work-done": workCard({ phase: "done", answer: "报告整理好了，共 **7 次**停顿，其中 5 次已修复。", background: "☑️ 后台任务已结束", footer: "用时 42 秒 · 6 个操作 · DeepSeek flash" }),
  "work-aborted": workCard({ phase: "aborted" }),
  "question-multi": questionCard(meal, { staged: { 0: ["寿司"] } }),
  "question-two": questionCard(trip),
  "question-answered": questionCard(meal, { state: "answered", answers: { answers: { meal: ["火锅", "寿司"] } } }),
  "link-secret": linkVCard({
    title: "🔑 V 需要凭据 GITHUB_TOKEN",
    lines: ["用来读取私有仓库", "只用于：api.github.com", "链接只能用一次、10 分钟内有效；值不会出现在聊天记录里。"],
    buttons: [{ label: "填写凭据", url: "https://secrets.example/e/abc" }],
  }),
  "link-handoff": linkVCard({
    title: "电脑 · 需要你操作",
    lines: ["登录页需要扫码，请接管 V 的电脑完成。"],
    image: { alt: "V 的电脑", ref: "/home/openclaw/w/desktop/v-desktop-handoff-h_1a2b.jpg" },
    buttons: [{ label: "接管电脑", url: "https://desk.example/h_1a2b" }, { label: "我完成了", command: "/v-handback h_1a2b" }, { label: "跳过", command: "/v-skip h_1a2b" }],
  }),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
  for (const [name, card] of Object.entries(fixtures)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(card, null, 2)}\n`);
  }
  console.log(`wrote ${Object.keys(fixtures).length} fixtures to ${dir}`);
}
