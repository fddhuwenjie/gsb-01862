/**
 * 塔罗游戏核心类
 */
class TarotGame {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cardManager = null;
        this.particleSystem = null;
        this.handTracker = null;
        
        this.mode = 'mouse'; // 'mouse' | 'gesture'
        this.state = 'idle'; // 'idle' | 'ready' | 'grabbing' | 'showing' | 'confirmed'
        
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.clock = new THREE.Clock();
        
        this.cardTargetPosition = new THREE.Vector3(0, 0, 3);
        this.cardIdlePosition = new THREE.Vector3(0, 0, 0);
        this.cardShowPosition = new THREE.Vector3(0, 0, 4);
        
        this.isHovering = false;
        this.animationMixer = null;
        
        // 手势光标指示器
        this.handCursor = null;
        this.handCursorLight = null;
    }

    /**
     * 初始化游戏
     */
    async init() {
        this.initThree();
        this.initLights();
        this.initBackground();
        this.initHandCursor();
        
        this.cardManager = new CardManager(this.scene);
        this.particleSystem = new ParticleSystem(this.scene);
        
        this.bindEvents();
        this.animate();
        
        // 创建初始卡牌
        await this.prepareNextCard();
        
        // 隐藏加载提示
        document.getElementById('loading').classList.add('hidden');
        
        this.updateUI();
    }

    /**
     * 初始化手势光标指示器
     */
    initHandCursor() {
        // 创建光标圆环
        const geometry = new THREE.RingGeometry(0.15, 0.2, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        this.handCursor = new THREE.Mesh(geometry, material);
        this.handCursor.position.z = 5;
        this.handCursor.visible = false;
        this.scene.add(this.handCursor);
        
        // 创建光标点光源
        this.handCursorLight = new THREE.PointLight(0x00ffff, 0.5, 3);
        this.handCursorLight.visible = false;
        this.scene.add(this.handCursorLight);
    }
    /**
     * 初始化Three.js
     */
    initThree() {
        // 场景
        this.scene = new THREE.Scene();
        
        // 相机
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 8);
        this.camera.lookAt(0, 0, 0);
        
        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
    }

    /**
     * 初始化灯光
     */
    initLights() {
        // 环境光
        const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambientLight);
        
        // 主光源
        const mainLight = new THREE.DirectionalLight(0xffffff, 1);
        mainLight.position.set(5, 10, 7);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        this.scene.add(mainLight);
        
        // 补光
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
        fillLight.position.set(-5, 5, -5);
        this.scene.add(fillLight);
        
        // 点光源（神秘氛围）
        const pointLight = new THREE.PointLight(0xff6600, 0.5, 20);
        pointLight.position.set(0, -3, 5);
        this.scene.add(pointLight);
    }

    /**
     * 初始化背景
     */
    initBackground() {
        // 星空背景
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 1000;
        const positions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 100;
            positions[i * 3 + 2] = -50 + Math.random() * 30;
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.8
        });
        
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 窗口大小变化
        window.addEventListener('resize', () => this.onResize());
        
        // 鼠标事件
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e));
        
        // 模式切换按钮
        document.getElementById('btn-mouse').addEventListener('click', () => this.setMode('mouse'));
        document.getElementById('btn-gesture').addEventListener('click', () => this.setMode('gesture'));
        
        // 下一张按钮
        document.getElementById('btn-next').addEventListener('click', () => this.onNextCard());
        
        // 历史记录面板切换
        document.getElementById('history-toggle').addEventListener('click', () => {
            document.getElementById('history-content').classList.toggle('hidden');
        });
    }

    /**
     * 设置交互模式
     */
    async setMode(mode) {
        this.mode = mode;
        
        // 更新按钮状态
        document.getElementById('btn-mouse').classList.toggle('active', mode === 'mouse');
        document.getElementById('btn-gesture').classList.toggle('active', mode === 'gesture');
        
        // 手势模式
        if (mode === 'gesture') {
            document.getElementById('gesture-status').classList.remove('hidden');
            document.getElementById('camera-preview').classList.remove('hidden');
            document.getElementById('hint').classList.add('hidden'); // 隐藏底部提示
            
            if (!this.handTracker) {
                this.handTracker = new HandTracker(
                    (gesture) => this.onGestureChange(gesture),
                    (position) => this.onHandMove(position)
                );
                
                const success = await this.handTracker.init();
                if (!success) {
                    // 初始化失败，降级到鼠标模式
                    this.showHint('摄像头权限获取失败，已切换到鼠标模式');
                    this.setMode('mouse');
                    return;
                }
            }
            
            this.handTracker.start();
        } else {
            document.getElementById('gesture-status').classList.add('hidden');
            document.getElementById('camera-preview').classList.add('hidden');
            document.getElementById('hint').classList.remove('hidden'); // 显示底部提示
            
            // 隐藏手势光标
            if (this.handCursor) this.handCursor.visible = false;
            if (this.handCursorLight) this.handCursorLight.visible = false;
            
            if (this.handTracker) {
                this.handTracker.stop();
            }
            
            this.showHint('点击卡牌开始抽卡');
        }
    }

    /**
     * 手势变化回调
     */
    onGestureChange(gesture) {
        // 先处理手势，更新状态
        this.handleGesture(gesture);
        
        // 再更新UI显示
        this.updateGestureUI(gesture);
    }
    
    /**
     * 更新手势UI显示
     */
    updateGestureUI(gesture) {
        const gestureIcon = document.getElementById('gesture-icon');
        const gestureName = document.getElementById('gesture-name');
        const gestureNextText = document.getElementById('gesture-next-text');
        
        // 手势显示映射
        const gestureDisplay = {
            'NONE': { icon: '❓', name: '无手势' },
            'OPEN': { icon: '✋', name: '张开手掌' },
            'PINCH': { icon: '🤏', name: '捏合' },
            'FIST': { icon: '✊', name: '握拳' },
            'POINT': { icon: '👆', name: '指向' }
        };
        
        // 显示当前识别的手势
        const display = gestureDisplay[gesture] || gestureDisplay['NONE'];
        gestureIcon.textContent = display.icon;
        gestureName.textContent = display.name;
        
        // 根据更新后的状态显示下一步提示
        let nextHint = '';
        if (this.state === 'confirmed') {
            nextHint = '等待自动生成下一张...';
        } else if (this.state === 'idle') {
            nextHint = '下一步：✋ 张开手掌 → 准备';
        } else if (this.state === 'ready') {
            nextHint = '下一步：🤏 对准卡牌捏合 → 抓取';
        } else if (this.state === 'grabbing' || this.state === 'showing') {
            nextHint = '下一步：✊ 握拳 → 确认抽卡';
        }
        gestureNextText.textContent = nextHint;
    }

    /**
     * 处理手势
     */
    handleGesture(gesture) {
        // 记录上一个手势，用于检测手势切换
        const prevGesture = this._prevGesture || 'NONE';
        const gestureChanged = gesture !== prevGesture;
        this._prevGesture = gesture;
        
        // 确认状态下不需要额外操作，会自动进入下一张
        if (this.state === 'confirmed') {
            return;
        }
        
        switch (gesture) {
            case 'OPEN':
                // 张开手掌，进入准备状态（只在手势变化时触发）
                if (gestureChanged && this.state === 'idle') {
                    this.state = 'ready';
                }
                break;
                
            case 'PINCH':
                // 捏合，射线命中卡牌后抓取（持续检测，不仅在手势变化时）
                if ((this.state === 'ready' || this.state === 'idle') && this.cardManager.cardMesh) {
                    this.raycaster.setFromCamera(this.mouse, this.camera);
                    const intersects = this.raycaster.intersectObject(this.cardManager.cardMesh);
                    if (intersects.length > 0) {
                        this.state = 'grabbing';
                        this.grabCard();
                    }
                }
                break;
                
            case 'FIST':
                // 握拳，确认抽卡（只在手势变化时触发）
                if (gestureChanged && (this.state === 'grabbing' || this.state === 'showing')) {
                    this.confirmCard();
                }
                break;
                
            case 'POINT':
                // 食指指向，悬停高亮并停止惯性
                if (this.cardManager.cardMesh) {
                    this.highlightCard(true);
                    // 停止惯性：立即将卡牌速度归零
                    this._cardVelocity = { x: 0, y: 0 };
                }
                break;
                
            default:
                this.highlightCard(false);
                break;
        }
    }

    /**
     * 手部移动回调
     */
    onHandMove(position) {
        if (this.mode !== 'gesture') return;
        
        // 将手部位置映射到屏幕坐标
        this.mouse.x = position.x * 2 - 1;
        this.mouse.y = -(position.y * 2 - 1);
        
        // 更新手势光标位置
        this.updateHandCursor();
        
        // 如果正在抓取，移动卡牌（带惯性）
        if (this.state === 'grabbing' && this.cardManager.cardMesh) {
            const targetX = (position.x - 0.5) * 4;
            const targetY = (0.5 - position.y) * 3;
            
            // 计算速度（用于惯性）
            const dx = targetX - this.cardManager.cardMesh.position.x;
            const dy = targetY - this.cardManager.cardMesh.position.y;
            this._cardVelocity = { x: dx * 0.1, y: dy * 0.1 };
            
            this.cardManager.cardMesh.position.x += this._cardVelocity.x;
            this.cardManager.cardMesh.position.y += this._cardVelocity.y;
        }
    }
    
    /**
     * 更新手势光标
     */
    updateHandCursor() {
        if (!this.handCursor || this.mode !== 'gesture') {
            if (this.handCursor) this.handCursor.visible = false;
            if (this.handCursorLight) this.handCursorLight.visible = false;
            return;
        }
        
        // 显示光标
        this.handCursor.visible = true;
        this.handCursorLight.visible = true;
        
        // 将屏幕坐标转换为3D位置
        const vector = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5);
        vector.unproject(this.camera);
        const dir = vector.sub(this.camera.position).normalize();
        const distance = (5 - this.camera.position.z) / dir.z;
        const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));
        
        this.handCursor.position.copy(pos);
        this.handCursorLight.position.copy(pos);
        
        // 射线检测是否对准卡牌
        this.raycaster.setFromCamera(this.mouse, this.camera);
        let isOnCard = false;
        
        if (this.cardManager.cardMesh && this.state !== 'confirmed') {
            const intersects = this.raycaster.intersectObject(this.cardManager.cardMesh);
            isOnCard = intersects.length > 0;
        }
        
        // 根据是否对准卡牌改变颜色
        if (isOnCard) {
            this.handCursor.material.color.setHex(0x00ff00); // 绿色 - 对准了
            this.handCursorLight.color.setHex(0x00ff00);
            this.handCursor.scale.setScalar(1.2);
        } else {
            this.handCursor.material.color.setHex(0x00ffff); // 青色 - 未对准
            this.handCursorLight.color.setHex(0x00ffff);
            this.handCursor.scale.setScalar(1);
        }
    }

    /**
     * 鼠标移动
     */
    onMouseMove(event) {
        if (this.mode !== 'mouse') return;
        
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // 射线检测
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        if (this.cardManager.cardMesh && this.state !== 'confirmed') {
            const intersects = this.raycaster.intersectObject(this.cardManager.cardMesh);
            this.highlightCard(intersects.length > 0);
        }
    }

    /**
     * 鼠标点击
     */
    onMouseClick(event) {
        if (this.mode !== 'mouse') return;
        if (this.state === 'confirmed') return;
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        if (this.cardManager.cardMesh) {
            const intersects = this.raycaster.intersectObject(this.cardManager.cardMesh);
            
            if (intersects.length > 0) {
                if (this.state === 'idle' || this.state === 'ready') {
                    this.grabCard();
                } else if (this.state === 'grabbing' || this.state === 'showing') {
                    this.confirmCard();
                }
            }
        }
    }

    /**
     * 准备下一张卡牌
     */
    async prepareNextCard() {
        const card = await this.cardManager.drawCard();
        
        if (!card) {
            this.showHint('所有卡牌已抽完！');
            return;
        }
        
        this.cardManager.createCardMesh(card, true);
        this.cardManager.cardMesh.position.copy(this.cardIdlePosition);
        
        // 添加轻微浮动动画
        this.cardFloatAnimation();
        
        // 重置状态
        this.state = 'idle';
        this._prevGesture = null; // 重置手势记录，允许重新开始
        this._fistForNext = false;
        
        this.updateUI();
    }

    /**
     * 卡牌浮动动画
     */
    cardFloatAnimation() {
        if (!this.cardManager.cardMesh) return;
        
        const mesh = this.cardManager.cardMesh;
        const startY = mesh.position.y;
        
        const animate = () => {
            if (!this.cardManager.cardMesh || this.state !== 'idle') return;
            
            const time = this.clock.getElapsedTime();
            mesh.position.y = startY + Math.sin(time * 2) * 0.1;
            mesh.rotation.y = Math.sin(time * 0.5) * 0.05;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }

    /**
     * 抓取卡牌
     */
    grabCard() {
        if (!this.cardManager.cardMesh) return;
        
        this.state = 'grabbing';
        
        // 动画：卡牌移向相机
        this.animateCardTo(this.cardShowPosition, 0.5, () => {
            this.state = 'showing';
            this.flipCard();
        });
        
        this.showHint(this.mode === 'gesture' ? '握拳确认抽卡' : '再次点击确认');
    }

    /**
     * 翻转卡牌
     */
    flipCard() {
        if (!this.cardManager.cardMesh) return;
        
        const mesh = this.cardManager.cardMesh;
        const targetRotation = Math.PI;
        const duration = 0.8;
        const startRotation = mesh.rotation.y;
        const startTime = this.clock.getElapsedTime();
        
        const animate = () => {
            const elapsed = this.clock.getElapsedTime() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            
            mesh.rotation.y = startRotation + (targetRotation - startRotation) * eased;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // 翻牌完成后，应用逆位旋转
                this.cardManager.applyReversedRotation();
            }
        };
        
        animate();
    }

    /**
     * 确认抽卡
     */
    confirmCard() {
        if (!this.cardManager.cardMesh || !this.cardManager.currentCard) return;
        
        this.state = 'confirmed';
        
        const card = this.cardManager.currentCard;
        
        // 显示卡牌信息
        this.showCardInfo(card);
        
        // 添加到历史记录
        this.addToHistory(card);
        
        // 创建灰烬粒子效果
        this.particleSystem.createAshParticles(this.cardManager.cardMesh, () => {
            // 粒子效果完成后，自动生成下一张卡牌
            this.autoNextCard();
        });
        
        // 隐藏卡牌
        this.cardManager.cardMesh.visible = false;
        
        this.showHint('');
    }
    
    /**
     * 自动生成下一张卡牌（粒子效果完成后调用）
     */
    async autoNextCard() {
        // 隐藏卡牌信息面板
        document.getElementById('card-info').classList.add('hidden');
        
        // 清理当前卡牌
        if (this.cardManager.cardMesh) {
            this.scene.remove(this.cardManager.cardMesh);
            this.cardManager.cardMesh = null;
        }
        
        // 准备下一张
        await this.prepareNextCard();
        
        this.showHint(this.mode === 'gesture' ? '张开手掌开始抽卡' : '点击卡牌开始抽卡');
    }

    /**
     * 下一张卡牌
     */
    async onNextCard() {
        // 隐藏卡牌信息面板
        document.getElementById('card-info').classList.add('hidden');
        
        // 清理当前卡牌
        if (this.cardManager.cardMesh) {
            this.scene.remove(this.cardManager.cardMesh);
            this.cardManager.cardMesh = null;
        }
        
        // 准备下一张
        await this.prepareNextCard();
        
        this.showHint(this.mode === 'gesture' ? '张开手掌开始抽卡' : '点击卡牌开始抽卡');
    }

    /**
     * 显示卡牌信息
     */
    showCardInfo(card) {
        const panel = document.getElementById('card-info');
        const nameEl = document.getElementById('card-name');
        const orientEl = document.getElementById('card-orientation');
        const meaningEl = document.getElementById('card-meaning');
        
        nameEl.textContent = `#${card.id} ${card.name}`;
        
        orientEl.textContent = card.orientation === 'upright' ? '正位' : '逆位';
        orientEl.className = card.orientation;
        
        meaningEl.textContent = card.meaning;
        
        panel.classList.remove('hidden');
    }

    /**
     * 添加到历史记录
     */
    addToHistory(card) {
        const historyPanel = document.getElementById('history-panel');
        const historyList = document.getElementById('history-list');
        
        // 显示历史记录面板
        historyPanel.classList.remove('hidden');
        
        // 获取卡牌图片URL
        const imageUrls = getCardImageUrl(card.id);
        const imageUrl = imageUrls.online || imageUrls.local;
        
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="card-mini">
                <img src="${imageUrl}" alt="${card.name}" class="card-mini-img ${card.orientation === 'reversed' ? 'reversed' : ''}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="card-mini-inner" style="display: none;">
                    <span class="card-mini-id">#${card.id}</span>
                </div>
            </div>
            <div class="card-details">
                <div class="card-title">${card.name}</div>
                <div class="card-orient ${card.orientation}">${card.orientation === 'upright' ? '正位' : '逆位'}</div>
            </div>
        `;
        
        historyList.insertBefore(item, historyList.firstChild);
    }

    /**
     * 高亮卡牌
     */
    highlightCard(highlight) {
        if (!this.cardManager.cardMesh) return;
        
        if (highlight !== this.isHovering) {
            this.isHovering = highlight;
            
            const scale = highlight ? 1.05 : 1;
            this.cardManager.cardMesh.scale.setScalar(scale);
        }
    }

    /**
     * 动画移动卡牌
     */
    animateCardTo(targetPosition, duration, onComplete) {
        if (!this.cardManager.cardMesh) return;
        
        const mesh = this.cardManager.cardMesh;
        const startPosition = mesh.position.clone();
        const startTime = this.clock.getElapsedTime();
        
        const animate = () => {
            const elapsed = this.clock.getElapsedTime() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            
            mesh.position.lerpVectors(startPosition, targetPosition, eased);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else if (onComplete) {
                onComplete();
            }
        };
        
        animate();
    }

    /**
     * 显示提示
     */
    showHint(text) {
        const hint = document.getElementById('hint');
        const hintText = document.getElementById('hint-text');
        
        if (text) {
            hintText.textContent = text;
            hint.classList.remove('hidden');
        } else {
            hint.classList.add('hidden');
        }
    }

    /**
     * 更新UI
     */
    updateUI() {
        document.getElementById('remaining-count').textContent = this.cardManager.getRemainingCount();
    }

    /**
     * 窗口大小变化
     */
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * 动画循环
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const deltaTime = this.clock.getDelta();
        
        // 更新粒子系统
        this.particleSystem.update(deltaTime);
        
        // 渲染
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * 释放资源
     */
    dispose() {
        if (this.handTracker) {
            this.handTracker.dispose();
        }
        
        this.cardManager.dispose();
        this.particleSystem.dispose();
        
        this.renderer.dispose();
    }
}
