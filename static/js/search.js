// search.js - 错题搜索功能 (已修复)
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        // ... (顶部的变量声明保持不变) ...
        const searchForm = document.getElementById('search-form');
        const searchQueryInput = document.getElementById('search-query');
        const searchImageInput = document.getElementById('search-image-input');
        const imagePreviewContainer = document.getElementById('search-image-preview');
        const toggleFiltersCheckbox = document.getElementById('toggle-filters');
        const filtersContainer = document.getElementById('search-filters');
        const subjectFiltersContainer = document.getElementById('subject-filters');
        const knowledgeAreaFiltersContainer = document.getElementById('knowledge-area-filters');
        const resultsContainer = document.getElementById('search-results-container');
        const loader = document.getElementById('search-loader');

        let allFiltersData = {};

        // ... (initFilters 和 updateKnowledgeAreaFilters 函数保持不变) ...
        function initFilters() {
            fetch('/get-search-filters')
                .then(response => response.json())
                .then(data => {
                    allFiltersData = data;
                    subjectFiltersContainer.innerHTML = '';
                    Object.keys(allFiltersData).forEach(subject => {
                        const label = document.createElement('label');
                        label.innerHTML = `<input type="checkbox" name="subject" value="${subject}"> ${subject}`;
                        subjectFiltersContainer.appendChild(label);
                    });
                })
                .catch(error => console.error('Error fetching filters:', error));
        }

        function updateKnowledgeAreaFilters() {
            const selectedSubjects = Array.from(subjectFiltersContainer.querySelectorAll('input:checked')).map(input => input.value);
            knowledgeAreaFiltersContainer.innerHTML = '';

            if (selectedSubjects.length === 0) {
                knowledgeAreaFiltersContainer.innerHTML = '<p class="filter-placeholder">请先选择科目</p>';
                return;
            }

            const areasToShow = new Set();
            selectedSubjects.forEach(subject => {
                if (allFiltersData[subject]) {
                    allFiltersData[subject].forEach(area => areasToShow.add(area));
                }
            });

            Array.from(areasToShow).sort().forEach(area => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" name="area" value="${area}"> ${area}`;
                knowledgeAreaFiltersContainer.appendChild(label);
            });
        }

        /**
         * 【核心修改】生成与主页面一致的错题卡片HTML，并渲染Markdown
         * @param {object} q - 单个错题的数据对象
         * @returns {string} - 完整的HTML字符串
         */
        function createQuestionCardHTML(q) {
            // 【修改】在插入HTML前，先用 marked.js 解析可能包含Markdown的字段
            const problemAnalysisHtml = q.problem_analysis ? marked.parse(q.problem_analysis) : '<p>暂无解析。</p>';

            const knowledgePointsHtml = q.knowledge_points && q.knowledge_points.length > 0
                // 使用 marked.parseInline() 来避免在 li 标签内产生多余的 <p> 标签
                ? `<ul>${q.knowledge_points.map(p => `<li>${marked.parseInline(p)}</li>`).join('')}</ul>`
                : '<p>暂无知识点分析。</p>';

            const possibleErrorsHtml = q.ai_analysis && q.ai_analysis.length > 0
                ? `<ul>${q.ai_analysis.map(p => `<li>${marked.parseInline(p)}</li>`).join('')}</ul>`
                : '<p>暂无可能的错误分析。</p>';
            
            const similarExamplesHtml = q.similar_examples && q.similar_examples.length > 0
                ? q.similar_examples.map((ex, i) => `
                    <div class="example">
                        <p><strong>例题 ${i + 1}:</strong> ${marked.parseInline(ex.question)}</p>
                        <div><strong>解答:</strong> ${marked.parse(ex.answer)}</div>
                    </div>`).join('')
                : '<p>暂无相似例题。</p>';

            // 将用户的纯文本换行符 \n 转换为 <br>，或者直接用 marked 解析
            const insightHtml = q.my_insight ? marked.parse(q.my_insight) : '<p>暂无灵感记录。</p>';

            return `
            <div class="question-block" data-question-id="${q.id}">
                <div class="action-toolbar">
                    <a href="/chat/${q.id}" target="_blank" class="action-btn" title="与AI聊聊">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </a>
                    <button class="action-btn" data-action="regenerate" title="重新生成解析">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                    </button>
                    <button class="action-btn" data-action="delete" title="删除此题">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>

                <div class="date-header">${new Date(q.upload_date).toLocaleDateString()} - ${q.subject}</div>
                
                <div class="question-content-wrapper">
                    <div class="question-image-wrapper">
                        <h3>原题图片</h3>
                        <img src="data:image/jpeg;base64,${q.original_image_b64}" alt="错题图片">
                    </div>
                    <div class="question-analysis-wrapper">
                        <h3>AI 解析</h3>
                        <div class="ai-analysis-content">${problemAnalysisHtml}</div>
                    </div>
                </div>

                <h3>核心知识点</h3>
                ${knowledgePointsHtml}

                <h3>可能的错误</h3>
                ${possibleErrorsHtml}

                <h3>相似例题</h3>
                <div class="similar-examples-content">${similarExamplesHtml}</div>

                <div class="insight-panel">
                    <h3 class="insight-title">💡 我的灵光一闪</h3>
                    <div class="insight-display">${insightHtml}</div>
                </div>
            </div>
            `;
        }

        // 3. 渲染搜索结果 (使用新的卡片生成函数)
        function renderResults(questions) {
            resultsContainer.innerHTML = '';
            if (!questions || questions.length === 0) {
                resultsContainer.innerHTML = '<div class="placeholder">未找到相关错题。</div>';
                return;
            }
            // 使用 map 和 join 一次性更新 innerHTML，性能稍好
            resultsContainer.innerHTML = questions.map(createQuestionCardHTML).join('');
        }

        // ... (handleSearch 和 事件监听部分保持不变) ...
        async function handleSearch(event) {
            event.preventDefault();
            loader.style.display = 'block';
            resultsContainer.innerHTML = '';

            const formData = new FormData();
            formData.append('query', searchQueryInput.value);

            if (searchImageInput.files[0]) {
                formData.append('image', searchImageInput.files[0]);
            }

            const selectedSubjects = Array.from(subjectFiltersContainer.querySelectorAll('input:checked')).map(input => input.value);
            const selectedAreas = Array.from(knowledgeAreaFiltersContainer.querySelectorAll('input:checked')).map(input => input.value);
            formData.append('filters', JSON.stringify({
                subjects: selectedSubjects,
                areas: selectedAreas
            }));

            try {
                const response = await fetch('/search', {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || '搜索失败');
                }
                const results = await response.json();
                renderResults(results);
            } catch (error) {
                resultsContainer.innerHTML = `<div class="placeholder error-text">搜索出错：${error.message}</div>`;
            } finally {
                loader.style.display = 'none';
            }
        }

        toggleFiltersCheckbox.addEventListener('change', () => {
            filtersContainer.style.display = toggleFiltersCheckbox.checked ? 'flex' : 'none';
        });

        subjectFiltersContainer.addEventListener('change', updateKnowledgeAreaFilters);

        searchImageInput.addEventListener('change', function() {
            imagePreviewContainer.innerHTML = '';
            const file = this.files[0];
            if (file) {
                searchQueryInput.value = `[图片: ${file.name}]`;
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    imagePreviewContainer.appendChild(img);
                };
                reader.readAsDataURL(file);
            }
        });

        searchForm.addEventListener('submit', handleSearch);

        initFilters();
    });
})();
