/**
 * 游戏逻辑测试
 */

describe('随机逻辑', () => {
  test('Math.random 应生成 0-1 之间的数', () => {
    for (let i = 0; i < 100; i++) {
      const rand = Math.random();
      expect(rand).toBeGreaterThanOrEqual(0);
      expect(rand).toBeLessThan(1);
    }
  });

  test('正逆位应约各占50%', () => {
    let uprightCount = 0;
    let reversedCount = 0;
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      if (Math.random() < 0.5) {
        reversedCount++;
      } else {
        uprightCount++;
      }
    }

    const ratio = uprightCount / iterations;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });
});

describe('洗牌算法', () => {
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  test('洗牌后数组长度不变', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffleArray(original);
    expect(shuffled).toHaveLength(original.length);
  });

  test('洗牌后包含所有原始元素', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = shuffleArray(original);
    original.forEach(item => {
      expect(shuffled).toContain(item);
    });
  });

  test('洗牌应产生不同顺序', () => {
    const original = Array.from({ length: 78 }, (_, i) => i);
    const shuffled = shuffleArray(original);
    
    let samePositionCount = 0;
    for (let i = 0; i < original.length; i++) {
      if (original[i] === shuffled[i]) {
        samePositionCount++;
      }
    }
    
    expect(samePositionCount).toBeLessThan(original.length * 0.5);
  });
});

describe('卡牌抽取逻辑', () => {
  test('抽取后卡牌应从可用池中移除', () => {
    const deck = [
      { id: 0, drawn: false },
      { id: 1, drawn: false },
      { id: 2, drawn: false }
    ];

    const availableCards = deck.filter(c => !c.drawn);
    const randomIndex = Math.floor(Math.random() * availableCards.length);
    const drawnCard = availableCards[randomIndex];
    drawnCard.drawn = true;

    const remainingCards = deck.filter(c => !c.drawn);
    expect(remainingCards).toHaveLength(2);
    expect(remainingCards).not.toContainEqual(drawnCard);
  });

  test('抽完所有卡牌后应无可用卡牌', () => {
    const deck = [
      { id: 0, drawn: false },
      { id: 1, drawn: false },
      { id: 2, drawn: false }
    ];

    deck.forEach(card => card.drawn = true);

    const availableCards = deck.filter(c => !c.drawn);
    expect(availableCards).toHaveLength(0);
  });
});

describe('状态机逻辑', () => {
  const validTransitions = {
    'idle': ['ready', 'grabbing'],
    'ready': ['grabbing', 'idle'],
    'grabbing': ['showing'],
    'showing': ['confirmed'],
    'confirmed': ['idle']
  };

  test('状态转换应符合预期流程', () => {
    expect(validTransitions['idle']).toContain('ready');
    expect(validTransitions['ready']).toContain('grabbing');
    expect(validTransitions['grabbing']).toContain('showing');
    expect(validTransitions['showing']).toContain('confirmed');
    expect(validTransitions['confirmed']).toContain('idle');
  });

  test('不应有无效的状态转换', () => {
    expect(validTransitions['confirmed']).not.toContain('grabbing');
    expect(validTransitions['idle']).not.toContain('confirmed');
  });
});
