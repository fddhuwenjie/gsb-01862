# CODE_REVIEW_UNDERSTANDING

> 本文档基于对 `frontend-user/js/` 下全部业务源码及测试文件的静态阅读，不包含运行时验证。所有结论均有对应代码行依据。

---

## 一、模块职责图景

### 1.1 文件层级关系

```
main.js (入口)
  └─ TarotGame.js (状态机 / 协调器)
       ├─ CardManager.js (牌库 / 卡牌Mesh / 纹理)
       ├─ ParticleSystem.js (灰烬粒子 Shader)
       └─ HandTracker.js (MediaPipe 封装 / 手势识别)
tarotData.js (纯数据，全局常量 + 工具函数)
```

| 文件 | 角色 | 核心状态 | 对外暴露 |
|---|---|---|---|
| [tarotData.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/tarotData.js) | 纯数据层 | 无（常量） | `TAROT_DATA`、`getAllCards()`、`getCardImageUrl()`、`CARD_BACK_URL`、`CARD_BACK_FALLBACK` |
| [CardManager.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js) | 牌库与卡牌资源管理 | `deck[]`、`drawnCards[]`、`currentCard`、`cardMesh` | `drawCard()`、`createCardMesh()`、`applyReversedRotation()`、`reset()`、`getRemainingCount()` |
| [HandTracker.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js) | MediaPipe Hands 封装 | `currentGesture`、`smoothedPosition`、`gestureBuffer` | `init()`、`start()`、`stop()`；回调 `onGestureChange`、`onHandMove` |
| [ParticleSystem.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js) | 灰烬粒子效果 | `particleSystems[]` | `createAshParticles(mesh, onComplete)`、`update(deltaTime)`、`dispose()` |
| [TarotGame.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js) | 游戏核心状态机与协调 | `state`、`mode`、`isHovering`、`_prevGesture` | `init()`、`setMode()`、`dispose()`；内部驱动所有子模块 |
| [main.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js) | DOM 入口 | 无 | DOMContentLoaded 后实例化 `TarotGame` |

### 1.2 关键设计决策

- **Three.js 卡牌建模**：使用 `BoxGeometry`（薄立方体）而非 `PlaneGeometry`，通过 6 面材质数组实现双面贴图（前面=牌背/背面=牌面，翻牌靠 `rotation.y = π`）。见 [CardManager.js#L331-L349](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L331-L349)。
- **手势识别架构**：HandTracker 不依赖 Three.js，只产出离散手势 (`NONE/OPEN/PINCH/FIST/POINT`) 和归一化坐标 (0~1)，由 TarotGame 负责将手势映射到状态机和射线检测。
- **粒子系统**：采用自定义 GLSL Shader + `THREE.Points`，2000 粒子从卡牌几何体表面采样，使用 AdditiveBlending 模拟灰烬飘散。
- **纹理三级降级**：在线 GitHub raw → 本地 `assets/cards/` → Canvas 程序化占位符。见 [CardManager.js#L172-L215](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L172-L215)。

---

## 二、一次完整抽卡的状态流详解

### 2.1 状态机定义

状态枚举见 [TarotGame.js#L14](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L14)：

```
idle → ready → grabbing → showing → confirmed → (回到 idle)
```

### 2.2 全链路分步追踪

#### 阶段 0：页面加载与初始化
1. `main.js` 监听 `DOMContentLoaded`，先做 `WebGLRenderingContext` 存在性检查，不支持则直接在 `#loading` 显示错误文案并 `return`，不会创建游戏实例（[main.js#L6-L11](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js#L6-L11)）。
2. `new TarotGame()` 仅设置字段，不做实际初始化。
3. `game.init()` 依次执行：
   - `initThree()`：创建 Scene、PerspectiveCamera(60° FOV, z=8)、WebGLRenderer（ACES 色调映射、PCFSoft 阴影），挂载到 `#canvas-container`。
   - `initLights()`：环境光 + 主方向光（带阴影）+ 补光 + 橙色点光源。
   - `initBackground()`：1000 颗随机星点 `THREE.Points`（z 在 -50 ~ -20）。
   - `initHandCursor()`：青色 `RingGeometry` 光标 + 点光源，默认 `visible=false`。
   - `new CardManager(scene)`：见阶段 1。
   - `new ParticleSystem(scene)`。
   - `bindEvents()`：resize、mousemove/click、模式切换按钮、"下一张"按钮、历史记录折叠。
   - `animate()`：启动 `requestAnimationFrame` 循环（每帧更新粒子、render）。
   - `await prepareNextCard()`：见阶段 2。
   - 隐藏 `#loading`，调用 `updateUI()` 更新剩余牌数显示。

#### 阶段 1：CardManager 构造与牌库初始化
- `initDeck()`（[CardManager.js#L26-L32](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L26-L32)）：调用 `getAllCards()` 将 78 张牌展开为单数组，给每张牌添加 `drawn: false`，然后 Fisher-Yates 洗牌。
- `loadBackTexture()`：先创建 Canvas 占位纹理（深紫底+金色问号），再异步加载 `assets/cards/back.svg`；失败则调用 `loadFallbackBackTexture()` 用内联 SVG data URI 创建纹理。
- `createLoadingTexture()`：预创建"加载中..." Canvas 纹理，供正面纹理未就绪时使用。

#### 阶段 2：准备下一张卡牌（prepareNextCard）
- 调用 `cardManager.drawCard()`：
  1. 过滤 `deck.filter(c => !c.drawn)` 得到可用牌池。若长度为 0 返回 `null`（此时仅显示提示，**不会重置牌库**，见风险 R6）。
  2. `Math.floor(Math.random() * availableCards.length)` 随机选牌。
  3. `Math.random() < 0.5` 决定正逆位（`isReversed`）。
  4. 将牌的 `drawn` 标记为 `true`。
  5. 构造 `currentCard` 对象，包含 `orientation`、`meaning`（根据正逆位取 `upright`/`reversed` 字段）、`frontTexture`（暂用 loadingTexture）、`backTexture`。
  6. 将 currentCard 推入 `drawnCards`。
  7. 异步调用 `loadCardTexture(card.id)` 加载真实正面纹理；加载完成后，如果 `cardMesh` 已存在则直接更新材质 map（见风险 R2 竞态条件）。
- `createCardMesh(card, showBack=true)`：若存在旧 mesh，从 scene 移除并 `dispose` geometry/material；创建新的 `BoxGeometry(2, 3, 0.02)`，六面材质中索引 4（前）用 backTexture、索引 5（后）用 frontTexture（loadingTexture）。将 mesh 放到 `cardIdlePosition(0,0,0)`，userData 记录 `isReversed` 和 `showingBack`。
- `cardFloatAnimation()`：启动 rAF 循环，仅在 `state === 'idle'` 时让卡牌沿 Y 轴轻微浮动（`Math.sin(time*2)*0.1`）并绕 Y 轴微摆。
- 设置 `state = 'idle'`，`_prevGesture = null`，`_fistForNext = false`。

#### 阶段 3：用户进入可抽取状态

| 模式 | 进入条件 | 行为差异 |
|---|---|---|
| 鼠标模式 | 默认即 `idle`，可直接点击 | 无需准备动作；mousemove 持续射线检测，命中时 `highlightCard(true)` 放大到 1.05 |
| 手势模式 | 需要 `OPEN` 手势触发 `idle → ready` | 必须先张开手掌；`OPEN` 仅在**手势变化边缘**触发一次（`gestureChanged && state==='idle'`） |

注意 [TarotGame.js#L309](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L309) 中 PINCH 分支判断条件是 `(state === 'ready' || state === 'idle')`，这意味着手势模式下**不经过 OPEN→ready 也可以直接 PINCH 抓取**（见风险 R8）。

#### 阶段 4：选中卡牌（hover 与 grab）

**鼠标路径**：
- `onMouseMove`：归一化鼠标坐标 → `raycaster.setFromCamera` → `intersectObject(cardMesh)` → `highlightCard(命中)`。
- `onMouseClick`：射线命中后，若 `state` 为 `idle`/`ready` → `grabCard()`。

**手势路径**：
- `onHandMove`：将 HandTracker 的归一化坐标映射到 `this.mouse`，更新 handCursor 位置（青/绿色环），光标颜色随命中状态切换。
- `POINT` 手势：`highlightCard(true)` 并将 `_cardVelocity` 置 0（试图"停止惯性"，但见风险 R11：惯性代码实际上不完整）。
- `PINCH` 手势：**每帧持续检测**（不要求 gestureChanged），射线命中卡牌则调用 `grabCard()`。
- 进入 `grabbing` 后，`onHandMove` 还会根据手掌位置直接修改 `cardMesh.position.x/y`（带简单阻尼），实现"拖拽"效果。

#### 阶段 5：确认抽牌（grabCard → confirmCard）
- `grabCard()`：立即设 `state = 'grabbing'`，启动 `animateCardTo(cardShowPosition(0,0,4), 0.5s, callback)`。动画使用 `lerpVectors` + easeOutCubic。动画完成后回调设 `state = 'showing'`，调用 `flipCard()`。
- `flipCard()`：rAF 动画将 `rotation.y` 从当前值插值到 π（180° 翻牌），持续 0.8s。动画结束后调用 `cardManager.applyReversedRotation()`，若为逆位则设置 `rotation.z = π`。
- **确认触发**：
  - 鼠标模式：再次点击卡牌（此时 state 为 `grabbing` 或 `showing`）→ `confirmCard()`。
  - 手势模式：`FIST` 手势在**手势变化边缘**触发 → `confirmCard()`。

#### 阶段 6：展示解读、灰烬粒子、写入历史
`confirmCard()` 做以下原子操作（但没有状态守卫防重入，见风险 R1）：
1. `state = 'confirmed'`。
2. `showCardInfo(card)`：填充 `#card-name`、`#card-orientation`（正位/逆位 CSS 类）、`#card-meaning`（取 `card.meaning`，即 drawCard 时根据正逆位选定的 upright/reversed 字符串），显示 `#card-info` 面板。
3. `addToHistory(card)`：DOM 操作创建 `.history-item`（包含迷你缩略图、名称、正逆位标签），`insertBefore` 到 `#history-list` 开头。缩略图优先用 online URL，`onerror` 仅隐藏 `<img>` 显示编号 div，**不会降级到 local URL**（见风险 R7）。
4. `particleSystem.createAshParticles(cardMesh, onComplete)`：
   - 从 cardMesh.geometry 采样 2000 个粒子点（50% 顶点采样 + 50% 表面随机采样）。
   - 创建 `THREE.Points` + 自定义 ShaderMaterial（AdditiveBlending，圆形点+辉光）。
   - 注册到 `particleSystems[]`，记录 velocities / lifetimes / maxLifetimes（1~3s 随机寿命）/ duration=3s。
   - `onComplete` 回调为 `() => this.autoNextCard()`。
5. `cardMesh.visible = false`（注意：mesh 仍在 scene 中，3 秒后才被移除）。

粒子动画由主循环 `animate()` → `particleSystem.update(deltaTime)` 驱动：每帧更新粒子位置（初始向上速度 + 正弦湍流）、速度衰减(0.98~0.99)、透明度按寿命衰减、大小衰减(0.995)。当所有粒子 lifetime≤0 或系统 time>3s 时，调用 `removeSystem()`：从数组 splice、scene.remove、dispose geometry/material、触发 `onComplete`。

#### 阶段 7：准备下一张卡牌
- `autoNextCard()`（粒子完成回调）或 `onNextCard()`（用户手动点击"抽下一张"按钮）：
  1. 隐藏 `#card-info`。
  2. `scene.remove(cardManager.cardMesh); cardManager.cardMesh = null`（注意：这里**没有 dispose 旧 mesh 的 geometry/material**，但 createCardMesh 在创建新 mesh 时会尝试 dispose 旧 mesh，然而 cardMesh 已被置 null，旧资源可能泄漏，见风险 R4/R18）。
  3. 重新 `prepareNextCard()`，回到阶段 2。

---

## 三、鼠标模式 vs 手势模式：共同点与差异

### 3.1 共同点

| 维度 | 说明 |
|---|---|
| 状态机骨架 | 共用 `idle → ready → grabbing → showing → confirmed` 五态 |
| 命中检测 | 均使用 `THREE.Raycaster` 从相机经过 `this.mouse` 坐标投射到 `cardMesh` |
| 核心动作函数 | `grabCard()`、`flipCard()`、`confirmCard()` 完全共享 |
| 资源层 | 共享 CardManager（牌库/纹理）、ParticleSystem（灰烬） |
| 确认后流程 | 灰烬粒子 → onComplete → autoNextCard → prepareNextCard 完全一致 |

### 3.2 关键差异

| 维度 | 鼠标模式 | 手势模式 |
|---|---|---|
| 进入 ready | **无此概念**，idle 即可点击 | 需 OPEN 手掌从 idle→ready（边缘触发） |
| hover 高亮 | mousemove 每帧射线检测 | POINT 手势触发高亮，NONE 时取消高亮 |
| grab 触发 | click 离散事件 | PINCH 手势，**持续每帧检测**（非边缘触发） |
| confirm 触发 | click 离散事件 | FIST 手势，**边缘触发**（gestureChanged） |
| 拖拽 | 无 | grabbing 状态下手移动可拖拽卡牌 x/y 位置 |
| 光标 | 系统鼠标（浏览器默认） | Three.js 场景中的 RingGeometry 光标 + 点光源 |
| 提示UI | 底部 `#hint` 文字 | `#gesture-status` 面板（手势图标 + 下一步提示） |
| 摄像头 | 不使用 | 需要 getUserMedia 权限 + MediaPipe CDN |
| 额外状态 `_prevGesture` | 不使用 | 用于边缘检测；prepareNextCard 时重置为 null |

---

## 四、降级策略全梳理

系统在多层实现了降级，形成如下决策链：

```
                        ┌─────────────────────────────────┐
                        │  main.js: WebGLRenderingContext? │
                        └──────────┬──────────────────────┘
                                   │ 否 → 显示"不支持WebGL"，终止
                                   ▼ 是
                        ┌─────────────────────────────────┐
                        │     TarotGame.init() 成功        │
                        └──────────┬──────────────────────┘
                                   ▼
           ┌───────────────────────────────────────────────┐
           │         setMode('gesture') 时                  │
           │  HandTracker.init() 检查以下条件（短路返回false）:│
           │  ① window.isSecureContext? (HTTPS/localhost)   │
           │  ② navigator.mediaDevices?.getUserMedia?       │
           │  ③ MediaPipe Hands CDN 是否可实例化             │
           │  ④ getUserMedia 是否成功 (权限/设备)            │
           └───────────┬───────────────────────────────────┘
                       │ 失败 → alert() + this.setMode('mouse')
                       │        （自动降级到鼠标模式）
                       ▼ 成功
           ┌───────────────────────────────────────────────┐
           │         纹理加载（CardManager）                 │
           │  牌背: back.svg → data:image/svg+xml 内联       │
           │  牌面: GitHub raw → assets/cards/*.jpg          │
           │       → Canvas 程序化占位（金色边框+卡牌名）      │
           └───────────────────────────────────────────────┘
```

具体错误码处理（[HandTracker.js#L88-L98](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L88-L98)）：
- `NotAllowedError` → alert"摄像头权限被拒绝"
- `NotFoundError` → alert"未检测到摄像头设备"
- 其他 → alert"初始化失败: {message}"

所有 alert 之后 `return false`，`setMode` 收到 false 后递归调用 `setMode('mouse')` 完成降级（[TarotGame.js#L212-L216](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L212-L216)）。

**注意**：若 MediaPipe CDN（jsdelivr）本身加载失败（网络不通/被墙），`Hands` 和 `Camera` 构造函数未定义，`new Hands(...)` 会抛出 `ReferenceError`，被 catch 捕获后走降级流程；但 **Three.js CDN 加载失败没有 fallback**（见风险 R14）。

---

## 五、抽过的牌如何避免重复

1. **数据结构**：`deck[]` 中每张牌有可变的 `drawn: boolean` 字段（在 `initDeck()` 时初始化为 false，见 [CardManager.js#L27-L30](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L27-L30)）。
2. **抽取逻辑**：`drawCard()` 始终从 `deck.filter(c => !c.drawn)` 中随机选取，选到后立即 `card.drawn = true`（[CardManager.js#L268-L280](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L268-L280)）。
3. **计数**：`getRemainingCount()` 实时 `filter` 计算。
4. **重置**：`reset()` 将所有 `drawn` 置 false、清空 `drawnCards`、重新洗牌。
5. **边界**：`drawCard()` 在 `availableCards.length === 0` 时返回 `null`，但**调用方 `prepareNextCard()` 仅 showHint 就 return，不调用 reset()，也无 UI 按钮触发 reset**（见风险 R6）。

**注意**：`card.drawn = true` 是在 `drawCard()` 中设置的，而非 `confirmCard()` 中。这意味着一旦 drawCard 被调用（即 prepareNextCard 时），该牌就从牌库中"预定"了，即使在展示过程中出问题（比如用户关闭页面）也不会被放回。这在单页会话中语义一致，但意味着"抽牌"的事务边界在 drawCard 而非 confirmCard（历史记录写入与牌库标记不在同一步骤，见风险 R7）。

---

## 六、正逆位的选择与展示

1. **生成**：`drawCard()` 中 `const isReversed = Math.random() < 0.5;`（50% 概率）。
2. **含义选择**：`meaning: isReversed ? card.reversed : card.upright`，直接取 `tarotData.js` 中预写的中文释义字符串。
3. **3D 展示**：
   - `createCardMesh` 时在 `cardMesh.userData.isReversed` 记录布尔值。
   - `flipCard()` 完成翻牌动画（rotation.y → π）后，调用 `applyReversedRotation()`，若 isReversed 则设 `cardMesh.rotation.z = π`（倒转180°）。
   - 注意：初始 `cardMesh.rotation` 是默认欧拉角，rotation.z = π 是在翻牌后叠加设置的。
4. **UI 标签**：`showCardInfo()` 中按 orientation 设置文本"正位"/"逆位"和 CSS class（影响颜色）。
5. **历史缩略图**：`<img>` 标签添加 `reversed` CSS 类（依赖 CSS `transform: rotate(180deg)` 实现倒置）。

---

## 七、风险分析与优先级

优先级定义：**P0** = 可直接导致重复抽取/状态错乱/数据错误，高概率影响用户体验；**P1** = 在特定时序/条件下触发，影响体验或造成资源泄漏；**P2** = 体验瑕疵或维护风险；**P3** = 代码整洁度/可观测性问题。

### P0 — 严重风险

#### R1. confirmCard() 缺乏幂等守卫，手势抖动可致重复抽取

- **位置**：[TarotGame.js#L551-L574](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L551-L574)
- **现象**：`confirmCard()` 虽然第一行设 `state = 'confirmed'`，但在它完成前（函数体是同步的，但 state 设在最前面）不会有重入问题。真正的风险在于 **grabCard() 也没有状态守卫**：
  - 手势模式 PINCH 判断是**每帧持续检测**（[TarotGame.js#L307-L317](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L307-L317)），条件为 `state === 'ready' || state === 'idle'`。
  - 一旦进入 grabbing，PINCH 分支不会再触发 grabCard()，看似安全。但 FIST 分支条件是 `state === 'grabbing' || state === 'showing'`，且仅在 gestureChanged 时触发。
  - **高危路径**：若由于 MediaPipe 抖动，FIST 被识别为"先变为 NONE/OPEN 再变回 FIST"（防抖缓冲仅3帧、阈值2帧），且此时 state 还没来得及推进到 confirmed（理论上 confirmCard 第一行就设 state，是同步的，所以此路径较安全）。
  - **更实际的风险**：`_prevGesture` 在 `prepareNextCard()` 中被重置为 `null`（[TarotGame.js#L473](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L473)），紧接着 `handleGesture` 中 `const prevGesture = this._prevGesture || 'NONE'`。如果新手势序列的第一帧就识别出 FIST（虽然正常流程要求 OPEN→PINCH→FIST，但手可能已经在握拳状态放入画面），`gestureChanged = ('FIST' !== 'NONE') = true`，直接进入 FIST 分支。但此时 state 刚被设为 'idle'（不是 grabbing/showing），所以不会触发 confirmCard()。这一条是安全的。
  - **真正的 P0 重入风险**：若用户在粒子动画的 3 秒等待期间快速切换模式（gesture ↔ mouse），`setMode` 不会改变 state（仍为 confirmed），confirmed 状态下 handleGesture 和 onMouseClick 都 return，应该不会重复。但 `createAshParticles` 的 onComplete 回调 `autoNextCard()` 若被异常触发两次（见 R4 粒子清理），会导致 prepareNextCard 被调用两次，同时存在两个 drawCard 调用，可能重复消耗牌库、创建两个 mesh（但第二次 createCardMesh 会 dispose 第一次的"当前" mesh，可能造成视觉闪烁）。
- **建议验证**：
  1. 在 confirmCard 入口加状态断言（`if (this.state === 'confirmed') return;`），形成幂等守卫。
  2. 给 createAshParticles 返回的 system 加 ID 或在 onComplete 中检查是否仍为当前活动粒子系统，避免双触发。

#### R2. 纹理异步加载竞态：旧牌纹理写入新牌材质

- **位置**：[CardManager.js#L297-L310](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L297-L310)
- **现象**：`drawCard()` 发起异步 `loadCardTexture(card.id)`，在 `.then()` 回调中直接读取 `this.cardMesh` 并更新材质。如果网络较慢，用户在纹理加载完成前就完成了一次抽卡（抽卡动画约 0.5s 靠近 + 0.8s 翻牌 + 3s 灰烬 ≈ 4.3s，通常足够，但 CDN 加载 GitHub raw 在国内可能较慢），`autoNextCard()` 调用 `createCardMesh()` 替换了 `this.cardMesh`，此时旧 Promise resolve 会把旧牌的纹理 map 设置到**新的 cardMesh** 材质上。
- **条件概率**：低~中（首次加载或网络差时容易触发）。
- **后果**：新卡牌背面（翻牌后朝向相机的一面）短暂显示上一张牌的图案，然后如果新牌纹理也还没加载完会被 loadingTexture/占位符覆盖；若新牌加载更快，旧纹理覆盖新纹理会导致错乱。
- **建议验证**：在 .then() 回调中校验 "当前 currentCard.id 是否为本次 drawCard 的 card.id"，或给 currentCard 加一个单调递增的 drawToken 不匹配则跳过更新。

#### R3. 测试代码与生产代码手势识别算法不一致，测试保护失效

- **位置**：[gestureRecognition.test.js#L56-L77](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gestureRecognition.test.js#L56-L77) vs [HandTracker.js#L209-L256](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L209-L256)
- **现象**：
  1. 测试文件**复制了一份** `recognizeGesture`，不是从 HandTracker 导入（jest 环境是 node，无法 import 浏览器类）。
  2. **关键阈值不一致**：PINCH 判断距离阈值在测试中是 `0.08`，生产代码是 `0.12`。
  3. **判断顺序/条件不一致**：测试中 POINT 分支先检查 PINCH（要求只有食指伸展时才判断 thumbToIndex < 0.08），即 PINCH 必须满足"只有食指伸展"；生产代码中 PINCH 判断是 `thumbToIndex < 0.12 && !(middle && ring && pinky)`，即只要"不是三指全伸"且拇指食指靠近就判定 PINCH，不要求只有食指伸。这意味着实际产品中 PINCH 识别范围更宽、更容易误触。
  4. 生产代码使用 `getDistance2D`（忽略 z）计算 thumbToIndex（[HandTracker.js#L215](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L215)），测试代码使用 3D `getDistance`。
- **后果**：测试通过的手势输入在实际产品中可能识别为不同手势；产品中发生的误识别不会被测试捕捉到。"测试覆盖"提供了虚假的安全感。
- **建议验证**：将手势识别纯算法部分提取为独立可导入模块（如 `gestureLogic.js`），测试直接导入同一份函数；统一阈值常量；增加对临界/模糊手势的边界用例（半握、过渡态）。

### P1 — 重要风险

#### R4. 粒子/卡牌资源清理不完整，长期运行可致 GPU 内存泄漏

- **位置**：
  - 正常路径 [CardManager.js#L318-L328](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L318-L328)（createCardMesh 中对旧 mesh 有 dispose）
  - 异常路径 [TarotGame.js#L583-L587](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L583-L587)（autoNextCard/onNextCard 中仅 `scene.remove; cardMesh = null`，未 dispose）
  - reset 路径 [CardManager.js#L390-L393](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L390-L393)（同样未 dispose）
  - 卡牌正面纹理 [CardManager.js#L399-L412](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L399-L412)（`dispose()` 仅释放 backTexture、placeholderTexture，**不释放** drawCard 加载的正面纹理）
- **现象**：
  - autoNextCard/onNextCard 把 cardMesh 置 null 后再调 prepareNextCard → createCardMesh，此时 createCardMesh 开头的 `if (this.cardMesh)` 判断为 null，跳过旧 mesh 的 dispose，geometry/material 在 GPU 上泄漏。
  - 牌面纹理（THREE.Texture）每次 drawCard 都通过 TextureLoader.load 创建新的，从无 dispose。78 张全部抽完约泄漏 78 个纹理对象（取决于图片尺寸，每个约 0.5~2MB 显存）。
  - ParticleSystem 的 removeSystem 正确 dispose geometry/material，但 velocities/lifetimes 等 Float32Array 靠 GC 回收（影响较小）。
- **建议验证**：使用 Chrome DevTools Memory 面板，连续抽完 78 张牌后拍堆快照，检查 THREE.Texture / THREE.BufferGeometry / THREE.ShaderMaterial 实例数量是否持续增长。修复 autoNextCard/onNextCard/reset 中的资源释放，保持与 createCardMesh 一致。

#### R5. 手势模式下 PINCH 与拖拽动画冲突，卡牌抖动

- **位置**：[TarotGame.js#L355-L366](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js) 与 [TarotGame.js#L682-L704](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L682-L704)
- **现象**：grabCard() 启动 animateCardTo()，该动画在 0.5s 内用 lerp 把卡牌从当前位置插值到 (0,0,4)。同时，若 state==='grabbing'，onHandMove 每帧直接覆盖 cardMesh.position.x/y。这两个动画同时操作 position，lerp 从被 onHandMove 改写后的位置继续插值，会导致卡牌一边被手拖拽一边朝目标位置"拔河"，产生抖动或漂移。
- **建议验证**：在手势模式下抓取后立即移动手，观察卡牌 Z 轴靠近过程中是否出现位置抖动。修复方案：在 animateCardTo 进行期间禁用手部位置控制，或让手拖拽接管动画（给 animateCardTo 一个可中断标志）。

#### R6. 牌库耗尽后卡死，无重置路径

- **位置**：[TarotGame.js#L457-L463](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L457-L463) 与 [CardManager.js#L269-L271](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L269-L271)
- **现象**：78 张抽完后 drawCard() 返回 null，prepareNextCard() 仅 showHint 就 return，不会创建新 mesh、不会设置 state。此时 cardMesh 在 autoNextCard 中已被置 null、scene 中无卡牌、state 停留为 'confirmed'，用户只能刷新页面。UI 上没有"重新洗牌"按钮。
- **建议验证**：编写脚本循环调用 79 次抽卡流程，观察第 79 次后场景状态。添加"重新开始"按钮调用 cardManager.reset() + prepareNextCard()。

#### R7. 历史记录与牌库标记非原子、缩略图降级缺失

- **位置**：[TarotGame.js#L556-L563](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L556-L563) 与 [TarotGame.js#L636-L663](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L636-L663)
- **现象**：
  1. `drawn = true` 在 drawCard 时设置，历史记录在 confirmCard 时写入。如果 confirmCard 抛异常（理论上 DOM 操作很少抛），牌已被消耗但无历史记录。
  2. 历史缩略图 `<img>` 只使用 `imageUrls.online || imageUrls.local`，由于所有牌都有 online 值（测试已验证），总是先用 online；`onerror` 仅隐藏图片显示编号，**不会尝试 local URL**。在网络受限环境下历史面板中会出现一连串 `#编号` 而无图案。
  3. 剩余牌数 `updateUI()` 仅在 prepareNextCard 时调用，confirmCard 时不调用，导致灰烬动画 3 秒内剩余数显示为"还剩 N 张"（实际已剩 N-1 张），与历史记录条数不一致。
- **建议验证**：断网环境下抽卡，检查历史面板图片；观察确认抽牌后剩余数字更新时机。

#### R8. 手势模式 idle 下可直接 PINCH 抓取，ready 语义弱化

- **位置**：[TarotGame.js#L309](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L309)
- **现象**：PINCH 分支条件为 `state === 'ready' || state === 'idle'`，配合 UI 提示"张开手掌→准备"，用户被引导先 OPEN，但实际上可以跳过 OPEN 直接捏合。这使得 ready 状态在手势模式下基本没有交互锁意义，且提示文字可能误导用户（用户张开手看到"下一步：捏合"，但不张手也能捏）。
- **建议验证**：手势模式下直接捏合卡牌，观察是否能抓取。如果意图是强制 OPEN→ready 流程，应去掉 `state === 'idle'`；如果意图是容错，应修改 UI 提示。

### P2 — 体验/可维护性风险

#### R9. PINCH 和 FIST 切换时序敏感，过渡手势可能被防抖吃掉

- **位置**：[HandTracker.js#L350-L383](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L350-L383) 与 [TarotGame.js#L319-L324](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L319-L324)
- **现象**：从 PINCH（食指+拇指靠近）切换到 FIST（全指弯曲）过程中，MediaPipe 可能输出几帧过渡态（如 2 根手指半伸）。防抖 buffer 大小 3、阈值 2，理论上需要至少 2 帧连续 FIST 才会切换，且 FIST 仅在 gestureChanged 边缘触发 confirmCard。如果过渡态被识别为 OPEN 或 NONE 持续 2 帧，会消费掉一次 gestureChanged(false→true)，随后真正 FIST 到来时又触发一次 changed，可能正确触发；但若防抖延迟导致 FIST 一直未稳定到阈值以上，confirmCard 永远不触发，用户握拳无反应。
- **建议验证**：慢速握拳、快速握拳、从捏合直接握拳三种手势，分别统计 confirmCard 触发率。可考虑对 FIST 设置更长的 buffer 或专门的"确认手势"冷却。

#### R10. _cardVelocity 惯性代码未完成，"停止惯性"逻辑无效

- **位置**：[TarotGame.js#L331](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L331)、[TarotGame.js#L362](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L362)
- **现象**：onHandMove 每帧计算 `dx/dy` 并赋值给 `this._cardVelocity`，然后直接把 velocity 加到 position 上。POINT 手势将 `_cardVelocity` 设为 0，意图"停止惯性"，但 _cardVelocity 从未在未检测到手移动时被用于继续移动（释放后无惯性滑行）。这本质上不是惯性，只是一个阻尼跟随。变量名和注释具有误导性。
- **建议验证**：手势模式抓取卡牌后快速甩手离开，观察卡牌是否继续滑行（不会）。如果需要惯性，应在 animate 循环或 onHandMove 中在"无新手输入"时继续应用 velocity 并衰减。

#### R11. cardFloatAnimation 闭包持有旧 mesh 引用

- **位置**：[TarotGame.js#L482-L499](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L482-L499)
- **现象**：rAF 递归虽然检查 `this.cardManager.cardMesh` 是否存在和 `state === 'idle'`，但实际操作的 `mesh` 变量是闭包创建时捕获的引用。如果 cardMesh 被替换（正常流程是 autoNextCard 先置 null 再 createCardMesh，这时条件 `!this.cardManager.cardMesh` 为 true 会 return，应该安全），但如果有代码路径直接替换 cardMesh 而不先置 null，可能操作已从场景移除的 mesh。目前代码未触发此 bug，但依赖隐式约定。
- **建议验证**：在 animate 回调内统一使用 `this.cardManager.cardMesh` 而非闭包引用。

#### R12. alert 阻塞式错误提示

- **位置**：[HandTracker.js#L37-L97](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L37-L97)
- **现象**：所有手势初始化错误都使用 `alert()` 弹窗，阻塞主线程，用户体验差；setMode 中 alert 之后才 setMode('mouse') 切换按钮状态，alert 期间 UI 显示"手势模式"激活但实际不可用。
- **建议验证**：改为页面内 toast / 面板提示，避免阻塞；在异步操作开始前先进入"加载中"状态。

#### R13. userData.showingBack 永不更新

- **位置**：[CardManager.js#L357](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L357)
- **现象**：createCardMesh 时设置 `userData.showingBack = showBack`，但翻牌后（rotation.y=π）从不更新此字段。目前仅有一处使用（[CardManager.js#L304-L305](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L304-L305) 纹理异步更新），且在翻牌前纹理更新恰好正确（因为 materials[5] 在翻牌后才对相机可见，而代码在 showBack=true 时设置 materials[5].map=texture，碰巧正确）。但如果后续有其他逻辑依赖此字段将产生 bug。
- **建议验证**：翻牌后显式设置 showingBack=false，或在使用处基于 rotation.y 计算。

#### R14. CDN 依赖无 fallback

- **位置**：[index.html#L76-L79](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/index.html#L76-L79)
- **现象**：Three.js 和 MediaPipe 均从 jsdelivr CDN 加载。Three.js 加载失败会导致 `THREE is not defined`，整个游戏无法启动（main.js 只做 WebGL 检查，不做脚本加载检查）。MediaPipe 加载失败被 catch 后可以降级到鼠标模式，但 Three.js 不行。
- **建议验证**：禁用网络或使用广告屏蔽器拦截 CDN，验证页面表现。可考虑本地 vendor 或提供 `<script onerror>` 处理。

### P3 — 代码质量与观测性

#### R15. 测试覆盖对交互状态机几乎零保护

- 现状：
  - `gameLogic.test.js` 测试的是 Math.random 范围、独立实现的 Fisher-Yates 洗牌、简单数组 filter，以及**硬编码的 validTransitions 对象**（测试对象是测试文件本身定义的字典，不是 TarotGame 类的真实转换逻辑，见 [gameLogic.test.js#L104-L124](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gameLogic.test.js#L104-L124)）。
  - `tarotData.test.js` 对数据完整性（78 张、URL 格式、字段存在）覆盖较好。
  - jest 配置 `testEnvironment: 'node'`，无法加载依赖 DOM/WebGL/Three.js 的模块，因此 TarotGame/CardManager/HandTracker/ParticleSystem 四大类**完全没有单元测试**。
  - 没有对以下关键路径的任何测试：
    - 状态转换（特别是非法转换的防御）
    - 纹理加载降级链
    - 粒子系统生命周期（update 后是否正确 dispose）
    - setMode 降级逻辑
    - drawCard 返回 null 时 prepareNextCard 的行为
    - 手势防抖对快速切换的响应
- **建议验证步骤**：
  1. 引入 jsdom + 一个 mock 的 THREE 全局对象，将 jest 环境改为 jsdom，使类可被实例化。
  2. 提取手势算法为纯函数模块（同 R3），写 20+ 边界用例（半握手、过渡态、手进出画面、镜像手等）。
  3. 对 TarotGame 的状态转换写状态机属性测试：给定任意状态和任意输入序列，断言不会出现非法转换（confirmed 状态下 grabCard 不被调用等）。
  4. Mock THREE.TextureLoader，验证三级降级链的每一级正确 resolve。
  5. 对 ParticleSystem.update 写快进测试：模拟 deltaTime 累积到 3s，验证 systems 数组清空且 geometry/material 被 dispose。

#### R16. 全局暴露 window.tarotGame 用于调试，生产环境未移除

- **位置**：[main.js#L27](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js#L27)
- **影响**：低风险，但用户可在控制台直接修改 game.state 等内部字段。

#### R17. autoNextCard 与 onNextCard 代码重复

- **位置**：[TarotGame.js#L579-L612](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L579-L612)
- **现象**：两个方法除了一个在粒子回调中调用、一个由按钮触发，主体逻辑完全相同（隐藏面板→移除mesh→置null→prepareNextCard→showHint），应提取公共方法减少分歧风险（修复 R4 时容易漏改一处）。

#### R18. HandTracker.init() 对 DOM 元素未做空检查

- **位置**：[HandTracker.js#L29-L31](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L29-L31)
- **现象**：直接 `getElementById('video')`，若 DOM 结构改变（id 写错/节点未渲染）返回 null，后续访问 `.srcObject` 抛 TypeError。虽然 try/catch 能捕获并降级，但错误信息不精准。

---

## 八、建议验证步骤清单

按优先级排序，可作为手工 QA 或自动化测试的起点：

| # | 验证项 | 操作步骤 | 预期结果 |
|---|---|---|---|
| V1 | 纹理竞态（R2） | Chrome DevTools 设 Slow 3G，快速连续抽卡 5~6 次 | 新卡牌翻牌后不会出现前一张的图案 |
| V2 | 手势重复确认（R1/R9） | 手势模式下反复 OPEN→PINCH→FIST，快慢各 10 次 | 每次 FIST 只触发一次 confirmCard，历史记录条数 = 抽卡次数 |
| V3 | 资源泄漏（R4） | 连续抽完 78 张（可在控制台循环触发），Chrome Memory 面板拍快照前/后对比 | THREE.Texture / BufferGeometry 实例数不应线性增长；粒子系统数组应为空 |
| V4 | 牌库耗尽（R6） | 抽完 78 张 | 出现"重新洗牌"按钮或自动重置，不卡死 |
| V5 | 模式降级 | HTTP 环境下（非 localhost）点击手势模式；拒绝摄像头权限 | alert 后自动切回鼠标模式，游戏可继续 |
| V6 | 历史缩略图降级（R7） | 断网后抽卡 | 历史图片应降级到 local 或占位，不应只显示编号 |
| V7 | 粒子清理 | 快速点击"抽下一张"按钮 10 次（跳过动画等待） | 不应出现多个灰烬粒子系统叠加；FPS 稳定 |
| V8 | 拖拽与动画冲突（R5） | 手势模式抓取后立即快速移动手 | 卡牌靠近相机过程不出现明显抖动/拉扯 |
| V9 | 剩余牌数同步（R7） | 抽一张卡，在灰烬期间观察右上角剩余数 | 确认抽牌立即减少，不等灰烬结束 |
| V10 | 正逆位正确性 | 连续抽 20 张，记录正/逆位 | 约 50% 正位 50% 逆位；3D 卡牌倒置时标签/含义一致 |
| V11 | 牌背加载降级 | 删除/重命名 `assets/cards/back.svg`，刷新页面 | 显示金色五角星内联 SVG 牌背，不出现黑色面 |
| V12 | 测试与代码一致性（R3） | 对比测试与生产 recognizeGesture 的阈值/条件 | 应完全一致，且测试能覆盖临界值 |

---

## 九、状态机可视化

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    ▼                                              │
               ┌─────────┐    OPEN(gesture edge)    ┌─────────┐   │
               │  idle   │ ───────────────────────→ │  ready  │   │
               │ (浮动)  │                          │ (等待)  │   │
               └────┬────┘                          └────┬────┘   │
                    │                                    │        │
     mouse click    │    PINCH + ray hit (每帧)           │        │
     (ray hit)      └────────────────┬───────────────────┘        │
                    │                │                            │
                    ▼                ▼                            │
               ┌─────────────────────────┐                         │
               │       grabbing          │  ← 手势模式可拖拽 x/y    │
               │ (卡牌 lerp 到 z=4)     │                         │
               └────────────┬────────────┘                         │
                            │ 0.5s 动画完成                       │
                            ▼                                      │
               ┌─────────────────────────┐                         │
               │       showing           │  ← 翻牌动画 0.8s         │
               │ (翻牌 + 正逆位旋转)     │                         │
               └────────────┬────────────┘                         │
                            │ mouse click / FIST (edge)            │
                            ▼                                      │
               ┌─────────────────────────┐                         │
               │       confirmed         │  ← 显示解读 + 灰烬       │
               │ (info面板 + 灰烬粒子)   │                         │
               └────────────┬────────────┘                         │
                            │ 3s 粒子完成 / btn-next                │
                            └──────────────────→ prepareNextCard() ─┘
                                                         │
                                                         ▼
                                                       idle
```

---

## 十、总结

本项目作为 Three.js + MediaPipe 的交互 Demo，整体架构分层清晰：`tarotData` 纯数据、`CardManager` 管牌与纹理、`HandTracker` 封装手势识别、`ParticleSystem` 负责视觉特效、`TarotGame` 作为中枢状态机协调各模块。降级链覆盖了 WebGL/HTTPS/摄像头权限/纹理加载多个层面，具备基本的健壮性。

但在**状态机的幂等性**（特别是手势模式下持续检测与边缘检测的混用）、**异步资源管理**（纹理竞态、mesh/material dispose 路径不一致）、**测试有效性**（复制算法导致测试生产不一致、jest node 环境无法测试核心类）三个维度存在较显著风险。建议优先修复 R1（confirmCard 幂等）、R2（纹理回调 token 校验）、R4（统一资源释放路径），并将手势识别算法提取为可测试的纯函数模块以解决 R3。
