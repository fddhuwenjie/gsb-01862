# CODE_REVIEW_UNDERSTANDING - Three.js 塔罗抽卡游戏代码理解文档

## 一、模块职责图景

### 1.1 模块架构图

```
main.js (入口)
    ↓
TarotGame.js (核心状态机 & 场景协调)
    ├─→ CardManager.js (牌库管理、纹理加载、卡牌网格)
    ├─→ HandTracker.js (MediaPipe Hands 手势识别)
    ├─→ ParticleSystem.js (灰烬粒子效果)
    └─→ tarotData.js (78张牌数据常量 + URL生成)
```

### 1.2 各模块详细职责

| 模块文件 | 核心职责 | 对外接口 |
|---------|---------|---------|
| [main.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/main.js) | WebGL支持检测、TarotGame实例化、初始化流程控制、全局调试挂载 | - |
| [TarotGame.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js) | Three.js场景搭建、状态机管理、鼠标/手势事件分发、UI更新、动画调度 | `init()`, `setMode()`, `grabCard()`, `confirmCard()`, `prepareNextCard()` |
| [CardManager.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js) | 78张牌库初始化洗牌、抽牌去重、纹理三级降级加载、卡牌Mesh创建/销毁、正逆位标记 | `drawCard()`, `createCardMesh()`, `applyReversedRotation()`, `getRemainingCount()`, `reset()` |
| [HandTracker.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js) | MediaPipe Hands初始化、摄像头权限申请、手部关键点绘制、手势识别、位置平滑、防抖缓冲 | `init()`, `start()`, `stop()`, `dispose()` |
| [ParticleSystem.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js) | 从卡牌几何体采样粒子点、Shader渲染灰烬、生命周期更新、自动销毁回调 | `createAshParticles()`, `update()`, `dispose()` |
| [tarotData.js](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/tarotData.js) | 78张RWS塔罗牌数据(大阿尔卡纳22+小阿尔卡纳56)、图片URL生成(在线/本地)、牌背SVG内联 | `getAllCards()`, `getCardImageUrl()` |

---

## 二、完整抽卡链路状态流说明

### 2.1 状态定义

[TarotGame.js:14](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L14-L14) 定义了5种状态：

| 状态 | 含义 |
|------|------|
| `idle` | 卡牌就绪，等待用户开始交互（空闲漂浮动画） |
| `ready` | **仅手势模式**：张开手掌确认后，等待对准捏合 |
| `grabbing` | 卡牌被选中，正在向镜头移动 |
| `showing` | 翻牌完成（正面朝上），等待确认抽卡 |
| `confirmed` | 已确认，正在播放灰烬粒子，自动准备下一张 |

### 2.2 完整抽卡时序

```
页面加载 (main.js)
    ↓
WebGL检测 → TarotGame.init()
    ↓
initThree() → initLights() → initBackground() → initHandCursor()
    ↓
new CardManager()          // 初始化78张牌并洗牌
    ↓
new ParticleSystem()
    ↓
bindEvents() → animate()   // 启动渲染循环
    ↓
prepareNextCard()
    ├─ cardManager.drawCard() → 随机抽一张（标记drawn=true，随机正逆位50%）
    ├─ createCardMesh(showBack=true) → 创建BoxGeometry，初始显示牌背
    ├─ cardFloatAnimation() → idle状态下持续浮动
    └─ state = 'idle'
    ↓
┌───────────────────────────────────────────────────────────────┐
│  【鼠标模式】                     【手势模式】                  │
│  onMouseMove() 悬停高亮          onHandMove() 移动光标        │
│  onMouseClick() 点击卡牌         OPEN手势 → state='ready'     │
│      ↓                           PINCH手势(对准卡牌)          │
│      └───────────────────────┬───────────────────────────────┘
│                              ↓
│                      grabCard() → state='grabbing'
│                              ↓
│                  animateCardTo(showPosition) → 卡牌移向镜头
│                              ↓
│                      flipCard() → 绕Y轴旋转π显示正面
│                              ↓
│                  applyReversedRotation() → 若reversed则绕Z轴转π
│                              ↓
│                      state = 'showing'
├───────────────────────────────────────────────────────────────┤
│  【鼠标模式】                     【手势模式】                  │
│  再次点击卡牌                    FIST手势(握拳)                │
│      └───────────────────────┬───────────────────────────────┘
│                              ↓
│                      confirmCard() → state='confirmed'
│                              ↓
│                  showCardInfo() → 显示正/逆位含义
│                              ↓
│                  addToHistory() → DOM插入历史记录项
│                              ↓
│                  particleSystem.createAshParticles()
│                              ↓
│                  cardMesh.visible = false
│                              ↓
│                  [粒子动画播放 1-3秒]
│                              ↓
│                  removeSystem() → onComplete回调触发
│                              ↓
│                      autoNextCard()
│                              ↓
│                  scene.remove(cardMesh) → dispose旧资源
│                              ↓
│                  prepareNextCard() → 回到idle，循环
└───────────────────────────────────────────────────────────────┘
```

### 2.3 鼠标模式 vs 手势模式：共同点与差异

**共同点**：
- 共享相同的5状态状态机
- 共享射线检测(Raycaster)机制进行卡牌命中
- 共享grabCard() → flipCard() → confirmCard()核心流程
- 共享粒子系统、历史记录、UI更新

**差异点**：

| 维度 | 鼠标模式 | 手势模式 |
|------|---------|---------|
| 进入ready状态 | **无需此状态**，直接idle→grabbing | 需要OPEN手势触发idle→ready（[TarotGame.js:302](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L302-L304)） |
| 选中卡牌触发 | 单次click事件（离散） | PINCH手势+射线命中（每帧持续检测，[TarotGame.js:309](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L309-L316)） |
| 确认抽牌触发 | 第二次click（离散） | FIST手势变化触发（仅在gestureChanged时，[TarotGame.js:321](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L321-L323)） |
| 光标表现 | 浏览器原生光标 | 青色/绿色RingGeometry+PointLight（[TarotGame.js:59-77](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L59-L77)） |
| 卡牌操控 | 无拖拽（点完直接飞过去） | grabbing状态下手部移动带惯性移动卡牌([TarotGame.js:355-366](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L355-L366)) |
| 悬停反馈 | highlightCard(scale=1.05) | POINT手势高亮+停止惯性 |
| 手势防抖 | N/A | 3帧缓冲区+多数投票阈值=2（[HandTracker.js:350-382](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L350-L382)） |
| 位置平滑 | N/A | smoothingFactor=0.3指数平滑（[HandTracker.js:150-151](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L150-L151)） |

---

## 三、关键机制深入分析

### 3.1 摄像头/浏览器降级策略

[TarotGame.js:192-236](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L192-L236) 中实现了多层降级：

1. **安全上下文检测** ([HandTracker.js:35-39](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L35-L39))：非HTTPS/localhost直接返回false→alert→降级鼠标
2. **API支持检测** ([HandTracker.js:42-46](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L42-L46))：navigator.mediaDevices不存在→alert→降级
3. **权限拒绝** ([HandTracker.js:90-91](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L90-L91))：NotAllowedError→alert→showHint→降级
4. **设备未找到** ([HandTracker.js:92-93](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L92-L93))：NotFoundError→alert→降级
5. **其他初始化异常** →catch→降级

**降级行为**：递归调用 `setMode('mouse')` 切回鼠标模式，隐藏摄像头UI，显示鼠标模式提示。

### 3.2 抽过的牌如何避免重复

[CardManager.js:26-32,266-313](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L26-L32)：

1. `initDeck()` 初始化时为每张牌添加 `drawn: false` 标记
2. `shuffleDeck()` Fisher-Yates洗牌算法打乱顺序
3. `drawCard()` 调用时：
   - 过滤 `deck.filter(c => !c.drawn)` 得到可用牌池
   - 随机选择一张后立即设置 `card.drawn = true`
   - 加入 `drawnCards[]` 数组
4. `getRemainingCount()` 实时统计未抽取数量
5. 牌库耗尽时 `drawCard()` 返回null→提示"所有卡牌已抽完"
6. `reset()` 方法可重置所有drawn标记（**注意：当前代码中未被UI调用，无重新开始按钮**）

### 3.3 正逆位生成与展示机制

[CardManager.js:277-292](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L277-L292)：

1. **随机选择**：`isReversed = Math.random() < 0.5`（各50%概率）
2. **含义绑定**：`meaning = isReversed ? card.reversed : card.upright` 直接在drawCard时选定
3. **视觉标记**：`cardMesh.userData.isReversed` 存储状态
4. **翻牌后应用**：flipCard动画完成后调用 `applyReversedRotation()` → reversed时 `rotation.z = π`（180度倒置）
5. **UI展示**：[TarotGame.js:617-631](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L617-L631)：
   - orientEl文本显示"正位"/"逆位"
   - orientEl.className设置为upright/reversed（CSS样式区分颜色）
   - meaningEl展示对应含义文本
6. **历史记录**：[TarotGame.js:651](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L651)：缩略图添加reversed class时CSS旋转180度

### 3.4 纹理三级降级加载

[CardManager.js:172-215](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L172-L215)：

**卡牌正面纹理加载优先级**：
1. 在线图源 (GitHub raw RWS卡牌高清图) → 成功则resolve
2. 本地图片 (assets/cards/{id}.jpg) → 在线失败后尝试
3. Canvas程序化生成占位符 → 显示卡牌编号+中文名+英文名

**牌背纹理**：
1. SVG文件 (`assets/cards/back.svg`)
2. 内联data URI SVG备用 ([tarotData.js:239-246](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/tarotData.js#L239-L246))

**异步更新机制**：[CardManager.js:297-310](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L297-L310)
- drawCard()立即返回（先用loadingTexture）
- 纹理异步加载完成后，如果cardMesh已存在则直接更新materials[4]/materials[5]的map
- 实现"先显示占位→真实贴图加载后替换"体验

---

## 四、风险优先级分析与影响

### 🔴 P0 严重风险（直接影响核心体验/数据正确性）

#### 风险1：手势识别抖动导致重复抽取或状态死锁

**位置**：[TarotGame.js:288-339](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L288-L339), [HandTracker.js:350-382](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L350-L382)

**问题分析**：
- PINCH手势处理是**持续检测（每帧）**而非仅在状态变化时（[TarotGame.js:309](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L309)无gestureChanged条件）
- 虽有3帧防抖缓冲，但阈值为2（简单多数），且PINCH→FIST过渡时容易出现抖动
- 更严重：PINCH分支允许 `state === 'idle'` 直接进入grabbing（[TarotGame.js:309](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L309)注释写了ready/idle都可以），这绕过了OPEN→ready的前置条件
- OPEN和FIST都依赖 `gestureChanged`，但如果手势在OPEN/PINCH/FIST之间快速震荡（手指半握状态），会导致：
  - 重复触发grabCard()（虽然state=='grabbing'后不会再进入，但动画过程中）
  - confirmCard()被意外触发（FIST误判）

**影响场景**：用户手指自然张合过渡时被误判为有效手势序列，跳过选中动画直接确认或重复抽牌。

---

#### 风险2：PINCH和FIST状态切换逻辑混乱

**位置**：[TarotGame.js:299-325](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L299-L325), [HandTracker.js:220-234](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L220-L234)

**问题分析**：
1. **识别优先级冲突**：HandTracker里FIST优先（extendedCount===0先判断），但PINCH判断条件是 `thumbToIndex < 0.12`，而握拳时拇指食指自然靠近。代码注释明确写了"握拳时拇指食指也会靠近不能误判为PINCH"，但只通过extendedCount===0优先判断来规避。
2. **状态触发条件不一致**：
   - OPEN → ready: 需要gestureChanged（状态跳变沿）
   - PINCH → grabbing: 不需要gestureChanged（电平持续触发）
   - FIST → confirm: 需要gestureChanged（沿触发）
3. **状态机不一致**：鼠标模式idle→grabbing是直接点击，手势模式设计了idle→ready→grabbing两步，但PINCH分支又允许idle直接→grabbing，导致ready状态实际上在PINCH持续命中时被绕过。
4. **未定义边缘情况**：showing状态下如果识别到PINCH会怎样？不会触发confirm，但会持续走PINCH分支无操作。如果从FIST回到PINCH呢？已经confirmed了直接return。

**影响场景**：用户从捏合(PINCH)到握拳(FIST)的过渡期间，因为识别阈值边界，可能出现：
- PINCH状态中突然某帧识别成FIST→意外confirm（过早确认，用户还没看清牌）
- 握拳过程中某帧识别成PINCH→已在grabbing/showing无副作用，但可能干扰FIST手势变化检测

---

#### 风险3：历史记录与剩余牌库状态不同步

**位置**：[TarotGame.js:457-477](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L457-L477), [TarotGame.js:636-663](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L636-L663)

**问题分析**：
1. **drawn标记时机过早**：`card.drawn = true` 在 `drawCard()` 中就设置了（[CardManager.js:280](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L280)），此时用户甚至还没看见这张牌
2. **addToHistory时机是confirmCard**，但drawn标记在prepareNextCard就完成了。如果用户：
   - 刷新页面 → drawnCards在内存中丢失，drawn标记也丢失，history DOM也清空
   - 在grabbing/showing状态下关闭页面 → 牌已标记drawn但未写入历史（内存数据不一致）
3. **无持久化**：牌库状态和历史记录全部在内存中，刷新后完全重置，没有localStorage持久化
4. **历史记录仅DOM存储**：刷新后消失，与CardManager.drawnCards数组无关
5. **剩余计数UI不同步边缘情况**：updateUI()只在prepareNextCard时调用，如果粒子动画过程中快速切模式等场景不会刷新计数（当前流程没问题，但扩展性差）

**影响场景**：用户正常抽一张牌过程中刷新，牌库减少但历史没有；78张抽完后刷新又可以重新抽。

---

### 🟠 P1 高风险（性能/资源泄漏/视觉异常）

#### 风险4：粒子对象清理时机问题

**位置**：[ParticleSystem.js:151-213](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/ParticleSystem.js#L151-L213)

**问题分析**：
1. **已实现但需验证**：removeSystem()确实调用了geometry.dispose()和material.dispose()，这是正确的
2. **双重完成条件**：`allDead || system.time > system.duration`，duration硬编码为3秒，maxLifetimes随机1-3秒。存在两种情况：
   - 所有粒子寿命结束（allDead=true）→ 触发清理
   - 超过3秒强制清理
3. **潜在问题**：
   - 每次createAshParticles都新建2000个粒子的BufferGeometry+ShaderMaterial，若快速连续抽牌（虽然状态机阻止了），可能同时存在多个粒子系统
   - 粒子速度更新没有速度上限，但有0.98/0.99衰减
   - geometries和materials在dispose前先从scene remove了，顺序正确
4. **未发现内存泄漏**：代码逻辑上dispose路径是完整的

**影响场景**：极端情况下（如果未来有快速跳过动画功能），粒子系统堆积可能导致帧率下降。当前代码状态机阻止了连续触发（confirmed状态下忽略手势）。

---

#### 风险5：卡牌纹理加载与Mesh材质索引耦合脆弱

**位置**：[CardManager.js:297-310](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L297-L310)

**问题分析**：
1. **硬编码材质索引**：`materials[4]`是正面，`materials[5]`是背面（[CardManager.js:334-349](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L334-L349)）
2. **异步更新逻辑问题**：
```javascript
materials[4].map = this.cardMesh.userData.showingBack ? backTexture : texture;
materials[5].map = this.cardMesh.userData.showingBack ? texture : backTexture;
```
   - 纹理加载完成时，卡牌可能已经被翻到正面了（showingBack=false），但这里仍用创建时的userData.showingBack判断
   - 如果加载时机刚好在flipCard()前后，userData.showingBack没有随翻牌更新！
   - 翻牌动画是直接改rotation.y，没有切换材质也没有更新showingBack标记
   - 结果：BoxGeometry双面材质实际上正面[4]和背面[5]贴图在翻牌后没有交换，卡牌是靠旋转180度看到[5]号面。异步纹理加载来的时候，可能把贴图贴错面。

**影响场景**：网络较慢时，真实纹理加载超过翻牌动画时间(0.8秒)完成，会导致正面贴成牌背、背面贴成牌面的视觉bug。

---

#### 风险6：卡牌加载失败占位策略的用户体验问题

**位置**：[CardManager.js:220-261, 645-654](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/CardManager.js#L220-L261)

**问题分析**：
1. **3D场景占位**：Canvas生成紫色渐变背景+金色边框+卡牌名（功能完整）
2. **历史记录缩略图占位**：[TarotGame.js:651-655](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L651-L655) 用了内联onerror：
   - onerror设置 `this.style.display='none'`，显示sibling div（只显示#编号）
   - 这个占位没有显示卡牌名，只有编号，体验不一致
3. **loadingTexture只在创建初期短暂显示**，然后立即被占位符或真实图替换。loadingTexture在牌背之前设置，但是牌背是单独的backTexture，正面才用loadingTexture
4. **占位纹理没有缓存**：createCardPlaceholder每次创建新CanvasTexture，但drawCard中是异步调用一次后更新，所以没问题

**影响场景**：离线环境/本地assets不存在时，历史缩略图只显示数字#0，无卡牌名称，用户无法识别。

---

### 🟡 P2 中风险（交互体验细节/状态机边缘情况）

#### 风险7：抓取状态下手势移动惯性无衰减

**位置**：[TarotGame.js:355-366](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L355-L366)

**问题分析**：
```javascript
const dx = targetX - this.cardManager.cardMesh.position.x;
const dy = targetY - this.cardManager.cardMesh.position.y;
this._cardVelocity = { x: dx * 0.1, y: dy * 0.1 };
this.cardManager.cardMesh.position.x += this._cardVelocity.x;
this.cardManager.cardMesh.position.y += this._cardVelocity.y;
```
- 每帧直接计算dx*0.1作为速度并立即应用
- 只有POINT手势才将_cardVelocity清零，手势移出镜头(NONE状态)时：
  - highlightCard(false)被调用
  - 但_cardVelocity保留最后值，卡牌继续移动？
  - 不，看逻辑：onHandMove只在检测到手时调用，无手时这个代码不执行，所以卡牌停在最后位置，不会继续飘
- 但animate()循环中没有独立的惯性衰减逻辑，松开后卡牌不会继续滑行，而是立即停止跟随（因为dx趋近于0）。这不是bug，但POINT手势清零速度的逻辑和无手时的自然停止不一致。

**影响场景**：手势短暂丢失时（手移出画面），卡牌停在半空中不回正。

---

#### 风险8：翻牌动画期间无状态锁定

**位置**：[TarotGame.js:510-514,521-546](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/TarotGame.js#L510-L514)

**问题分析**：
- grabCard()设置state='grabbing'，启动animateCardTo(0.5秒)→回调设置state='showing'→启动flipCard(0.8秒)
- 问题：在这1.3秒动画期间，如果是鼠标模式：
  - onMouseClick检查state === 'grabbing' || 'showing'就调用confirmCard()
  - 用户在卡牌还没翻过来的时候点击，会提前confirm，卡牌直接消失播粒子
- 手势模式同理：如果动画期间检测到FIST（虽然FIST需要gestureChanged，但如果握拳时机刚好在grab动画期间），也会提前确认

**影响场景**：操作快的用户可能在翻牌动画没完成时就二次点击/握拳，牌没看见就化成灰了。

---

#### 风险9：测试覆盖未真正保护交互状态机

**位置**：[tests/gameLogic.test.js:104-125](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gameLogic.test.js#L104-L125)

**问题分析**：
1. **测试只验证数据结构，不验证真实状态转换逻辑**：
   - validTransitions是测试文件里写死的一个对象，只检查对象字面量包含关系
   - 完全没有导入/实例化TarotGame或CardManager
   - 没有模拟真实的事件序列测试状态迁移合法性
2. **手势测试代码与实际代码不一致**：
   - [gestureRecognition.test.js:67](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/tests/gestureRecognition.test.js#L67) 中PINCH阈值是 `thumbToIndex < 0.08`
   - 实际HandTracker.js中PINCH阈值是 `thumbToIndex < 0.12`（[HandTracker.js:232](file:///Users/huwenjie/项目/gsb/gsb-01862/frontend-user/js/HandTracker.js#L232)）
   - 测试中PINCH判断还在POINT分支内，实际代码PINCH在POINT之前判断且独立于手指伸展数
   - **测试的手势识别算法与实际生产代码是两份不同实现！**
3. **测试环境为node**（package.json:testEnvironment:node），无法测试DOM/Three.js/MediaPipe
4. **没有测试**：
   - CardManager.drawCard()去重逻辑（只测了一个简化版数组filter）
   - 状态机在非法输入下的防御性
   - 粒子系统生命周期
   - 模式切换降级
   - 纹理加载降级路径

**影响场景**：状态机核心逻辑改动后测试无法捕捉回归；手势阈值调优后测试仍基于旧值通过。

---

## 五、建议验证步骤

### 5.1 核心流程验证

| 验证项 | 操作步骤 | 预期结果 |
|--------|---------|---------|
| 完整抽卡链路(鼠标) | 页面加载→点击卡牌→等翻牌→再次点击 | 状态按idle→grabbing→showing→confirmed→idle流转；粒子播放后下一张出现 |
| 完整抽卡链路(手势) | 切手势→允许摄像头→✋张手→🤏对准捏合→✊握拳 | OPEN→ready→PINCH→grabbing→FIST→confirmed |
| 去重验证 | 连续抽5-10张 | 剩余计数递减；历史记录无重复牌；不会抽到同一张两次 |
| 正逆位分布 | 抽20张统计 | 约10正10逆；逆位时卡牌视觉旋转180°；含义对应正确 |
| 78张抽完 | 模拟抽完全部（可改代码快速测试） | 提示"所有卡牌已抽完"；不再生成新牌 |

### 5.2 降级与容错验证

| 验证项 | 操作步骤 | 预期结果 |
|--------|---------|---------|
| 摄像头拒绝 | 切手势模式→权限弹窗选拒绝 | alert提示→自动切回鼠标模式；hint显示提示文字 |
| 非HTTPS访问 | http://(非localhost)打开→切手势 | alert提示需要HTTPS/localhost；不崩溃 |
| 断网加载 | 离线打开页面 | 牌背用内联SVG；牌面用Canvas生成占位；历史缩略图onerror隐藏图片 |
| 浏览器不支持WebGL | 用极旧浏览器或模拟 | 显示红色"不支持WebGL"提示；不执行后续初始化 |

### 5.3 风险点专项验证

| 风险项 | 验证操作 |
|--------|---------|
| PINCH抖动误触 | 在ready状态快速捏合-松开-捏合，观察是否多次触发grab |
| PINCH→FIST过渡 | 捏合着慢慢握拳，观察是否在半握时误触发confirm |
| 快速二次点击 | grab动画期间快速连点，观察是否提前confirm没看见牌面 |
| 慢速网络纹理 | Chrome DevTools设为Slow 3G，抽牌观察贴图替换是否正确翻面 |
| 粒子多次播放 | 连续抽10张以上，观察Chrome Task Manager内存是否持续增长 |
| 手势丢失 | grabbing状态下手移出画面再移回，观察光标和卡牌位置 |

### 5.4 测试改进建议

1. **对齐手势算法**：将HandTracker的recognizeGesture导出，测试直接import而非重复实现
2. **状态机单元测试**：抽离状态转换逻辑为纯函数，node环境可测试
3. **CardManager单元测试**：在测试中mock THREE，验证drawCard/reset/dispose逻辑
4. **集成测试**：考虑用puppeteer/playwright做E2E（但MediaPipe在无头浏览器有问题）
5. **测试阈值同步**：与生产代码共享手势阈值常量，避免硬编码两份

---

## 六、代码质量观察总结

### 做得好的方面：
1. **模块职责划分清晰**：TarotGame协调、CardManager管牌、HandTracker管手势、ParticleSystem管特效，分层合理
2. **资源降级完善**：纹理三级降级、摄像头多层降级，容错考虑周全
3. **Three.js资源管理**：CardManager/ParticleSystem都实现了dispose()释放geometry/material
4. **手势防抖和平滑**：有3帧缓冲+位置平滑，基础稳定性有考虑
5. **代码可读性强**：命名规范，注释到位，状态常量语义清晰

### 需要关注的架构债务：
1. 状态转换缺少防御性校验，非法转换没有日志或保护
2. 手势处理逻辑中不同触发条件（沿/电平）混用，缺少明确注释说明设计意图
3. 材质索引硬编码耦合、userData属性无类型定义
4. 没有状态变更事件/钩子，UI更新分散在各处
5. 测试与生产代码存在"两份实现"的漂移风险
