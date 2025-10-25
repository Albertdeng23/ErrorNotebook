// actions.js - 动作按钮统一处理（删除、复制、重生成、聊天）
(function() {
    document.addEventListener('DOMContentLoaded', function() {
        const tabContent = document.querySelector('.tab-content');
        if (!tabContent) return;

        tabContent.addEventListener('click', function(event) {
            // 支持两类按钮：工具条按钮 (.action-btn) 和 注释控件 (.insight-btn)
            const clicked = event.target.closest('.action-btn, .insight-btn');
            if (!clicked) return;

            // 工具条按钮优先处理（问题级操作）
            if (clicked.classList.contains('action-btn')) {
                const actionBtn = clicked;
                const action = actionBtn.dataset.action;
                const questionBlock = actionBtn.closest('.question-block');
                if (questionBlock && questionBlock.dataset.questionId) {
                    const questionId = questionBlock.dataset.questionId;
                    switch (action) {
                        case 'delete': handleDelete(questionId, questionBlock); break;
                        case 'copy': handleCopy(questionId, actionBtn); break;
                        case 'regenerate': handleRegenerate(questionId, questionBlock); break;
                        case 'edit': alert('修改功能正在开发中！'); break;
                        case 'chat': handleChat(questionId); break;
                    }
                }

                // 处理粗心记录的工具条动作
                const mistakeBlock = actionBtn.closest('.careless-mistake-block');
                if (mistakeBlock && mistakeBlock.dataset.mistakeId) {
                    const mistakeId = mistakeBlock.dataset.mistakeId;
                    switch (action) {
                        case 'edit-careless': if (typeof handleEditCareless === 'function') handleEditCareless(mistakeId, mistakeBlock); break;
                        case 'copy-careless': if (typeof handleCopyCareless === 'function') handleCopyCareless(mistakeId, actionBtn); break;
                        case 'delete-careless': if (typeof handleDeleteCareless === 'function') handleDeleteCareless(mistakeId, mistakeBlock); break;
                    }
                }
            }

            // 注释栏按钮处理（我的灵光一闪）
            if (clicked.classList.contains('insight-btn')) {
                const insightBtn = clicked;
                const insightAction = insightBtn.dataset.action;
                const insightPanel = insightBtn.closest('.insight-panel');
                if (!insightPanel) return;
                const qid = insightPanel.dataset.questionId;
                switch (insightAction) {
                    case 'edit-insight': startEditInsight(insightPanel); break;
                    case 'save-insight': saveInsight(insightPanel, qid); break;
                    case 'cancel-insight': cancelEditInsight(insightPanel); break;
                }
            }
        });
    });

    function handleChat(id) { window.open(`/chat/${id}`, '_blank'); }

    function handleDelete(id, element) {
        if (!confirm('确定要删除这条错题记录吗？此操作不可撤销。')) return;
        fetch(`/delete/${id}`, { method: 'DELETE' })
        .then(response => {
            if (response.ok) {
                let dateHeader = element.previousElementSibling;
                while(dateHeader && !dateHeader.classList.contains('date-header')) { dateHeader = dateHeader.previousElementSibling; }
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

    function handleCopy(id, button) {
        const qBlock = document.querySelector(`.question-block[data-question-id="${id}"]`);
        if (!qBlock) return;
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
        if (analysisContent) analysisContent.style.opacity = '0.5';
        element.insertAdjacentHTML('afterbegin', '<p class="loading-text" style="text-align:center; font-weight:bold;">正在重新生成...</p>');
        fetch(`/regenerate/${id}`, { method: 'POST' })
        .then(response => { if (!response.ok) throw new Error('服务器响应错误'); return response.json(); })
        .then(data => {
            if (data.status === 'success') { alert('生成成功！页面将刷新以显示最新内容。'); window.location.reload(); } else { throw new Error(data.message || '未知错误'); }
        })
        .catch(error => { console.error('Error:', error); alert(`重新生成失败: ${error.message}`); })
        .finally(() => {
            const loadingText = element.querySelector('.loading-text'); if (loadingText) loadingText.remove();
            if (analysisContent) analysisContent.style.opacity = '1';
        });
    }

    // ==== Insight (我的灵光一闪) helpers ====
    function startEditInsight(panel) {
        const display = panel.querySelector('.insight-display');
        const editor = panel.querySelector('.insight-editor');
        const btnEdit = panel.querySelector('[data-action="edit-insight"]');
        const btnSave = panel.querySelector('[data-action="save-insight"]');
        const btnCancel = panel.querySelector('[data-action="cancel-insight"]');
        if (!display || !editor) return;
        display.style.display = 'none';
        editor.style.display = 'block';
        editor.focus();
        if (btnEdit) btnEdit.style.display = 'none';
        if (btnSave) btnSave.style.display = 'inline-block';
        if (btnCancel) btnCancel.style.display = 'inline-block';
    }

    function cancelEditInsight(panel) {
        const display = panel.querySelector('.insight-display');
        const editor = panel.querySelector('.insight-editor');
        const btnEdit = panel.querySelector('[data-action="edit-insight"]');
        const btnSave = panel.querySelector('[data-action="save-insight"]');
        const btnCancel = panel.querySelector('[data-action="cancel-insight"]');
        if (!display || !editor) return;
        editor.style.display = 'none';
        display.style.display = 'block';
        if (btnEdit) btnEdit.style.display = 'inline-block';
        if (btnSave) btnSave.style.display = 'none';
        if (btnCancel) btnCancel.style.display = 'none';
    }

    async function saveInsight(panel, qid) {
        const editor = panel.querySelector('.insight-editor');
        const display = panel.querySelector('.insight-display');
        const btnSave = panel.querySelector('[data-action="save-insight"]');
        if (!editor || !display) return;
        const text = editor.value.trim();
        if (btnSave) { btnSave.disabled = true; btnSave.textContent = '保存中...'; }
        try {
            const resp = await fetch(`/update-insight/${qid}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insight: text })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.message || '保存失败');
            display.innerHTML = text ? text : '<em class="muted">还没有添加你的灵光一闪，点编辑写下你的想法。</em>';
            cancelEditInsight(panel);
        } catch (err) {
            console.error('保存注释失败', err);
            alert('保存注释失败：' + err.message);
        } finally {
            if (btnSave) { btnSave.disabled = false; btnSave.textContent = '保存'; }
        }
    }

    // 不导出私有函数（全局行为通过事件委托触发）
})();
