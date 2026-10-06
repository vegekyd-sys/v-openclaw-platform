# V 信号伙伴头像与任务状态（2026-10-06）

用户选定 D「信号伙伴」为主头像，四张任务变体通过内置 image_gen 生成。保留同一脸型、白发、蓝绿制服、龙虾胸针、小信号伙伴与淡紫背景。资产在 lab/gpt-live-h5/assets 中；原始生成文件保留。

## 图片和真实任务对应

| 状态 | 画面动作 | 事件来源 |
| --- | --- | --- |
| idle | 手托信号伙伴，触碰耳麦 | 无在执行的任务 / 通话结束 |
| memory | 翻阅档案，定位记忆卡 | memory_search / memory_get |
| web | 放大镜检查网页卡片 | web_search / web_fetch |
| calendar | 点选全息日历，伙伴提示时钟 | feishu_calendar；或明确的只读 lark-cli calendar +agenda 执行 |
| background | 与伙伴连接、整理任务节点 | 后端委派、其他尚未识别的工具 |

由实际 tool.call / tool.result / tool.error 管理状态。并行时显示最新仍在执行的任务，结束后回到另一项活跃任务或主头像。重复 callId 不重排，未知完成事件不影响其他任务。挂断、取消控制和查询当前时间不产生任务头像。

小何 / Grok 的直接工具调用在服务端提供 activity 枚举。openclaw_tool 包装调用根据真实内层工具分类；不向浏览器发送参数、查询词或结果。GPT Live 的 SSE 使用收到的工具名字分类；只暴露整体后端委派时显示 background，不能声称已展示内部具体步骤。没有按用户口头描述推测，也没有随机展示正在做另一类任务。

340ms 淡出旧图，图片先加载后替换；迟到下载不能恢复已结束任务。减少动态效果设置禁用过渡。页面离开注销渲染器。V 标识移到头像下方；保持桌面左右结构及手机接通后顶部小头像布局。

## 验证与范围

- 161 项本地检查通过：头像任务映射 / 并行与结束 / 迟到加载 / 图片失败 / 减少动态效果；原通话 app、server、hosted、媒体模块、H5 冻结产物、直接工具 session 回归。
- 浏览器插件未提供，使用独立 Playwright CLI 会话 v-avatar-task 验证。1440×960 桌面、390×844 手机及四种状态图加载、340ms 过渡后的裁切、无横向溢出、减少动态效果。无 pageerror；每张 PNG 为1254×1254。
- 浏览器验收使用本地 UI fixture，不是实际后端工具/模型/付费语音验收。截图、脚本、结果和日志放在本 worktree 的 ignored tmp。
- 新模块和五张图纳入静态白名单以及 H5_PATHS，防止仅本地可读而发布漏文件。
- 本补丁尚未合 dev，未部署当前 Candidate、共享 VLab 或 V。没有修改暂停中的音频与最终答案保真，也没有自动拨号或重启 Gateway。

## 生成 Prompt 集

内置 image_gen；输入为用户选定的 D 图片（exec-c372026d-a449-44c6-99ad-5a1084ced349.png）。

共同约束：编辑用户选定的图片生成一张任务状态变体；锁定角色身份、白发与马尾、蓝绿/奶白制服、龙虾胸针、分叉青色耳麦，以及同一个珍珠白信号伙伴。保持软光3D材质、纯淡紫背景、正方形构图和一致角色比例。任务动作要明显，不仅改变表情。伙伴位于画面左侧；无字、水印或其他角色。

### 查记忆

V looks attentively down at an OPEN translucent cyan archive book she holds at chest height. A few little photo-like geometric memory cards float from its pages. The signal creature leans toward the book and uses one antenna to illuminate a particular memory card. V has a warm concentrated expression; one finger points to that exact card. This reads instantly as looking up memories in an archive, NOT browsing websites or a generic magical orb.

### 网页检索

V and the signal creature are actively searching the web: V holds a large transparent cyan magnifying lens in one hand and uses it to inspect THREE floating translucent webpage cards with abstract thumbnail blocks and lines, no readable text. The creature points an antenna toward the best matching card. Slightly playful curious expression, body turned toward the search cards. Distinct search action and big legible magnifying lens, NOT an archive book.

### 查日历

V studies a clearly recognizable compact holographic CALENDAR PANEL in front of her chest: a neat 7-column date grid with a few orange event chips and one glowing selected day, no numbers or words. V taps the selected event with her fingertip while the floating signal creature points to a small clock icon next to the grid. Friendly focused expression. Make calendar and clock large and recognizable, NOT generic webpage cards or book.

### 后台整理与分析

V is carrying out a multistep background task: arranging THREE chunky glowing task tiles connected by short cyan route lines in front of her. First tile has an abstract document shape, second a cog shape, third an empty checkmark outline; show first complete via small light, middle currently active, final pending. V uses both hands to connect and organize the middle tile; signal creature carries another small document tile toward her. Concentrated but cheerful, visually working rather than waiting. Large simple legible objects, NOT a calendar, browser or archive book.

