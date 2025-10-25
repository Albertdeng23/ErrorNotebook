// summary.js - 处理每日总结、图表和重新生成逻辑
(function() {
    let subjectChartInstance = null;
    let weeklyChartInstance = null;

    function createSubjectChart(canvasId, chartData) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (subjectChartInstance) {
            try { subjectChartInstance.destroy(); } catch (e) { /* ignore */ }
        }

        subjectChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: '科目错题数',
                    data: chartData.data,
                    backgroundColor: ['rgba(255, 99, 132, 0.5)', 'rgba(54, 162, 235, 0.5)', 'rgba(255, 206, 86, 0.5)', 'rgba(75, 192, 192, 0.5)', 'rgba(153, 102, 255, 0.5)', 'rgba(255, 159, 64, 0.5)'],
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } }
            }
        });
    }

    async function fetchAndUpdateSummary(date) {
        const summaryContainer = document.getElementById('daily-summary-container');
        if (summaryContainer) summaryContainer.innerHTML = `<div class="placeholder"><h2>正在为 ${date} 加载总结...</h2></div>`;

        try {
            const response = await fetch(`/get-summary/${date}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || '服务器响应错误');
            updateSummaryUI(data);
        } catch (error) {
            console.error('Error fetching summary:', error);
            if (summaryContainer) summaryContainer.innerHTML = `<div class="placeholder error-text">加载总结失败：${error.message}</div>`;
        }
    }

    function updateSummaryUI(data) {
        const summaryContainer = document.getElementById('daily-summary-container');
        if (!summaryContainer) return;
        if (!data || data.error || (data.ai_summary && data.ai_summary.error)) {
            const errorMessage = data ? (data.error || (data.ai_summary ? data.ai_summary.error : '未知错误')) : '未能加载总结数据。';
            summaryContainer.innerHTML = `<div class="placeholder"><h2>学习总结</h2><p class="error-text">${errorMessage}</p></div>`;
            return;
        }

        const knowledgePointsHTML = (data.ai_summary.knowledge_points_summary || []).map(point => `<li>${point}</li>`).join('');

        summaryContainer.innerHTML = `
            <div class="summary-header">
                <h2>学习总结 (${data.date})</h2>
                <button id="regenerate-summary-btn" class="secondary-btn" title="使用最新的AI模型重新生成总结">🔄 重新生成</button>
            </div>
            <p><strong>学习总纲：</strong>${data.ai_summary.general_summary}</p>
            <p><strong>核心知识点：</strong></p>
            <ul>${knowledgePointsHTML}</ul>
            <div class="summary-stats">
                <div class="stat-item"><strong>当日错题数：</strong> ${data.question_count} 道</div>
                <div class="stat-item subject-chart-container"><strong>科目分布：</strong><canvas id="subject-bar-chart-dynamic"></canvas></div>
            </div>
        `;

        if (data.subject_chart_data) createSubjectChart('subject-bar-chart-dynamic', data.subject_chart_data);
        attachRegenerateListener();
    }

    async function handleRegenerateSummary() {
        const regenerateBtn = document.getElementById('regenerate-summary-btn');
        const summaryTitle = document.querySelector('#daily-summary-container h2');
        if (!regenerateBtn || !summaryTitle) return;

        const dateMatch = summaryTitle.innerText.match(/\((.*?)\)/);
        if (!dateMatch || !dateMatch[1]) { console.error('无法从标题中解析日期'); return; }
        const dateToRegenerate = dateMatch[1];

        regenerateBtn.disabled = true;
        regenerateBtn.innerHTML = '生成中...';

        try {
            const response = await fetch(`/regenerate-summary/${dateToRegenerate}`, { method: 'POST' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '重新生成失败');
            updateSummaryUI(result);
        } catch (error) {
            console.error('重新生成总结时出错:', error);
            const summaryContainer = document.getElementById('daily-summary-container');
            if (summaryContainer) summaryContainer.innerHTML += `<p class="error-text" style="text-align:center; margin-top:10px;">${error.message}</p>`;
        } finally {
            const finalBtn = document.getElementById('regenerate-summary-btn');
            if (finalBtn) { finalBtn.disabled = false; finalBtn.innerHTML = '🔄 重新生成'; }
        }
    }

    function attachRegenerateListener() {
        const regenerateBtn = document.getElementById('regenerate-summary-btn');
        if (regenerateBtn) regenerateBtn.addEventListener('click', handleRegenerateSummary);
    }

    // 导出到全局以供其他模块调用
    window.createSubjectChart = createSubjectChart;
    window.fetchAndUpdateSummary = fetchAndUpdateSummary;
    window.attachRegenerateListener = attachRegenerateListener;

    // 页面加载时渲染近7日折线图（如果后端注入了 weeklyChartData）
    document.addEventListener('DOMContentLoaded', function() {
        try {
            if (typeof weeklyChartData !== 'undefined' && weeklyChartData && Array.isArray(weeklyChartData.labels) && weeklyChartData.labels.length > 0) {
                const el = document.getElementById('weekly-chart');
                if (el) {
                    const ctx = el.getContext('2d');
                    if (weeklyChartInstance) { try { weeklyChartInstance.destroy(); } catch (e) {} }
                    weeklyChartInstance = new Chart(ctx, {
                        type: 'line',
                        data: { labels: weeklyChartData.labels, datasets: [{ label: '每日新增错题数', data: weeklyChartData.data, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, fill: true }] },
                        options: { scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
                    });
                }
            }
        } catch (err) {
            console.error('初始化 weekly chart 时出错:', err);
        }
    });

})();
