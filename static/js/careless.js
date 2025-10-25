// careless.js - 粗心错题相关的加载、渲染与编辑逻辑
(function() {
    function loadCarelessMistakes() {
        const container = document.querySelector('#careless-mistake-tab');
        if (!container || container.dataset.isLoading === 'true' || container.dataset.hasMore === 'false') return;

        let page = parseInt(container.dataset.page || '1', 10);
        container.dataset.isLoading = 'true';
        const loader = container.querySelector('.loader');
        if (loader) loader.style.display = 'block';

        fetch(`/get-careless-mistakes?page=${page}`)
            .then(response => response.json())
            .then(mistakes => {
                if (loader) loader.style.display = 'none';
                if (mistakes.length > 0) {
                    const list = container.querySelector('.careless-mistake-list');
                    renderCarelessMistakes(mistakes, list);
                    container.dataset.page = page + 1;
                } else {
                    container.dataset.hasMore = 'false';
                    const message = page === 1 ? '这里还没有记录哦。' : '已经到底啦！';
                    if (!container.querySelector('.end-message')) container.insertAdjacentHTML('beforeend', `<p class="end-message">${message}</p>`);
                }
            })
            .catch(error => {
                console.error('Error loading careless mistakes:', error);
                if (loader) loader.innerText = '加载失败，请重试。';
            })
            .finally(() => { container.dataset.isLoading = 'false'; });
    }

    function renderCarelessMistakes(mistakes, container) {
        let html = '';
        mistakes.forEach(m => {
            html += `
            <div class="question-block careless-mistake-block" data-mistake-id="${m.id}">
                <div class="action-toolbar">
                    <button class="action-btn" data-action="edit-careless" title="编辑反思"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                    <button class="action-btn" data-action="copy-careless" title="复制反思内容"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="action-btn" data-action="delete-careless" title="删除本条记录"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
                <div class="date-header-inline">${m.upload_date.split(' ')[0]}</div>
                <h3>原题图片</h3>
                <img src="data:image/jpeg;base64,${m.original_image_b64}" alt="错题图片">
                <h3>我的反思</h3>
                <div class="user-reflection-content">${m.user_reflection}</div>
            </div>`;
        });
        container.insertAdjacentHTML('beforeend', html);
    }

    function handleDeleteCareless(id, element) {
        if (!confirm('确定要删除这条记录吗？此操作不可撤销。')) return;
        fetch(`/delete-careless-mistake/${id}`, { method: 'DELETE' })
        .then(response => {
            if (response.ok) {
                element.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                element.style.opacity = '0';
                element.style.transform = 'scale(0.95)';
                setTimeout(() => element.remove(), 500);
            } else { alert('删除失败，请稍后再试。'); }
        })
        .catch(error => { console.error('Error:', error); alert('删除时发生网络错误。'); });
    }

    function handleCopyCareless(id, button) {
        const mBlock = document.querySelector(`.careless-mistake-block[data-mistake-id="${id}"]`);
        if (!mBlock) return;
        const reflectionDiv = mBlock.querySelector('.user-reflection-content');
        const textToCopy = reflectionDiv ? reflectionDiv.innerText : '';
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalIcon = button.innerHTML;
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { button.innerHTML = originalIcon; }, 1500);
        }).catch(err => { console.error('Copy failed', err); alert('复制失败！'); });
    }

    function handleEditCareless(id, element) {
        const reflectionContainer = element.querySelector('.user-reflection-content');
        if (!reflectionContainer) return;
        if (element.classList.contains('is-editing')) return;
        element.classList.add('is-editing');

        const originalHtml = reflectionContainer.innerHTML;
        const editorId = `editor-${id}`;

        reflectionContainer.innerHTML = `\n        <textarea id="${editorId}"></textarea>\n        <div class="edit-controls">\n            <button class="btn-save">保存</button>\n            <button class="btn-cancel">取消</button>\n        </div>\n    `;

        tinymce.init({
            selector: `#${editorId}`,
            height: 250,
            menubar: false,
            plugins: 'lists link image table code help wordcount',
            toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist',
            setup: function(editor) { editor.on('init', function() { editor.setContent(originalHtml); }); }
        });

        const btnSave = reflectionContainer.querySelector('.btn-save');
        const btnCancel = reflectionContainer.querySelector('.btn-cancel');

        btnSave.addEventListener('click', () => {
            const newContent = tinymce.get(editorId).getContent();
            const formData = new FormData();
            formData.append('user_reflection', newContent);

            btnSave.textContent = '保存中...';
            btnSave.disabled = true;

            fetch(`/update-careless-mistake/${id}`, { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    tinymce.get(editorId).remove();
                    reflectionContainer.innerHTML = data.new_reflection;
                    element.classList.remove('is-editing');
                } else {
                    alert('保存失败: ' + data.message);
                    btnSave.textContent = '保存';
                    btnSave.disabled = false;
                }
            })
            .catch(err => { console.error('Save error:', err); alert('保存时发生网络错误。'); btnSave.textContent = '保存'; btnSave.disabled = false; });
        });

        btnCancel.addEventListener('click', () => {
            tinymce.get(editorId).remove();
            reflectionContainer.innerHTML = originalHtml;
            element.classList.remove('is-editing');
        });
    }

    // 导出需要被其他模块调用的函数
    window.loadCarelessMistakes = loadCarelessMistakes;
    window.handleDeleteCareless = handleDeleteCareless;
    window.handleCopyCareless = handleCopyCareless;
    window.handleEditCareless = handleEditCareless;
})();
