# 塔罗抽卡游戏 (Three.js)

基于Three.js的3D塔罗抽卡游戏，支持手势识别和鼠标两种交互模式。

## How to Run

### 方式一：直接打开（无需构建）
双击 `frontend-user/index.html` 在浏览器中打开即可运行。

### 方式二：本地服务器（推荐，手势识别需要HTTPS）

> ⚠️ **重要提示**：手势识别功能需要 **HTTPS 或 localhost** 环境才能访问摄像头。直接用 `file://` 协议打开或部署到非 HTTPS 服务器将无法使用手势模式。

```bash
# 使用Python
cd frontend-user
python -m http.server 8080

# 或使用Node.js
npx serve -p 8080
```
然后访问 `http://localhost:8080`

### 方式三：使用 npm 脚本启动
```bash
cd frontend-user
npm install
npm run dev
```

### 方式四：Docker运行
```bash
docker compose up --build -d
```
访问 `http://localhost:8082`

## 开发与测试

```bash
cd frontend-user

# 安装依赖
npm install

# 启动开发服务器（使用 serve）
npm run dev

# 运行测试
npm run test

# 运行测试（监听模式）
npm run test:watch

# 生成测试覆盖率报告
npm run test:coverage
```

## Services

| 服务 | 端口 | 说明 |
|------|------|------|
| frontend | 8082 | Nginx静态文件服务 |

## 题目内容

生成塔罗抽卡游戏(Three.js)，集成MediaPipeHands（摄像头权限失败自动降级鼠标模式，提供手势/鼠标切换按钮)。手势逻辑（除左右移动外）：OPEN 手掌=进入待抽牌状态/允许抽取；PINCH 捏合=射线命中卡牌后抓取并拉到镜头前悬停展示；FIST 握拳=确认抽牌并锁定结果；可选 POINT 食指=悬停高亮/停止惯性。随机逻辑：每次抽取从未抽过牌库随机选1张，同时以 Math.random()<0.5 生成 orientation ∈ {upright,reversed}；若reversed则卡牌绕Z轴旋转180°并显示"逆位"，并在UI展示对应含义文本（正/逆两套字段）。卡牌贴图：接入高清 Rider-Waite-Smith经典塔罗牌图源作为正面图（牌背为统一背面图)，支持本地/URL两种加载方式与失败占位。灰烬逻辑：确认后将卡牌几何采样为粒子（Points/InstancedBufferGeometry)，粒子大小随机、透明度与寿命衰减，上飘+轻微湍流噪声，逐帧减少 alpha 并在结束时移除；同时把抽到的牌（含正/逆位与牌名）写入历史记录面板并从牌库移除，自动生成下一张待抽卡。

## 项目介绍

本项目是一个基于Three.js的3D塔罗抽卡游戏，主要特性：

1. **双模式交互**：支持MediaPipe手势识别和鼠标操作，可自由切换
2. **手势识别**：识别张开手掌、捏合、握拳等手势进行抽卡操作
3. **经典塔罗牌**：使用Rider-Waite-Smith经典塔罗牌图案
4. **正逆位系统**：随机生成正位/逆位，显示对应解读
5. **粒子特效**：抽卡确认后卡牌化为灰烬粒子飘散
6. **历史记录**：记录所有抽取的卡牌及其含义

## 操作说明

### 鼠标模式
- 移动鼠标：选择卡牌
- 点击：抽取卡牌
- 再次点击：确认并查看结果

### 手势模式
- 张开手掌(OPEN)：进入待抽牌状态
- 捏合(PINCH)：大拇指与食指捏合，抓取卡牌
- 握拳(FIST)：确认抽牌
- 食指指向(POINT)：悬停高亮

## 部署说明

> ⚠️ **HTTPS 要求**：手势识别功能依赖浏览器的摄像头 API，该 API 仅在安全上下文（HTTPS 或 localhost）中可用。
> 
> - 本地开发：使用 `localhost` 即可正常使用手势功能
> - 线上部署：**必须使用 HTTPS 协议**，否则摄像头权限将被浏览器拒绝，手势模式无法使用
> - 如果在非 HTTPS 环境访问，系统会自动降级为鼠标模式

## 项目结构

```
├── index.html          # 主页面
├── package.json        # 依赖管理与脚本配置
├── css/
│   └── style.css       # 样式文件
├── js/
│   ├── main.js         # 主程序入口
│   ├── TarotGame.js    # 游戏核心类
│   ├── CardManager.js  # 卡牌管理
│   ├── HandTracker.js  # 手势识别
│   ├── ParticleSystem.js # 粒子系统
│   └── tarotData.js    # 塔罗牌数据
├── tests/              # 单元测试（Jest）
│   ├── tarotData.test.js
│   ├── gestureRecognition.test.js
│   └── gameLogic.test.js
├── assets/
│   └── cards/          # 卡牌图片
├── Dockerfile
├── docker-compose.yml
└── README.md
```
