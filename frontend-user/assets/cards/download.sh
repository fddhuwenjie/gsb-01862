#!/bin/bash
# 下载 Rider-Waite-Smith 塔罗牌图片到本地

BASE_URL="https://raw.githubusercontent.com/metabismuth/tarot-json/master/cards"

# 大阿尔卡纳 0-21
MAJOR=("m00" "m01" "m02" "m03" "m04" "m05" "m06" "m07" "m08" "m09" "m10" "m11" "m12" "m13" "m14" "m15" "m16" "m17" "m18" "m19" "m20" "m21")

# 权杖 22-35
WANDS=("w01" "w02" "w03" "w04" "w05" "w06" "w07" "w08" "w09" "w10" "w11" "w12" "w13" "w14")

# 圣杯 36-49
CUPS=("c01" "c02" "c03" "c04" "c05" "c06" "c07" "c08" "c09" "c10" "c11" "c12" "c13" "c14")

# 宝剑 50-63
SWORDS=("s01" "s02" "s03" "s04" "s05" "s06" "s07" "s08" "s09" "s10" "s11" "s12" "s13" "s14")

# 星币 64-77
PENTACLES=("p01" "p02" "p03" "p04" "p05" "p06" "p07" "p08" "p09" "p10" "p11" "p12" "p13" "p14")

echo "开始下载塔罗牌图片..."

# 下载大阿尔卡纳
for i in "${!MAJOR[@]}"; do
    echo "下载 ${i}.jpg (${MAJOR[$i]})"
    curl -s -o "${i}.jpg" "${BASE_URL}/${MAJOR[$i]}.jpg"
done

# 下载权杖
for i in "${!WANDS[@]}"; do
    id=$((22 + i))
    echo "下载 ${id}.jpg (${WANDS[$i]})"
    curl -s -o "${id}.jpg" "${BASE_URL}/${WANDS[$i]}.jpg"
done

# 下载圣杯
for i in "${!CUPS[@]}"; do
    id=$((36 + i))
    echo "下载 ${id}.jpg (${CUPS[$i]})"
    curl -s -o "${id}.jpg" "${BASE_URL}/${CUPS[$i]}.jpg"
done

# 下载宝剑
for i in "${!SWORDS[@]}"; do
    id=$((50 + i))
    echo "下载 ${id}.jpg (${SWORDS[$i]})"
    curl -s -o "${id}.jpg" "${BASE_URL}/${SWORDS[$i]}.jpg"
done

# 下载星币
for i in "${!PENTACLES[@]}"; do
    id=$((64 + i))
    echo "下载 ${id}.jpg (${PENTACLES[$i]})"
    curl -s -o "${id}.jpg" "${BASE_URL}/${PENTACLES[$i]}.jpg"
done

echo "下载完成！共 78 张卡牌图片。"
