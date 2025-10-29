// tabs.js - 选项卡逻辑、加载与渲染题目
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        const mainTabBtns = document.querySelectorAll('.tab-btn');
        const mainTabPanes = document.querySelectorAll('.tab-pane');
        mainTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                mainTabBtns.forEach(b => b.classList.remove('active'));
                mainTabPanes.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const activePane = document.getElementById(btn.dataset.tab);
                activePane.classList.add('active');

                if (btn.dataset.tab === 'careless-mistake-tab' && activePane.querySelector('.careless-mistake-list').children.length === 0) {
                    if (typeof loadCarelessMistakes === 'function') loadCarelessMistakes();
                }
            });
        });

        const subjectTabBtns = document.querySelectorAll('.subject-btn');
        const subjectTabPanes = document.querySelectorAll('.subject-pane');
        subjectTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                subjectTabBtns.forEach(b => b.classList.remove('active'));
                subjectTabPanes.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const activePane = document.getElementById(`subject-${btn.dataset.subject}`);
                activePane.dataset.currentDate = '';
                activePane.classList.add('active');
                if (activePane.children.length <= 1) {
                    if (typeof loadQuestionsForActiveSubject === 'function') loadQuestionsForActiveSubject();
                }
            });
        });

        // 初始为默认激活科目加载
        if (typeof loadQuestionsForActiveSubject === 'function') loadQuestionsForActiveSubject();
    });

    // 无限滚动监听（独立于 DOMContentLoaded，确保元素存在时绑定）
    document.addEventListener('DOMContentLoaded', function() {
        const questionContentArea = document.querySelector('.content-area');
        const carelessMistakeArea = document.getElementById('careless-mistake-tab');

        if (questionContentArea) {
            questionContentArea.addEventListener('scroll', () => {
                const activePane = document.querySelector('.subject-pane.active');
                if (!activePane) return;

                const isLoading = activePane.dataset.isLoading === 'true';
                const hasMore = activePane.dataset.hasMore === 'true';
                const isAtBottom = questionContentArea.scrollTop + questionContentArea.clientHeight >= questionContentArea.scrollHeight - 200;

                if (hasMore && !isLoading && isAtBottom) {
                    loadQuestionsForActiveSubject();
                }
            });
        }

        if (carelessMistakeArea) {
            carelessMistakeArea.addEventListener('scroll', () => {
                if (!carelessMistakeArea.classList.contains('active')) return;

                const isLoading = carelessMistakeArea.dataset.isLoading === 'true';
                const hasMore = carelessMistakeArea.dataset.hasMore === 'true';
                const isAtBottom = carelessMistakeArea.scrollTop + carelessMistakeArea.clientHeight >= carelessMistakeArea.scrollHeight - 100;

                if (hasMore && !isLoading && isAtBottom) {
                    if (typeof loadCarelessMistakes === 'function') loadCarelessMistakes();
                }
            });
        }
    });

    // 核心函数：加载当前科目的题目
    function loadQuestionsForActiveSubject() {
        const activePane = document.querySelector('.subject-pane.active');
        if (!activePane || activePane.dataset.isLoading === 'true') return;

        const subject = activePane.dataset.subjectName;
        let page = parseInt(activePane.dataset.page || '1', 10);
        const startDate = activePane.dataset.currentDate || '';

        activePane.dataset.isLoading = 'true';
        const loader = activePane.querySelector('.loader');
        if (loader) loader.style.display = 'block';

        let apiUrl = `/get-questions?subject=${encodeURIComponent(subject)}&page=${page}`;
        if (startDate) apiUrl += `&start_date=${startDate}`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(questions => {
                if (loader) loader.style.display = 'none';
                if (questions.length > 0) {
                    renderQuestions(questions, activePane);
                    activePane.dataset.page = page + 1;

                    if (page === 1 && startDate) {
                        setTimeout(() => {
                            const targetDateHeader = activePane.querySelector(`#date-${startDate}`);
                            if (targetDateHeader) targetDateHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                    }
                } else {
                    activePane.dataset.hasMore = 'false';
                    const message = (page === 1 && startDate) ? `日期 ${startDate} 下没有错题哦。` : '已经到底啦！';
                    if (!activePane.querySelector('.end-message')) activePane.insertAdjacentHTML('beforeend', `<p class="end-message">${message}</p>`);
                }
            })
            .catch(error => {
                console.error('Error loading questions:', error);
                if (loader) loader.innerText = '加载失败，请重试。';
            })
            .finally(() => { activePane.dataset.isLoading = 'false'; });
    }

    function renderQuestions(questions, container) {
        let lastDate = container.dataset.lastDate || '';
        let html = '';
        questions.forEach(q => {
            const currentDate = q.upload_date.split(' ')[0];
            if (currentDate !== lastDate) {
                html += `<h2 class="date-header" id="date-${currentDate}">${currentDate}</h2>`;
                lastDate = currentDate;
            }
            html += `
            <div class="question-block" data-question-id="${q.id}">
                <div class="action-toolbar">
                     <button class="action-btn" data-action="chat" title="和AI聊聊"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
                    <button class="action-btn" data-action="regenerate" title="重新生成解析"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button>
                    <button class="action-btn" data-action="edit" title="修改解析 (待实现)"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                    <button class="action-btn" data-action="copy" title="复制解析"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="action-btn" data-action="delete" title="删除本错题"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
                <h3>原题图片</h3>
                <img src="data:image/jpeg;base64,${q.original_image_b64}" alt="错题图片">
                <div id="analysis-content-${q.id}">
                    <h3>AI解析</h3><div class="ai-analysis-content">${window.markdownToHtml ? window.markdownToHtml(q.problem_analysis) : q.problem_analysis}</div>
                    <h3>考点分析</h3><ul class="knowledge-points-content">${(q.knowledge_points||[]).map(p => `<li>${p}</li>`).join('')}</ul>
                    <h3>可能的错误</h3><ul class="ai-analysis-errors">${(q.ai_analysis||[]).map(e => `<li>${e}</li>`).join('')}</ul>
                    <h3>例题练手</h3><div class="similar-examples-content">${(q.similar_examples||[]).map(ex => `<div class="example"><strong>题目：</strong> ${ex.question}<br><strong>解答：</strong><br><div>${window.markdownToHtml ? window.markdownToHtml(ex.answer) : ex.answer}</div></div>`).join('')}</div>
                </div>
                <!-- 我的灵光一闪 注释栏（始终渲染，但内容根据是否已有注释变化） -->
                <div class="insight-panel" data-question-id="${q.id}">
                    <h3 class="insight-title">我的灵光一闪</h3>
                    <div class="insight-display">${q.my_insight ? q.my_insight : '<em class="muted">还没有添加你的灵光一闪，点添加写下你的想法。</em>'}</div>
                    <textarea class="insight-editor" style="display:none;">${q.my_insight ? q.my_insight : ''}</textarea>
                    <div class="insight-controls">
                        <button class="insight-btn" data-action="edit-insight">${q.my_insight ? '编辑' : '添加'}</button>
                        <button class="insight-btn" data-action="save-insight" style="display:none;">保存</button>
                        <button class="insight-btn" data-action="cancel-insight" style="display:none;">取消</button>
                    </div>
                </div>
            </div>`;
        });
        container.dataset.lastDate = lastDate;
        const loader = container.querySelector('.loader');
        if (loader) loader.insertAdjacentHTML('beforebegin', html);
    }

    // 导出 API
    window.loadQuestionsForActiveSubject = loadQuestionsForActiveSubject;
})();
