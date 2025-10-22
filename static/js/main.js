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
            
            // 【核心修改】重置面板并设置新的起始日期状态
            activePane.innerHTML = '<div class="loader">加载中...</div>'; // 清空旧内容
            activePane.dataset.page = "1"; // 重置页码
            activePane.dataset.hasMore = "true"; // 重置加载状态
            activePane.dataset.lastDate = ""; // 重置上一个日期
            activePane.dataset.currentDate = date; // <-- 【新增】记住当前要开始加载的日期

            // 调用加载函数（不再需要传递参数）
            loadQuestionsForActiveSubject();
            
            // 每日总结的逻辑保持不变
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

// --- 1.1. 主选项卡切换 (稍作修改以支持新面板) ---
    const mainTabBtns = document.querySelectorAll('.tab-btn');
    const mainTabPanes = document.querySelectorAll('.tab-pane');
    mainTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            mainTabBtns.forEach(b => b.classList.remove('active'));
            mainTabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const activePane = document.getElementById(btn.dataset.tab);
            activePane.classList.add('active');

            // 【新增】如果点击的是“计算错误”选项卡，且内容为空，则加载数据
            if (btn.dataset.tab === 'careless-mistake-tab' && activePane.querySelector('.careless-mistake-list').children.length === 0) {
                loadCarelessMistakes();
            }
        });
    });

    // --- 1.2. 科目子选项卡切换 ---
    const subjectTabBtns = document.querySelectorAll('.subject-btn');
    const subjectTabPanes = document.querySelectorAll('.subject-pane');
    subjectTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除所有按钮和面板的 active 状态
            subjectTabBtns.forEach(b => b.classList.remove('active'));
            subjectTabPanes.forEach(p => p.classList.remove('active'));
            
            // 激活被点击的按钮
            btn.classList.add('active');

            // 【正确顺序】
            // 1. 先根据按钮的 data-subject 找到对应的面板
            const activePane = document.getElementById(`subject-${btn.dataset.subject}`);
            
            // 2. 现在可以安全地对 activePane 进行操作了
            // 清除日期状态，这样加载时就会从最新的开始
            activePane.dataset.currentDate = ''; 
            
            // 3. 激活这个面板，让它显示出来
            activePane.classList.add('active');
            
            // 4. 如果面板是空的，就加载初始数据
            if (activePane.children.length <= 1) {
                loadQuestionsForActiveSubject();
            }
        });
    });

    // --- 1.3. 页面加载时，为默认激活的科目加载初始数据 ---
    loadQuestionsForActiveSubject();

    // --- 1.4. 无限滚动加载 (已修复) ---

    // 1. 直接获取那两个真正会产生滚动条的容器
    const questionContentArea = document.querySelector('.content-area');
    const carelessMistakeArea = document.getElementById('careless-mistake-tab');

    // 2. 为“错题回顾”面板添加独立的滚动监听
    if (questionContentArea) {
        questionContentArea.addEventListener('scroll', () => {
            const activePane = document.querySelector('.subject-pane.active');
            if (!activePane) return; // 如果没有激活的科目面板，则不执行

            const isLoading = activePane.dataset.isLoading === 'true';
            const hasMore = activePane.dataset.hasMore === 'true';
            
            // 判断是否滚动到底部的条件
            const isAtBottom = questionContentArea.scrollTop + questionContentArea.clientHeight >= questionContentArea.scrollHeight - 200;

            if (hasMore && !isLoading && isAtBottom) {
                console.log('Scrolling to bottom in questions, loading more...'); // 调试信息
                loadQuestionsForActiveSubject();
            }
        });
    }

    // 3. 为“计算错误”面板添加独立的滚动监听
    if (carelessMistakeArea) {
        carelessMistakeArea.addEventListener('scroll', () => {
            // 只有当这个面板本身是激活状态时才执行
            if (!carelessMistakeArea.classList.contains('active')) return;

            const isLoading = carelessMistakeArea.dataset.isLoading === 'true';
            const hasMore = carelessMistakeArea.dataset.hasMore === 'true';

            // 判断是否滚动到底部的条件
            const isAtBottom = carelessMistakeArea.scrollTop + carelessMistakeArea.clientHeight >= carelessMistakeArea.scrollHeight - 100;

            if (hasMore && !isLoading && isAtBottom) {
                console.log('Scrolling to bottom in careless mistakes, loading more...'); // 调试信息
                loadCarelessMistakes(); // 确保你有一个 loadCarelessMistakes 函数来加载数据
            }
        });
    }

    // --- 1.6. 核心函数：从API加载问题 ---
    function loadQuestionsForActiveSubject() {
        const activePane = document.querySelector('.subject-pane.active');
        // 【修改】移除函数参数，因为我们不再需要它了
        if (!activePane || activePane.dataset.isLoading === 'true') return;

        const subject = activePane.dataset.subjectName;
        let page = parseInt(activePane.dataset.page, 10);
        
        // 【新增】从面板状态中读取起始日期
        const startDate = activePane.dataset.currentDate;

        activePane.dataset.isLoading = 'true';
        const loader = activePane.querySelector('.loader');
        if (loader) loader.style.display = 'block';

        // 【修改】构建API URL时，如果存在起始日期，就总是带上它
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

                    // 【新增】如果是第一页加载，则自动滚动到目标日期
                    if (page === 1 && startDate) {
                        // 使用 setTimeout 确保DOM渲染完成后再滚动
                        setTimeout(() => {
                            const targetDateHeader = activePane.querySelector(`#date-${startDate}`);
                            if (targetDateHeader) {
                                const contentArea = document.querySelector('.content-area');
                                // 使用 scrollIntoView 实现平滑滚动
                                targetDateHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }, 100); // 100毫秒的延迟通常足够
                    }

                } else {
                    activePane.dataset.hasMore = 'false';
                    const message = (page === 1 && startDate) ? `日期 ${startDate} 下没有错题哦。` : '已经到底啦！';
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
                     <button class="action-btn" data-action="chat" title="和AI聊聊"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
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
    // --- 3.1 初始化富文本编辑器 ---
    tinymce.init({
        selector: '#reflection-editor',
        plugins: 'lists link image table code help wordcount',
        toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist outdent indent | link image | code',
        height: 300,
        menubar: false,
        placeholder: '在这里详细记录你的反思：是哪里看错了？哪个公式用混了？还是计算步骤跳步了？...'
    });

    // --- 3.2 上传区域的子选项卡切换逻辑 (带状态重置) ---
    const uploadSubTabs = document.querySelectorAll('.upload-sub-tabs .subject-btn');
    const uploadPanes = document.querySelectorAll('.upload-pane');
    const aiForm = document.getElementById('upload-form');
    const carelessForm = document.getElementById('careless-upload-form');

    uploadSubTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            // 切换激活状态
            uploadSubTabs.forEach(b => b.classList.remove('active'));
            uploadPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.subTab).classList.add('active');

            // 【UX优化】清空非激活选项卡的状态
            if (btn.dataset.subTab === 'ai-upload') {
                // 如果切换到AI上传，清空粗心上传表单
                carelessForm.reset();
                carelessForm.querySelector('#careless-image-preview').innerHTML = '';
                carelessForm.querySelector('#careless-upload-status').innerHTML = '';
            } else {
                // 如果切换到粗心上传，清空AI上传表单
                aiForm.reset();
                aiForm.querySelector('#image-preview').innerHTML = '';
                aiForm.querySelector('#upload-status').innerHTML = '';
            }
        });
    });

    // --- 3.3 AI智能分析上传逻辑 (独立作用域) ---
    if (aiForm) {
        const aiImageInput = aiForm.querySelector('#question_image');
        const aiImagePreview = aiForm.querySelector('#image-preview');
        const aiSubmitBtn = aiForm.querySelector('#submit-btn');
        const aiUploadStatus = aiForm.querySelector('#upload-status');

        aiImageInput.addEventListener('change', function() {
            aiImagePreview.innerHTML = '';
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    aiImagePreview.appendChild(img);
                }
                reader.readAsDataURL(file);
            }
        });

        aiForm.addEventListener('submit', function(event) {
            event.preventDefault();
            aiSubmitBtn.disabled = true;
            aiSubmitBtn.textContent = '正在分析中...';
            aiUploadStatus.innerHTML = '';
            aiUploadStatus.className = '';
            fetch('/upload', { method: 'POST', body: new FormData(aiForm) })
            .then(response => {
                if (!response.ok) return response.json().then(err => { throw new Error(err.message) });
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    aiUploadStatus.textContent = data.message + ' 页面即将刷新...';
                    aiUploadStatus.classList.add('success');
                    setTimeout(() => window.location.reload(), 2000);
                } else { throw new Error(data.message); }
            })
            .catch(error => {
                aiUploadStatus.textContent = '上传失败：' + error.message;
                aiUploadStatus.classList.add('error');
                aiSubmitBtn.disabled = false;
                aiSubmitBtn.textContent = '上传并分析';
            });
        });
    }

    // --- 3.4 粗心反思上传逻辑 (独立作用域) ---
    if (carelessForm) {
        const carelessImageInput = carelessForm.querySelector('#careless_question_image');
        const carelessImagePreview = carelessForm.querySelector('#careless-image-preview');
        const carelessSubmitBtn = carelessForm.querySelector('#careless-submit-btn');
        const carelessUploadStatus = carelessForm.querySelector('#careless-upload-status');

        carelessImageInput.addEventListener('change', function() {
            carelessImagePreview.innerHTML = '';
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    carelessImagePreview.appendChild(img);
                }
                reader.readAsDataURL(file);
            }
        });

        carelessForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const reflectionContent = tinymce.get('reflection-editor').getContent();
            if (!reflectionContent.trim()) {
                alert('请填写你的反思内容！');
                return;
            }

            carelessSubmitBtn.disabled = true;
            carelessSubmitBtn.textContent = '正在保存...';
            carelessUploadStatus.innerHTML = '';
            carelessUploadStatus.className = '';

            const formData = new FormData(carelessForm);
            formData.append('user_reflection', reflectionContent);

            fetch('/upload-careless-mistake', { method: 'POST', body: formData })
            .then(response => {
                if (!response.ok) return response.json().then(err => { throw new Error(err.message) });
                return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    carelessUploadStatus.textContent = data.message + ' 页面即将刷新...';
                    carelessUploadStatus.classList.add('success');
                    setTimeout(() => window.location.reload(), 2000);
                } else { throw new Error(data.message); }
            })
            .catch(error => {
                carelessUploadStatus.textContent = '保存失败：' + error.message;
                carelessUploadStatus.classList.add('error');
                carelessSubmitBtn.disabled = false;
                carelessSubmitBtn.textContent = '保存我的反思';
            });
        });
    }

    // ===================================================================
    // SECTION 4: ACTION BUTTONS LOGIC (EVENT DELEGATION)
    // ===================================================================
    const tabContent = document.querySelector('.tab-content');
    if (tabContent) {
        tabContent.addEventListener('click', function(event) {
            const actionBtn = event.target.closest('.action-btn');
            if (!actionBtn) return;

            const action = actionBtn.dataset.action;
            
            // AI错题回顾的操作
            const questionBlock = actionBtn.closest('.question-block');
            if (questionBlock && questionBlock.dataset.questionId) {
                const questionId = questionBlock.dataset.questionId;
                switch (action) {
                    case 'delete': handleDelete(questionId, questionBlock); break;
                    case 'copy': handleCopy(questionId, actionBtn); break;
                    case 'regenerate': handleRegenerate(questionId, questionBlock); break;
                    case 'edit': alert('修改功能正在开发中！'); break;
                    case 'chat': handleChat(questionId); break; // <-- 【新增】
                    case 'delete': handleDelete(questionId, questionBlock); break;
                }
            }

            // 【新增】粗心错误记录的操作
            const mistakeBlock = actionBtn.closest('.careless-mistake-block');
            if (mistakeBlock && mistakeBlock.dataset.mistakeId) {
                const mistakeId = mistakeBlock.dataset.mistakeId;
                switch (action) {
                    case 'edit-careless': handleEditCareless(mistakeId, mistakeBlock); break;
                    case 'copy-careless': handleCopyCareless(mistakeId, actionBtn); break;
                    case 'delete-careless': handleDeleteCareless(mistakeId, mistakeBlock); break;
                }
            }
        });
    }

    function handleChat(id) {
    window.open(`/chat/${id}`, '_blank');
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

    // ===================================================================
    // 【新增】SECTION 6: CARELESS MISTAKE LOGIC
    // ===================================================================
    function loadCarelessMistakes() {
        const container = document.querySelector('#careless-mistake-tab');
        if (!container || container.dataset.isLoading === 'true' || container.dataset.hasMore === 'false') return;

        let page = parseInt(container.dataset.page, 10);
        container.dataset.isLoading = 'true';
        const loader = container.querySelector('.loader');
        if (loader) loader.style.display = 'block';

        fetch(`/get-careless-mistakes?page=${page}`)
            .then(response => response.json())
            .then(mistakes => {
                if (loader) loader.style.display = 'none';
                if (mistakes.length > 0) {
                    renderCarelessMistakes(mistakes, container.querySelector('.careless-mistake-list'));
                    container.dataset.page = page + 1;
                } else {
                    container.dataset.hasMore = 'false';
                    const message = page === 1 ? '这里还没有记录哦。' : '已经到底啦！';
                    if (!container.querySelector('.end-message')) {
                         container.insertAdjacentHTML('beforeend', `<p class="end-message">${message}</p>`);
                    }
                }
            })
            .catch(error => {
                console.error('Error loading careless mistakes:', error);
                if (loader) loader.innerText = '加载失败，请重试。';
            })
            .finally(() => {
                container.dataset.isLoading = 'false';
            });
    }

    function renderCarelessMistakes(mistakes, container) {
        let html = '';
        mistakes.forEach(m => {
            // 【修改】添加了 action-toolbar div
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
                <div class="user-reflection-content">
                    ${m.user_reflection}
                </div>
            </div>`;
        });
        container.insertAdjacentHTML('beforeend', html);
    }


});

function handleDeleteCareless(id, element) {
    if (confirm('确定要删除这条记录吗？此操作不可撤销。')) {
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
}

function handleCopyCareless(id, button) {
    const mBlock = document.querySelector(`.careless-mistake-block[data-mistake-id="${id}"]`);
    const reflectionDiv = mBlock.querySelector('.user-reflection-content');
    // 使用 innerText 获取纯文本内容，去除HTML标签
    const textToCopy = reflectionDiv.innerText; 
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalIcon = button.innerHTML;
        button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => { button.innerHTML = originalIcon; }, 1500);
    }).catch(err => { console.error('Copy failed', err); alert('复制失败！'); });
}

function handleEditCareless(id, element) {
    const reflectionContainer = element.querySelector('.user-reflection-content');
    // 防止重复点击
    if (element.classList.contains('is-editing')) return;
    element.classList.add('is-editing');

    const originalHtml = reflectionContainer.innerHTML;
    const editorId = `editor-${id}`;

    // 1. 创建编辑器和按钮的HTML结构
    reflectionContainer.innerHTML = `
        <textarea id="${editorId}"></textarea>
        <div class="edit-controls">
            <button class="btn-save">保存</button>
            <button class="btn-cancel">取消</button>
        </div>
    `;

    // 2. 初始化 TinyMCE 编辑器
    tinymce.init({
        selector: `#${editorId}`,
        height: 250,
        menubar: false,
        plugins: 'lists link image table code help wordcount',
        toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | bullist numlist',
        setup: function(editor) {
            // 编辑器初始化完成后，填入原始内容
            editor.on('init', function() {
                editor.setContent(originalHtml);
            });
        }
    });

    // 3. 绑定保存和取消按钮的事件
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
                // 销毁编辑器实例
                tinymce.get(editorId).remove();
                // 更新为静态内容
                reflectionContainer.innerHTML = data.new_reflection;
                element.classList.remove('is-editing');
            } else {
                alert('保存失败: ' + data.message);
                btnSave.textContent = '保存';
                btnSave.disabled = false;
            }
        })
        .catch(err => {
            console.error('Save error:', err);
            alert('保存时发生网络错误。');
            btnSave.textContent = '保存';
            btnSave.disabled = false;
        });
    });

    btnCancel.addEventListener('click', () => {
        // 销毁编辑器实例
        tinymce.get(editorId).remove();
        // 恢复原始内容
        reflectionContainer.innerHTML = originalHtml;
        element.classList.remove('is-editing');
    });

}
