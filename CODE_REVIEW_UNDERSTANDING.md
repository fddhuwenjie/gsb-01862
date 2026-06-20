# 塔罗抽卡游戏 — 代码理解与审查文档

本文档基于对项目全部业务代码的静态阅读，从模块职责、完整抽卡链路、交互状态流、降级策略、用户体验风险五个维度展开分析。所有结论均可追溯至具体源码行。

---

## 一、模块职责图景

| 文件 | 职责边界 | 不负责什么 |
|---|---|---|
| [main.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js) | 入口引导：DOMContentLoaded 后做 WebGL 能力检测，实例化 `TarotGame`，挂载到 `window.tarotGame` 便于调试；初始化失败时向 `#loading` 写入错误提示 | 不持有任何业务状态，不绑定事件，不创建 3D 对象 |
| [TarotGame.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js) | **核心编排器**：Three.js 场景/相机/渲染器初始化、灯光与星空背景、状态机驱动、鼠标与手势两套事件分发、卡牌动画（抓取/翻转/浮动/灰烬后销毁）、UI 面板（卡牌信息/历史/提示/剩余数）同步、手势光标指示器 | 不管理牌库数据结构，不识别手势关键点，不计算粒子物理，不持有塔罗牌文本 |
| [CardManager.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js) | **牌库与 3D 卡牌**：78 张牌的初始化/洗牌/去重抽取、正逆位随机、纹理三级降级加载（在线→本地→Canvas 占位）、`BoxGeometry` 六面材质卡牌网格构建、逆位 Z 轴 180° 旋转、几何体/材质 dispose | 不决定何时抽牌，不处理用户输入，不展示解读文本 |
| [HandTracker.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js) | **手势识别封装**：MediaPipe Hands 初始化、摄像头权限与安全上下文校验、21 点手部关键点绘制、手指屈伸判别、四种手势（OPEN/PINCH/FIST/POINT）分类、3 帧缓冲防抖、手部位置指数平滑（`smoothingFactor=0.3`）、镜像 X 坐标 | 不知道游戏状态机的存在，不直接操作 Three.js 对象，通过回调向外暴露 `onGestureChange` / `onHandMove` |
| [ParticleSystem.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js) | **灰烬粒子效果**：从卡牌 `BoxGeometry` 表面采样 2000 个点作为发射源、自定义 `ShaderMaterial`（顶点 shader 按距离缩放点尺寸、片元 shader 圆形裁切+暖色混合+AdditiveBlending）、湍流噪声驱动漂浮、每帧寿命/透明度/速度衰减、结束后自动 dispose geometry/material 并回调 | 不管理卡牌生命周期，不触发游戏流程推进，由 TarotGame 在 `confirmCard` 时调用并在粒子结束后回调 `autoNextCard` |
| [tarotData.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/tarotData.js) | **静态数据层**：22 张大阿尔卡纳 + 56 张小阿尔卡纳（权杖/圣杯/宝剑/星币各 14 张）的中英文名称和正/逆位解读；`getCardImageUrl()` 返回本地与 GitHub Raw 在线 URL 映射；内联 SVG 牌背 fallback；牌背常量 `CARD_BACK_URL` | 不包含运行时状态，不做随机，不依赖 DOM/Three.js |

**依赖关系（单向）**：`main.js` → `TarotGame` → `CardManager` + `ParticleSystem` + `HandTracker`；`CardManager` → `tarotData.js` 暴露的全局函数（`getAllCards`, `getCardImageUrl`）。所有 JS 文件通过 `<script>` 标签按顺序加载到全局作用域（见 [index.html#L82-L87](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/index.html#L82-L87)），无 ES Module 打包。

---

## 二、一次完整抽卡的链路深描

以下链路从页面加载开始，沿着"加载→初始化→待抽→选中→确认→展示→灰烬→历史→下一张"展开。

### 阶段 1：页面加载与游戏初始化（[main.js#L4-L24](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js#L4-L24) + [TarotGame.js#L35-L54](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L35-L54)）

1. `DOMContentLoaded` 触发后，先检测 `window.WebGLRenderingContext`，不支持则直接在 `#loading` 中显示错误并 `return`。
2. `new TarotGame()`：构造函数初始化状态机为 `this.state = 'idle'`，模式为 `this.mode = 'mouse'`，创建 `THREE.Raycaster`、`THREE.Vector2 mouse`、`THREE.Clock`，预定义 `cardIdlePosition(0,0,0)` / `cardShowPosition(0,0,4)` / `cardTargetPosition(0,0,3)` 三个锚点。
3. `game.init()` 按序执行：
   - `initThree()`：60° FOV 透视相机（z=8），开启 PCFSoftShadowMap、ACESFilmicToneMapping；
   - `initLights()`：环境光 + 主方向光（2048 shadow map）+ 补光 + 底部橙色点光源；
   - `initBackground()`：1000 颗随机分布的 `THREE.Points` 星空；
   - `initHandCursor()`：青色圆环 + 点光源组成的手势光标（默认 `visible=false`）；
   - `new CardManager(this.scene)`：此时 CardManager 构造函数立即调用 `initDeck()` 复制 78 张牌并洗牌，同时异步加载牌背纹理、创建加载中纹理、创建占位纹理；
   - `new ParticleSystem(this.scene)`：仅创建空数组 `this.particleSystems = []`；
   - `bindEvents()`：注册 resize、mousemove、click、模式切换按钮、下一张按钮、历史面板切换；
   - `animate()`：启动 `requestAnimationFrame` 循环，每帧调用 `particleSystem.update(deltaTime)` 后渲染；
   - **关键异步点**：`await this.prepareNextCard()` 进入第一次抽牌准备。

### 阶段 2：卡牌初始化与"可抽取状态"（[TarotGame.js#L457-L477](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L457-L477) + [CardManager.js#L266-L313](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L266-L313)）

1. `prepareNextCard()` 调用 `cardManager.drawCard()`：
   - 过滤 `deck.filter(c => !c.drawn)` 得到可用牌池（去重机制，见第四节）；
   - `Math.floor(Math.random() * availableCards.length)` 随机选一张；
   - `Math.random() < 0.5` 决定正逆位；
   - 标记 `card.drawn = true`；
   - **立即同步返回**一个 `currentCard` 对象：`{ ...card, orientation, meaning, frontTexture: loadingTexture, backTexture }`，同时把它 push 到 `drawnCards`；
   - **异步发起** `loadCardTexture(card.id)`：先尝试 GitHub Raw 在线图，失败则本地 `assets/cards/{id}.jpg`，再失败则 `createCardPlaceholder()` 绘制 Canvas 占位纹理；纹理加载完成后，若 cardMesh 已存在则更新材质数组的 map 并 `needsUpdate = true`。
2. `createCardMesh(card, showBack=true)`：若已有旧卡牌先 dispose geometry/material 再从 scene 移除；创建 2×3×0.02 的 `BoxGeometry`，六面材质数组 `[右,左,上,下,前,后]`，前后面分别绑定 backTexture/frontTexture（showBack=true 时正面贴牌背、背面贴牌面，翻转 π 后露出牌面）；将 `isReversed` / `showingBack` 存入 `userData`。
3. 卡牌放置到 `cardIdlePosition(0,0,0)`，调用 `cardFloatAnimation()` 启动 y 轴 sin 浮动和 y 轴微幅旋转。
4. `this.state = 'idle'`，`this._prevGesture = null`，`this.updateUI()` 更新剩余张数。
5. 隐藏 `#loading`，底部提示"点击卡牌开始抽卡"。

### 阶段 3：选中卡牌（鼠标 vs 手势两条路径汇入同一 `grabCard()`）

**鼠标路径**（[TarotGame.js#L417-L452](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L417-L452)）：
- `onMouseMove`：归一化鼠标坐标到 [-1,1]，Raycaster 与 `cardMesh` 求交，`highlightCard(true/false)` 设置 scale 1.05/1。
- `onMouseClick`：若 `state !== 'confirmed'`，射线命中且 state 是 `idle`/`ready` 时调用 `grabCard()`。注意鼠标模式**直接从 idle 进入 grabbing**，没有 ready 阶段。

**手势路径**（[TarotGame.js#L288-L339](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L288-L339) + [HandTracker.js#L209-L256](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L209-L256)）：
- 用户点击"手势模式"按钮后 `setMode('gesture')`：lazy 初始化 `HandTracker`，传入两个回调；检查 `isSecureContext`、`navigator.mediaDevices.getUserMedia` 可用性（见第五节降级）。
- MediaPipe `onResults` 回调中，若检测到手：
  - `recognizeGesture()` 先判 FIST（四指全屈/单指非食指伸），再判 PINCH（thumbToIndex<0.12 且非三指全伸），再判 OPEN（≥3 指伸），再判 POINT（仅食指伸）；
  - `stabilizeGesture()`：3 帧滑动窗口 majority vote，阈值 2 帧一致才切换，防抖；
  - 位置：取手腕(0)和中指根(9)中点做 palm center，X 轴镜像（`x = 1 - palmCenter.x`），再经 `smoothingFactor=0.3` 指数平滑；
  - 回调到 `onGestureChange` → `handleGesture`：
    - `OPEN`：仅当 `gestureChanged && state === 'idle'` 时设置 `state = 'ready'`；
    - `PINCH`：**持续检测**（不要求 gestureChanged），当 state 是 `ready` 或 `idle` 且射线命中 cardMesh 时，调用 `grabCard()` 并设 `state='grabbing'`。这里允许 PINCH 从 idle 直接抓取，和 OPEN→ready 的要求存在**不一致**（风险分析见第七节）。
    - `FIST`：仅当 `gestureChanged && (state === 'grabbing' || state === 'showing')` 时调用 `confirmCard()`；
    - `POINT`：高亮卡牌并**立即将速度清零**（停止手势移动惯性）；
    - `NONE`：取消高亮。
  - `onHandMove`：映射到 `this.mouse`，更新手势光标颜色（命中变绿 1.2x 放大，否则青色）；若 `state === 'grabbing'` 则用 0.1 系数插值移动卡牌位置。

### 阶段 4：确认抽牌（[TarotGame.js#L504-L574](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L504-L574)）

1. `grabCard()`：
   - 先强制 `this.state = 'grabbing'`；
   - `animateCardTo(cardShowPosition, 0.5, callback)`：用 easeOutCubic 把卡牌从当前位置 lerp 到 (0,0,4)；
   - 动画完成后回调：`this.state = 'showing'`，调用 `flipCard()`；
   - 同步提示"握拳确认抽卡"或"再次点击确认"。
2. `flipCard()`：0.8 秒绕 Y 轴从当前 rotation.y 旋转到 π（即 180° 翻面）；动画结束回调 `cardManager.applyReversedRotation()`——若 `userData.isReversed` 则再绕 Z 轴旋转 π（上下颠倒表示逆位）。
3. `confirmCard()`（由鼠标二次点击或 FIST 手势触发）：
   - `this.state = 'confirmed'`；
   - `showCardInfo(card)`：在 `#card-info` 面板显示 `#id 名称`、正位/逆位标签、对应 `meaning` 文本；
   - `addToHistory(card)`：见第六节；
   - `particleSystem.createAshParticles(cardMesh, onComplete)`：见阶段 5；
   - 立即 `cardMesh.visible = false`（卡牌在灰烬中"消失"）；
   - 清空底部提示。

### 阶段 5：灰烬粒子与下一张准备（[ParticleSystem.js#L13-L241](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js#L13-L241) + [TarotGame.js#L579-L612](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L579-L612)）

1. `createAshParticles(cardMesh, onComplete)`：
   - 复制卡牌当前 world position/rotation，从 `BoxGeometry` 的 position attribute 采样；
   - 2000 个粒子，50% 直接从顶点取、50% 在卡牌宽高表面均匀分布，全部 applyEuler 到世界坐标；
   - 速度：主方向向上（vy 0.5~2.0）+ 水平扰动；寿命 1~3 秒随机；
   - 自定义 ShaderMaterial：AdditiveBlending、depthWrite=false，片元按距中心距离做圆形裁切+暖色混合；
   - 把 system 对象 push 到 `this.particleSystems`。
2. 每帧 `update(deltaTime)`：
   - 遍历所有粒子，寿命递减、位置叠加速度+湍流噪声、速度衰减 0.98~0.99、透明度按寿命比例衰减、尺寸乘 0.995；
   - 若 `allDead` 或累计 time > duration（3s）则加入 `systemsToRemove`；
   - `removeSystem`：splice 数组、scene.remove mesh、dispose geometry/material、调用 `onComplete`。
3. 粒子完成回调触发 `autoNextCard()`：
   - 隐藏 `#card-info` 面板；
   - 从 scene 移除当前 cardMesh、置 `cardManager.cardMesh = null`（注意：这里**没有 dispose 该 mesh 的 geometry/material**，只有 `createCardMesh` 在下次创建新卡牌时才会 dispose 旧 mesh；但此时旧 mesh 已被 remove，下次 createCardMesh 的 `if (this.cardMesh)` 检查是 null，不会触发那段 dispose——**这是一处资源泄漏点**，见第七节）；
   - 再次 `await prepareNextCard()`，进入阶段 2，闭合循环。

---

## 三、鼠标模式 vs 手势模式：状态流的共同点与差异

### 共同状态机

```
                    ┌──────────────┐
  prepareNextCard   │     idle     │◄──────────────────────┐
  ─────────────────►│  (卡牌浮动)  │                       │
                    └──────┬───────┘                       │
                           │                               │
          ┌────────────────┼────────────────┐              │
          │ 鼠标点击        │ OPEN (gesture) │              │
          │ (idle→grabbing)│ (idle→ready)   │              │
          ▼                ▼                │              │
     ┌─────────┐     ┌─────────┐           │ 粒子完成      │
     │grabbing │     │  ready  │           │ autoNextCard  │
     │(飞近动画)│     │(等待PINCH)│         │               │
     └────┬────┘     └────┬────┘           │               │
          │               │ PINCH+命中      │               │
          │               ▼                │               │
          │          ┌─────────┐           │               │
          │          │grabbing │           │               │
          │          └────┬────┘           │               │
          │ animate 完成  │                   │               │
          ▼               ▼                   │               │
     ┌─────────┐     ┌─────────┐           │               │
     │ showing │◄────┤ showing │           │               │
     │(翻面完成)│     │(翻面完成)│           │               │
     └────┬────┘     └────┬────┘           │               │
          │               │                   │               │
          │ 鼠标再点/FIST │                   │               │
          ▼               ▼                   │               │
     ┌─────────────────────────────┐        │               │
     │         confirmed           │        │               │
     │ (显示解读+灰烬+历史写入)      │────────┘               │
     └─────────────────────────────┘                        │
          │                                                  │
          └─── 粒子 onComplete → autoNextCard() ─────────────┘
```

### 关键差异

| 维度 | 鼠标模式 | 手势模式 |
|---|---|---|
| 进入 ready 状态 | **不存在**，`idle` 点击直接 `grabbing` | 必须先 `OPEN` 手掌触发 `idle→ready`，且要求 `gestureChanged`（边缘触发） |
| 选中卡牌的触发方式 | `click` 事件（离散事件，天然防抖） | `PINCH` 手势：条件 `(state==='ready'\|\|'idle') && 射线命中`，是**电平持续检测**，每一帧只要满足就会尝试进入 grabbing，但因 state 立即变为 grabbing 防止重复触发 |
| 抓取时的卡牌移动 | 无（卡牌直接动画飞向固定点） | `onHandMove` 持续更新卡牌 x/y，带 0.1 系数速度衰减 |
| 确认动作 | 再次点击（同样离散，安全） | `FIST` 手势：要求 `gestureChanged`（边缘触发） |
| 光标/指针 | 系统鼠标，无额外 3D 指示器 | 青色 3D 圆环 + 点光源，命中卡牌变绿放大 |
| 悬停高亮 | `onMouseMove` 持续更新 | 仅 `POINT` 手势高亮（OPEN/PINCH 手势下不高亮，但 PINCH 时会直接进入抓取） |
| 提示文案 | "点击卡牌开始抽卡"→"再次点击确认" | "张开手掌开始抽卡"→"握拳确认抽卡"，并在右上角面板实时显示当前手势图标和下一步提示 |
| 模式切换时 UI | 显示 `#hint`，隐藏 `#gesture-status`/`#camera-preview` | 显示手势状态面板+摄像头预览，隐藏 `#hint` |

### 相同点
- 最终都汇入同一组方法：`grabCard()` → `flipCard()` → `confirmCard()` → `autoNextCard()`。
- 共用同一个 `THREE.Raycaster` 做命中检测（手势模式的 PINCH 命中检测也是用 raycaster）。
- 共用同一套粒子、历史、UI 面板逻辑。
- 状态机 `confirmed` 阶段都拒绝任何新输入（`handleGesture` 中 confirmed 直接 return；`onMouseClick` 中 confirmed 直接 return）。

---

## 四、关键机制解析

### 4.1 抽过的牌如何避免重复（[CardManager.js#L266-L313](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L266-L313)）

- `initDeck()` 将 78 张基础数据 `map` 成带 `drawn: false` 标记的对象副本，**直接引用**放入 `this.deck`。
- `shuffleDeck()` Fisher-Yates 原地洗牌。
- `drawCard()` 每次 `this.deck.filter(c => !c.drawn)` 实时计算可用池，随机选中后**原地修改**该对象 `card.drawn = true`。
- 因此未重置牌库前同一 ID 的牌不会再次被抽到。`drawnCards` 数组额外保存一份引用（包含运行时生成的 orientation/meaning/texture 等），但去重判断依赖的是 `deck[*].drawn` 标记。
- `reset()` 遍历所有 `deck[*].drawn = false`，清空 `drawnCards`，重新洗牌。**注意**：当前 UI 没有暴露"重新开始"按钮，`reset()` 是死代码，除非通过 `window.tarotGame.cardManager.reset()` 在控制台手动调用。
- 全部 78 张抽完后 `drawCard()` 返回 `null`，`prepareNextCard()` 显示"所有卡牌已抽完！"，不再创建新卡牌，但状态/场景中保留上一张卡牌的残留状态（`cardMesh` 未被清理）。

### 4.2 正逆位含义如何被选中并展示

**选择**：[CardManager.js#L277-L289](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L277-L289) 用 `Math.random() < 0.5` 决定 `isReversed` 布尔值；随后 `orientation: isReversed ? 'reversed' : 'upright'`，`meaning: isReversed ? card.reversed : card.upright`。正逆位的 50% 概率分布在 [gameLogic.test.js#L14-L30](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gameLogic.test.js#L14-L30) 中有测试。

**3D 呈现**：`flipCard()` 完成 Y 轴 180° 翻面后调用 `applyReversedRotation()`，若 reversed 则 `rotation.z = Math.PI`，即卡牌图像上下颠倒。

**信息面板**：[TarotGame.js#L617-L631](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L617-L631) `showCardInfo()` 读取 `card.orientation` 设置 `#card-orientation` 文本和 class（css 应定义 `.upright`/`.reversed` 不同颜色），`#card-meaning` 直接填入 `card.meaning` 字符串。

**历史小图**：[TarotGame.js#L636-L663](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L636-L663) 中 `<img>` 的 class 加 `reversed` 做 CSS 旋转，图片 onerror 时隐藏 `<img>` 并显示显示编号的 fallback div（只显示 `#id`，没有正逆位文字）。

### 4.3 摄像头权限失败 / 浏览器不支持时的降级链（[TarotGame.js#L192-L236](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L192-L236) + [HandTracker.js#L28-L99](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L28-L99)）

降级触发点集中在 `HandTracker.init()` 的三道检查与一个 try/catch：

| 失败场景 | 检测位置 | 用户反馈 | 降级行为 |
|---|---|---|---|
| 非安全上下文（HTTP 非 localhost） | `!window.isSecureContext` | alert 提示需要 HTTPS/localhost | `init()` 返回 false → `setMode('gesture')` 自动调用 `setMode('mouse')` 并显示"摄像头权限获取失败，已切换到鼠标模式" |
| 浏览器无 `navigator.mediaDevices.getUserMedia` | `!navigator.mediaDevices \|\| !...getUserMedia` | alert 提示使用现代浏览器 | 同上 |
| 用户拒绝摄像头权限（`NotAllowedError`） | catch 分支 | alert 说明权限被拒 | 同上 |
| 无摄像头设备（`NotFoundError`） | catch 分支 | alert 说明未检测到设备 | 同上 |
| 其他初始化异常 | catch 分支 | alert 显示 error.message | 同上 |

`setMode('mouse')` 被递归调用时会：隐藏 `#gesture-status`、`#camera-preview`，恢复 `#hint` 显示，停止 HandTracker（若已启动），隐藏手势光标，把按钮 active 状态切回鼠标。由于守卫条件 `if (!this.handTracker)` 只在首次进入 gesture 模式时才 new/init，后续用户再次点手势按钮会直接 `start()`，不会重复请求权限——**但用户若此前拒绝权限后想再授权，必须刷新页面**（没有重试逻辑）。

### 4.4 卡牌贴图加载失败的占位策略（[CardManager.js#L172-L261](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L172-L261)）

三层降级：
1. **在线优先**：`https://raw.githubusercontent.com/metabismuth/tarot-json/master/cards/{m00-p14}.jpg`（GitHub Raw，文件名映射表见 [tarotData.js#L210-L227](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/tarotData.js#L210-L227)）；
2. **本地兜底**：`assets/cards/{id}.jpg`，可由 `assets/cards/download.sh` 下载；
3. **Canvas 占位**：所有图源失败后 `createCardPlaceholder(cardId)` 在 canvas 上绘制渐变背景+金色边框+卡牌编号+中英文名称。

牌背也有兜底：先加载 `assets/cards/back.svg`，失败则使用内联 data URI SVG（金色五角星图案，见 [tarotData.js#L239-L246](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/tarotData.js#L239-L246)）。

纹理加载体验上采用"**先显示 loading 纹理 → 异步加载真实纹理 → 加载完 hot-swap 材质 map**"的渐进策略：`drawCard()` 立即返回 `frontTexture: this.loadingTexture`（紫蓝色渐变+"加载中..."文字），真正的 `loadCardTexture` Promise 在 .then 里直接替换 `materials[4]/[5].map`。这样用户不需要等待网络图片完成就能翻牌。但存在一个时序问题（见第七节风险 R5）。

---

## 五、粒子与资源生命周期

- 粒子系统在 `removeSystem` 里正确执行了 `geometry.dispose()` + `material.dispose()` + `scene.remove(mesh)`；
- `CardManager.createCardMesh` 在创建新 mesh 前会对旧 mesh 做 geometry/material dispose；
- `TarotGame.autoNextCard` 直接 `this.scene.remove(this.cardManager.cardMesh); this.cardManager.cardMesh = null;`，**此处没有 dispose**，依赖下一次 `createCardMesh` 时 `if (this.cardMesh)` 的检查。但因为 cardMesh 已被置 null，下一次 createCardMesh 不会进入 dispose 分支——这意味着 geometry 和 6 个 material 会泄漏。对比 `onNextCard`（用户手动点按钮）代码完全相同，也有同样问题。
- `CardManager.dispose()` 只释放 backTexture 和 placeholderTexture，**没有释放 loadingTexture、也没有释放当前卡牌的 frontTexture（如果是异步加载的网络纹理）**。
- `HandTracker.dispose()` 停止 camera、关闭 video tracks。
- Three.js 纹理通过 `THREE.TextureLoader` 加载，Three.js 本身**不做缓存**，重复请求同一张卡会重复创建 WebGLTexture 对象；浏览器 HTTP 缓存会避免重复网络下载，但 GPU 端显存会因多次 drawCard 而增长（不过由于每张牌只抽一次，实际每个 frontTexture 只会被请求一次，影响有限）。

---

## 六、历史记录机制（[TarotGame.js#L636-L663](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L636-L663)）

- 历史记录**仅存在 DOM** 中（`#history-list` 是 `<div>` 容器，新项 `insertBefore` 到顶部），**不写入 localStorage / sessionStorage**，页面刷新即丢失；
- 历史项小图也使用 `getCardImageUrl(card.id).online || .local`，在 img 上挂 `onerror` 隐藏图片、显示纯编号 div；
- 历史面板首次有记录时 `historyPanel.classList.remove('hidden')`，之后一直显示（没有重新隐藏的逻辑）；
- **不同步问题**：`drawnCards` 数组（在 CardManager 里）与 DOM 历史列表是两套独立的记录体系：
  - `drawnCards.push(this.currentCard)` 在 `drawCard()` 返回前就已经 push，早于 `confirmCard()`；
  - DOM 历史项只在 `confirmCard()` 里才 insertBefore；
  - 若用户确认前刷新页面，drawnCards 有记录但 DOM 没有（刷新后又都丢失）；
  - `reset()` 清空 drawnCards 但**不清空 DOM**；
  - 剩余张数 `getRemainingCount()` 基于 `deck.filter(c=>!c.drawn).length`，该计数在 `drawCard()` 时已递减，而 DOM 历史在 `confirmCard()` 时才加项，两者在"已经翻牌但尚未确认"这一时刻会短暂不一致（剩余数已经减 1，但历史列表还没加项）。

---

## 七、用户体验风险与优先级

以下按 **影响严重度 × 触发概率** 排序。

### 🔴 R1（高）：手势抖动可能触发"跳过 ready 直接抓取"

- 位置：[TarotGame.js#L307-L317](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L307-L317)
- 问题：PINCH 处理条件是 `(this.state === 'ready' || this.state === 'idle') && this.cardManager.cardMesh`，即允许在 `idle` 状态下直接被 PINCH 抓取。而 OPEN→ready 是**边缘触发**（要求 gestureChanged），一旦 MediaPipe 漏检 OPEN（例如手进入画面时张开幅度不够、或防抖窗口里 OPEN 没拿到多数票），用户直接做捏合动作时仍能从 idle 进入 grabbing。这本身是"宽容"设计，但反过来看：
  - 用户在 idle 状态下还在调整手的位置，可能自然做出类似 PINCH 的姿势（拇指食指靠近），导致还没对准就意外触发抓取；
  - PINCH 是**电平持续检测**（不像 FIST/OPEN 要求 gestureChanged），虽然 state 变 grabbing 后条件不再满足不会重复 grabCard，但第一次触发无需"进入 PINCH"这个切换动作，只要某一帧被识别为 PINCH 且射线命中就立即抓取，缺少"张开→捏合"的明确仪式感。
- 建议：PINCH 也改为边缘触发（记录 `_prevWasPinch`，只在从非 PINCH→PINCH 时触发），并考虑去掉 `state === 'idle'` 条件，强制走 OPEN→ready→PINCH 链，或在 idle 状态下要求 PINCH 持续 N 帧才触发。

### 🔴 R2（高）：FIST 确认可能在"翻牌动画中"过早触发

- 位置：[TarotGame.js#L319-L324](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L319-L324)
- 问题：FIST 触发条件是 `state === 'grabbing' || state === 'showing'`。`grabCard()` 先同步设置 `state='grabbing'`，然后用 0.5 秒把卡牌飞向镜头，**动画结束后**才置 `state='showing'` 并开始 `flipCard()`。用户在刚看到卡牌开始飞的时候就可能本能地握拳，此时 `state='grabbing'`，FIST 会**立即确认**，导致：
  - 卡牌还没飞到 showPosition(0,0,4) 就被 `visible=false`；
  - `flipCard()` 的 requestAnimationFrame 仍在执行，会对一个已经 visible=false 且已被从 scene 移除的旧 mesh 做 rotation 动画（虽然不可见但回调 `applyReversedRotation()` 仍会访问 mesh，此时 mesh 还没置 null，直到 autoNextCard 里才置 null，这段时间存在空引用风险——实测 autoNextCard 在粒子 3 秒后才执行，期间 mesh 引用仍在但 visible=false 且 position 还在被动画修改，然后又被 flip 动画修改，再被 applyReversedRotation 修改；这些写操作在 disposed/removed mesh 上不会报错但浪费 CPU）。
- 建议：仅在 `state === 'showing'`（即翻转完成后）才允许 FIST 确认，或在 grabCard 动画完成前忽略 FIST。

### 🟠 R3（中高）：PINCH 和 FIST 切换时机的手势分类歧义

- 位置：[HandTracker.js#L220-L234](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L220-L234)
- 问题：识别顺序是 FIST（最优先）→PINCH→OPEN→POINT。当用户从 PINCH（拇食指捏合、其他三指屈）自然过渡到 FIST（五指全屈）时：
  - PINCH 条件中包含 `!(fingerStates.middle && fingerStates.ring && fingerStates.pinky)` 即"三指不全伸"，三指弯曲时仍满足；
  - FIST 条件是 `extendedCount === 0` 或 `===1 且不是食指`；
  - 过渡瞬间：食指还没完全弯曲但 middle/ring/pinky 已弯曲 → extendedCount=1 且是 index → 既不满足 FIST 也不满足 PINCH（thumbToIndex 此时也可能 >0.12 因为拇指移开） → 落入返回 `NONE` 或 `POINT`。
  - 防抖 buffer 只有 3 帧、阈值 2，导致可能在 FIST 被确认前短暂发出 POINT/NONE；
  - `handleGesture` 中 FIST 要求 gestureChanged，一旦 PINCH→NONE→FIST，FIST 的 change 事件会从 NONE 触发，但条件是 `state==='grabbing'||'showing'`，会确认——这次确认本身能成功，但中间的 NONE 会触发 `highlightCard(false)` 导致光标闪烁。
- 更大的潜在问题是：测试文件 [gestureRecognition.test.js#L56-L77](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gestureRecognition.test.js#L56-L77) 里复制的 `recognizeGesture` 与实际源码版本**不一致**：
  - 测试版 PINCH 阈值是 `thumbToIndex < 0.08`；
  - 生产版阈值是 `thumbToIndex < 0.12`，且多了 `!(fingerStates.middle && fingerStates.ring && fingerStates.pinky)` 守卫；
  - 测试版 PINCH 只在"仅食指伸"分支内判断，而生产版 PINCH 在 OPEN 判断之前。
  - 意味着测试通过并不代表生产版行为被验证。

### 🟠 R4（中高）：粒子后卡牌资源泄漏（已在第五节描述）

- 位置：[TarotGame.js#L584-L587](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L584-L587) 和 [TarotGame.js#L603-L606](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L603-L606)
- 问题：`autoNextCard` 和 `onNextCard` 只 `scene.remove(mesh)` 并置 null，未 `geometry.dispose()` 也未 `material.dispose()`。由于 `createCardMesh` 在下次创建时先检查 `if (this.cardMesh)`——此时 cardMesh 已为 null，跳过 dispose 分支，导致 BoxGeometry 和 6 个 MeshStandardMaterial 及其关联纹理（包括异步加载的正面纹理）的 GPU 资源无法回收。连续抽完 78 张牌会泄漏 78 份 geometry + ~468 份 material + 最多 78 份 frontTexture。
- 建议：统一通过 `CardManager.disposeCurrentMesh()` 封装释放逻辑，由 TarotGame 调用。

### 🟠 R5（中）：纹理异步加载时序问题

- 位置：[CardManager.js#L297-L310](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L297-L310)
- 问题：异步纹理加载完后更新材质时用的是 `this.cardMesh.userData.showingBack ? backTexture : texture`，但 `backTexture` 引用的是闭包中 `drawCard()` 执行时的 `this.backTexture`。若此时牌背还在异步加载中（`loadBackTexture` 也是异步的），`backTexture` 可能是 `undefined`，material.map 被赋 null 会导致牌背显示黑色（Three.js 未赋值 map 时 MeshStandardMaterial 使用纯色）。
- 其次，用户翻牌后若纹理还没加载完，翻面后看到的还是 loadingTexture 的"加载中..."画面（正面是 loading，背面也是 loading——因为 createCardMesh(showBack=true) 把 front 贴 backTexture，back 贴 frontTexture，即牌面那面贴的是 loadingTexture）。翻牌后展示的可能是紫色"加载中..."Canvas 而非真实牌面，直到 .then 回调 swap 材质 map。这是**可接受的渐进加载**，但体验上会看到一张写着"加载中..."的牌面被翻过来，略显突兀。
- 再次，.then 回调使用 `materials[4]`/`[5]` 硬编码索引，若未来 BoxGeometry 改为其他几何体或材质数组顺序变化会 silently break。

### 🟡 R6（中）：历史记录与牌库状态不同步

- 位置：见第六节描述。
- 问题：
  1. `drawnCards.push` 在 drawCard() 时完成，但 DOM 历史项在 confirmCard() 时才添加，期间剩余计数已减少但历史未加；
  2. `reset()` 清空 drawnCards 但不清空 DOM；
  3. 历史记录刷新即丢失，用户刷新后无法回看抽卡历史；
  4. 历史项只显示编号和名称、正逆位标签和缩略图，不显示解读文本（需展开或提供详情，但目前无此功能）；
  5. 历史项小图加载失败的 fallback div 只显示 `#id`，逆位样式在 fallback div 上没有体现。

### 🟡 R7（中）：全部抽完后的处理不完整

- 位置：[TarotGame.js#L460-L463](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L460-L463)
- 问题：`prepareNextCard` 收到 `drawCard()===null` 后显示提示，但：
  - `state` 没有重置（保留上一次的 confirmed 或其他状态）；
  - 上次的 cardMesh 可能还留在场景中（confirmed 状态下 autoNextCard 已 remove，但如果是最后一张触发 null，autoNextCard 不会被调用——因为 confirmCard 只有在粒子结束后才调 autoNextCard，而 autoNextCard 中 prepareNextCard 返回 null 时不会创建新 cardMesh，旧 mesh 已在 confirmCard 中 visible=false，问题不大但 `cardManager.cardMesh` 引用未置 null）；
  - 没有"重新开始"按钮，用户只能刷新。

### 🟡 R8（中）：`cardFloatAnimation` 递归 RAF 未取消

- 位置：[TarotGame.js#L482-L499](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L482-L499)
- 问题：每次 `prepareNextCard` 都启动新的 RAF 递归；旧递归检查 `!this.cardManager.cardMesh || this.state !== 'idle'` 才 return，这意味着状态变 grabbing 后旧动画会自动停止。但如果两次 prepareNextCard 间隔极短（理论上目前不可能，因为只有粒子 3 秒后才调，且 state==='confirmed' 时用户不能触发新抽卡），可能短时间两个动画都在写不同 mesh 的 position。实际影响低，但代码可维护性差：没有记录 rafId 无法主动 cancel。

### 🟡 R9（低中）：手势模式下卡牌拖动后无复位

- 位置：[TarotGame.js#L355-L366](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L355-L366)
- 问题：`onHandMove` 在 grabbing 状态下把卡牌跟随手部位置移动，松手（手离开画面 / 切 FIST）后卡牌停留在最后位置，没有动画回到中心/固定展示位。`animateCardTo` 在 grabCard 时启动，但后续手势拖动持续覆盖 position。一旦用户在拖动时握拳确认，灰烬粒子从最后手的位置发射，而非中心位置，可能导致灰烬从屏幕侧边升起，视觉上卡牌不是从"牌堆"抽取的。

### 🟡 R10（低中）：测试覆盖没有真正保护状态机

- 位置：[tests/gameLogic.test.js#L104-L125](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gameLogic.test.js#L104-L125)、[tests/gestureRecognition.test.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gestureRecognition.test.js)
- 问题：
  1. 状态机测试只是构造了一个**手写的、静态的** `validTransitions` 对象并断言它包含某些关系，**完全没有实例化 TarotGame 或驱动其事件**。它不能发现非法转换（例如 R1/R2 描述的 idle→grabbing、grabbing→confirmed 等实际行为变化）。
  2. 手势算法测试复制了一份 `recognizeGesture` 函数，且副本与生产代码**参数阈值不同**（见 R3），测试通过不保证线上逻辑正确。
  3. 没有任何测试覆盖：
     - CardManager 的异步纹理加载降级链；
     - ParticleSystem 的生命周期与 dispose；
     - 鼠标/手势事件的端到端状态流转；
     - 模式切换的降级逻辑；
     - 历史记录写入；
     - 78 张牌去重（只有 3 张 mock 的微型测试）。
  4. 现有测试全部纯算法/数据测试，对 Three.js 渲染对象和 DOM 操作零覆盖。
- 建议：引入 jsdom + 手动 mock Three.js，对 TarotGame 的状态转换做行为级测试；同步生产版 recognizeGesture 到测试或直接 import；添加对 CardManager.drawCard 返回 shape 和去重的 78 张规模测试。

### 🟢 R11（低）：未使用/死代码

- `TarotGame.constructor` 中的 `this.animationMixer` 从未赋值或读取；
- `TarotGame.prepareNextCard` 中的 `this._fistForNext = false` 赋值但从未读取；
- `CardManager.reset()` 无 UI 入口调用；
- `TarotGame.cardTargetPosition` 定义后从未使用（showPosition 和 idlePosition 在用）。

---

## 八、建议验证步骤

按优先级排序，建议按以下顺序验证：

### P0（发布前必须验证）

1. **手势去抖验证**：手势模式下，不张手直接捏合，是否能意外抓取？慢速张开再捏合，能否稳定进入 ready→grabbing？建议用 console.log 打印状态变化，连续测试 20 次。
2. **快速确认验证**：点击/捏合后立刻点击/握拳，在卡牌飞行途中是否立刻触发 confirmCard？卡面是否还没翻过来就消失？
3. **资源泄漏验证**：Chrome DevTools → Performance 面板录制连续抽完 78 张牌，观察 GPU Memory 曲线和 `WebGLRenderer.info.memory.textures/geometries` 是否单调增长且不回落。
4. **降级链验证**：
   - 在 HTTP 非 localhost 环境打开（或在 Firefox 中手动禁用摄像头权限），切手势模式验证 alert 与自动回退鼠标；
   - 断网后切手势模式验证降级路径；
   - 断网后抽卡验证正面纹理是否使用 Canvas 占位、牌背是否显示内联 SVG。

### P1（体验优化前验证）

5. **历史记录一致性**：抽卡 → 翻牌后未确认前观察剩余张数是否已减少；刷新页面观察历史是否丢失（确认当前是设计如此）。
6. **纹理时序**：在 DevTools Network 面板把网速切到 Slow 3G，抽卡观察翻牌时是否显示"加载中..."牌面，等几秒后是否正确替换为真实牌面。
7. **手势过渡歧义**：从 PINCH 快速变 FIST，用日志打印 gesture 序列，观察是否出现中间态（NONE/POINT）及其对 UI 的影响。
8. **粒子系统性能**：移动端 Safari/Chrome 上连续抽卡观察帧率，2000 粒子×78 次不清理的累积影响（已确认清理逻辑本身正确，验证的是粒子本身每帧 2000 次迭代的 CPU 开销）。

### P2（长期质量）

9. **测试重构**：
   - 删除 [gestureRecognition.test.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gestureRecognition.test.js) 中复制的 `recognizeGesture`，改为通过 require/import 生产函数（需把 HandTracker.js 改为可引用模块或把 recognizeGesture 导出）；
   - 用状态转换表驱动 TarotGame 单测，给定当前 state + 输入事件，断言新 state 和被调用方法；
   - 增加 78 张牌去重测试：抽 78 次后 id 应全部唯一，第 79 次返回 null。
10. **可访问性验证**：键盘操作（Tab/Enter）目前没有绑定，只有鼠标与手势；若需支持无障碍应补充键盘事件流。

---

## 九、架构小结

项目整体分层清晰：纯数据层（tarotData）、纯手势算法（HandTracker）、纯视觉特效（ParticleSystem）、牌库资源管理（CardManager）由编排层（TarotGame）组合。状态机只有 5 个状态，意图明确。降级链（WebGL→手势→纹理三层兜底）体现了较好的健壮性思路。

主要改进空间集中在：
- **状态机守卫一致性**（R1/R2）：对手势事件的边缘/电平触发策略不统一，idle 可被 PINCH 绕过 ready；
- **资源管理收口**（R4）：卡牌 mesh 释放路径分散，多处只 remove 不 dispose；
- **测试实际保护能力**（R10）：现有测试更像是算法演示而非代码行为约束，手势识别测试副本与生产代码不一致；
- **手势交互仪式感**（R1/R9）：PINCH 电平触发易误触，拖动后卡牌无复位。

这四个方向改进后，无论是用户体验还是代码可维护性都会得到实质性提升。
