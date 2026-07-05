let skrybaChatHistory = [];
let skrybaThreads = [];
let skrybaActiveThreadId = null;

function loadSkrybaThreadsFromStorage() {
    try {
        const raw = localStorage.getItem(ASSISTANT_THREADS_KEY);
        if (!raw) {
            skrybaThreads = [];
            skrybaActiveThreadId = null;
            return;
        }
        const data = JSON.parse(raw);
        skrybaThreads = Array.isArray(data.threads) ? data.threads : [];
        skrybaActiveThreadId = data.activeId || null;
    } catch {
        skrybaThreads = [];
        skrybaActiveThreadId = null;
    }
}

function saveSkrybaThreadsToStorage() {
    try {
        localStorage.setItem(ASSISTANT_THREADS_KEY, JSON.stringify({
            activeId: skrybaActiveThreadId,
            threads: skrybaThreads.slice(0, SKRYBA_MAX_THREADS)
        }));
    } catch { /* ignore */ }
}

function getSkrybaThreadById(id) {
    return skrybaThreads.find((t) => t.id === id) || null;
}

function createSkrybaThread(title = 'Nowa rozmowa') {
    return {
        id: `thread_${Date.now()}`,
        title,
        updatedAt: Date.now(),
        messages: [],
        lastSearchResults: [],
        lastAdvisorContext: null,
        lastTransactionFilter: null
    };
}

function skrybaPersistActiveThread() {
    if (!skrybaActiveThreadId) return;
    const thread = getSkrybaThreadById(skrybaActiveThreadId);
    if (!thread) return;
    thread.messages = skrybaChatHistory.map((m) => {
        const copy = { role: m.role, text: m.text };
        if (m.meta) copy.meta = JSON.parse(JSON.stringify(m.meta));
        return copy;
    });
    thread.lastSearchResults = skrybaLastSearchResults;
    thread.lastAdvisorContext = skrybaLastAdvisorContext;
    thread.lastTransactionFilter = skrybaLastTransactionFilter;
    thread.updatedAt = Date.now();
    const firstUser = thread.messages.find((m) => m.role === 'user');
    if (firstUser?.text) {
        thread.title = firstUser.text.slice(0, 48) + (firstUser.text.length > 48 ? '…' : '');
    }
    skrybaThreads.sort((a, b) => b.updatedAt - a.updatedAt);
    saveSkrybaThreadsToStorage();
}

function ensureActiveSkrybaThread() {
    if (skrybaActiveThreadId && getSkrybaThreadById(skrybaActiveThreadId)) return;
    const thread = createSkrybaThread();
    skrybaThreads.unshift(thread);
    skrybaActiveThreadId = thread.id;
    saveSkrybaThreadsToStorage();
}

function skrybaLoadActiveThreadIntoUi() {
    const thread = getSkrybaThreadById(skrybaActiveThreadId);
    skrybaChatHistory = thread?.messages ? thread.messages.map((m) => ({ ...m })) : [];
    skrybaLastSearchResults = Array.isArray(thread?.lastSearchResults)
        ? thread.lastSearchResults
        : [];
    skrybaLastAdvisorContext = thread?.lastAdvisorContext || null;
    skrybaLastTransactionFilter = thread?.lastTransactionFilter || null;
    skrybaPendingTransaction = null;
    const list = document.getElementById('skryba-messages');
    if (list) list.innerHTML = '';
    if (!skrybaChatHistory.length) {
        renderSkrybaWelcomeIfEmpty();
    } else {
        skrybaChatHistory.forEach((entry) => {
            if (entry.role === 'user') {
                appendSkrybaMessage('user', entry.text, '', { skipPersist: true, skipScroll: true });
                return;
            }
            if (entry.role !== 'assistant') return;
            if (entry.meta?.pending?.transaction) {
                if (typeof restoreSkrybaPendingFromHistoryEntry === 'function') {
                    restoreSkrybaPendingFromHistoryEntry(entry);
                }
                return;
            }
            if (entry.meta?.skrybaTxList?.filter) {
                const items = typeof skrybaGetFilteredTransactionItems === 'function'
                    ? skrybaGetFilteredTransactionItems(entry.meta.skrybaTxList.filter)
                    : [];
                const extraHtml = typeof buildSkrybaTransactionListExtraHtml === 'function'
                    ? buildSkrybaTransactionListExtraHtml(items)
                    : '';
                appendSkrybaMessage('assistant', entry.text, extraHtml, { skipPersist: true, skipScroll: true });
                return;
            }
            appendSkrybaMessage('assistant', entry.text, '', { skipPersist: true, skipScroll: true });
        });
        scrollSkrybaToBottom();
    }
    updateSkrybaHeaderForChat();
}

function skrybaStartNewThread() {
    skrybaPersistActiveThread();
    const thread = createSkrybaThread();
    skrybaThreads.unshift(thread);
    skrybaActiveThreadId = thread.id;
    saveSkrybaThreadsToStorage();
    skrybaLoadActiveThreadIntoUi();
    skrybaShowChatView();
    document.getElementById('skryba-input')?.focus();
}

function clearSkrybaConversation() {
    skrybaStartNewThread();
}

function skrybaOpenThread(threadId) {
    skrybaPersistActiveThread();
    skrybaActiveThreadId = threadId;
    saveSkrybaThreadsToStorage();
    skrybaLoadActiveThreadIntoUi();
    skrybaShowChatView();
}

function formatSkrybaThreadDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
}

function skrybaDeleteThread(threadId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!threadId || !getSkrybaThreadById(threadId)) return;
    skrybaThreads = skrybaThreads.filter((t) => t.id !== threadId);
    if (skrybaActiveThreadId === threadId) {
        skrybaActiveThreadId = skrybaThreads[0]?.id || null;
        if (!skrybaActiveThreadId) ensureActiveSkrybaThread();
        skrybaLoadActiveThreadIntoUi();
    }
    saveSkrybaThreadsToStorage();
    renderSkrybaThreadsList();
    if (typeof showSettingsToast === 'function') showSettingsToast('Usunięto rozmowę');
}

function skrybaDeleteAllThreads() {
    if (!skrybaThreads.length) return;
    if (typeof confirm === 'function'
        && !confirm('Usunąć całą historię rozmów Skryby? Tej operacji nie cofniesz.')) {
        return;
    }
    skrybaThreads = [];
    skrybaActiveThreadId = null;
    ensureActiveSkrybaThread();
    saveSkrybaThreadsToStorage();
    skrybaLoadActiveThreadIntoUi();
    renderSkrybaThreadsList();
    if (typeof showSettingsToast === 'function') showSettingsToast('Historia rozmów wyczyszczona');
}

function renderSkrybaThreadsList() {
    const list = document.getElementById('skryba-threads-list');
    if (!list) return;
    list.innerHTML = '';
    if (!skrybaThreads.length) {
        const empty = document.createElement('p');
        empty.className = 'skryba-threads-empty';
        empty.textContent = 'Brak zapisanych rozmów. Rozpocznij nową i wróć tutaj później.';
        list.appendChild(empty);
        return;
    }
    skrybaThreads.forEach((thread) => {
        const row = document.createElement('div');
        row.className = 'skryba-thread-row';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skryba-thread-item';
        const last = thread.messages?.[thread.messages.length - 1];
        const preview = last?.text?.slice(0, 60) || 'Pusta rozmowa';
        btn.innerHTML = `<p class="skryba-thread-item-title">${escapeHtml(thread.title || 'Rozmowa')}</p>
            <p class="skryba-thread-item-meta">${escapeHtml(formatSkrybaThreadDate(thread.updatedAt))} · ${escapeHtml(preview)}</p>`;
        btn.onclick = () => skrybaOpenThread(thread.id);
        row.appendChild(btn);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'skryba-thread-delete';
        del.setAttribute('aria-label', 'Usuń rozmowę');
        del.textContent = '×';
        del.onclick = (event) => skrybaDeleteThread(thread.id, event);
        row.appendChild(del);

        list.appendChild(row);
    });
}

function updateSkrybaHeaderForChat() {
    const titleEl = document.getElementById('skryba-header-title');
    const subEl = document.getElementById('skryba-header-subtitle');
    const thread = getSkrybaThreadById(skrybaActiveThreadId);
    if (titleEl) titleEl.textContent = 'Skryba';
    if (subEl) {
        if (thread?.title) {
            subEl.textContent = thread.title;
            subEl.classList.remove('hidden');
        } else {
            subEl.textContent = '';
            subEl.classList.add('hidden');
        }
    }
}

function skrybaShowThreadsView() {
    skrybaPersistActiveThread();
    document.getElementById('skryba-threads-view')?.classList.remove('hidden');
    document.getElementById('skryba-chat-view')?.classList.add('hidden');
    document.getElementById('btn-skryba-back')?.classList.remove('hidden');
    const titleEl = document.getElementById('skryba-header-title');
    const subEl = document.getElementById('skryba-header-subtitle');
    if (titleEl) titleEl.textContent = 'Historia rozmów';
    if (subEl) subEl.classList.add('hidden');
    renderSkrybaThreadsList();
}

function skrybaShowChatView() {
    document.getElementById('skryba-threads-view')?.classList.add('hidden');
    document.getElementById('skryba-chat-view')?.classList.remove('hidden');
    document.getElementById('btn-skryba-back')?.classList.add('hidden');
    updateSkrybaHeaderForChat();
}
