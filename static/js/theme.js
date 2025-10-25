// theme.js - 主题切换逻辑（class-based，使用 localStorage 持久化）
(function() {
    const THEME_KEY = 'siteTheme';

    // 便于调试：脚本加载时打印
    try { console.debug('theme.js loaded'); } catch (e) { /* ignore */ }

    function applyTheme(name) {
        const body = document.body;
        // 移除已知主题类
        ['theme-cyberpunk','theme-ubuntu','theme-windows'].forEach(c => body.classList.remove(c));
        if (name && name !== 'default') {
            body.classList.add(`theme-${name}`);
        }
        // 保存偏好
        try { localStorage.setItem(THEME_KEY, name || 'default'); } catch (e) { /* ignore */ }
    }

    function handleThemeButtonClick(btn) {
        try {
            const t = btn.dataset.theme;
            console.debug('theme.js: theme button clicked', t);
            applyTheme(t);
            // 更新按钮样式
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        } catch (err) {
            console.error('theme.js handler error:', err);
        }
    }

    function init() {
        try {
            // 读取保存的偏好
            let saved = null;
            try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
            if (!saved) saved = 'default';
            applyTheme(saved);

            // 直接绑定存在的按钮（旧逻辑）
            const buttons = document.querySelectorAll('.theme-btn');
            if (!buttons || buttons.length === 0) {
                console.debug('theme.js: no .theme-btn found in DOM at init time');
            }
            buttons.forEach(btn => {
                btn.removeEventListener('click', btn._themeHandler);
                btn._themeHandler = () => handleThemeButtonClick(btn);
                btn.addEventListener('click', btn._themeHandler);
                // 标记当前选中状态
                if (btn.dataset.theme === saved) btn.classList.add('active');
            });

            // 事件委托作为后备：处理动态插入或绑定失败的场景
            document.removeEventListener('click', document._themeDelegateHandler);
            document._themeDelegateHandler = function(e) {
                const btn = e.target.closest && e.target.closest('.theme-btn');
                if (btn) {
                    handleThemeButtonClick(btn);
                }
            };
            document.addEventListener('click', document._themeDelegateHandler);

        } catch (err) {
            console.error('theme.js init error:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOMContentLoaded 已经触发，立即初始化
        setTimeout(init, 0);
    }

})();
