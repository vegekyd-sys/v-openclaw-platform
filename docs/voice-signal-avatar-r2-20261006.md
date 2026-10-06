## R2：人物表演修订

用户指出首批状态图主要改变道具、人物表情与动作变化不足。R2 仅替换四张任务图，主头像保持用户选定的 D。新图片使用 -r2 文件名保存，旧版保留；静态白名单和完整 H5 产物引用 R2。

- 查记忆：托腮、翻页、视线上移回想，嘴部闭合。
- 网页检索：前倾探身、放大镜贴近一只眼，另一眼眯起，惊讶圆嘴。
- 查日程：侧身握日历，眉头收紧、抿嘴认真核对，伙伴移到日历一侧。
- 后台处理：俯身前倾、双手展开处理信号节点，眉头下压，专注闭口；伙伴协助搬资料。

优先改变头部角度、身体方向、手臂轮廓、眼神和嘴型，再配任务道具；不改变真实事件映射。

内置 image_gen 重新生成，以原始选定主头像为角色与服装参考，不沿用原有姿势。共同提示强调：原图仅作身份参考；必须大幅改变头部角度、身体朝向、眼神、眉毛、嘴型与手臂轮廓。保持白发、统一制服、胸针、耳麦、同一信号伙伴、淡紫背景和3D风格。不得重复主图开口微笑及触耳姿势，道具次于人物表演。

### R2 独立任务 Prompt

#### 查记忆 · 托腮沉思

ACTING POSE: V is hunched thoughtfully over an archive book, shoulders turned 30 degrees to viewer-right, head tilted strongly DOWN toward viewer-left. Her LEFT cheek rests on her LEFT fist with elbow on the edge of the open archive book, compressing her cheek a little. Her RIGHT hand delicately turns one glowing page. EXPRESSION: closed lips in a tiny thoughtful pout, one eyebrow gently lifted, eyes glance UP SIDEWAYS as if recalling a memory; no broad smile, no teeth showing. The little creature floats beside her shoulder looking down into the book with an equally pondering expression and one curled antenna. Quiet, absorbed, endearing recollection; clear large bent elbow/chin-rest silhouette. A few simple translucent memory cards rise from the book at the lower edge. Her face must look obviously different from a smiling search portrait.

#### 网页检索 · 探身发现

ACTING POSE: V leans FAR FORWARD toward the camera with a strong diagonal torso twist toward viewer-left, neck extended, her ponytail swinging out to viewer-right. One arm brings a large cyan magnifying lens directly up to her LEFT eye, which appears comically enlarged through it. The OTHER eye is squeezed shut in a playful investigative squint. Her free arm reaches out to grab a floating search result card on viewer-left. EXPRESSION: one eyebrow sharply arched, lips form a small surprised ROUND 'o' mouth as she discovers a useful result, NO usual toothy smile. The creature flies forward beside the search card like a scout, antennae stretched ahead. Energetic curiosity and 'aha!', exaggerated cartoon acting, very different silhouette from a relaxed upright portrait. Two minimal webpage cards at lower left, with shapes only.

#### 查日程 · 侧身核对

ACTING POSE: V stands in a strong THREE-QUARTER SIDE VIEW facing viewer-right (about 55-degree body turn), head turned further toward a floating calendar on the RIGHT edge, not looking at the viewer. Her left arm crosses her torso to cradle the large calendar upright, right elbow is raised while right index finger traces a particular calendar row. Keep her white ponytail sweeping to the LEFT behind her shoulder. EXPRESSION: genuinely businesslike careful checking: eyes NARROWED with concentration, brows angled inward, lips pressed together into a slight ASYMMETRIC side pout; NO smile or teeth. The creature sits just above the right side of the calendar, raises an antenna as a small clock cue. Calendar has a clear seven-column grid and two orange appointment blocks. Her side-on head, raised elbow and serious face should be unmistakable at thumbnail size.

#### 后台任务 · 双手忙碌

ACTING POSE: V works like a multitasking interstellar operator: torso leaning FORWARD and toward viewer-right, both elbows held WIDE, hands spread apart operating two separate floating task nodes at chest level, like conducting a little signal network. Head tilted about 25 degrees toward viewer-right and chin down, gaze fixed intensely on the connection BETWEEN her hands. White ponytail swings across the upper left, giving the picture a new silhouette. EXPRESSION: charming determined focus, LOWERED brows, cheeks puffed slightly, small tightly CLOSED mouth with one corner pulled sideways as if concentrating hard; NO broad smile. The signal creature on viewer-left is actively hauling a document tile with BOTH little fins, antenna tips glowing. One simple document node, one cog node and a connecting cyan thread, no final-success claim. Show real busy body effort and vivid teamwork, not idle posing with a prop.


## R2 验证

161 项本地检查通过。独立 Playwright UI fixture 验证1440×960桌面、390×844手机、四张R2状态图真实加载及过渡完成后的圆形裁切；无错误或警告、无横向溢出。原事件映射不变，未新增真实语音或后端任务测试，未合dev或部署Candidate/共享VLab/V。本轮预览浏览器与26249服务已收尾。

图片文件位于 `lab/gpt-live-h5/assets/v-signal-{memory,web,calendar,background}-20261006-r2.png`；主头像仍为 `v-signal-idle-20261006.png`。原生成文件均保留。
