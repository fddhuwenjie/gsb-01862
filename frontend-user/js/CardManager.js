/**
 * 卡牌管理器
 */
class CardManager {
    constructor(scene) {
        this.scene = scene;
        this.textureLoader = new THREE.TextureLoader();
        this.deck = []; // 未抽取的牌库
        this.drawnCards = []; // 已抽取的卡牌
        this.currentCard = null; // 当前展示的卡牌
        this.cardMesh = null; // 当前卡牌网格
        this.cardWidth = 2;
        this.cardHeight = 3;
        this.backTexture = null;
        this.placeholderTexture = null;
        this.loadingTexture = null; // 加载中纹理
        
        this.initDeck();
        this.loadBackTexture();
        this.createLoadingTexture();
    }

    /**
     * 初始化牌库
     */
    initDeck() {
        this.deck = getAllCards().map(card => ({
            ...card,
            drawn: false
        }));
        this.shuffleDeck();
    }

    /**
     * 洗牌
     */
    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    /**
     * 加载牌背纹理
     */
    loadBackTexture() {
        // 创建占位纹理
        this.placeholderTexture = this.createPlaceholderTexture();
        
        // 尝试加载牌背图片
        this.textureLoader.load(
            CARD_BACK_URL,
            (texture) => {
                this.backTexture = texture;
            },
            undefined,
            () => {
                // 加载失败，使用SVG占位
                this.loadFallbackBackTexture();
            }
        );
    }

    /**
     * 加载备用牌背
     */
    loadFallbackBackTexture() {
        const img = new Image();
        img.onload = () => {
            const texture = new THREE.Texture(img);
            texture.needsUpdate = true;
            this.backTexture = texture;
        };
        img.src = CARD_BACK_FALLBACK;
    }

    /**
     * 创建加载中纹理
     */
    createLoadingTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        
        // 背景
        const gradient = ctx.createLinearGradient(0, 0, 200, 300);
        gradient.addColorStop(0, '#3a3a6e');
        gradient.addColorStop(1, '#2a2a5e');
        ctx.fillStyle = gradient;
        this.drawRoundRect(ctx, 0, 0, 200, 300, 10);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 3;
        this.drawRoundRect(ctx, 8, 8, 184, 284, 8);
        ctx.stroke();
        
        // 加载图标（圆环）
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(100, 130, 30, 0, Math.PI * 1.5);
        ctx.stroke();
        
        // 加载文字
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('加载中...', 100, 190);
        
        this.loadingTexture = new THREE.CanvasTexture(canvas);
    }

    /**
     * 绘制圆角矩形（兼容旧浏览器）
     */
    drawRoundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.arcTo(x + width, y, x + width, y + radius, radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        ctx.lineTo(x + radius, y + height);
        ctx.arcTo(x, y + height, x, y + height - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    }

    /**
     * 创建占位纹理
     */
    createPlaceholderTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        
        // 渐变背景
        const gradient = ctx.createLinearGradient(0, 0, 200, 300);
        gradient.addColorStop(0, '#2a2a6e');
        gradient.addColorStop(1, '#1a1a4e');
        ctx.fillStyle = gradient;
        this.drawRoundRect(ctx, 0, 0, 200, 300, 10);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 4;
        this.drawRoundRect(ctx, 10, 10, 180, 280, 8);
        ctx.stroke();
        
        // 问号
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 80px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 100, 150);
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    /**
     * 加载卡牌正面纹理
     * 优先在线图源 -> 本地图片 -> 占位符
     */
    loadCardTexture(cardId) {
        return new Promise((resolve) => {
            const urls = getCardImageUrl(cardId);
            
            // 首先尝试加载在线图源
            if (urls.online) {
                this.textureLoader.load(
                    urls.online,
                    (texture) => {
                        // 在线图片加载成功
                        resolve(texture);
                    },
                    undefined,
                    () => {
                        // 在线加载失败，尝试本地图片
                        this.textureLoader.load(
                            urls.local,
                            (texture) => {
                                // 本地图片加载成功
                                resolve(texture);
                            },
                            undefined,
                            () => {
                                // 本地也失败，使用占位符
                                resolve(this.createCardPlaceholder(cardId));
                            }
                        );
                    }
                );
            } else {
                // 没有在线图源，尝试本地
                this.textureLoader.load(
                    urls.local,
                    (texture) => {
                        resolve(texture);
                    },
                    undefined,
                    () => {
                        resolve(this.createCardPlaceholder(cardId));
                    }
                );
            }
        });
    }

    /**
     * 创建卡牌占位纹理
     */
    createCardPlaceholder(cardId) {
        const card = this.deck.find(c => c.id === cardId) || getAllCards().find(c => c.id === cardId);
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const ctx = canvas.getContext('2d');
        
        // 背景
        const gradient = ctx.createLinearGradient(0, 0, 200, 300);
        gradient.addColorStop(0, '#4a3f6e');
        gradient.addColorStop(1, '#2a2a4e');
        ctx.fillStyle = gradient;
        this.drawRoundRect(ctx, 0, 0, 200, 300, 10);
        ctx.fill();
        
        // 边框
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        this.drawRoundRect(ctx, 8, 8, 184, 284, 8);
        ctx.stroke();
        
        // 卡牌编号
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(cardId).padStart(2, '0'), 100, 40);
        
        // 卡牌名称
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(card ? card.name : 'Unknown', 100, 150);
        
        // 英文名
        if (card && card.nameEn) {
            ctx.font = '14px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillText(card.nameEn, 100, 175);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    /**
     * 抽取一张卡牌
     */
    async drawCard() {
        // 从未抽取的牌中随机选择
        const availableCards = this.deck.filter(c => !c.drawn);
        if (availableCards.length === 0) {
            return null;
        }
        
        const randomIndex = Math.floor(Math.random() * availableCards.length);
        const card = availableCards[randomIndex];
        
        // 随机正逆位
        const isReversed = Math.random() < 0.5;
        
        // 标记为已抽取
        card.drawn = true;
        
        // 先使用加载中纹理，异步加载真实纹理
        const backTexture = this.backTexture || this.placeholderTexture;
        
        // 创建卡牌结果（先用加载中纹理）
        this.currentCard = {
            ...card,
            orientation: isReversed ? 'reversed' : 'upright',
            meaning: isReversed ? card.reversed : card.upright,
            frontTexture: this.loadingTexture || this.placeholderTexture,
            backTexture
        };
        
        this.drawnCards.push(this.currentCard);
        
        // 异步加载真实纹理并更新
        this.loadCardTexture(card.id).then(texture => {
            this.currentCard.frontTexture = texture;
            // 如果卡牌网格已创建，更新材质
            if (this.cardMesh && this.cardMesh.material) {
                const materials = this.cardMesh.material;
                if (Array.isArray(materials)) {
                    // 更新正面和背面材质的贴图
                    materials[4].map = this.cardMesh.userData.showingBack ? backTexture : texture;
                    materials[5].map = this.cardMesh.userData.showingBack ? texture : backTexture;
                    materials[4].needsUpdate = true;
                    materials[5].needsUpdate = true;
                }
            }
        });
        
        return this.currentCard;
    }

    /**
     * 创建卡牌网格
     */
    createCardMesh(card, showBack = true) {
        // 移除旧卡牌
        if (this.cardMesh) {
            this.scene.remove(this.cardMesh);
            this.cardMesh.geometry.dispose();
            if (Array.isArray(this.cardMesh.material)) {
                this.cardMesh.material.forEach(m => m.dispose());
            } else {
                this.cardMesh.material.dispose();
            }
        }
        
        // 创建卡牌几何体
        const geometry = new THREE.BoxGeometry(this.cardWidth, this.cardHeight, 0.02);
        
        // 材质数组：[右, 左, 上, 下, 前(正面), 后(背面)]
        const materials = [
            new THREE.MeshStandardMaterial({ color: 0x333333 }), // 右
            new THREE.MeshStandardMaterial({ color: 0x333333 }), // 左
            new THREE.MeshStandardMaterial({ color: 0x333333 }), // 上
            new THREE.MeshStandardMaterial({ color: 0x333333 }), // 下
            new THREE.MeshStandardMaterial({ 
                map: showBack ? card.backTexture : card.frontTexture,
                roughness: 0.5,
                metalness: 0.1
            }), // 前
            new THREE.MeshStandardMaterial({ 
                map: showBack ? card.frontTexture : card.backTexture,
                roughness: 0.5,
                metalness: 0.1
            })  // 后
        ];
        
        this.cardMesh = new THREE.Mesh(geometry, materials);
        this.cardMesh.castShadow = true;
        this.cardMesh.receiveShadow = true;
        
        // 保存逆位状态和显示状态，翻牌后应用旋转
        this.cardMesh.userData.isReversed = card.orientation === 'reversed';
        this.cardMesh.userData.showingBack = showBack;
        
        this.scene.add(this.cardMesh);
        
        return this.cardMesh;
    }
    
    /**
     * 应用逆位旋转（翻牌后调用）
     * 若reversed则卡牌绕Z轴旋转180°
     */
    applyReversedRotation() {
        if (this.cardMesh && this.cardMesh.userData.isReversed) {
            this.cardMesh.rotation.z = Math.PI;
        }
    }

    /**
     * 获取剩余卡牌数
     */
    getRemainingCount() {
        return this.deck.filter(c => !c.drawn).length;
    }

    /**
     * 重置牌库
     */
    reset() {
        this.deck.forEach(card => card.drawn = false);
        this.drawnCards = [];
        this.currentCard = null;
        this.shuffleDeck();
        
        if (this.cardMesh) {
            this.scene.remove(this.cardMesh);
            this.cardMesh = null;
        }
    }

    /**
     * 释放资源
     */
    dispose() {
        if (this.cardMesh) {
            this.scene.remove(this.cardMesh);
            this.cardMesh.geometry.dispose();
            if (Array.isArray(this.cardMesh.material)) {
                this.cardMesh.material.forEach(m => m.dispose());
            } else {
                this.cardMesh.material.dispose();
            }
        }
        
        if (this.backTexture) this.backTexture.dispose();
        if (this.placeholderTexture) this.placeholderTexture.dispose();
    }
}
