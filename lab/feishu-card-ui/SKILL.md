---
name: feishu-card-ui
description: 在飞书里把结构化结果做成卡片 UI（图表、指标卡、分栏对比、时间线、状态标签、折叠细节、跳转按钮）的版式与写法；写卡片回复前读。
---

# 飞书卡片 UI

## 什么时候用
- 有一组数字 → 图表；有 2–4 个关键数字 → 指标卡；几个选项比较 → 分栏 + 推荐标签；按时间排的安排 → 时间线；有好坏/风险 → 彩色标签。出现其中任一样就用卡片，可以同时用好几样。
- 只是罗列信息（区号、名单、几行参数）、闲聊、短答、过程说明（"我先查一下"）：发 markdown 或文字。

## 怎么写
- 那条回复整条只有一个 JSON 对象（卡片 JSON 2.0），以 `{` 开头、`}` 结尾；不放代码块，前后不加文字。过程说明可以先单独发文字。
- 一张卡讲一件事：标题一句话说结论（subtitle 补关键数字），先给结论和指标，再给图，细节和长表格收进折叠面板。
- 颜色要有意思：green 好/完成，orange 注意，red 风险/超标，blue 中性，grey 次要；header 的 template 跟整体状态一致。
- 指标卡一行 2–4 个；图表数据点不超过 20 个；按钮只用 open_url。
- 图片只能用飞书上传得到的 img_key，不能填网址。单卡不超过 30 KB、200 个组件；飞书拒收的卡会被改成纯文字发出。

## 组件
- 标题：`"header":{"title":{"tag":"plain_text","content":"…"},"subtitle":{"tag":"plain_text","content":"…"},"text_tag_list":[{"tag":"text_tag","text":{"tag":"plain_text","content":"上升"},"color":"green"}],"template":"green"}`
- 文字：`{"tag":"markdown","content":"**粗体** <font color='red'>彩色</font> <text_tag color='green'>标签</text_tag> [链接](https://…)","text_size":"heading|normal|notation","text_align":"left|center"}`；分割线 `{"tag":"hr"}`
- 分栏：`{"tag":"column_set","horizontal_spacing":"8px","columns":[{"tag":"column","width":"weighted|auto","weight":1,"background_style":"grey-50","padding":"8px 8px 8px 8px","vertical_align":"center","elements":[…]}]}`
- 图表（VChart）：`{"tag":"chart","aspect_ratio":"16:9|4:3|1:1","chart_spec":{"type":"line|bar|area|pie", …}}`；折线/柱状用 xField/yField（多条线加 seriesField），饼图用 categoryField/valueField。
- 表格组件：`{"tag":"table","page_size":10,"columns":[{"name":"n","display_name":"名称","data_type":"text|lark_md|number|date"}],"rows":[{"n":"A"}]}`（简单表格直接写 markdown 表格也行）
- 折叠：`{"tag":"collapsible_panel","expanded":false,"header":{"title":{"tag":"markdown","content":"**详情**（展开）"}},"elements":[…]}`
- 按钮：`{"tag":"button","text":{"tag":"plain_text","content":"打开"},"type":"primary|default","size":"small","behaviors":[{"type":"open_url","default_url":"https://…"}]}`

## 版式（照着改内容即可，可以混用）

### 数据与趋势：状态标签标题 → 指标卡一行 → 图表 → 结论 → 折叠的安排/明细
```json
{"schema":"2.0","config":{"width_mode":"fill"},"header":{"title":{"tag":"plain_text","content":"跑量趋势 · 5–10 月"},"subtitle":{"tag":"plain_text","content":"半年 332 km · 稳步上升"},"text_tag_list":[{"tag":"text_tag","text":{"tag":"plain_text","content":"上升"},"color":"green"}],"template":"green"},"body":{"elements":[{"tag":"column_set","horizontal_spacing":"8px","columns":[{"tag":"column","width":"weighted","weight":1,"background_style":"grey-50","padding":"8px 8px 8px 8px","vertical_spacing":"2px","elements":[{"tag":"markdown","content":"<font color='grey'>月均</font>","text_size":"notation","text_align":"center"},{"tag":"markdown","content":"**55 km**","text_size":"heading","text_align":"center"},{"tag":"markdown","content":"<font color='green'>近 3 月 66</font>","text_size":"notation","text_align":"center"}]},{"tag":"column","width":"weighted","weight":1,"background_style":"grey-50","padding":"8px 8px 8px 8px","vertical_spacing":"2px","elements":[{"tag":"markdown","content":"<font color='grey'>峰值</font>","text_size":"notation","text_align":"center"},{"tag":"markdown","content":"**70 km**","text_size":"heading","text_align":"center"},{"tag":"markdown","content":"<font color='grey'>9 月</font>","text_size":"notation","text_align":"center"}]},{"tag":"column","width":"weighted","weight":1,"background_style":"grey-50","padding":"8px 8px 8px 8px","vertical_spacing":"2px","elements":[{"tag":"markdown","content":"<font color='grey'>最大波动</font>","text_size":"notation","text_align":"center"},{"tag":"markdown","content":"**+61%**","text_size":"heading","text_align":"center"},{"tag":"markdown","content":"<font color='red'>8 月，偏冒险</font>","text_size":"notation","text_align":"center"}]}]},{"tag":"chart","aspect_ratio":"16:9","chart_spec":{"type":"bar","data":{"values":[{"m":"5月","km":42},{"m":"6月","km":55},{"m":"7月","km":38},{"m":"8月","km":61},{"m":"9月","km":70},{"m":"10月","km":66}]},"xField":"m","yField":"km","label":{"visible":true}}},{"tag":"markdown","content":"**结论**：整体在涨，10 月回落是健康的巩固。<text_tag color='orange'>注意</text_tag> 月跑量涨幅控制在 10% 以内。"},{"tag":"collapsible_panel","expanded":false,"header":{"title":{"tag":"markdown","content":"**11 月安排**（展开）"}},"elements":[{"tag":"markdown","content":"- W1 16 km 轻松跑\n- W2 18 km 加一次节奏跑\n- W3 20 km 长距离 10 km\n- W4 14 km 减量"}]}]}}
```

### 多方对比：每个选项一栏 + 推荐标签 → 折叠的完整参数 → 跳转按钮
```json
{"schema":"2.0","config":{"width_mode":"fill"},"header":{"title":{"tag":"plain_text","content":"三款旗舰怎么选"},"template":"blue"},"body":{"elements":[{"tag":"column_set","horizontal_spacing":"8px","columns":[{"tag":"column","width":"weighted","weight":1,"background_style":"grey-50","padding":"8px 8px 8px 8px","elements":[{"tag":"markdown","content":"**iPhone 17 Pro**\n<text_tag color='green'>推荐</text_tag>"},{"tag":"markdown","content":"影像视频最稳","text_size":"notation"}]},{"tag":"column","width":"weighted","weight":1,"background_style":"grey-50","padding":"8px 8px 8px 8px","elements":[{"tag":"markdown","content":"**Pixel 10 Pro**\n<text_tag color='blue'>性价比</text_tag>"},{"tag":"markdown","content":"拍照算法强","text_size":"notation"}]},{"tag":"column","width":"weighted","weight":1,"background_style":"grey-50","padding":"8px 8px 8px 8px","elements":[{"tag":"markdown","content":"**S26 Ultra**\n<text_tag color='grey'>备选</text_tag>"},{"tag":"markdown","content":"大屏+长续航","text_size":"notation"}]}]},{"tag":"collapsible_panel","expanded":false,"header":{"title":{"tag":"markdown","content":"**完整参数**（展开）"}},"elements":[{"tag":"markdown","content":"| | iPhone | Pixel | S26 |\n|---|---|---|---|\n| 屏幕 | 6.3\" | 6.3\" | 6.9\" |\n| 起售价 | ¥7999 | $999 | ¥9699 |"}]},{"tag":"column_set","columns":[{"tag":"column","width":"auto","elements":[{"tag":"button","text":{"tag":"plain_text","content":"Apple 官网"},"type":"primary","size":"small","behaviors":[{"type":"open_url","default_url":"https://www.apple.com.cn"}]}]},{"tag":"column","width":"auto","elements":[{"tag":"button","text":{"tag":"plain_text","content":"三星官网"},"size":"small","behaviors":[{"type":"open_url","default_url":"https://www.samsung.com.cn"}]}]}]}]}}
```

### 计划与行程：左栏时间、右栏内容，一步一行 → 风险/备选标签
```json
{"schema":"2.0","config":{"width_mode":"fill"},"header":{"title":{"tag":"plain_text","content":"周六 · 陪爸妈上海一日"},"subtitle":{"tag":"plain_text","content":"14–19℃ 阴 · 步行约 3000 步"},"template":"orange"},"body":{"elements":[{"tag":"column_set","horizontal_spacing":"12px","columns":[{"tag":"column","width":"auto","elements":[{"tag":"markdown","content":"<font color='orange'>**10:00**</font>"}]},{"tag":"column","width":"weighted","weight":1,"elements":[{"tag":"markdown","content":"**外滩源慢走**\n<font color='grey'>路平、长椅多</font>"}]}]},{"tag":"column_set","horizontal_spacing":"12px","columns":[{"tag":"column","width":"auto","elements":[{"tag":"markdown","content":"<font color='orange'>**12:00**</font>"}]},{"tag":"column","width":"weighted","weight":1,"elements":[{"tag":"markdown","content":"**午饭 · 本帮菜**\n<font color='grey'>提前订座</font>"}]}]},{"tag":"column_set","horizontal_spacing":"12px","columns":[{"tag":"column","width":"auto","elements":[{"tag":"markdown","content":"<font color='orange'>**14:00**</font>"}]},{"tag":"column","width":"weighted","weight":1,"elements":[{"tag":"markdown","content":"**上海博物馆东馆**\n<font color='grey'>有电梯，可租轮椅</font>"}]}]},{"tag":"hr"},{"tag":"markdown","content":"<text_tag color='red'>雨天备选</text_tag> 改去来福士 + 室内茶馆","text_size":"notation"}]}}
```

### 状态汇报：饼图 + 右侧清单与状态标签
```json
{"schema":"2.0","config":{"width_mode":"fill"},"header":{"title":{"tag":"plain_text","content":"本周开支"},"text_tag_list":[{"tag":"text_tag","text":{"tag":"plain_text","content":"超预算 12%"},"color":"red"}],"template":"red"},"body":{"elements":[{"tag":"column_set","horizontal_spacing":"8px","columns":[{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"chart","aspect_ratio":"1:1","chart_spec":{"type":"pie","data":{"values":[{"c":"餐饮","v":820},{"c":"交通","v":260},{"c":"购物","v":1150}]},"categoryField":"c","valueField":"v","outerRadius":0.8,"innerRadius":0.5,"legends":{"visible":true,"orient":"bottom"}}}]},{"tag":"column","width":"weighted","weight":1,"vertical_align":"center","elements":[{"tag":"markdown","content":"**¥2230** / 预算 ¥2000\n\n- 购物 <text_tag color='red'>超</text_tag>\n- 餐饮 <text_tag color='green'>正常</text_tag>\n- 交通 <text_tag color='green'>正常</text_tag>"}]}]}]}}
```
