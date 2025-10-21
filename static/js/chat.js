document.addEventListener('DOMContentLoaded', function() {
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    const md = window.markdownit({ html: true, linkify: true, typographer: true });

    const initialContext = `... (initial context from your data) ...`; // This is a placeholder
    
    // Use a more robust way to generate unique IDs
    const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // CHAT HISTORY - The single source of truth
    let messages = [{
        role: 'system', // The initial context is better suited as a system message
        content: `Based on the following analysis, answer the user's questions. Analysis: ${initialQuestionData.problem_analysis}`,
        id: generateId()
    }];

    // ===================================================================
    // CORE AI STREAMING FUNCTION (REFACTORED)
    // ===================================================================
    async function streamAIResponse(history) {
        const aiMessageId = generateId();
        const aiMessageElement = addMessageToUI('', 'ai', aiMessageId);
        const aiContentElement = aiMessageElement.querySelector('.message-content');
        aiContentElement.innerHTML = '<span class="blinking-cursor"></span>';

        // Disable input during streaming
        messageInput.disabled = true;
        sendBtn.disabled = true;

        try {
            const response = await fetch('/chat-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history.map(({id, ...rest}) => rest) }) // Don't send our internal ID to the API
            });

            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';
            aiContentElement.innerHTML = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                fullResponse += decoder.decode(value, { stream: true });
                aiContentElement.innerHTML = md.render(fullResponse);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            messages.push({ role: 'ai', content: fullResponse, id: aiMessageId });

        } catch (error) {
            console.error('Chat request failed:', error);
            aiContentElement.innerHTML = `<p class="error-text">Sorry, an error occurred: ${error.message}</p>`;
            messages.push({ role: 'ai', content: `Error: ${error.message}`, id: aiMessageId });
        } finally {
            messageInput.disabled = false;
            sendBtn.disabled = false;
            messageInput.focus();
        }
    }

    // ===================================================================
    // UI RENDERING
    // ===================================================================
    function addMessageToUI(content, role, id) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', role);
        messageElement.dataset.id = id; // Assign unique ID

        const avatar = `<div class="avatar">${role === 'user' ? '🧑‍🎓' : '🤖'}</div>`;
        
        const toolbarIcons = {
            regenerate: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`,
            edit: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
            copy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
            del: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
        };

        const editOrRegenButton = role === 'user' 
            ? `<button class="message-btn" title="Edit & Resubmit" data-action="edit">${toolbarIcons.edit}</button>`
            : `<button class="message-btn" title="Regenerate" data-action="regenerate">${toolbarIcons.regenerate}</button>`;

        const toolbar = `
            <div class="message-toolbar">
                ${editOrRegenButton}
                <button class="message-btn" title="Copy" data-action="copy">${toolbarIcons.copy}</button>
                <button class="message-btn" title="Delete" data-action="delete">${toolbarIcons.del}</button>
            </div>`;

        const contentHTML = role === 'user' ? `<p>${content}</p>` : md.render(content);
        messageElement.innerHTML = `
            ${avatar}
            <div class="message-content">${contentHTML}</div>
            ${toolbar}
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageElement;
    }

    // ===================================================================
    // EVENT LISTENERS
    // ===================================================================
    chatForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const userInput = messageInput.value.trim();
        if (!userInput) return;

        messageInput.value = '';
        messageInput.style.height = 'auto';

        const newId = generateId();
        messages.push({ role: 'user', content: userInput, id: newId });
        addMessageToUI(userInput, 'user', newId);
        
        streamAIResponse(messages);
    });

    // Main event delegation for all message actions
    chatMessages.addEventListener('click', (event) => {
        const actionBtn = event.target.closest('.message-btn');
        if (!actionBtn) return;

        const messageEl = actionBtn.closest('.message');
        const messageId = messageEl.dataset.id;
        const action = actionBtn.dataset.action;

        switch (action) {
            case 'copy': handleCopy(messageEl, actionBtn); break;
            case 'delete': handleDelete(messageId); break;
            case 'regenerate': handleRegenerate(messageId); break;
            case 'edit': handleEdit(messageId, messageEl); break;
        }
    });

    // ===================================================================
    // ACTION HANDLER FUNCTIONS
    // ===================================================================
    function handleCopy(messageEl, button) {
        const textToCopy = messageEl.querySelector('.message-content').innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalIcon = button.innerHTML;
            button.innerHTML = '✅';
            setTimeout(() => { button.innerHTML = originalIcon; }, 1500);
        }).catch(err => alert('Copy failed!'));
    }

    function handleDelete(messageId) {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return;

        // Remove this message and all subsequent messages
        messages.splice(messageIndex);

        // Remove corresponding DOM elements
        let elToRemove = chatMessages.querySelector(`[data-id="${messageId}"]`);
        while (elToRemove) {
            let nextEl = elToRemove.nextElementSibling;
            elToRemove.remove();
            elToRemove = nextEl;
        }
    }

    function handleRegenerate(messageId) {
        const messageIndex = messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1 || messages[messageIndex].role !== 'ai') return;

        // History is now up to the point *before* this AI message
        const historyToResubmit = messages.slice(0, messageIndex);
        
        // Delete this message and all subsequent ones
        handleDelete(messageId);
        
        // Resubmit for a new response
        streamAIResponse(historyToResubmit);
    }

    function handleEdit(messageId, messageEl) {
        const contentDiv = messageEl.querySelector('.message-content');
        const originalP = contentDiv.querySelector('p');
        if (!originalP) return; // Already editing or invalid format

        const originalText = originalP.innerText;
        
        contentDiv.innerHTML = `
            <textarea class="edit-textarea">${originalText}</textarea>
            <div class="edit-message-controls">
                <button class="btn-cancel">Cancel</button>
                <button class="btn-save">Save & Submit</button>
            </div>
        `;

        const textarea = contentDiv.querySelector('.edit-textarea');
        textarea.focus();
        textarea.style.height = textarea.scrollHeight + 'px';

        contentDiv.querySelector('.btn-cancel').addEventListener('click', () => {
            contentDiv.innerHTML = `<p>${originalText}</p>`;
        });

        contentDiv.querySelector('.btn-save').addEventListener('click', () => {
            const newText = textarea.value.trim();
            if (!newText) return;

            // Update the UI immediately
            contentDiv.innerHTML = `<p>${newText}</p>`;

            // Update the history and trigger regeneration
            const messageIndex = messages.findIndex(m => m.id === messageId);
            if (messageIndex === -1) return;

            // Update the user message content
            messages[messageIndex].content = newText;

            // History is now up to the point of the *edited* user message
            const historyToResubmit = messages.slice(0, messageIndex + 1);
            
            // Delete all subsequent messages
            const nextMessage = messages[messageIndex + 1];
            if (nextMessage) {
                handleDelete(nextMessage.id);
            }
            
            // Resubmit for a new response
            streamAIResponse(historyToResubmit);
        });
    }

    // Other listeners (like image modal)
    // ... (Your existing image modal logic can be pasted here) ...
    const sidebarImage = document.getElementById('sidebar-image');
    const imageModal = document.getElementById('image-modal');
    if (sidebarImage && imageModal) {
        const modalImage = document.getElementById('modal-image');
        const closeModalBtn = document.querySelector('.close-modal');
        const closeModal = () => imageModal.style.display = 'none';
        sidebarImage.addEventListener('click', () => {
            imageModal.style.display = 'flex';
            modalImage.src = sidebarImage.src;
        });
        closeModalBtn.addEventListener('click', closeModal);
        imageModal.addEventListener('click', (e) => { if (e.target === imageModal) closeModal(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    }
});
