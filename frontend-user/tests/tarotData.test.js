/**
 * 塔罗牌数据测试
 */
const fs = require('fs');
const path = require('path');

// 读取并执行脚本获取全局变量
const scriptContent = fs.readFileSync(
  path.resolve(__dirname, '../js/tarotData.js'),
  'utf-8'
);

const fn = new Function(`
  ${scriptContent}
  return { TAROT_DATA, getAllCards, getCardImageUrl, CARD_BACK_URL, CARD_BACK_FALLBACK };
`);

const { TAROT_DATA, getAllCards, getCardImageUrl, CARD_BACK_URL, CARD_BACK_FALLBACK } = fn();

describe('TAROT_DATA 数据结构', () => {
  test('应包含大阿尔卡纳22张', () => {
    expect(TAROT_DATA.majorArcana).toHaveLength(22);
  });

  test('应包含权杖14张', () => {
    expect(TAROT_DATA.wands).toHaveLength(14);
  });

  test('应包含圣杯14张', () => {
    expect(TAROT_DATA.cups).toHaveLength(14);
  });

  test('应包含宝剑14张', () => {
    expect(TAROT_DATA.swords).toHaveLength(14);
  });

  test('应包含星币14张', () => {
    expect(TAROT_DATA.pentacles).toHaveLength(14);
  });

  test('每张卡牌应有完整属性', () => {
    const allCards = [
      ...TAROT_DATA.majorArcana,
      ...TAROT_DATA.wands,
      ...TAROT_DATA.cups,
      ...TAROT_DATA.swords,
      ...TAROT_DATA.pentacles
    ];
    
    allCards.forEach(card => {
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('name');
      expect(card).toHaveProperty('nameEn');
      expect(card).toHaveProperty('upright');
      expect(card).toHaveProperty('reversed');
      expect(typeof card.upright).toBe('string');
      expect(typeof card.reversed).toBe('string');
      expect(card.upright.length).toBeGreaterThan(0);
      expect(card.reversed.length).toBeGreaterThan(0);
    });
  });
});

describe('getAllCards 函数', () => {
  test('应返回78张卡牌', () => {
    const cards = getAllCards();
    expect(cards).toHaveLength(78);
  });

  test('卡牌ID应从0到77连续', () => {
    const cards = getAllCards();
    const ids = cards.map(c => c.id).sort((a, b) => a - b);
    
    for (let i = 0; i < 78; i++) {
      expect(ids[i]).toBe(i);
    }
  });
});

describe('getCardImageUrl 函数', () => {
  test('应返回包含local和online的对象', () => {
    const urls = getCardImageUrl(0);
    expect(urls).toHaveProperty('local');
    expect(urls).toHaveProperty('online');
  });

  test('本地路径格式正确', () => {
    const urls = getCardImageUrl(5);
    expect(urls.local).toBe('assets/cards/5.jpg');
  });

  test('在线URL应指向GitHub', () => {
    const urls = getCardImageUrl(0);
    expect(urls.online).toContain('raw.githubusercontent.com');
  });

  test('所有78张卡牌都有在线URL', () => {
    for (let i = 0; i < 78; i++) {
      const urls = getCardImageUrl(i);
      expect(urls.online).not.toBeNull();
    }
  });
});

describe('牌背资源', () => {
  test('应有牌背URL', () => {
    expect(CARD_BACK_URL).toBeDefined();
    expect(typeof CARD_BACK_URL).toBe('string');
  });

  test('应有牌背备用资源', () => {
    expect(CARD_BACK_FALLBACK).toBeDefined();
    expect(CARD_BACK_FALLBACK).toContain('data:image/svg+xml');
  });
});
