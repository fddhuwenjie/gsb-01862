/**
 * 手势识别模块 - MediaPipe Hands
 */
class HandTracker {
    constructor(onGestureChange, onHandMove) {
        this.onGestureChange = onGestureChange;
        this.onHandMove = onHandMove;
        this.hands = null;
        this.camera = null;
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.isRunning = false;
        this.currentGesture = 'NONE';
        this.handPosition = { x: 0.5, y: 0.5 };
        this.smoothedPosition = { x: 0.5, y: 0.5 };
        this.smoothingFactor = 0.3;
        
        // 手势稳定性检测（防抖）
        this.gestureBuffer = [];
        this.gestureBufferSize = 3; // 降低到3帧，响应更快
        this.lastConfirmedGesture = 'NONE';
    }

    /**
     * 初始化手势识别
     */
    async init() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('hand-canvas');
        this.ctx = this.canvas.getContext('2d');

        try {
            // 检查安全上下文（HTTPS 或 localhost）
            if (!window.isSecureContext) {
                console.warn('手势识别需要安全上下文（HTTPS 或 localhost）');
                alert('手势识别功能需要 HTTPS 或 localhost 环境才能使用摄像头。\n请使用 HTTPS 部署或在本地运行。');
                return false;
            }
            
            // 检查是否支持 getUserMedia
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('浏览器不支持 getUserMedia');
                alert('您的浏览器不支持摄像头功能，请使用现代浏览器（Chrome、Firefox、Safari）。');
                return false;
            }

            // 初始化MediaPipe Hands
            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.3
            });

            this.hands.onResults((results) => this.onResults(results));

            // 请求摄像头权限
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });

            this.video.srcObject = stream;
            await this.video.play();

            // 设置canvas尺寸
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;

            // 初始化Camera工具
            this.camera = new Camera(this.video, {
                onFrame: async () => {
                    if (this.isRunning) {
                        await this.hands.send({ image: this.video });
                    }
                },
                width: 640,
                height: 480
            });

            return true;
        } catch (error) {
            console.error('手势识别初始化失败:', error);
            if (error.name === 'NotAllowedError') {
                alert('摄像头权限被拒绝，请在浏览器设置中允许访问摄像头。');
            } else if (error.name === 'NotFoundError') {
                alert('未检测到摄像头设备。');
            } else {
                alert('手势识别初始化失败: ' + error.message);
            }
            return false;
        }
    }

    /**
     * 开始识别
     */
    start() {
        if (this.camera) {
            this.isRunning = true;
            this.camera.start();
        }
    }

    /**
     * 停止识别
     */
    stop() {
        this.isRunning = false;
        if (this.camera) {
            this.camera.stop();
        }
    }

    /**
     * 处理识别结果
     */
    onResults(results) {
        // 清除画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            
            // 绘制手部关键点
            this.drawHand(landmarks);
            
            // 识别手势（带防抖）
            const rawGesture = this.recognizeGesture(landmarks);
            const stableGesture = this.stabilizeGesture(rawGesture);
            
            if (stableGesture !== this.currentGesture) {
                this.currentGesture = stableGesture;
                if (this.onGestureChange) {
                    this.onGestureChange(stableGesture);
                }
            }
            
            // 获取手掌中心位置
            const palmCenter = this.getPalmCenter(landmarks);
            this.handPosition = { x: 1 - palmCenter.x, y: palmCenter.y }; // 镜像X
            
            // 平滑处理
            this.smoothedPosition.x += (this.handPosition.x - this.smoothedPosition.x) * this.smoothingFactor;
            this.smoothedPosition.y += (this.handPosition.y - this.smoothedPosition.y) * this.smoothingFactor;
            
            if (this.onHandMove) {
                this.onHandMove(this.smoothedPosition);
            }
        } else {
            // 没有检测到手
            if (this.currentGesture !== 'NONE') {
                this.currentGesture = 'NONE';
                if (this.onGestureChange) {
                    this.onGestureChange('NONE');
                }
            }
        }
    }

    /**
     * 绘制手部关键点
     */
    drawHand(landmarks) {
        // 绘制连接线
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],       // 拇指
            [0, 5], [5, 6], [6, 7], [7, 8],       // 食指
            [0, 9], [9, 10], [10, 11], [11, 12],  // 中指
            [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
            [0, 17], [17, 18], [18, 19], [19, 20], // 小指
            [5, 9], [9, 13], [13, 17]              // 手掌
        ];

        this.ctx.strokeStyle = '#00ff88';
        this.ctx.lineWidth = 2;

        for (const [i, j] of connections) {
            const p1 = landmarks[i];
            const p2 = landmarks[j];
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x * this.canvas.width, p1.y * this.canvas.height);
            this.ctx.lineTo(p2.x * this.canvas.width, p2.y * this.canvas.height);
            this.ctx.stroke();
        }

        // 绘制关键点
        this.ctx.fillStyle = '#ff6600';
        for (const point of landmarks) {
            this.ctx.beginPath();
            this.ctx.arc(
                point.x * this.canvas.width,
                point.y * this.canvas.height,
                4, 0, Math.PI * 2
            );
            this.ctx.fill();
        }
    }

    /**
     * 识别手势
     */
    recognizeGesture(landmarks) {
        const fingerStates = this.getFingerStates(landmarks);
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        
        // 计算拇指和食指的距离（2D，更稳定）
        const thumbToIndex = this.getDistance2D(thumbTip, indexTip);
        
        // 计算伸展的手指数量（不含拇指）
        const extendedCount = [fingerStates.index, fingerStates.middle, fingerStates.ring, fingerStates.pinky].filter(Boolean).length;
        
        // FIST - 所有手指弯曲（最优先！握拳时拇指食指也会靠近，不能误判为PINCH）
        if (extendedCount === 0) {
            return 'FIST';
        }
        
        // FIST - 只有1根手指伸展且不是食指
        if (extendedCount === 1 && !fingerStates.index) {
            return 'FIST';
        }
        
        // PINCH - 大拇指和食指捏合（优先于OPEN判断）
        // 条件：拇指食指距离很近，且中指、无名指、小指不全伸展
        if (thumbToIndex < 0.12 && !(fingerStates.middle && fingerStates.ring && fingerStates.pinky)) {
            return 'PINCH';
        }
        
        // OPEN - 3根及以上手指伸展
        if (extendedCount >= 3) {
            return 'OPEN';
        }
        
        // POINT - 只有食指伸展
        if (fingerStates.index && !fingerStates.middle && !fingerStates.ring && !fingerStates.pinky) {
            return 'POINT';
        }
        
        // 2根手指的情况
        if (extendedCount === 2) {
            // 食指+中指 = 剪刀手，当POINT
            if (fingerStates.index && fingerStates.middle && !fingerStates.ring && !fingerStates.pinky) {
                return 'POINT';
            }
            return 'OPEN';
        }
        
        return 'NONE';
    }

    /**
     * 获取手指状态（伸展/弯曲）
     */
    getFingerStates(landmarks) {
        // 使用 Y 坐标判断：指尖 Y 小于 PIP Y 表示伸展（屏幕坐标系Y向下）
        // 同时结合距离判断
        
        const wrist = landmarks[0];
        
        // 食指: tip=8, pip=6, mcp=5
        const indexTip = landmarks[8];
        const indexPip = landmarks[6];
        const indexMcp = landmarks[5];
        // 指尖在PIP上方（Y更小）或距离MCP足够远
        const indexExtended = indexTip.y < indexPip.y || 
            this.getDistance(indexTip, indexMcp) > this.getDistance(indexPip, indexMcp) * 1.3;
        
        // 中指: tip=12, pip=10, mcp=9
        const middleTip = landmarks[12];
        const middlePip = landmarks[10];
        const middleMcp = landmarks[9];
        const middleExtended = middleTip.y < middlePip.y ||
            this.getDistance(middleTip, middleMcp) > this.getDistance(middlePip, middleMcp) * 1.3;
        
        // 无名指: tip=16, pip=14, mcp=13
        const ringTip = landmarks[16];
        const ringPip = landmarks[14];
        const ringMcp = landmarks[13];
        const ringExtended = ringTip.y < ringPip.y ||
            this.getDistance(ringTip, ringMcp) > this.getDistance(ringPip, ringMcp) * 1.3;
        
        // 小指: tip=20, pip=18, mcp=17
        const pinkyTip = landmarks[20];
        const pinkyPip = landmarks[18];
        const pinkyMcp = landmarks[17];
        const pinkyExtended = pinkyTip.y < pinkyPip.y ||
            this.getDistance(pinkyTip, pinkyMcp) > this.getDistance(pinkyPip, pinkyMcp) * 1.3;
        
        // 拇指用X坐标判断（拇指横向伸展）
        const thumbTip = landmarks[4];
        const thumbIp = landmarks[3];
        const thumbMcp = landmarks[2];
        // 拇指指尖X距离手腕比IP更远
        const thumbExtended = Math.abs(thumbTip.x - wrist.x) > Math.abs(thumbIp.x - wrist.x);
        
        return {
            thumb: thumbExtended,
            index: indexExtended,
            middle: middleExtended,
            ring: ringExtended,
            pinky: pinkyExtended
        };
    }
    
    /**
     * 计算两点2D距离（忽略z）
     */
    getDistance2D(p1, p2) {
        return Math.sqrt(
            Math.pow(p1.x - p2.x, 2) + 
            Math.pow(p1.y - p2.y, 2)
        );
    }

    /**
     * 获取手掌中心
     */
    getPalmCenter(landmarks) {
        // 使用手腕和中指根部的中点
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];
        return {
            x: (wrist.x + middleMcp.x) / 2,
            y: (wrist.y + middleMcp.y) / 2
        };
    }

    /**
     * 计算两点距离
     */
    getDistance(p1, p2) {
        return Math.sqrt(
            Math.pow(p1.x - p2.x, 2) + 
            Math.pow(p1.y - p2.y, 2) + 
            Math.pow(p1.z - p2.z, 2)
        );
    }

    /**
     * 手势稳定性检测（防抖）
     * 连续多帧相同手势才确认切换
     */
    stabilizeGesture(rawGesture) {
        // 添加到缓冲区
        this.gestureBuffer.push(rawGesture);
        
        // 保持缓冲区大小
        if (this.gestureBuffer.length > this.gestureBufferSize) {
            this.gestureBuffer.shift();
        }
        
        // 检查缓冲区中是否有足够多的相同手势
        const gestureCounts = {};
        for (const g of this.gestureBuffer) {
            gestureCounts[g] = (gestureCounts[g] || 0) + 1;
        }
        
        // 找出出现次数最多的手势
        let maxCount = 0;
        let dominantGesture = this.lastConfirmedGesture;
        
        for (const [gesture, count] of Object.entries(gestureCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantGesture = gesture;
            }
        }
        
        // 如果主导手势出现次数超过阈值（至少2次），则确认切换
        const threshold = 2; // 降低阈值，响应更快
        if (maxCount >= threshold && dominantGesture !== this.lastConfirmedGesture) {
            this.lastConfirmedGesture = dominantGesture;
        }
        
        return this.lastConfirmedGesture;
    }

    /**
     * 释放资源
     */
    dispose() {
        this.stop();
        if (this.video && this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }
    }
}
