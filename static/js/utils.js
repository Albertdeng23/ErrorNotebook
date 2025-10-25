// utils.js - 辅助函数
(function() {
    function markdownToHtml(text) {
        if (!text) return '';
        return text.replace(/### (.*)/g, '<h3>$1</h3>')
                   .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                   .replace(/\n/g, '<br>');
    }

    window.markdownToHtml = markdownToHtml;
})();
