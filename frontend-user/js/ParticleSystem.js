/**
 * 粒子系统 - 灰烬效果
 */
class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particleSystems = [];
    }

    /**
     * 从卡牌几何体创建灰烬粒子
     */
    createAshParticles(cardMesh, onComplete) {
        const geometry = cardMesh.geometry;
        const position = cardMesh.position.clone();
        const rotation = cardMesh.rotation.clone();
        
        // 采样点数量
        const particleCount = 2000;
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const alphas = new Float32Array(particleCount);
        const lifetimes = new Float32Array(particleCount);
        
        // 从几何体获取顶点数据进行采样
        const positionAttr = geometry.getAttribute('position');
        const vertexCount = positionAttr.count;
        
        // 获取卡牌尺寸用于表面采样
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        const cardWidth = bbox.max.x - bbox.min.x;
        const cardHeight = bbox.max.y - bbox.min.y;
        const cardDepth = bbox.max.z - bbox.min.z;
        
        // 初始化粒子 - 从几何体表面采样
        for (let i = 0; i < particleCount; i++) {
            let x, y, z;
            
            // 混合采样：50%从顶点采样，50%从表面插值采样
            if (i % 2 === 0 && vertexCount > 0) {
                // 从顶点采样
                const vertexIndex = Math.floor(Math.random() * vertexCount);
                x = positionAttr.getX(vertexIndex);
                y = positionAttr.getY(vertexIndex);
                z = positionAttr.getZ(vertexIndex);
                // 添加微小扰动
                x += (Math.random() - 0.5) * 0.1;
                y += (Math.random() - 0.5) * 0.1;
                z += (Math.random() - 0.5) * 0.02;
            } else {
                // 从表面插值采样（在卡牌正反面）
                x = (Math.random() - 0.5) * cardWidth;
                y = (Math.random() - 0.5) * cardHeight;
                // 随机选择正面或背面
                z = Math.random() < 0.5 ? cardDepth / 2 : -cardDepth / 2;
                z += (Math.random() - 0.5) * 0.01;
            }
            
            // 应用卡牌的位置和旋转
            const vec = new THREE.Vector3(x, y, z);
            vec.applyEuler(rotation);
            vec.add(position);
            
            positions[i * 3] = vec.x;
            positions[i * 3 + 1] = vec.y;
            positions[i * 3 + 2] = vec.z;
            
            // 速度：主要向上，带有随机扰动
            velocities[i * 3] = (Math.random() - 0.5) * 0.5;
            velocities[i * 3 + 1] = Math.random() * 1.5 + 0.5; // 向上
            velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
            
            // 随机大小
            sizes[i] = Math.random() * 0.08 + 0.02;
            
            // 初始透明度
            alphas[i] = 1.0;
            
            // 随机寿命
            lifetimes[i] = Math.random() * 2 + 1;
        }
        
        // 创建BufferGeometry
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        particleGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        
        // 着色器材质
        const particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0xff6600) }
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying float vAlpha;
                
                void main() {
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                varying float vAlpha;
                
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;
                    
                    float glow = 1.0 - dist * 2.0;
                    vec3 finalColor = mix(color, vec3(1.0, 0.9, 0.5), glow * 0.5);
                    gl_FragColor = vec4(finalColor, vAlpha * glow);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(particles);
        
        // 粒子系统数据
        const system = {
            mesh: particles,
            geometry: particleGeometry,
            material: particleMaterial,
            velocities: velocities,
            lifetimes: lifetimes,
            maxLifetimes: lifetimes.slice(),
            time: 0,
            duration: 3,
            onComplete: onComplete
        };
        
        this.particleSystems.push(system);
        
        return system;
    }

    /**
     * 更新所有粒子系统
     */
    update(deltaTime) {
        const systemsToRemove = [];
        
        for (const system of this.particleSystems) {
            system.time += deltaTime;
            system.material.uniforms.time.value = system.time;
            
            const positions = system.geometry.attributes.position.array;
            const sizes = system.geometry.attributes.size.array;
            const alphas = system.geometry.attributes.alpha.array;
            const velocities = system.velocities;
            const lifetimes = system.lifetimes;
            const maxLifetimes = system.maxLifetimes;
            
            const particleCount = positions.length / 3;
            let allDead = true;
            
            for (let i = 0; i < particleCount; i++) {
                if (lifetimes[i] <= 0) continue;
                
                allDead = false;
                lifetimes[i] -= deltaTime;
                
                // 湍流噪声
                const turbulence = this.turbulenceNoise(
                    positions[i * 3],
                    positions[i * 3 + 1],
                    system.time
                );
                
                // 更新位置
                positions[i * 3] += velocities[i * 3] * deltaTime + turbulence.x * 0.1;
                positions[i * 3 + 1] += velocities[i * 3 + 1] * deltaTime;
                positions[i * 3 + 2] += velocities[i * 3 + 2] * deltaTime + turbulence.z * 0.1;
                
                // 速度衰减
                velocities[i * 3] *= 0.98;
                velocities[i * 3 + 1] *= 0.99;
                velocities[i * 3 + 2] *= 0.98;
                
                // 透明度衰减
                const lifeRatio = lifetimes[i] / maxLifetimes[i];
                alphas[i] = Math.max(0, lifeRatio);
                
                // 大小随寿命变化
                sizes[i] *= 0.995;
            }
            
            system.geometry.attributes.position.needsUpdate = true;
            system.geometry.attributes.size.needsUpdate = true;
            system.geometry.attributes.alpha.needsUpdate = true;
            
            // 检查是否完成
            if (allDead || system.time > system.duration) {
                systemsToRemove.push(system);
            }
        }
        
        // 移除完成的粒子系统
        for (const system of systemsToRemove) {
            this.removeSystem(system);
        }
    }

    /**
     * 简单的湍流噪声
     */
    turbulenceNoise(x, y, t) {
        return {
            x: Math.sin(x * 2 + t * 3) * Math.cos(y * 1.5 + t * 2) * 0.5,
            z: Math.cos(x * 1.5 + t * 2) * Math.sin(y * 2 + t * 3) * 0.5
        };
    }

    /**
     * 移除粒子系统
     */
    removeSystem(system) {
        const index = this.particleSystems.indexOf(system);
        if (index > -1) {
            this.particleSystems.splice(index, 1);
        }
        
        this.scene.remove(system.mesh);
        system.geometry.dispose();
        system.material.dispose();
        
        if (system.onComplete) {
            system.onComplete();
        }
    }

    /**
     * 清理所有粒子系统
     */
    dispose() {
        for (const system of this.particleSystems) {
            this.scene.remove(system.mesh);
            system.geometry.dispose();
            system.material.dispose();
        }
        this.particleSystems = [];
    }
}
