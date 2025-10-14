document.addEventListener('DOMContentLoaded', function() {

    // ===================================================================
    // SECTION 0: CALENDAR LOGIC & INITIALIZATION
    // ===================================================================
    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearEl = document.getElementById('month-year');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    // 新增：获取搜索框元素
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const clearSearchButton = document.getElementById('clear-search-button');
    
    // allDatesWithRecords 变量由后端在HTML模板中注入
    let currentDate = new Date();

    function renderCalendar(year, month) {
        if (!calendarGrid) return; // 如果页面上没有日历容器，则退出
        
        calendarGrid.innerHTML = '';
        monthYearEl.textContent = `${year}年 ${month + 1}月`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = (firstDay.getDay() + 6) % 7; // 0=周一, 6=周日

        const daysInPrevMonth = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const dayEl = document.createElement('div');
            dayEl.classList.add('calendar-day', 'prev-month-day');
            dayEl.textContent = daysInPrevMonth - i;
            calendarGrid.appendChild(dayEl);
        }

        const todayStr = new Date().toISOString().split('T')[0];
        for (let i = 1; i <= daysInMonth; i++) {
            const dayEl = document.createElement('div');
            dayEl.classList.add('calendar-day');
            dayEl.textContent = i;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            dayEl.dataset.date = dateStr;

            if (typeof allDatesWithRecords !== 'undefined' && allDatesWithRecords.includes(dateStr)) {
                dayEl.classList.add('has-records');
            } else {
                dayEl.classList.add('disabled');
            }
            if (dateStr === todayStr) {
                dayEl.classList.add('today');
            }
            calendarGrid.appendChild(dayEl);
        }
        
        const totalCells = startDayOfWeek + daysInMonth;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 1; i <= remainingCells; i++) {
            const dayEl = document.createElement('div');
            dayEl.classList.add('calendar-day', 'next-month-day');
            dayEl.textContent = i;
            calendarGrid.appendChild(dayEl);
        }
    }

    if (calendarGrid) {
        // 日历点击事件 (使用事件委托)
        calendarGrid.addEventListener('click', (e) => {
            const dayEl = e.target;
            if (!dayEl.classList.contains('has-records')) return;

            const date = dayEl.dataset.date;
            const selected = calendarGrid.querySelector('.selected');
            if (selected) selected.classList.remove('selected');
            dayEl.classList.add('selected');

            const activePane = document.querySelector('.subject-pane.active');
            if (!activePane) {
                alert('请先选择一个科目！');
                return;
            }
            activePane.innerHTML = '<div class="loader">加载中...</div>';
            activePane.dataset.page = "1";
            activePane.dataset.hasMore = "true";
            activePane.dataset.lastDate = "";
            loadQuestionsForActiveSubject(date);
            fetchAndRenderSummary(date);
        });

        // 月份切换按钮事件
        prevMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        });
        nextMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
        });

        // 初始渲染日历
        renderCalendar(currentDate.getFullYear(), currentDate.getMonth());
    }

    // ===================================================================
    // SECTION 1: CORE LOADING & TAB LOGIC
    // ===================================================================

    // --- 1.1. 主选项卡切换 ---
    const mainTabBtns = document.querySelectorAll('.tab-btn');
    const mainTabPanes = document.querySelectorAll('.tab-pane');
    mainTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            mainTabBtns.forEach(b => b.classList.remove('active'));
            mainTabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });

    // --- 1.2. 科目子选项卡切换 ---
    const subjectTabBtns = document.querySelectorAll('.subject-btn');
    const subjectTabPanes = document.querySelectorAll('.subject-pane');
    subjectTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            subjectTabBtns.forEach(b => b.classList.remove('active'));
            subjectTabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const activePane = document.getElementById(`subject-${btn.dataset.subject}`);
            activePane.classList.add('active');
            
            if (activePane.children.length <= 1) {
                loadQuestionsForActiveSubject();
            }
        });
    });

    // --- 1.3. 页面加载时，为默认激活的科目加载初始数据 ---
    loadQuestionsForActiveSubject();

    // --- 1.4. 无限滚动加载 ---
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
        contentArea.addEventListener('scroll', () => {
            const activePane = document.querySelector('.subject-pane.active');
            if (!activePane) return;
            const isLoading = activePane.dataset.isLoading === 'true';
            const hasMore = activePane.dataset.hasMore === 'true';
            if (hasMore && !isLoading && contentArea.scrollTop + contentArea.clientHeight >= contentArea.scrollHeight - 200) {
                loadQuestionsForActiveSubject();
            }
        });
    }

    // --- 1.6. 核心函数：从API加载问题 ---
    function loadQuestionsForActiveSubject(startDate = null) {
        const activePane = document.querySelector('.subject-pane.active');
        if (!activePane || activePane.dataset.isLoading === 'true') return;

        const subject = activePane.dataset.subjectName;
        let page = parseInt(activePane.dataset.page, 10);
        
        activePane.dataset.isLoading = 'true';
        const loader = activePane.querySelector('.loader');
        if (loader) loader.style.display = 'block';

        let apiUrl = `/get-questions?subject=${encodeURIComponent(subject)}&page=${page}`;
        if (startDate) {
            apiUrl += `&start_date=${startDate}`;
        }

        fetch(apiUrl)
            .then(response => response.json())
            .then(questions => {
                if (loader) loader.style.display = 'none';
                if (questions.length > 0) {
                    renderQuestions(questions, activePane);
                    activePane.dataset.page = page + 1;
                } else {
                    activePane.dataset.hasMore = 'false';
                    const message = page === 1 ? '这个分类下没有错题哦。' : '已经到底啦！';
                    if (!activePane.querySelector('.end-message')) {
                         activePane.insertAdjacentHTML('beforeend', `<p class="end-message">${message}</p>`);
                    }
                }
            })
            .catch(error => {
                console.error('Error loading questions:', error);
                if (loader) loader.innerText = '加载失败，请重试。';
            })
            .finally(() => {
                activePane.dataset.isLoading = 'false';
            });
    }

    // --- 1.7. 核心函数：渲染问题HTML到页面 ---
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
                    <button class="action-btn" data-action="regenerate" title="重新生成解析"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg></button>
                    <button class="action-btn" data-action="edit" title="修改解析 (待实现)"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>
                    <button class="action-btn" data-action="copy" title="复制解析"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                    <button class="action-btn" data-action="delete" title="删除本错题"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
                </div>
                <h3>原题图片</h3>
                <img src="data:image/jpeg;base64,${q.original_image_b64}" alt="错题图片">
                <div id="analysis-content-${q.id}">
                    <h3>AI解析</h3><div class="ai-analysis-content">${markdownToHtml(q.problem_analysis)}</div>
                    <h3>考点分析</h3><ul class="knowledge-points-content">${q.knowledge_points.map(p => `<li>${p}</li>`).join('')}</ul>
                    <h3>可能的错误</h3><ul class="ai-analysis-errors">${q.ai_analysis.map(e => `<li>${e}</li>`).join('')}</ul>
                    <h3>例题练手</h3><div class="similar-examples-content">${q.similar_examples.map(ex => `<div class="example"><strong>题目：</strong> ${ex.question}<br><strong>解答：</strong><br><div>${markdownToHtml(ex.answer)}</div></div>`).join('')}</div>
                </div>
            </div>`;
        });
        container.dataset.lastDate = lastDate;
        const loader = container.querySelector('.loader');
        if (loader) {
            loader.insertAdjacentHTML('beforebegin', html);
        }
    }
    
    // --- 1.8. 辅助函数：简易Markdown转HTML ---
    function markdownToHtml(text) {
        if (!text) return '';
        return text.replace(/### (.*)/g, '<h3>$1</h3>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    }

    // ===================================================================
    // SECTION 2: DYNAMIC SUMMARY LOGIC
    // ===================================================================
    let subjectChartInstance = null;
    function fetchAndRenderSummary(date) {
        const summaryContainer = document.getElementById('daily-summary-container');
        summaryContainer.innerHTML = `<div class="placeholder"><h2>正在为 ${date} 加载总结...</h2></div>`;
        fetch(`/get-summary/${date}`)
            .then(response => {
                if (!response.ok) return response.json().then(err => { throw new Error(err.message) });
                return response.json();
            })
            .then(data => renderSummary(data))
            .catch(error => {
                console.error('Error fetching summary:', error);
                summaryContainer.innerHTML = `<div class="placeholder error-text">加载总结失败：${error.message}</div>`;
            });
    }

    function renderSummary(data) {
        const summaryContainer = document.getElementById('daily-summary-container');
        let aiSummaryHtml = (data.ai_summary && !data.ai_summary.error) ? `
            <p><strong>学习总纲：</strong>${data.ai_summary.general_summary}</p>
            <p><strong>核心知识点：</strong></p>
            <ul>${data.ai_summary.knowledge_points_summary.map(p => `<li>${p}</li>`).join('')}</ul>` : 
            `<p class="error-text">AI总结生成失败或不可用。</p>`;

        summaryContainer.innerHTML = `
            <h2>学习总结 (${data.date})</h2>${aiSummaryHtml}
            <div class="summary-stats">
                <div class="stat-item"><strong>当日错题数：</strong> ${data.question_count} 道</div>
                <div class="stat-item subject-chart-container"><strong>科目分布：</strong><canvas id="subject-bar-chart-dynamic"></canvas></div>
            </div>`;

        if (subjectChartInstance) subjectChartInstance.destroy();
        subjectChartInstance = new Chart(document.getElementById('subject-bar-chart-dynamic').getContext('2d'), {
            type: 'bar',
            data: { labels: data.subject_chart_data.labels, datasets: [{ label: '科目错题数', data: data.subject_chart_data.data, backgroundColor: ['rgba(255, 99, 132, 0.5)', 'rgba(54, 162, 235, 0.5)', 'rgba(255, 206, 86, 0.5)', 'rgba(75, 192, 192, 0.5)', 'rgba(153, 102, 255, 0.5)', 'rgba(255, 159, 64, 0.5)'], borderWidth: 1 }] },
            options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
        });
    }

    // ===================================================================
    // SECTION 3: UPLOAD FORM LOGIC
    // ===================================================================
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        const imageInput = document.getElementById('question_image');
        const imagePreview = document.getElementById('image-preview');
        const submitBtn = document.getElementById('submit-btn');
        const uploadStatus = document.getElementById('upload-status');

        imageInput.addEventListener('change', function() {
            imagePreview.innerHTML = '';
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => { const img = document.createElement('img'); img.src = e.target.result; imagePreview.appendChild(img); }
                reader.readAsDataURL(file);
            }
        });

        uploadForm.addEventListener('submit', function(event) {
            event.preventDefault();
            submitBtn.disabled = true;
            submitBtn.textContent = '正在分析中...';
            uploadStatus.innerHTML = '';
            uploadStatus.className = '';
            fetch('/upload', { method: 'POST', body: new FormData(uploadForm) })
            .then(response => {
                if (!response.ok) return response.json().then(err => { throw new Error(err.message) });
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    uploadStatus.textContent = data.message + ' 页面即将刷新...';
                    uploadStatus.classList.add('success');
                    setTimeout(() => window.location.reload(), 2000);
                } else { throw new Error(data.message); }
            })
            .catch(error => {
                uploadStatus.textContent = '上传失败：' + error.message;
                uploadStatus.classList.add('error');
                submitBtn.disabled = false;
                submitBtn.textContent = '上传并分析';
            });
        });
    }

    // ===================================================================
    // SECTION 4: ACTION BUTTONS LOGIC (EVENT DELEGATION)
    // ===================================================================
    const reviewTab = document.getElementById('review-tab');
    if (reviewTab) {
        reviewTab.addEventListener('click', function(event) {
            const actionBtn = event.target.closest('.action-btn');
            if (!actionBtn) return;
            const action = actionBtn.dataset.action;
            const questionBlock = actionBtn.closest('.question-block');
            const questionId = questionBlock.dataset.questionId;
            switch (action) {
                case 'delete': handleDelete(questionId, questionBlock); break;
                case 'copy': handleCopy(questionId, actionBtn); break;
                case 'regenerate': handleRegenerate(questionId, questionBlock); break;
                case 'edit': alert('修改功能正在开发中！'); break;
            }
        });
    }

    function handleDelete(id, element) {
        if (confirm('确定要删除这条错题记录吗？此操作不可撤销。')) {
            fetch(`/delete/${id}`, { method: 'DELETE' })
            .then(response => {
                if (response.ok) {
                    let dateHeader = element.previousElementSibling;
                    while(dateHeader && !dateHeader.classList.contains('date-header')) {
                        dateHeader = dateHeader.previousElementSibling;
                    }
                    element.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                    element.style.opacity = '0';
                    element.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        element.remove();
                        if (dateHeader && (!dateHeader.nextElementSibling || dateHeader.nextElementSibling.classList.contains('date-header'))) {
                            dateHeader.style.transition = 'opacity 0.3s ease';
                            dateHeader.style.opacity = '0';
                            setTimeout(() => dateHeader.remove(), 300);
                        }
                    }, 500);
                } else { alert('删除失败，请稍后再试。'); }
            })
            .catch(error => { console.error('Error:', error); alert('删除时发生网络错误。'); });
        }
    }

    function handleCopy(id, button) {
        const qBlock = document.querySelector(`.question-block[data-question-id="${id}"]`);
        const textToCopy = `【AI解析】\n${qBlock.querySelector('.ai-analysis-content').innerText}\n\n【考点分析】\n${Array.from(qBlock.querySelectorAll('.knowledge-points-content li')).map(li => `- ${li.innerText}`).join('\n')}\n\n【可能的错误】\n${Array.from(qBlock.querySelectorAll('.ai-analysis-errors li')).map(li => `- ${li.innerText}`).join('\n')}`;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalIcon = button.innerHTML;
            button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { button.innerHTML = originalIcon; }, 1500);
        }).catch(err => { console.error('Copy failed', err); alert('复制失败！'); });
    }

    function handleRegenerate(id, element) {
        if (!confirm('重新生成会覆盖当前的解析，确定吗？')) return;
        const analysisContent = document.getElementById(`analysis-content-${id}`);
        analysisContent.style.opacity = '0.5';
        element.insertAdjacentHTML('afterbegin', '<p class="loading-text" style="text-align:center; font-weight:bold;">正在重新生成...</p>');
        fetch(`/regenerate/${id}`, { method: 'POST' })
        .then(response => { if (!response.ok) throw new Error('服务器响应错误'); return response.json(); })
        .then(data => {
            if (data.status === 'success') {
                alert('生成成功！页面将刷新以显示最新内容。');
                window.location.reload();
            } else { throw new Error(data.message || '未知错误'); }
        })
        .catch(error => { console.error('Error:', error); alert(`重新生成失败: ${error.message}`); })
        .finally(() => {
            const loadingText = element.querySelector('.loading-text');
            if (loadingText) loadingText.remove();
            analysisContent.style.opacity = '1';
        });
    }

    // ===================================================================
    // SECTION 5: INITIAL CHART RENDERING (ON PAGE LOAD)
    // ===================================================================
    if (typeof weeklyChartData !== 'undefined' && weeklyChartData.labels.length > 0) {
        const weeklyCtx = document.getElementById('weekly-chart').getContext('2d');
        new Chart(weeklyCtx, {
            type: 'line',
            data: { labels: weeklyChartData.labels, datasets: [{ label: '每日新增错题数', data: weeklyChartData.data, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, fill: true }] },
            options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }

});
