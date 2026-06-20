# 本地卡牌图片

本目录用于存放 78 张 Rider-Waite-Smith 塔罗牌图片。

## 图片命名规则

图片文件名应为 `{cardId}.jpg`，其中 cardId 为 0-77：

- 0-21: 大阿尔卡纳 (Major Arcana)
- 22-35: 权杖 (Wands)
- 36-49: 圣杯 (Cups)
- 50-63: 宝剑 (Swords)
- 64-77: 星币 (Pentacles)

## 下载图片

项目默认从在线图源加载图片。如需离线使用，可运行以下脚本下载图片：

```bash
# 在 frontend-user/assets/cards 目录下运行
chmod +x download.sh
./download.sh
```

或手动下载：
- 图源: https://raw.githubusercontent.com/metabismuth/tarot-json/master/cards/
- 文件名映射见 `tarotData.js` 中的 `getCardImageUrl` 函数

## 加载优先级

1. 在线图源 (GitHub raw)
2. 本地图片 (assets/cards/{id}.jpg)
3. Canvas 占位符
