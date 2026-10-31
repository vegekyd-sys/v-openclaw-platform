// Builds the two Recap sample cards (Feishu card JSON 2.0) used in the design doc.
import {writeFileSync} from 'node:fs';

const md = (content, extra = {}) => ({tag: 'markdown', content, ...extra});
const note = content => md(`<font color='grey'>${content}</font>`, {text_size: 'notation'});
const button = (text, type, value) => ({
  tag: 'button', text: {tag: 'plain_text', content: text}, type, size: 'small',
  behaviors: [{type: 'callback', value}],
});
const buttons = (...items) => ({
  tag: 'column_set', flex_mode: 'flow', horizontal_spacing: '8px',
  columns: items.map(item => ({tag: 'column', width: 'auto', elements: [item]})),
});
const section = (title, lines) => md(`**${title}**\n${lines.join('\n')}`);

const p2p = {
  schema: '2.0',
  config: {update_multi: true, width_mode: 'default', summary: {content: '回顾：交付页换大陆 CDN，等你选一家'}},
  header: {
    title: {tag: 'plain_text', content: '回顾'},
    subtitle: {tag: 'plain_text', content: '私聊 · 截至 10月28日 14:32'},
    text_tag_list: [{tag: 'text_tag', text: {tag: 'plain_text', content: '样例'}, color: 'neutral'}],
    template: 'default',
  },
  body: {elements: [
    md('**在给夜班交付页换大陆 CDN。测速做完了，等你选一家。**'),
    section('进展', [
      "<font color='grey'>☑️ 找到慢的原因：Cloudflare 在大陆没有节点，视频码率 11–27 Mbps</font>",
      "<font color='grey'>☑️ 腾讯云 COS、七牛各测 3 次，COS 快 2.3 倍，七牛快 1.9 倍</font>",
      '▶️ 正在把样片压到 6 Mbps，看画质能不能接受',
    ]),
    section('需要你', [
      '选 CDN：**腾讯云 COS**（月约 ¥40）还是 **七牛**（有免费额度）',
    ]),
    section('V 接下来', [
      '你选定后，改 cdn-upload 技能的上传目标，重传最近 3 个交付页',
    ]),
    md("<font color='orange'>⚠️ 七牛免费额度每月 10 GB，夜班跑一晚就会用完</font>"),
    {tag: 'collapsible_panel', expanded: false,
      header: {title: {tag: 'markdown', content: "<font color='grey'>更早的事（2 件）</font>"}},
      elements: [md("<font color='grey'>☑️ 10/27 修好交付页在 iOS 上不能播放\n☑️ 10/27 清掉 3 个重复的交付清单</font>")]},
    buttons(
      button('继续', 'primary_filled', {a: 'v.recap.continue', s: 'SAMPLE'}),
      button('刷新', 'default', {a: 'v.recap.refresh', s: 'SAMPLE'}),
    ),
    note('基于最近 42 条消息 · 2 分钟前生成 · 不会写进对话记录'),
  ]},
};

const group = {
  schema: '2.0',
  config: {update_multi: true, width_mode: 'default', summary: {content: '群回顾：3 条竖版广告，2 条待确认'}},
  header: {
    title: {tag: 'plain_text', content: '群回顾'},
    subtitle: {tag: 'plain_text', content: '最近 24 小时 · 4 人参与'},
    text_tag_list: [
      {tag: 'text_tag', text: {tag: 'plain_text', content: '仅你可见'}, color: 'blue'},
      {tag: 'text_tag', text: {tag: 'plain_text', content: '样例'}, color: 'neutral'},
    ],
    template: 'default',
  },
  body: {elements: [
    md('**在做 3 条 15 秒竖版广告。1 条已交付，2 条等确认文案。**'),
    section('进展', [
      "<font color='grey'>☑️ 第 1 条「通勤」已交付（馨仪 昨天 18:20 确认）</font>",
      '▶️ 第 2、3 条成片已出，等文案定稿再配字幕',
    ]),
    section('待办', [
      '**天懿**：确认第 2 条结尾用「立即下载」还是「限时免费」',
      '**馨仪**：补第 3 条的产品截图（V 昨天 21:05 问过，还没回）',
    ]),
    md("<font color='orange'>⚠️ 投放排期是周五，文案周四中午前要定</font>"),
    buttons(
      button('发到群里', 'primary_filled', {a: 'v.recap.publish', s: 'SAMPLE'}),
      button('刷新', 'default', {a: 'v.recap.refresh', s: 'SAMPLE'}),
    ),
    note('基于最近 24 小时 31 条消息 · 只总结本群内容 · 刚刚生成'),
  ]},
};

// Usage: node build-sample-cards.mjs <output-dir>
const out = process.argv[2];
writeFileSync(`${out}/recap-p2p.json`, JSON.stringify(p2p, null, 2));
writeFileSync(`${out}/recap-group.json`, JSON.stringify(group, null, 2));
console.log('ok', JSON.stringify(p2p).length, JSON.stringify(group).length);
