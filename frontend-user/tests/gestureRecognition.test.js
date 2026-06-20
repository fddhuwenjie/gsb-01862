/**
 * 手势识别逻辑测试
 */

/**
 * 手势识别核心算法（从 HandTracker.js 提取）
 */
function getDistance(p1, p2) {
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow(p1.z - p2.z, 2)
  );
}

function getFingerStates(landmarks) {
  const wrist = landmarks[0];

  const indexTip = landmarks[8];
  const indexPip = landmarks[6];
  const indexMcp = landmarks[5];
  const indexExtended = indexTip.y < indexPip.y ||
    getDistance(indexTip, indexMcp) > getDistance(indexPip, indexMcp) * 1.3;

  const middleTip = landmarks[12];
  const middlePip = landmarks[10];
  const middleMcp = landmarks[9];
  const middleExtended = middleTip.y < middlePip.y ||
    getDistance(middleTip, middleMcp) > getDistance(middlePip, middleMcp) * 1.3;

  const ringTip = landmarks[16];
  const ringPip = landmarks[14];
  const ringMcp = landmarks[13];
  const ringExtended = ringTip.y < ringPip.y ||
    getDistance(ringTip, ringMcp) > getDistance(ringPip, ringMcp) * 1.3;

  const pinkyTip = landmarks[20];
  const pinkyPip = landmarks[18];
  const pinkyMcp = landmarks[17];
  const pinkyExtended = pinkyTip.y < pinkyPip.y ||
    getDistance(pinkyTip, pinkyMcp) > getDistance(pinkyPip, pinkyMcp) * 1.3;

  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const thumbExtended = Math.abs(thumbTip.x - wrist.x) > Math.abs(thumbIp.x - wrist.x);

  return {
    thumb: thumbExtended,
    index: indexExtended,
    middle: middleExtended,
    ring: ringExtended,
    pinky: pinkyExtended
  };
}

function recognizeGesture(landmarks) {
  const fingerStates = getFingerStates(landmarks);
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const thumbToIndex = getDistance(thumbTip, indexTip);
  const extendedCount = [fingerStates.index, fingerStates.middle, fingerStates.ring, fingerStates.pinky].filter(Boolean).length;

  if (extendedCount === 0) return 'FIST';
  if (extendedCount === 1 && !fingerStates.index) return 'FIST';
  if (extendedCount >= 3) return 'OPEN';
  if (fingerStates.index && !fingerStates.middle && !fingerStates.ring && !fingerStates.pinky) {
    if (thumbToIndex < 0.08) return 'PINCH';
    return 'POINT';
  }
  if (extendedCount === 2) {
    if (fingerStates.index && fingerStates.middle && !fingerStates.ring && !fingerStates.pinky) {
      return 'POINT';
    }
    return 'OPEN';
  }
  return 'NONE';
}

/**
 * 创建模拟手部关键点
 * 关键：指尖Y > PIP Y 表示弯曲（屏幕坐标系Y向下）
 */
function createMockLandmarks(config) {
  // 初始化21个关键点
  const base = Array(21).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }));
  
  // 手腕位置
  base[0] = { x: 0.5, y: 0.8, z: 0 };
  
  // 拇指关键点 (2=MCP, 3=IP, 4=TIP)
  base[2] = { x: 0.45, y: 0.7, z: 0 };
  base[3] = { x: 0.43, y: 0.68, z: 0 };
  base[4] = { x: 0.41, y: 0.66, z: 0 };

  if (config.fist) {
    // 握拳：所有指尖Y > PIP Y（弯曲向下）
    // 食指 (5=MCP, 6=PIP, 8=TIP)
    base[5] = { x: 0.4, y: 0.6, z: 0 };
    base[6] = { x: 0.4, y: 0.55, z: 0 };
    base[8] = { x: 0.4, y: 0.6, z: 0 };  // TIP.y > PIP.y = 弯曲
    
    // 中指 (9=MCP, 10=PIP, 12=TIP)
    base[9] = { x: 0.5, y: 0.58, z: 0 };
    base[10] = { x: 0.5, y: 0.53, z: 0 };
    base[12] = { x: 0.5, y: 0.58, z: 0 };
    
    // 无名指 (13=MCP, 14=PIP, 16=TIP)
    base[13] = { x: 0.6, y: 0.6, z: 0 };
    base[14] = { x: 0.6, y: 0.55, z: 0 };
    base[16] = { x: 0.6, y: 0.6, z: 0 };
    
    // 小指 (17=MCP, 18=PIP, 20=TIP)
    base[17] = { x: 0.7, y: 0.62, z: 0 };
    base[18] = { x: 0.7, y: 0.57, z: 0 };
    base[20] = { x: 0.7, y: 0.62, z: 0 };
  }

  if (config.open) {
    // 张开：所有指尖Y < PIP Y（伸展向上）
    base[5] = { x: 0.35, y: 0.6, z: 0 };
    base[6] = { x: 0.35, y: 0.5, z: 0 };
    base[8] = { x: 0.35, y: 0.3, z: 0 };  // TIP.y < PIP.y = 伸展
    
    base[9] = { x: 0.45, y: 0.58, z: 0 };
    base[10] = { x: 0.45, y: 0.48, z: 0 };
    base[12] = { x: 0.45, y: 0.28, z: 0 };
    
    base[13] = { x: 0.55, y: 0.6, z: 0 };
    base[14] = { x: 0.55, y: 0.5, z: 0 };
    base[16] = { x: 0.55, y: 0.3, z: 0 };
    
    base[17] = { x: 0.65, y: 0.62, z: 0 };
    base[18] = { x: 0.65, y: 0.52, z: 0 };
    base[20] = { x: 0.65, y: 0.32, z: 0 };
    
    // 拇指伸展
    base[2] = { x: 0.4, y: 0.7, z: 0 };
    base[3] = { x: 0.3, y: 0.65, z: 0 };
    base[4] = { x: 0.2, y: 0.6, z: 0 };
  }

  if (config.point) {
    // 指向：只有食指伸展，其他弯曲
    // 食指伸展
    base[5] = { x: 0.4, y: 0.6, z: 0 };
    base[6] = { x: 0.4, y: 0.5, z: 0 };
    base[8] = { x: 0.4, y: 0.3, z: 0 };
    
    // 中指弯曲
    base[9] = { x: 0.5, y: 0.58, z: 0 };
    base[10] = { x: 0.5, y: 0.53, z: 0 };
    base[12] = { x: 0.5, y: 0.58, z: 0 };
    
    // 无名指弯曲
    base[13] = { x: 0.6, y: 0.6, z: 0 };
    base[14] = { x: 0.6, y: 0.55, z: 0 };
    base[16] = { x: 0.6, y: 0.6, z: 0 };
    
    // 小指弯曲
    base[17] = { x: 0.7, y: 0.62, z: 0 };
    base[18] = { x: 0.7, y: 0.57, z: 0 };
    base[20] = { x: 0.7, y: 0.62, z: 0 };
    
    // 拇指远离食指
    base[4] = { x: 0.2, y: 0.65, z: 0 };
  }

  if (config.pinch) {
    // 捏合：食指伸展 + 拇指食指靠近
    // 食指伸展
    base[5] = { x: 0.4, y: 0.6, z: 0 };
    base[6] = { x: 0.4, y: 0.5, z: 0 };
    base[8] = { x: 0.4, y: 0.35, z: 0 };
    
    // 拇指靠近食指（距离 < 0.08）
    base[4] = { x: 0.42, y: 0.37, z: 0 };
    
    // 其他手指弯曲
    base[9] = { x: 0.5, y: 0.58, z: 0 };
    base[10] = { x: 0.5, y: 0.53, z: 0 };
    base[12] = { x: 0.5, y: 0.58, z: 0 };
    
    base[13] = { x: 0.6, y: 0.6, z: 0 };
    base[14] = { x: 0.6, y: 0.55, z: 0 };
    base[16] = { x: 0.6, y: 0.6, z: 0 };
    
    base[17] = { x: 0.7, y: 0.62, z: 0 };
    base[18] = { x: 0.7, y: 0.57, z: 0 };
    base[20] = { x: 0.7, y: 0.62, z: 0 };
  }

  return base;
}

describe('手势识别', () => {
  test('应识别握拳(FIST)', () => {
    const landmarks = createMockLandmarks({ fist: true });
    expect(recognizeGesture(landmarks)).toBe('FIST');
  });

  test('应识别张开手掌(OPEN)', () => {
    const landmarks = createMockLandmarks({ open: true });
    expect(recognizeGesture(landmarks)).toBe('OPEN');
  });

  test('应识别指向(POINT)', () => {
    const landmarks = createMockLandmarks({ point: true });
    expect(recognizeGesture(landmarks)).toBe('POINT');
  });

  test('应识别捏合(PINCH)', () => {
    const landmarks = createMockLandmarks({ pinch: true });
    expect(recognizeGesture(landmarks)).toBe('PINCH');
  });
});

describe('手指状态检测', () => {
  test('握拳时所有手指应为弯曲状态', () => {
    const landmarks = createMockLandmarks({ fist: true });
    const states = getFingerStates(landmarks);
    expect(states.index).toBe(false);
    expect(states.middle).toBe(false);
    expect(states.ring).toBe(false);
    expect(states.pinky).toBe(false);
  });

  test('张开时所有手指应为伸展状态', () => {
    const landmarks = createMockLandmarks({ open: true });
    const states = getFingerStates(landmarks);
    expect(states.index).toBe(true);
    expect(states.middle).toBe(true);
    expect(states.ring).toBe(true);
    expect(states.pinky).toBe(true);
  });

  test('指向时只有食指伸展', () => {
    const landmarks = createMockLandmarks({ point: true });
    const states = getFingerStates(landmarks);
    expect(states.index).toBe(true);
    expect(states.middle).toBe(false);
    expect(states.ring).toBe(false);
    expect(states.pinky).toBe(false);
  });
});
