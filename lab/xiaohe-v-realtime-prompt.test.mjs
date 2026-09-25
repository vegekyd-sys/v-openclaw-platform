import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const prompt = fs.readFileSync(new URL("./xiaohe-v-realtime-prompt.md", import.meta.url), "utf8");

test("Xiaohe must speak a contextual acknowledgement before consulting V", () => {
  const speakFirst = prompt.indexOf("先用当前语言对用户说一句简短、具体、自然的过渡");
  const waitUntilSpoken = prompt.indexOf("等这句话已经说出来，再调用 openclaw_agent_consult");
  const neverSilent = prompt.indexOf("绝对不要一声不响地先调用工具");
  assert(speakFirst >= 0, "missing speak-before-tool requirement");
  assert(waitUntilSpoken > speakFirst, "tool order must follow the spoken acknowledgement");
  assert(neverSilent > waitUntilSpoken, "silent tool waits must be explicitly forbidden");
});

test("Xiaohe acknowledgement remains contextual instead of a fixed canned phrase", () => {
  assert.match(prompt, /查记忆时可以说/);
  assert.match(prompt, /查当前信息时可以说/);
  assert.match(prompt, /看文件时可以说/);
  assert.match(prompt, /不要机械套用例句，也不要每次重复同一句/);
});
