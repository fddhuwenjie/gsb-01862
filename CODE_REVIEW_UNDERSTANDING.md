# CODE_REVIEW_UNDERSTANDING.md

> 本文档基于对 `frontend-user/` 下源码的静态阅读所撰写，仅描述当前实现，不复述 README，也不假设代码尚未具备的能力。所有行号引用均为撰写时的版本。

---

## 1. 模块职责图景

整个抽卡前端是一个无打包工具、依赖全局脚本顺序加载的 Three.js 应用。`index.html` 顺序引入 `tarotData.js → ParticleSystem.js → HandTracker.js → CardManager.js → TarotGame.js → main.js`，全部类都挂在浏览器全局作用域。

| 模块 | 主要职责 | 关键边界 |
|------|----------|----------|
| [main.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js) | DOMContentLoaded 启动入口；做 WebGL 能力检查；构造 `TarotGame` 并调用 `init()`；把 `game` 暴露到 `window.tarotGame` 方便调试 | 不直接管理状态机、Three 场景或手势 |
| [TarotGame.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js) | 游戏总控：Three.js 场景/相机/渲染器、灯光、星空背景、手势光标、状态机 (`idle/ready/grabbing/showing/confirmed`)、模式切换、鼠标射线交互、手势回调路由、卡牌动画（移动/翻牌/浮动）、UI 更新（提示、历史、剩余张数） | 不直接负责贴图加载、粒子物理、手势识别细节 |
| [CardManager.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js) | 牌库与材质：读取 `getAllCards()` 构建 78 张牌副本、Fisher–Yates 洗牌、抽牌（同时随机正/逆位）、贴图三级回退（在线 → 本地 → Canvas 占位）、Three.js BoxGeometry 卡牌网格创建、应用逆位旋转、剩余张数统计、释放资源 | 不感知交互模式与状态机 |
| [HandTracker.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js) | MediaPipe Hands 封装：安全上下文/getUserMedia 检查、摄像头初始化、关键点绘制（视频预览叠加）、`recognizeGesture()`（FIST/PINCH/OPEN/POINT/NONE）、手指伸展判定、3 帧滑动窗口防抖（`stabilizeGesture`，阈值 ≥2）、手掌中心平滑（指数滑动 0.3）、回调 `onGestureChange`/`onHandMove` | 完全不知道卡牌或状态机；只对外抛事件 |
| [ParticleSystem.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js) | 灰烬粒子：从 `cardMesh.geometry` 顶点 + 表面混合采样 2000 个粒子，Float32Array 存放速度/寿命/alpha，自定义 ShaderMaterial（加法混合，灰烬颜色 `0xff6600`）、湍流噪声更新位置、寿命到期或 `time > 3s` 时移除并触发 `onComplete` 回调 | 不感知卡牌业务，只接受 `cardMesh` 与回调 |
| [tarotData.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/tarotData.js) | 静态数据：78 张 Rider-Waite-Smith 牌（id 0–77，正/逆位中文释义）、`getAllCards()`、`getCardImageUrl(id)` 返回 `{local, online}`（在线指向 `metabismuth/tarot-json` GitHub raw）、`CARD_BACK_URL` + `CARD_BACK_FALLBACK`（内联 SVG dataURL） | 纯数据/工具，无副作用 |

---

## 2. 一次完整抽卡的链路（端到端）

下列时间线按代码实际调用顺序拼出，鼠标模式与手势模式只在「触发器」处分叉。

### 2.1 页面加载与场景初始化
1. [main.js:4-24](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js#L4-L24) 在 `DOMContentLoaded` 检查 `window.WebGLRenderingContext`，否则把 `#loading` 改成红色错误提示并返回。
2. 通过 `new TarotGame()` 与 `await game.init()` 进入 [TarotGame.init()](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L35-L54)：
   - `initThree()` 建立 `Scene`、`PerspectiveCamera(60°, z=8)`、`WebGLRenderer`（开启 PCF 软阴影 + ACES Filmic Tone Mapping），将 `domElement` 挂到 `#canvas-container`。
   - `initLights()` 加 4 盏灯（环境光、主平行光、补光、点光）。
   - `initBackground()` 用 1000 个粒子做星空（`THREE.Points`）。
   - `initHandCursor()` 创建一个青色 `RingGeometry` 与 `PointLight`，初始 `visible = false`，仅在手势模式可见。
   - 实例化 `cardManager`（构造时立刻 `initDeck()` + `loadBackTexture()` + `createLoadingTexture()`）与 `particleSystem`。
   - `bindEvents()` 绑定 mousemove/click、模式切换按钮、`#btn-next`、`#history-toggle`、resize。
   - `animate()` 启动 RAF 循环：每帧调用 `particleSystem.update(deltaTime)` 并渲染。
   - `await prepareNextCard()` 抽出第一张「待抽」的卡放在 `cardIdlePosition (0,0,0)`，并启动 `cardFloatAnimation` 让卡牌在 `state==='idle'` 时上下浮动 + Y 轴轻摇。
   - 隐藏 `#loading`，`updateUI()` 写入剩余张数。

### 2.2 用户进入「可抽取」状态
- **鼠标模式（默认）**：模式按钮初始就 `active`，`#hint` 显示「点击卡牌开始抽卡」。`onMouseMove` 实时做射线检测，命中就 `highlightCard(true)`（缩放 1.05）。状态保持 `idle`，没有显式的 `ready`。
- **手势模式**：用户点 `#btn-gesture` 进入 [setMode('gesture')](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L192-L236)：显示 `#gesture-status` 与 `#camera-preview`、隐藏底部 `#hint`；首次会 `new HandTracker(...)` 并 `await handTracker.init()`。识别到 `OPEN` 且 `state==='idle'` 且发生手势变化时，状态切到 `ready`（[handleGesture:300-305](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L300-L305)）。

### 2.3 选中卡牌（射线命中）
- **鼠标**：`onMouseMove` 持续刷新 `this.mouse`，并实时 `intersectObject(cardMesh)` 决定是否 `highlightCard`。
- **手势**：`onHandMove` 把摄像头坐标做 `x → 2x-1`、`y → -(2y-1)` 映射到 NDC，再在 `updateHandCursor()` 里反投影出空间光标位置，命中卡牌时 cursor 变绿放大；同时用同一组 `this.mouse` 做射线检测。`POINT` 手势会调用 `highlightCard(true)` 并把 `_cardVelocity` 清零（描述为「停止惯性」）。

### 2.4 抽牌触发（grabCard）
- **鼠标**：`onMouseClick` 命中卡牌且 `state ∈ {idle, ready}` 时调用 [grabCard()](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L504-L516)。
- **手势**：`PINCH` 手势在 `state ∈ {ready, idle}` 且射线命中卡牌时立即把状态置为 `'grabbing'` 并 `grabCard()`。注意此分支即便不发生「手势变化」也会触发——这是后面风险讨论的关键。
- `grabCard()` 内部：状态 `'grabbing'` → `animateCardTo(cardShowPosition=(0,0,4), 0.5s, easeOutCubic)` → 完成后 `state='showing'` → 调用 `flipCard()` 用 0.8s easeOutCubic 把 Y 轴旋转到 `Math.PI`，翻完调用 `cardManager.applyReversedRotation()`，若是逆位再让 `rotation.z = π`。提示语会随模式不同显示「握拳确认抽卡」/「再次点击确认」。

### 2.5 确认抽卡（confirmCard）
- **鼠标**：第二次点击命中卡牌且 `state ∈ {grabbing, showing}` 时调用 `confirmCard()`。
- **手势**：在 `state ∈ {grabbing, showing}` 且 `FIST` 手势刚发生切换 (`gestureChanged === true`) 时触发。
- [confirmCard()](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L551-L574) 把状态置 `'confirmed'`，做四件事：`showCardInfo(card)` 弹卡牌信息面板、`addToHistory(card)` 在历史区插一条、`particleSystem.createAshParticles(cardMesh, onComplete)` 创建灰烬粒子、`cardMesh.visible=false` 隐藏卡牌。`showHint('')` 清空底部提示。

### 2.6 正逆位的产生与展示
- 产生：[CardManager.drawCard()](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L266-L313)。`Math.random() < 0.5` 决定 `isReversed`，写入 `currentCard.orientation = 'reversed'|'upright'`、`currentCard.meaning = isReversed ? card.reversed : card.upright`。
- 视觉：翻牌动画结束后由 `applyReversedRotation()` 设置 `mesh.rotation.z = π`（仅当 `isReversed`）。
- 文本：`showCardInfo()` 写 `#card-name` (`#id 名字`)、`#card-orientation`（"正位" / "逆位"，并用 className 区分样式）、`#card-meaning`（对应 `upright`/`reversed` 的描述字符串）。
- 历史 mini 卡：在 [addToHistory](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L636-L663) 中给逆位的 `<img>` 加 `reversed` class（CSS 决定旋转视觉）。

### 2.7 灰烬粒子
- [createAshParticles()](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js#L13-L146) 直接读取 `cardMesh.geometry` 的 `position` attribute 与包围盒，混合「顶点采样 + 表面采样」生成 2000 个粒子，初始向上速度 `0.5~2.0`，水平 `±0.25`。
- ShaderMaterial 用加法混合渲染圆形发光点，gl_PointSize 随屏幕距离衰减。
- `update()` 每帧累计 `time`，对每个粒子做：寿命扣减、湍流位移、速度衰减（0.98/0.99）、`alpha = lifeRatio`、`size *= 0.995`。当 `allDead` 或 `time > duration(3s)` 时调用 `removeSystem()` 释放 geometry/material 并执行 `onComplete`。

### 2.8 写入历史 + 准备下一张
- 粒子完成回调 `autoNextCard()`（[L579-L593](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L579-L593)）会先隐藏 `#card-info`、`scene.remove(cardMesh)` 并把 `cardMesh = null`，再 `await prepareNextCard()` 抽下一张：`drawCard()` 把新的 `card.drawn = true`，创建新 mesh、回到 `cardIdlePosition`、重启 `cardFloatAnimation`，并把 `state` 重置为 `'idle'`、`_prevGesture = null`、`_fistForNext = false`，最后 `updateUI()` 刷新剩余张数。
- 用户也可以在 `#card-info` 里点 `抽下一张` 触发同等的 `onNextCard()` 流程（同 `autoNextCard` 实现，但不依赖粒子完成回调）。

---

## 3. 状态机：鼠标 vs 手势

`TarotGame.state` 只有 5 种取值：`idle / ready / grabbing / showing / confirmed`。

```
idle ──(OPEN, 仅手势变化时)──► ready
idle ──(鼠标点击命中, 或 PINCH 命中)──► grabbing  (跨阶段直跳)
ready ──(鼠标点击命中, 或 PINCH 命中)──► grabbing
grabbing ──(animateCardTo 0.5s 完成)──► showing
grabbing/showing ──(再次点击命中, 或 FIST 手势变化)──► confirmed
confirmed ──(粒子完成 → autoNextCard → prepareNextCard)──► idle
```

### 共同点
- 状态机变量、动画、UI 完全共享，只是触发器不同。
- `idle` 与 `ready` 在「能否抓取」上等价，`onMouseClick` 与 `PINCH` 都接受这两个状态。
- `grabbing` 与 `showing` 在「能否确认」上等价。
- `confirmed` 期间任何输入都被忽略：鼠标在 `onMouseClick` 与 `onMouseMove` 都早退；手势在 `handleGesture` 里直接 `return`。
- 无论哪种模式，`prepareNextCard()` 都会把 `state` 还原为 `idle`，并清空 `_prevGesture`，从而允许新一轮 `OPEN` 触发 `ready`。

### 差异
| 维度 | 鼠标模式 | 手势模式 |
|------|---------|---------|
| 「就绪」语义 | 没有 `ready` 阶段，`idle` 直接可点 | 必须先 `OPEN` 才会进入 `ready`，但 `PINCH` 也允许从 `idle` 直接抓取 |
| 命中检测频率 | 只在 mousemove/click 时 | 每帧 `onHandMove` + `updateHandCursor` 都会算 |
| 触发上升沿 | 浏览器原生 `click` 自带 | 依赖 `_prevGesture` 与 `gestureChanged` 自检 |
| `OPEN` / `POINT` | 不存在概念，鼠标命中即高亮 | 多了「准备」与「悬停」语义 |
| UI 副作用 | 显示 `#hint` | 显示 `#gesture-status` + `#camera-preview`，隐藏 `#hint` |
| 「下一步提示」 | 静态 hint 文案 | `updateGestureUI` 根据当前 `state` 动态写入 `#gesture-next-text` |

---

## 4. 降级与错误处理

### 4.1 摄像头权限失败 / 浏览器不支持
- WebGL 缺失：`main.js` 直接把 `#loading` 改成红字提示并 return，不会再创建 `TarotGame`。
- 切换到手势模式时进入 [HandTracker.init](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L28-L99)：
  1. `!window.isSecureContext` → `alert` 提示需要 HTTPS/localhost，返回 `false`。
  2. `!navigator.mediaDevices.getUserMedia` → `alert` 提示浏览器不支持，返回 `false`。
  3. `try` 块内 `getUserMedia` 失败时按 `error.name` 区分 `NotAllowedError`（拒绝授权）/`NotFoundError`（无设备）/其他，分别 `alert`，最后返回 `false`。
- `setMode('gesture')` 检测到 `init()` 返回 `false` 后，会调用 `showHint('摄像头权限获取失败，已切换到鼠标模式')` 并递归 `setMode('mouse')`。这就实现了 README 强调的「降级」。
- 注意：`setMode` 中只在「首次为 null」时才创建 `HandTracker`。如果首次失败，`handTracker` 不会被创建（因为返回前 break 了 `this.handTracker = new HandTracker(...)` 之后的赋值——其实赋值已经发生），下次再点「手势模式」会跳过 `init()` 直接 `start()`，存在重新尝试授权失败的风险（详见风险 5.5）。

### 4.2 贴图加载
- 牌背：`loadBackTexture()` 先存好 Canvas 占位 `placeholderTexture`，异步加载 `back.svg`；失败回退到 `loadFallbackBackTexture()` 用 `CARD_BACK_FALLBACK` 内联 SVG dataURL。两层失败之间 `backTexture` 仍是 `null`，`drawCard` 里会 fallback 到 `placeholderTexture`。
- 卡面：`loadCardTexture(id)` 三级链：在线（GitHub raw）→ 本地 `assets/cards/{id}.jpg` → `createCardPlaceholder(id)`（Canvas 画牌号 + 中文名 + 英文名）。
- `drawCard()` 同步返回时把 `frontTexture` 暂时设为 `loadingTexture`（一张「加载中」Canvas），异步加载完成后通过 `materials[4]/[5].map = ...; needsUpdate = true` 替换。

### 4.3 抽过的牌避免重复
- `initDeck()` 把 `getAllCards()` 拷贝并加 `drawn:false` 字段，再 `shuffleDeck()` 打乱。
- `drawCard()` 在 `this.deck.filter(c => !c.drawn)` 上随机抽，再 `card.drawn = true`。`drawnCards` 只 push，不会再次出现在可用集合中。
- `getRemainingCount()` 依赖同一字段；`#remaining-count` 在 `prepareNextCard` 末尾刷新一次。
- 抽完后 `drawCard()` 返回 `null`，`prepareNextCard()` 会 `showHint('所有卡牌已抽完！')` 并跳过创建 mesh。

---

## 5. 用户体验风险与优先级

按对体验影响从高到低排列。每条都基于代码实际行为，未做臆测。

### P0 风险

**5.1 PINCH 触发条件没有「手势上升沿」校验，存在重复抓取风险**  
[handleGesture: case 'PINCH'](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L307-L317) 注释明确写「持续检测，不仅在手势变化时」。配合 MediaPipe 30fps 推理 + 3 帧防抖窗口，只要用户保持捏合 + 光标停留在卡牌上，每一帧都会进入分支。当前代码靠「`state==='ready' || state==='idle'`」+ `grabCard()` 内部把状态切到 `'grabbing'` 来防抖：进入 `grabbing` 后 PINCH 不再生效，看似安全。但是 `animateCardTo` 完成后状态变 `showing`，FIST 又允许在 `showing` 阶段触发 `confirmCard`。如果用户从 PINCH 转 FIST 时手指抖动、识别先把它判成短暂 OPEN，然后立刻又进 PINCH，可能在尚未 confirm 前就触发了二次抓取（不过此时状态已是 `showing`，PINCH 分支不会再触发）。**结论**：当前 PINCH 实际上是安全的，但若有人后续把 PINCH 的 guard 改成包含 `showing`，就会立刻退化成无防抖的重复抓取。建议在该分支显式加 `gestureChanged` 校验或冷却时间。

**5.2 PINCH ↔ FIST 切换时机模糊**  
握拳和捏合的指尖距离都可能很近：`recognizeGesture` 已经故意把「extendedCount===0 → FIST」放在前面，并要求 PINCH 时「中指、无名指、小指不全伸展」。但中间过渡帧（拇指食指捏合 + 中指尚未弯下来）会被识别为 OPEN/POINT，再瞬间变 FIST。`stabilizeGesture` 的 3 帧滑动窗口阈值仅 2，等于「3 帧里有 2 帧」就切换，**对快速过渡几乎无防抖**（约 67ms）。这意味着用户从 PINCH 直接握拳时，可能出现 `PINCH → OPEN/POINT → FIST` 的短暂错读，影响体感是「卡牌偶尔被解除抓取（POINT 进入 highlight 分支）后立刻翻牌」。

**5.3 摄像头打开后无法重试授权 / 失败状态泄漏**  
`setMode('gesture')` 中：
```js
if (!this.handTracker) {
  this.handTracker = new HandTracker(...);
  const success = await this.handTracker.init();
  if (!success) { ...降级到 mouse; return; }
}
this.handTracker.start();
```
如果首次 `init()` 失败，`this.handTracker` 已经是非 null（赋值发生在 await 之前），下次再点手势模式不会再 `init()`，而是直接 `this.handTracker.start()`，但 `this.camera` 仍是 null，等于静默失败（从用户视角是「点了没反应」）。建议失败后置 `this.handTracker = null` 或暴露重试入口。

### P1 风险

**5.4 浮动动画与翻牌动画各自独立的 RAF，会并发**  
`cardFloatAnimation` 通过 `requestAnimationFrame(animate)` 自递归，guard 是 `state === 'idle'`，进入 `grabbing` 后会自然停。但 `animateCardTo` 与 `flipCard` 也都是独立 RAF。它们都直接写 `mesh.position` / `mesh.rotation.y`，没有互锁。理论上同一帧都在跑，会产生抢写覆盖。当前流程上是串行进入的（`grabCard` 触发时 state 必然变了，浮动会停止），但任何后续加新动画都需要小心。

**5.5 历史记录与剩余牌库状态弱同步**  
`addToHistory` 与 `getRemainingCount` 用的是不同数据源——前者是 DOM 节点列表，后者是 `deck.filter(!drawn)`。`updateUI()` 仅在 `prepareNextCard` 末尾被调用，意味着「剩余张数」的更新点和「历史新增」的更新点在视觉上有时间差（`addToHistory` 在 `confirmCard` 中执行，但剩余数已经在更早的 `drawCard` 时减少，UI 却要等到下一次 `prepareNextCard` 才刷新）。换句话说：confirm 完到自动抽下一张的几秒内，UI 上「历史多了一张，但剩余张数还是上一张抽出来时算的值」。这并非崩溃，但容易让用户误以为「自己刚抽的还没扣掉」。

**5.6 卡牌贴图占位策略与异步替换的副作用**  
`drawCard` 把 `frontTexture` 设为 `loadingTexture`，异步加载完成后通过判断 `cardMesh.userData.showingBack` 把贴图写到正确的材质槽。但是：
- 异步回调是在 `currentCard` 上更新 `frontTexture`，然后再访问 `this.cardMesh`。如果用户在贴图回来之前就点了「抽下一张」，`scene.remove(cardMesh)` 会执行，`this.cardMesh = null`，但 `currentCard.frontTexture` 已替换为新纹理，再后续逻辑没有立即问题；不过 `loadCardTexture` 创建的 Texture 没有被显式 `dispose()`，会留下游离 GPU 资源。
- 贴图替换没有处理「翻牌动画进行到一半」的情况——如果贴图在 `flipCard()` 还没完成时回来，可能用户看到的是「翻到一半的加载中纹理」突然变成正面图片，闪烁。

**5.7 `handCursor.material.color` 在每帧改色**  
`updateHandCursor` 每帧根据是否对准卡牌切色。`MeshBasicMaterial.color` 修改不会触发 `needsUpdate` 问题（它直接走 uniform 更新），但同时 `handCursorLight.color.setHex` 也会被调用，这会触发 Three.js 内部的 `Color.copy` 与 light uniform 重新上传——量级很小，但说明每帧都做无差别赋值，缺少「上一帧是否已是同色」短路。

### P2 风险

**5.8 粒子对象清理依赖回调链路**  
`particleSystems` 数组是 `update` 循环里推入/移除的。如果用户在粒子还没结束时反复触发新的 `confirmCard`（理论上 state===confirmed 阶段被 guard 住，所以正常路径不会发生），会叠加多个粒子系统。所有清理都在 `removeSystem` 中做 `geometry.dispose() / material.dispose()`，但 `velocities`、`lifetimes`、`maxLifetimes` 这些原生数组靠 GC 即可。比较隐蔽的是 `system.onComplete()` 抛错时，`removeSystem` 不会重试——`autoNextCard` 是异步函数，里面 `await prepareNextCard()` 失败不会 surface 给粒子系统。

**5.9 鼠标点击在「卡牌还在飞向相机」期间也会进入 confirm**  
`grabCard` 设置 `state='grabbing'`，0.5s 之后才到 `showing`。在 `grabbing` 阶段如果用户连点两下，第二次点击就立即进入 `confirmCard`，卡牌甚至还没到位，UI 上会观感生硬。当前 `onMouseClick` 在 `state==='grabbing'` 时也接受 confirm，没有「等动画结束」的锁。

**5.10 `setMode` 内的递归调用**  
失败时调用 `this.setMode('mouse')`，本身是 async，但调用方没有 await 这个递归，理论上会有 microtask 顺序问题；目前没看到具体缺陷，但属于隐藏复杂度。

---

## 6. 测试覆盖现状

`frontend-user/tests/` 三个 Jest 测试只校验**纯函数与数据**：

- `tarotData.test.js`：验证 78 张牌的字段完整、id 连续、`getCardImageUrl` 形态。**有效**。
- `gestureRecognition.test.js`：把 `recognizeGesture` 算法整段复制到测试文件里（注意：测试代码与 `HandTracker.js` 是**两份独立实现**——例如测试里 `thumbToIndex < 0.08` 才判 PINCH，源码是 `< 0.12`，且测试版本 PINCH 仅在「只食指伸展 + 拇指近」时触发，而源码允许「至少一个 ring/pinky 没伸展」就成立）。**测试通过不能保证生产代码的判定逻辑也通过**——这两个版本会产生不同结果。
- `gameLogic.test.js`：验证 `Math.random` 范围、Fisher–Yates 长度/包含/打乱程度、抽牌计数、以及一份**硬编码的状态转换合法表**（`validTransitions`）。注意这个合法表与真实 `TarotGame` 的转换不一致：比如表里写 `idle → [ready, grabbing]`、`ready → [grabbing, idle]`，但实际代码 `OPEN→ready` 只在「`gestureChanged`」时发生；`grabbing → showing` 在表中存在，而 `confirmed → idle` 实际靠 `prepareNextCard` 副作用，不是状态机意义上的转移函数。

**结论：现有测试不真正保护交互状态机**。它们既不渲染也不驱动 `TarotGame` 实例；状态机的所有边界情况（5.1–5.10 列的所有风险）都没有被任何测试覆盖。`gestureRecognition.test.js` 的「双份实现」让人误以为手势算法已经被验证，但实际只是验证了一份替身。

---

## 7. 风险优先级与建议验证步骤

| 优先级 | 风险编号 | 建议处理 |
|--------|----------|----------|
| P0 | 5.1 PINCH 持续触发 | 给 PINCH 分支显式加 `gestureChanged` 或 200ms 冷却；在 Jest 中针对 `handleGesture` 写状态机驱动测试（mock Raycaster），用「连续 10 帧都是 PINCH」断言只触发一次 `grabCard`。 |
| P0 | 5.2 PINCH↔FIST 抖动 | 把 `gestureBufferSize` 的 2/3 阈值改为可配置；为关键过渡（PINCH→FIST、FIST→OPEN）增加「禁止跨过中间手势」的状态保护；验证步骤：录制一段实际摄像头视频，离线回放并打印每帧识别结果。 |
| P0 | 5.3 摄像头授权失败状态泄漏 | 把 `await this.handTracker.init()` 失败后 `this.handTracker = null` 或加 `inited` 字段；手动测试：先拒绝授权再点手势模式，应当再次出现授权弹窗而不是无反应。 |
| P1 | 5.4 多 RAF 并发 | 把动画统一调度到 `animate()` 主循环中（用 `clock` 累计 progress），避免独立 RAF；用浏览器 Performance 录像验证。 |
| P1 | 5.5 历史/剩余张数时序 | 在 `confirmCard()` 内立刻调用 `updateUI()`；自动化验证：用 jsdom 模拟点击两次，断言 DOM 中 `#remaining-count` 与 `#history-list` 子元素数同步变化。 |
| P1 | 5.6 贴图回填副作用 | 卡牌切换时取消未完成的 `loadCardTexture` Promise（保存上一张的 Promise，比对 cardId 后再赋值）；释放过时 Texture。 |
| P2 | 5.7–5.10 | 视体感影响再处理；可在 e2e（Playwright）中通过快速点击/连发手势事件回归。 |

### 推荐的最小验证清单
1. **手势状态机单测**（缺失）：用 mock 的 `cardMesh` + `Raycaster` 直接驱动 `handleGesture('PINCH')` 30 次，断言只调用一次 `grabCard`；手势序列 `OPEN → PINCH → FIST` 应得到 confirmed。
2. **降级路径手测**：在非 HTTPS 环境点击手势模式，应弹出 alert + 自动回到鼠标模式按钮高亮态。
3. **离线贴图回退**：禁网络访问 GitHub raw，断言卡牌仍能展示 Canvas 占位，并且 `addToHistory` 中 `<img>` 失败后 `card-mini-inner` 显示 `#id`。
4. **重复抽牌**：抽完 78 张后再点「下一张」，应得到「所有卡牌已抽完」提示且不会创建空 mesh。
5. **粒子峰值**：在控制台连续触发 `confirmCard`（绕过状态机限制），观察 `particleSystem.particleSystems.length` 在 3 秒后归零。
6. **跨模式切换**：手势模式抓取中切换到鼠标模式，检查 `handCursor.visible=false`，并且 `state` 仍能被鼠标点击 confirm（当前代码会工作，但值得人工回归）。

---

## 8. 信息流速查图

```
DOM ── click/move ──► TarotGame.onMouse* ─┐
                                          ├─► state machine ─► CardManager (mesh/texture)
HandTracker ── onGestureChange/onHandMove ┘                  └─► ParticleSystem (ash) ──► onComplete ──► autoNextCard
                                                                                                     │
tarotData.js ── getAllCards/getCardImageUrl/CARD_BACK_* ─────────────────────────────────────────────┘
```

最大单点责任都在 `TarotGame`：它既是**渲染容器**又是**状态机**还是**事件路由**，体积 765 行；任何后续重构最值得拆出来的就是 `state` 与 `handleGesture` 这一块。
