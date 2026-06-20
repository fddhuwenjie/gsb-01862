/**
 * 主入口
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 检查WebGL支持
    if (!window.WebGLRenderingContext) {
        document.getElementById('loading').innerHTML = `
            <p style="color: #ff6666;">您的浏览器不支持WebGL，请使用现代浏览器访问。</p>
        `;
        return;
    }

    // 初始化游戏
    const game = new TarotGame();
    
    try {
        await game.init();
        console.log('塔罗游戏初始化成功');
    } catch (error) {
        console.error('游戏初始化失败:', error);
        document.getElementById('loading').innerHTML = `
            <p style="color: #ff6666;">游戏加载失败，请刷新页面重试。</p>
        `;
    }

    // 全局访问（调试用）
    window.tarotGame = game;
});
