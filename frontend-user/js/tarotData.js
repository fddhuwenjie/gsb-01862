/**
 * 塔罗牌数据 - Rider-Waite-Smith 经典78张
 */
const TAROT_DATA = {
    // 大阿尔卡纳 (Major Arcana) 0-21
    majorArcana: [
        {
            id: 0, name: "愚者", nameEn: "The Fool",
            upright: "新的开始、冒险精神、天真无邪、自由自在、无限可能",
            reversed: "鲁莽冲动、缺乏计划、不负责任、愚蠢行为、错失良机"
        },
        {
            id: 1, name: "魔术师", nameEn: "The Magician",
            upright: "创造力、意志力、自信、技能、新机遇",
            reversed: "欺骗、操纵、才能浪费、缺乏自信、计划失败"
        },
        {
            id: 2, name: "女祭司", nameEn: "The High Priestess",
            upright: "直觉、神秘、内在智慧、潜意识、静待时机",
            reversed: "秘密暴露、忽视直觉、表面化、信息隐瞒、混乱"
        },
        {
            id: 3, name: "女皇", nameEn: "The Empress",
            upright: "丰收、母性、创造、自然、富足",
            reversed: "依赖、创造力受阻、过度保护、不孕、停滞"
        },
        {
            id: 4, name: "皇帝", nameEn: "The Emperor",
            upright: "权威、稳定、领导力、父性、结构",
            reversed: "专制、控制欲、僵化、不成熟、缺乏纪律"
        },
        {
            id: 5, name: "教皇", nameEn: "The Hierophant",
            upright: "传统、信仰、教育、指导、精神追求",
            reversed: "打破常规、挑战权威、个人信念、非传统、自由思想"
        },
        {
            id: 6, name: "恋人", nameEn: "The Lovers",
            upright: "爱情、和谐、选择、价值观、伙伴关系",
            reversed: "不和谐、失衡、价值观冲突、错误选择、分离"
        },
        {
            id: 7, name: "战车", nameEn: "The Chariot",
            upright: "胜利、意志力、决心、控制、成功",
            reversed: "失控、缺乏方向、攻击性、失败、障碍"
        },
        {
            id: 8, name: "力量", nameEn: "Strength",
            upright: "勇气、耐心、内在力量、同情心、自制力",
            reversed: "软弱、自我怀疑、缺乏自信、滥用力量、胆怯"
        },
        {
            id: 9, name: "隐士", nameEn: "The Hermit",
            upright: "内省、寻求真理、独处、智慧、指引",
            reversed: "孤立、孤独、偏执、拒绝帮助、迷失方向"
        },
        {
            id: 10, name: "命运之轮", nameEn: "Wheel of Fortune",
            upright: "命运、转折点、好运、周期、机遇",
            reversed: "厄运、抗拒改变、失控、坏运气、停滞"
        },
        {
            id: 11, name: "正义", nameEn: "Justice",
            upright: "公正、真相、因果、法律、平衡",
            reversed: "不公正、不诚实、逃避责任、偏见、失衡"
        },
        {
            id: 12, name: "倒吊人", nameEn: "The Hanged Man",
            upright: "牺牲、新视角、等待、放下、顿悟",
            reversed: "拖延、抗拒、无谓牺牲、停滞不前、自私"
        },
        {
            id: 13, name: "死神", nameEn: "Death",
            upright: "结束、转变、过渡、放下过去、新生",
            reversed: "抗拒改变、停滞、恐惧、依恋过去、无法放手"
        },
        {
            id: 14, name: "节制", nameEn: "Temperance",
            upright: "平衡、耐心、调和、适度、目标",
            reversed: "失衡、过度、缺乏耐心、冲突、不和谐"
        },
        {
            id: 15, name: "恶魔", nameEn: "The Devil",
            upright: "束缚、诱惑、物质主义、阴暗面、依赖",
            reversed: "解脱、打破束缚、觉醒、恢复控制、自由"
        },
        {
            id: 16, name: "塔", nameEn: "The Tower",
            upright: "突变、灾难、觉醒、真相揭露、解放",
            reversed: "逃避灾难、恐惧改变、延迟、内在转变、抗拒"
        },
        {
            id: 17, name: "星星", nameEn: "The Star",
            upright: "希望、灵感、平静、信心、更新",
            reversed: "绝望、缺乏信心、失望、悲观、断开连接"
        },
        {
            id: 18, name: "月亮", nameEn: "The Moon",
            upright: "幻觉、恐惧、潜意识、直觉、不确定",
            reversed: "释放恐惧、真相大白、克服焦虑、清晰、误解消除"
        },
        {
            id: 19, name: "太阳", nameEn: "The Sun",
            upright: "快乐、成功、活力、乐观、真相",
            reversed: "暂时挫折、过度乐观、延迟成功、缺乏热情、阴霾"
        },
        {
            id: 20, name: "审判", nameEn: "Judgement",
            upright: "觉醒、重生、反思、召唤、决定",
            reversed: "自我怀疑、拒绝反思、逃避、后悔、无法原谅"
        },
        {
            id: 21, name: "世界", nameEn: "The World",
            upright: "完成、成就、旅行、圆满、整合",
            reversed: "未完成、缺乏结束、延迟、空虚、寻求结束"
        }
    ],
    
    // 小阿尔卡纳 - 权杖 (Wands)
    wands: [
        { id: 22, name: "权杖王牌", nameEn: "Ace of Wands", upright: "灵感、新机会、创造力、潜力", reversed: "延迟、缺乏动力、错失机会、创意受阻" },
        { id: 23, name: "权杖二", nameEn: "Two of Wands", upright: "计划、决策、进步、发现", reversed: "恐惧改变、缺乏计划、犹豫不决" },
        { id: 24, name: "权杖三", nameEn: "Three of Wands", upright: "扩展、远见、领导力、机遇", reversed: "障碍、延迟、缺乏远见、失望" },
        { id: 25, name: "权杖四", nameEn: "Four of Wands", upright: "庆祝、和谐、家庭、稳定", reversed: "不稳定、冲突、缺乏支持、过渡期" },
        { id: 26, name: "权杖五", nameEn: "Five of Wands", upright: "竞争、冲突、挑战、多样性", reversed: "避免冲突、和解、内在冲突、压力释放" },
        { id: 27, name: "权杖六", nameEn: "Six of Wands", upright: "胜利、成功、认可、自信", reversed: "失败、缺乏认可、自我怀疑、骄傲" },
        { id: 28, name: "权杖七", nameEn: "Seven of Wands", upright: "防御、坚持、挑战、勇气", reversed: "放弃、不堪重负、妥协、疲惫" },
        { id: 29, name: "权杖八", nameEn: "Eight of Wands", upright: "速度、行动、旅行、进展", reversed: "延迟、挫折、等待、混乱" },
        { id: 30, name: "权杖九", nameEn: "Nine of Wands", upright: "坚韧、毅力、勇气、最后考验", reversed: "疲惫、放弃、偏执、脆弱" },
        { id: 31, name: "权杖十", nameEn: "Ten of Wands", upright: "负担、责任、压力、努力", reversed: "释放负担、委托、崩溃、逃避责任" },
        { id: 32, name: "权杖侍从", nameEn: "Page of Wands", upright: "热情、探索、发现、自由精神", reversed: "缺乏方向、犹豫、挫折、坏消息" },
        { id: 33, name: "权杖骑士", nameEn: "Knight of Wands", upright: "能量、冒险、冲动、热情", reversed: "鲁莽、延迟、挫折、分散注意力" },
        { id: 34, name: "权杖王后", nameEn: "Queen of Wands", upright: "自信、独立、热情、决心", reversed: "自私、嫉妒、不安全感、专横" },
        { id: 35, name: "权杖国王", nameEn: "King of Wands", upright: "领导力、远见、企业家、荣誉", reversed: "专制、冲动、傲慢、高期望" }
    ],
    
    // 小阿尔卡纳 - 圣杯 (Cups)
    cups: [
        { id: 36, name: "圣杯王牌", nameEn: "Ace of Cups", upright: "新感情、直觉、创造力、爱", reversed: "情感封闭、空虚、压抑感情" },
        { id: 37, name: "圣杯二", nameEn: "Two of Cups", upright: "伙伴关系、统一、爱情、和谐", reversed: "失衡、分离、沟通不畅、紧张" },
        { id: 38, name: "圣杯三", nameEn: "Three of Cups", upright: "庆祝、友谊、创造力、社交", reversed: "过度放纵、八卦、孤立、取消" },
        { id: 39, name: "圣杯四", nameEn: "Four of Cups", upright: "冥想、冷漠、重新评估、不满", reversed: "觉醒、接受、新机会、行动" },
        { id: 40, name: "圣杯五", nameEn: "Five of Cups", upright: "失落、悲伤、失望、悔恨", reversed: "接受、前进、原谅、恢复" },
        { id: 41, name: "圣杯六", nameEn: "Six of Cups", upright: "怀旧、回忆、童年、天真", reversed: "活在过去、不切实际、前进" },
        { id: 42, name: "圣杯七", nameEn: "Seven of Cups", upright: "幻想、选择、想象、白日梦", reversed: "清晰、决定、现实、专注" },
        { id: 43, name: "圣杯八", nameEn: "Eight of Cups", upright: "离开、放弃、寻找更深意义", reversed: "恐惧改变、停滞、漫无目的" },
        { id: 44, name: "圣杯九", nameEn: "Nine of Cups", upright: "满足、愿望实现、幸福、感恩", reversed: "不满、贪婪、物质主义、失望" },
        { id: 45, name: "圣杯十", nameEn: "Ten of Cups", upright: "幸福、和谐、家庭、圆满", reversed: "破裂、不和谐、价值观冲突" },
        { id: 46, name: "圣杯侍从", nameEn: "Page of Cups", upright: "创造力、直觉、好消息、好奇", reversed: "情感不成熟、创意受阻、逃避" },
        { id: 47, name: "圣杯骑士", nameEn: "Knight of Cups", upright: "浪漫、魅力、想象力、美", reversed: "情绪化、不切实际、嫉妒、失望" },
        { id: 48, name: "圣杯王后", nameEn: "Queen of Cups", upright: "同情、关怀、情感安全、直觉", reversed: "情感不安全、依赖、殉道者" },
        { id: 49, name: "圣杯国王", nameEn: "King of Cups", upright: "情感平衡、外交、同情、智慧", reversed: "情绪化、操纵、冷漠、压抑" }
    ],
    
    // 小阿尔卡纳 - 宝剑 (Swords)
    swords: [
        { id: 50, name: "宝剑王牌", nameEn: "Ace of Swords", upright: "突破、清晰、真相、新想法", reversed: "混乱、误解、残忍、障碍" },
        { id: 51, name: "宝剑二", nameEn: "Two of Swords", upright: "僵局、困难决定、平衡、否认", reversed: "犹豫不决、信息过载、情感释放" },
        { id: 52, name: "宝剑三", nameEn: "Three of Swords", upright: "心碎、悲伤、痛苦、分离", reversed: "恢复、原谅、释放痛苦、乐观" },
        { id: 53, name: "宝剑四", nameEn: "Four of Swords", upright: "休息、恢复、冥想、静养", reversed: "疲惫、倦怠、缺乏休息、焦虑" },
        { id: 54, name: "宝剑五", nameEn: "Five of Swords", upright: "冲突、失败、输赢、自私", reversed: "和解、原谅、前进、释放" },
        { id: 55, name: "宝剑六", nameEn: "Six of Swords", upright: "过渡、改变、前进、离开", reversed: "停滞、抗拒改变、未完成事务" },
        { id: 56, name: "宝剑七", nameEn: "Seven of Swords", upright: "欺骗、策略、偷偷摸摸、机智", reversed: "坦白、良心、被抓住、忏悔" },
        { id: 57, name: "宝剑八", nameEn: "Eight of Swords", upright: "限制、困境、受害者心态、无助", reversed: "自由、释放、新视角、控制" },
        { id: 58, name: "宝剑九", nameEn: "Nine of Swords", upright: "焦虑、噩梦、担忧、绝望", reversed: "希望、寻求帮助、恢复、释放" },
        { id: 59, name: "宝剑十", nameEn: "Ten of Swords", upright: "结束、失败、危机、背叛", reversed: "恢复、重生、不可避免的结束" },
        { id: 60, name: "宝剑侍从", nameEn: "Page of Swords", upright: "好奇、机智、沟通、新想法", reversed: "八卦、欺骗、缺乏计划、冷酷" },
        { id: 61, name: "宝剑骑士", nameEn: "Knight of Swords", upright: "行动、冲动、野心、快速", reversed: "鲁莽、无方向、延迟、争论" },
        { id: 62, name: "宝剑王后", nameEn: "Queen of Swords", upright: "独立、清晰思维、直接、诚实", reversed: "冷酷、苛刻、恶意、过于情绪化" },
        { id: 63, name: "宝剑国王", nameEn: "King of Swords", upright: "权威、真相、智慧、清晰", reversed: "操纵、残忍、滥用权力、不诚实" }
    ],
    
    // 小阿尔卡纳 - 星币/钱币 (Pentacles)
    pentacles: [
        { id: 64, name: "星币王牌", nameEn: "Ace of Pentacles", upright: "新机会、繁荣、财富、稳定", reversed: "错失机会、缺乏计划、贪婪" },
        { id: 65, name: "星币二", nameEn: "Two of Pentacles", upright: "平衡、适应、时间管理、优先", reversed: "失衡、混乱、过度承诺、压力" },
        { id: 66, name: "星币三", nameEn: "Three of Pentacles", upright: "团队合作、技能、学习、实施", reversed: "缺乏团队精神、不协调、平庸" },
        { id: 67, name: "星币四", nameEn: "Four of Pentacles", upright: "安全、控制、保守、节约", reversed: "贪婪、物质主义、自我保护过度" },
        { id: 68, name: "星币五", nameEn: "Five of Pentacles", upright: "困难、贫困、孤立、担忧", reversed: "恢复、改善、精神贫困、接受帮助" },
        { id: 69, name: "星币六", nameEn: "Six of Pentacles", upright: "慷慨、施与受、分享、繁荣", reversed: "债务、自私、单方面慷慨" },
        { id: 70, name: "星币七", nameEn: "Seven of Pentacles", upright: "耐心、投资、长期视野、坚持", reversed: "缺乏远见、有限成功、不耐烦" },
        { id: 71, name: "星币八", nameEn: "Eight of Pentacles", upright: "勤奋、技能发展、专注、质量", reversed: "缺乏专注、完美主义、无动力" },
        { id: 72, name: "星币九", nameEn: "Nine of Pentacles", upright: "丰富、独立、自给自足、奢华", reversed: "过度工作、肤浅、财务挫折" },
        { id: 73, name: "星币十", nameEn: "Ten of Pentacles", upright: "财富、家庭、传承、长期成功", reversed: "财务失败、家庭冲突、短期思维" },
        { id: 74, name: "星币侍从", nameEn: "Page of Pentacles", upright: "机会、学习、新开始、勤奋", reversed: "缺乏进步、拖延、错失机会" },
        { id: 75, name: "星币骑士", nameEn: "Knight of Pentacles", upright: "效率、常规、保守、负责", reversed: "无聊、停滞、懒惰、完美主义" },
        { id: 76, name: "星币王后", nameEn: "Queen of Pentacles", upright: "实际、安全、滋养、富足", reversed: "不平衡、自私、嫉妒、不安全" },
        { id: 77, name: "星币国王", nameEn: "King of Pentacles", upright: "财富、商业、领导力、安全", reversed: "贪婪、物质主义、顽固、浪费" }
    ]
};

// 获取所有卡牌
function getAllCards() {
    return [
        ...TAROT_DATA.majorArcana,
        ...TAROT_DATA.wands,
        ...TAROT_DATA.cups,
        ...TAROT_DATA.swords,
        ...TAROT_DATA.pentacles
    ];
}

// 卡牌图片URL生成（使用在线资源或本地）
function getCardImageUrl(cardId) {
    // 本地图片路径
    const localPath = `assets/cards/${cardId}.jpg`;
    
    // Rider-Waite-Smith 经典塔罗牌在线图源
    // 使用 GitHub raw 图源（支持 CORS，高清 350x600px）
    const cardFileNames = [
        // 大阿尔卡纳 0-21
        'm00', 'm01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07',
        'm08', 'm09', 'm10', 'm11', 'm12', 'm13', 'm14', 'm15',
        'm16', 'm17', 'm18', 'm19', 'm20', 'm21',
        // 权杖 (Wands) 22-35
        'w01', 'w02', 'w03', 'w04', 'w05', 'w06', 'w07', 'w08',
        'w09', 'w10', 'w11', 'w12', 'w13', 'w14',
        // 圣杯 (Cups) 36-49
        'c01', 'c02', 'c03', 'c04', 'c05', 'c06', 'c07', 'c08',
        'c09', 'c10', 'c11', 'c12', 'c13', 'c14',
        // 宝剑 (Swords) 50-63
        's01', 's02', 's03', 's04', 's05', 's06', 's07', 's08',
        's09', 's10', 's11', 's12', 's13', 's14',
        // 星币 (Pentacles) 64-77
        'p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08',
        'p09', 'p10', 'p11', 'p12', 'p13', 'p14'
    ];
    
    // 在线图源URL（GitHub raw，高清 RWS 塔罗牌）
    const onlineUrl = cardId < cardFileNames.length 
        ? `https://raw.githubusercontent.com/metabismuth/tarot-json/master/cards/${cardFileNames[cardId]}.jpg`
        : null;
    
    return { local: localPath, online: onlineUrl };
}

// 牌背图片
const CARD_BACK_URL = 'assets/cards/back.svg';
const CARD_BACK_FALLBACK = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
  <rect fill="#1a1a4e" width="200" height="300" rx="10"/>
  <rect fill="#2a2a6e" x="10" y="10" width="180" height="280" rx="8"/>
  <circle cx="100" cy="150" r="60" fill="none" stroke="#ffd700" stroke-width="2"/>
  <polygon points="100,100 110,140 150,140 118,165 130,205 100,180 70,205 82,165 50,140 90,140" fill="#ffd700"/>
</svg>
`);
