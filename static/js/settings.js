// settings.js - 主题设置与切换
(function() {
    const THEME_KEY = 'error_notebook_theme';

    function applyTheme(themeClass) {
        const html = document.documentElement;
        // 清除已知主题类
        ['theme-light', 'theme-dark', 'theme-indigo'].forEach(c => html.classList.remove(c));
        if (themeClass && themeClass !== 'theme-light') html.classList.add(themeClass);
    }

    function loadSavedTheme() {
        const t = localStorage.getItem(THEME_KEY) || 'theme-light';
        return t;
    }

    function saveTheme(themeClass) {
        localStorage.setItem(THEME_KEY, themeClass);
    }

    document.addEventListener('DOMContentLoaded', function() {
        const current = loadSavedTheme();
        applyTheme(current);

        // 将当前值设置到单选框上
        const radios = document.querySelectorAll('input[name="theme"]');
        radios.forEach(r => {
            if (r.value === current) r.checked = true;
        });

        const applyBtn = document.getElementById('apply-theme-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                const sel = document.querySelector('input[name="theme"]:checked');
                const theme = sel ? sel.value : 'theme-light';
                applyTheme(theme);
                saveTheme(theme);
                // 简单提示
                applyBtn.textContent = '已应用';
                setTimeout(() => applyBtn.textContent = '应用并保存', 1200);
            });
        }

        // 实时切换（选中即预览，但不保存），可选行为
        radios.forEach(r => r.addEventListener('change', function() {
            applyTheme(this.value);
        }));
    });
})();
