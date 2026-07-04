let skrybaChatHistory = [];
let skrybaPendingTransaction = null;
let skrybaPendingAction = null;
let skrybaPendingClarify = null;
let skrybaLastSearchResults = [];
let skrybaLastAdvisorContext = null;
let skrybaThreads = [];
let skrybaActiveThreadId = null;
let skrybaViewportBound = false;

const SKRYBA_USER_AVATAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
const SKRYBA_ASSISTANT_AVATAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h3l3 3 3-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

function isAssistantEnabled() {
    try {
        const raw = localStorage.getItem(ASSISTANT_ENABLED_KEY);
        if (raw === null) return false;
        return raw === '1' || raw === 'true';
    } catch {
        return false;
    }
}

function setAssistantEnabled(enabled) {
    try {
        localStorage.setItem(ASSISTANT_ENABLED_KEY, enabled ? '1' : '0');
    } catch { /* ignore */ }
    syncAssistantSettingsUI();
    syncSkrybaHeaderVisibility();
}

function isAssistantConfirmTxEnabled() {
    try {
        const raw = localStorage.getItem(ASSISTANT_CONFIRM_TX_KEY);
        if (raw === null) return true;
        return raw === '1' || raw === 'true';
    } catch {
        return true;
    }
}

function setAssistantConfirmTx(enabled) {
    try {
        localStorage.setItem(ASSISTANT_CONFIRM_TX_KEY, enabled ? '1' : '0');
    } catch { /* ignore */ }
}

function getAssistantApiKey() {
    try {
        const stored = localStorage.getItem(ASSISTANT_API_KEY_KEY);
        if (stored !== null) return stored.trim();
        return (typeof ASSISTANT_DEFAULT_API_KEY === 'string' ? ASSISTANT_DEFAULT_API_KEY : '').trim();
    } catch {
        return (typeof ASSISTANT_DEFAULT_API_KEY === 'string' ? ASSISTANT_DEFAULT_API_KEY : '').trim();
    }
}

function setAssistantApiKey(value) {
    try {
        localStorage.setItem(ASSISTANT_API_KEY_KEY, String(value || '').trim());
    } catch { /* ignore */ }
}

function syncSkrybaHeaderVisibility() {
    const btn = document.getElementById('btn-skryba');
    if (btn) btn.classList.toggle('hidden', !isAssistantEnabled());
}

function syncAssistantSettingsUI() {
    const enabledEl = document.getElementById('assistant-enabled-toggle');
    const confirmEl = document.getElementById('assistant-confirm-tx-toggle');
    const keyEl = document.getElementById('assistant-api-key');
    if (enabledEl) enabledEl.checked = isAssistantEnabled();
    if (confirmEl) confirmEl.checked = isAssistantConfirmTxEnabled();
    if (keyEl && keyEl.value !== getAssistantApiKey()) keyEl.value = getAssistantApiKey();
}

function onAssistantEnabledToggle() {
    const el = document.getElementById('assistant-enabled-toggle');
    setAssistantEnabled(!!el?.checked);
}

function onAssistantConfirmTxToggle() {
    const el = document.getElementById('assistant-confirm-tx-toggle');
    setAssistantConfirmTx(!!el?.checked);
}

function onAssistantApiKeyBlur() {
    const el = document.getElementById('assistant-api-key');
    setAssistantApiKey(el?.value || '');
}

function saveAssistantApiKey() {
    const el = document.getElementById('assistant-api-key');
    setAssistantApiKey(el?.value || '');
    if (typeof showSettingsToast === 'function') {
        showSettingsToast(getAssistantApiKey() ? 'Klucz API zapisany lokalnie' : 'Klucz API usunięty');
    }
}

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
        lastAdvisorContext: null
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
                restoreSkrybaPendingFromHistoryEntry(entry);
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
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skryba-thread-item';
        const last = thread.messages?.[thread.messages.length - 1];
        const preview = last?.text?.slice(0, 60) || 'Pusta rozmowa';
        btn.innerHTML = `<p class="skryba-thread-item-title">${escapeHtml(thread.title || 'Rozmowa')}</p>
            <p class="skryba-thread-item-meta">${escapeHtml(formatSkrybaThreadDate(thread.updatedAt))} · ${escapeHtml(preview)}</p>`;
        btn.onclick = () => skrybaOpenThread(thread.id);
        list.appendChild(btn);
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

function scrollSkrybaToBottom() {
    const list = document.getElementById('skryba-messages');
    if (list) list.scrollTop = list.scrollHeight;
}

function syncSkrybaViewport() {
    const overlay = document.getElementById('skryba-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    const vv = window.visualViewport;
    if (vv) {
        overlay.style.height = `${vv.height}px`;
        overlay.style.top = `${vv.offsetTop}px`;
    }
    scrollSkrybaToBottom();
}

function clearSkrybaViewportStyles() {
    const overlay = document.getElementById('skryba-overlay');
    if (!overlay) return;
    overlay.style.height = '';
    overlay.style.top = '';
}

function bindSkrybaViewport() {
    if (skrybaViewportBound || !window.visualViewport) return;
    skrybaViewportBound = true;
    const update = () => syncSkrybaViewport();
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
}

function toggleSkrybaPanel() {
    const panel = document.getElementById('skryba-overlay');
    if (!panel) return;
    if (panel.classList.contains('hidden')) openSkrybaPanel();
    else closeSkrybaPanel();
}

function openSkrybaPanel() {
    if (!isAssistantEnabled()) {
        if (typeof showAppToast === 'function') {
            showAppToast('Włącz Skrybę w Ustawienia → Asystent AI', 'default');
        }
        return;
    }
    loadSkrybaThreadsFromStorage();
    ensureActiveSkrybaThread();
    const overlay = document.getElementById('skryba-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.classList.add('skryba-open');
    const btn = document.getElementById('btn-skryba');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    skrybaShowChatView();
    skrybaLoadActiveThreadIntoUi();
    bindSkrybaViewport();
    syncSkrybaViewport();
    window.setTimeout(() => {
        document.getElementById('skryba-input')?.focus();
        syncSkrybaViewport();
    }, 80);
}

function closeSkrybaPanel() {
    skrybaPersistActiveThread();
    clearSkrybaViewportStyles();
    document.getElementById('skryba-overlay')?.classList.add('hidden');
    document.body.classList.remove('skryba-open');
    const btn = document.getElementById('btn-skryba');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.getElementById('skryba-input')?.blur();
}

function renderSkrybaWelcomeIfEmpty() {
    const list = document.getElementById('skryba-messages');
    if (!list || list.children.length) return;

    const body = typeof buildSkrybaWelcomeBody === 'function'
        ? buildSkrybaWelcomeBody()
        : 'Cześć! Tu Skryba — pomogę ogarnąć wydatki i budżet.';
    const chipsHtml = buildSkrybaWelcomeChipsHtml();
    appendSkrybaMessage('assistant', body, chipsHtml, { skipPersist: true });
}

function polishSkrybaText(text) {
    if (text === '…') return text;
    return typeof polishSkrybaReply === 'function' ? polishSkrybaReply(text) : String(text || '');
}

function appendSkrybaFollowUpChips(chips) {
    if (!Array.isArray(chips) || !chips.length) return;
    const extraHtml = `<div class="skryba-chip-row skryba-chip-row--followup">${chips.map((chip) => (
        `<button type="button" class="skryba-chip" onclick="skrybaSendSuggestion(this.dataset.text)" data-text="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`
    )).join('')}</div>`;
    const list = document.getElementById('skryba-messages');
    const row = document.createElement('div');
    row.className = 'skryba-msg skryba-msg--assistant skryba-msg--chips';
    row.innerHTML = `<div class="skryba-msg-body"><div class="skryba-msg-extra">${extraHtml}</div></div>`;
    list?.appendChild(row);
    scrollSkrybaToBottom();
}

function autoResizeSkrybaInput() {
    const input = document.getElementById('skryba-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

function showSkrybaVoicePreview(text) {
    const preview = document.getElementById('skryba-voice-preview');
    const label = document.getElementById('skryba-voice-preview-text');
    if (!preview || !label) {
        const input = document.getElementById('skryba-input');
        if (input) input.value = text;
        return;
    }
    label.textContent = text;
    preview.classList.remove('hidden');
}

function hideSkrybaVoicePreview() {
    document.getElementById('skryba-voice-preview')?.classList.add('hidden');
}

function confirmSkrybaVoicePreview() {
    const label = document.getElementById('skryba-voice-preview-text');
    const text = label?.textContent?.trim() || '';
    const input = document.getElementById('skryba-input');
    if (input) input.value = text;
    hideSkrybaVoicePreview();
    if (text) sendSkrybaMessage();
}

function cancelSkrybaVoicePreview() {
    const input = document.getElementById('skryba-input');
    if (input) input.value = '';
    hideSkrybaVoicePreview();
}

function buildSkrybaWelcomeChipsHtml() {
    const chips = [
        'Podsumowanie miesiąca',
        'Briefing tygodnia',
        'Co z nadwyżką?',
        'Rozlicz miesiąc',
        'Otwórz raporty'
    ];
    return `<div class="skryba-chip-row">${chips.map((chip) => (
        `<button type="button" class="skryba-chip" onclick="skrybaSendSuggestion(this.dataset.text)" data-text="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`
    )).join('')}</div>`;
}

function skrybaSendSuggestion(text) {
    const input = document.getElementById('skryba-input');
    if (!input) return;
    input.value = String(text || '');
    sendSkrybaMessage();
}

function createSkrybaAvatar(role) {
    const avatar = document.createElement('div');
    avatar.className = `skryba-msg-avatar skryba-msg-avatar--${role}`;
    avatar.setAttribute('aria-hidden', 'true');
    avatar.innerHTML = role === 'user' ? SKRYBA_USER_AVATAR_SVG : SKRYBA_ASSISTANT_AVATAR_SVG;
    return avatar;
}

function appendSkrybaMessage(role, text, extraHtml = '', options = {}) {
    const list = document.getElementById('skryba-messages');
    if (!list) return null;
    const messageId = options.messageId || `skryba-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const row = document.createElement('div');
    row.className = `skryba-msg skryba-msg--${role}${text === '…' ? ' skryba-msg--typing' : ''}`;
    row.dataset.messageId = messageId;

    const body = document.createElement('div');
    body.className = 'skryba-msg-body';
    const bubble = document.createElement('div');
    bubble.className = 'skryba-msg-bubble';
    bubble.textContent = role === 'assistant' ? polishSkrybaText(text) : text;
    body.appendChild(bubble);
    if (extraHtml) {
        const extra = document.createElement('div');
        extra.className = 'skryba-msg-extra';
        extra.innerHTML = extraHtml;
        body.appendChild(extra);
    }

    const avatar = createSkrybaAvatar(role);
    if (role === 'user') {
        row.appendChild(body);
        row.appendChild(avatar);
    } else {
        row.appendChild(avatar);
        row.appendChild(body);
    }

    list.appendChild(row);
    if (!options.skipScroll) scrollSkrybaToBottom();
    return messageId;
}

function appendSkrybaTypewriterMessage(text, options = {}) {
    const list = document.getElementById('skryba-messages');
    if (!list) return null;
    const messageId = options.messageId || `skryba-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const row = document.createElement('div');
    row.className = 'skryba-msg skryba-msg--assistant';
    row.dataset.messageId = messageId;

    const body = document.createElement('div');
    body.className = 'skryba-msg-body';
    const bubble = document.createElement('div');
    bubble.className = 'skryba-msg-bubble';
    bubble.textContent = '';
    body.appendChild(bubble);

    const avatar = createSkrybaAvatar('assistant');
    row.appendChild(avatar);
    row.appendChild(body);
    list.appendChild(row);
    if (!options.skipScroll) scrollSkrybaToBottom();

    const fullText = polishSkrybaText(String(text || ''));
    if (!fullText || options.instant) {
        bubble.textContent = fullText;
        return messageId;
    }

    let index = 0;
    const step = Math.max(1, Math.ceil(fullText.length / 36));
    const tick = () => {
        index = Math.min(fullText.length, index + step);
        bubble.textContent = fullText.slice(0, index);
        scrollSkrybaToBottom();
        if (index < fullText.length) {
            window.requestAnimationFrame(tick);
        }
    };
    window.requestAnimationFrame(tick);
    return messageId;
}

function buildSkrybaPendingTransactionExtraHtml() {
    return `<div class="skryba-tx-actions">
            <button type="button" class="skryba-btn skryba-btn--primary" onclick="confirmSkrybaPendingTransaction()">Dodaj</button>
            <button type="button" class="skryba-btn" onclick="cancelSkrybaPendingTransaction()">Anuluj</button>
        </div>`;
}

function getSkrybaPendingTransactionState() {
    return skrybaPendingTransaction?.status === 'pending' ? skrybaPendingTransaction : null;
}

function findSkrybaPendingMessageRow() {
    const id = skrybaPendingTransaction?.domMessageId;
    if (!id) return null;
    return document.querySelector(`[data-message-id="${id}"]`);
}

function updateSkrybaPendingDom() {
    const pending = getSkrybaPendingTransactionState();
    if (!pending) return;
    const row = findSkrybaPendingMessageRow();
    if (!row) return;
    const bubble = row.querySelector('.skryba-msg-bubble');
    const preview = row.querySelector('.skryba-tx-preview');
    if (bubble) bubble.textContent = pending.replyText || 'Proponuję dodać transakcję:';
    if (preview) {
        preview.textContent = formatAssistantTransactionPreview(pending.transaction);
        preview.classList.add('skryba-tx-preview--updated');
    }
    scrollSkrybaToBottom();
}

function syncSkrybaPendingHistoryEntry() {
    const pending = getSkrybaPendingTransactionState();
    if (!pending) return;
    const idx = skrybaChatHistory.findIndex((e) => e.meta?.pending?.id === pending.id);
    if (idx < 0) return;
    skrybaChatHistory[idx] = {
        role: 'assistant',
        text: pending.replyText || 'Proponuję dodać transakcję:',
        meta: {
            pending: {
                id: pending.id,
                transaction: { ...pending.transaction }
            }
        }
    };
}

function appendSkrybaPendingTransaction(tx, options = {}) {
    const normalized = typeof normalizeAssistantTransaction === 'function'
        ? normalizeAssistantTransaction(tx)
        : tx;
    if (!normalized) return;

    const pendingId = `pending_${Date.now()}`;
    const replyText = options.replyText
        || (typeof getSkrybaActionReplyPhrase === 'function'
            ? getSkrybaActionReplyPhrase('add_transaction')
            : 'Proponuję dodać taką transakcję — sprawdź szczegóły i potwierdź:');
    const label = formatAssistantTransactionPreview(normalized);
    const extraHtml = `<div class="skryba-tx-preview">${escapeHtml(label)}</div>${buildSkrybaPendingTransactionExtraHtml()}`;
    const domMessageId = appendSkrybaMessage('assistant', replyText, extraHtml);

    skrybaPendingTransaction = {
        id: pendingId,
        version: 1,
        status: 'pending',
        source: options.source || 'ai',
        transaction: normalized,
        domMessageId,
        replyText
    };

    skrybaChatHistory.push({
        role: 'assistant',
        text: replyText,
        meta: {
            pending: {
                id: pendingId,
                transaction: { ...normalized }
            }
        }
    });
}

function restoreSkrybaPendingFromHistoryEntry(entry) {
    const pendingMeta = entry.meta?.pending;
    if (!pendingMeta?.transaction) {
        appendSkrybaMessage('assistant', entry.text, '', { skipPersist: true, skipScroll: true });
        return;
    }
    const normalized = typeof normalizeAssistantTransaction === 'function'
        ? normalizeAssistantTransaction(pendingMeta.transaction)
        : pendingMeta.transaction;
    if (!normalized) return;

    const replyText = entry.text || (typeof getSkrybaActionReplyPhrase === 'function'
        ? getSkrybaActionReplyPhrase('add_transaction')
        : 'Proponuję dodać taką transakcję — sprawdź szczegóły i potwierdź:');
    const label = formatAssistantTransactionPreview(normalized);
    const extraHtml = `<div class="skryba-tx-preview">${escapeHtml(label)}</div>${buildSkrybaPendingTransactionExtraHtml()}`;
    const domMessageId = appendSkrybaMessage('assistant', replyText, extraHtml, {
        skipPersist: true,
        skipScroll: true
    });

    skrybaPendingTransaction = {
        id: pendingMeta.id || `pending_${Date.now()}`,
        version: 1,
        status: 'pending',
        source: 'restored',
        transaction: normalized,
        domMessageId,
        replyText
    };
}

function updateSkrybaPendingTransaction(rawTx, replyText) {
    const pending = getSkrybaPendingTransactionState();
    if (!pending) return false;
    const normalized = typeof normalizeAssistantTransaction === 'function'
        ? normalizeAssistantTransaction({ ...pending.transaction, ...rawTx })
        : null;
    if (!normalized) return false;

    pending.version += 1;
    pending.transaction = normalized;
    if (replyText) pending.replyText = replyText;
    updateSkrybaPendingDom();
    syncSkrybaPendingHistoryEntry();
    skrybaPersistActiveThread();
    return true;
}

function clearSkrybaPendingHistoryMeta() {
    const pending = skrybaPendingTransaction;
    if (!pending) return;
    const idx = skrybaChatHistory.findIndex((e) => e.meta?.pending?.id === pending.id);
    if (idx >= 0) {
        const text = skrybaChatHistory[idx].text;
        skrybaChatHistory[idx] = { role: 'assistant', text };
    }
}

function formatAssistantTransactionPreview(tx) {
    const cat = tx.subCategory && tx.subCategory !== '[Bez podkategorii]'
        ? `${tx.mainCategory} › ${tx.subCategory}`
        : tx.mainCategory;
    const sign = tx.type === 'expense' ? '−' : '+';
    const date = typeof formatTxDate === 'function' ? formatTxDate(tx.date) : tx.date;
    const note = tx.note ? ` · ${tx.note}` : '';
    return `${sign}${tx.amount.toFixed(2)} zł · ${cat} · ${date}${note}`;
}

function confirmSkrybaPendingTransaction() {
    const pending = getSkrybaPendingTransactionState();
    if (!pending) return;
    const result = commitAssistantTransaction(pending.transaction);
    skrybaPendingTransaction = null;
    clearSkrybaPendingHistoryMeta();
    if (!result.ok) {
        const msg = result.error === 'cancelled'
            ? 'Anulowano zapis transakcji.'
            : (result.error || 'Nie udało się zapisać.');
        appendSkrybaMessage('assistant', msg);
        skrybaChatHistory.push({ role: 'assistant', text: msg });
        skrybaPersistActiveThread();
        return;
    }
    const msg = `Zapisano: ${formatAssistantTransactionPreview(result.tx)}`;
    appendSkrybaMessage('assistant', msg);
    skrybaChatHistory.push({ role: 'assistant', text: msg });
    skrybaPersistActiveThread();
    if (typeof hapticFeedback === 'function') hapticFeedback();
}

function cancelSkrybaPendingTransaction() {
    skrybaPendingTransaction = null;
    clearSkrybaPendingHistoryMeta();
    const msg = 'Zostawiam bez zapisu — anulowano.';
    appendSkrybaMessage('assistant', msg);
    skrybaChatHistory.push({ role: 'assistant', text: msg });
    skrybaPersistActiveThread();
}

function appendSkrybaPendingAction(action) {
    skrybaPendingAction = action;
    const extraHtml = `<div class="skryba-tx-preview">${escapeHtml(action.summary)}</div>
        <div class="skryba-tx-actions">
            <button type="button" class="skryba-btn skryba-btn--primary" onclick="confirmSkrybaPendingAction()">Wykonaj</button>
            <button type="button" class="skryba-btn" onclick="cancelSkrybaPendingAction()">Anuluj</button>
        </div>`;
    appendSkrybaMessage('assistant', action.reply || (typeof getSkrybaActionReplyPhrase === 'function'
        ? getSkrybaActionReplyPhrase(action.tool, action.params || {})
        : 'Potwierdź operację:'), extraHtml);
}

function confirmSkrybaPendingAction() {
    if (!skrybaPendingAction) return;
    const action = skrybaPendingAction;
    skrybaPendingAction = null;
    let result;
    if (action.tool === 'add_transaction_split' && Array.isArray(action.params?.transactions)) {
        result = typeof commitMultipleTransactions === 'function'
            ? commitMultipleTransactions(action.params.transactions, { skipBudgetConfirm: true })
            : { ok: false, error: 'Brak obsługi podziału.' };
        if (result.ok) {
            result = { ok: true, message: `Zapisano ${result.txs.length} transakcje.` };
        } else {
            result = { ok: false, error: result.error || 'Nie udało się zapisać.' };
        }
    } else {
        result = executeSkrybaAction(action.tool, action.params);
    }
    const msg = result.ok
        ? result.message
        : (result.error || 'Operacja nie powiodła się.');
    appendSkrybaMessage('assistant', msg);
    skrybaChatHistory.push({ role: 'assistant', text: msg });
    skrybaPersistActiveThread();
    if (result.ok && typeof hapticFeedback === 'function') hapticFeedback();
}

function cancelSkrybaPendingAction() {
    skrybaPendingAction = null;
    const msg = 'OK, rezygnujemy z tej operacji.';
    appendSkrybaMessage('assistant', msg);
    skrybaChatHistory.push({ role: 'assistant', text: msg });
    skrybaPersistActiveThread();
}

function appendSkrybaClarifyChoices(action, preview) {
    const matches = preview.clarifyMatches || preview.clarify.map((label) => ({ label }));
    skrybaPendingClarify = {
        tool: action.tool,
        params: { ...(action.params || {}) },
        reply: action.reply || '',
        clarifyMatches: matches
    };
    const buttons = matches.map((match, idx) => (
        `<button type="button" class="skryba-btn skryba-choice-btn" onclick="onSkrybaClarifyChoice(${idx})">${escapeHtml(match.label)}</button>`
    )).join('');
    const extraHtml = `<div class="skryba-choice-row">${buttons}</div>`;
    const msg = 'Znalazłem kilka opcji — którą wybierasz?';
    appendSkrybaMessage('assistant', msg, extraHtml);
    skrybaChatHistory.push({ role: 'assistant', text: msg });
    skrybaPersistActiveThread();
}

function onSkrybaClarifyChoice(idx) {
    const pending = skrybaPendingClarify;
    if (!pending) return;
    const match = pending.clarifyMatches?.[idx];
    if (!match) return;
    skrybaPendingClarify = null;
    const params = { ...pending.params };
    if (match.loanId) params.loanId = match.loanId;
    if (match.cardId) params.cardId = match.cardId;
    if (pending.tool === 'repay_card') params.cardQuery = match.label;
    else params.loanQuery = match.label;
    dispatchSkrybaAction({ tool: pending.tool, params, reply: pending.reply });
}

async function dispatchSkrybaAction(action) {
    const tool = action?.tool;
    const params = action?.params || {};
    const reply = action?.reply
        || (typeof getSkrybaActionReplyPhrase === 'function'
            ? getSkrybaActionReplyPhrase(tool, params)
            : '');

    if (tool === 'navigate') {
        const result = executeSkrybaAction(tool, params);
        const msg = result.ok ? result.message : (result.error || 'Nie udało się przejść.');
        appendSkrybaMessage('assistant', msg);
        if (result.ok && typeof closeSkrybaPanel === 'function') {
            window.setTimeout(() => closeSkrybaPanel(), 180);
        }
        return msg;
    }

    if (tool === 'add_transaction') {
        return handleAssistantIntent({
            intent: 'add_transaction',
            reply,
            transaction: params
        });
    }

    const preview = buildSkrybaActionPreview(tool, params);
    if (!preview.ok) {
        if (preview.clarify?.length) {
            appendSkrybaClarifyChoices(action, preview);
            return preview.clarify.join(', ');
        }
        const msg = preview.error || 'Nie udało się przygotować operacji.';
        appendSkrybaMessage('assistant', msg);
        return msg;
    }

    if (isAssistantConfirmTxEnabled()) {
        appendSkrybaPendingAction({
            tool,
            params,
            reply: reply || preview.summary,
            summary: preview.summary
        });
        return reply || preview.summary;
    }

    const result = executeSkrybaAction(tool, params);
    const msg = result.ok ? result.message : (result.error || 'Operacja nie powiodła się.');
    appendSkrybaMessage('assistant', msg);
    if (result.ok && typeof hapticFeedback === 'function') hapticFeedback();
    return msg;
}

function commitAssistantTransaction(txData) {
    if (typeof commitTransactionData !== 'function') {
        return { ok: false, error: 'Brak obsługi zapisu transakcji.' };
    }
    const type = txData.type === 'income' ? 'income' : 'expense';
    if (!isAssistantCategoryPairValid(type, txData.mainCategory, txData.subCategory)) {
        return { ok: false, error: 'Nieprawidłowa kategoria — wybierz parę z listy kategorii aplikacji.' };
    }
    const sanitized = {
        amount: txData.amount,
        type,
        mainCategory: txData.mainCategory,
        subCategory: txData.subCategory,
        date: txData.date,
        note: txData.note || '',
        affectsCash: true
    };
    return commitTransactionData(sanitized, { skipBudgetConfirm: true });
}

function getAssistantCategoryCatalog() {
    const expense = categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense;
    const income = categoryTree?.income || DEFAULT_CATEGORY_TREE.income;
    return { expense, income };
}

function findAssistantCategoryName(name, candidates) {
    const trimmed = String(name || '').trim();
    if (!trimmed || !Array.isArray(candidates) || !candidates.length) return null;
    if (candidates.includes(trimmed)) return trimmed;
    const lower = trimmed.toLowerCase();
    const caseMatch = candidates.find((c) => c.toLowerCase() === lower);
    if (caseMatch) return caseMatch;
    if (typeof levenshteinDistance !== 'function' || trimmed.length < 3) return null;
    let best = null;
    let bestDist = 3;
    candidates.forEach((c) => {
        const dist = levenshteinDistance(lower, c.toLowerCase());
        if (dist <= 2 && dist < bestDist) {
            best = c;
            bestDist = dist;
        }
    });
    return best;
}

function isAssistantCategoryPairValid(type, mainCategory, subCategory) {
    const tree = type === 'income'
        ? (categoryTree?.income || DEFAULT_CATEGORY_TREE.income)
        : (categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense);
    if (!tree || !mainCategory || !tree[mainCategory]) return false;
    const subs = tree[mainCategory] || [];
    if (!subCategory || subCategory === '[Bez podkategorii]') return true;
    return subs.includes(subCategory);
}

function validateAssistantCategories(type, mainCategory, subCategory) {
    const tree = type === 'income'
        ? (categoryTree?.income || DEFAULT_CATEGORY_TREE.income)
        : (categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense);
    const mains = Object.keys(tree);
    const defaultMain = type === 'income' ? 'Inne' : 'Różne';
    let main = findAssistantCategoryName(mainCategory, mains);
    if (!main) {
        main = mains.includes(defaultMain) ? defaultMain : (mains[0] || defaultMain);
    }
    let subs = tree[main] || [];
    let sub = String(subCategory || '').trim() || '[Bez podkategorii]';
    if (sub !== '[Bez podkategorii]' && !subs.includes(sub)) {
        let matchedSub = findAssistantCategoryName(sub, subs);
        if (!matchedSub) {
            for (const [candidateMain, candidateSubs] of Object.entries(tree)) {
                const crossSub = findAssistantCategoryName(sub, candidateSubs || []);
                if (crossSub) {
                    main = candidateMain;
                    subs = candidateSubs || [];
                    matchedSub = crossSub;
                    break;
                }
            }
        }
        if (!matchedSub) {
            const subLooksLikeOtherMain = findAssistantCategoryName(sub, mains.filter((m) => m !== main));
            if (subLooksLikeOtherMain) {
                sub = subs.includes('[Bez podkategorii]') ? '[Bez podkategorii]' : (subs[0] || '[Bez podkategorii]');
            } else {
                sub = subs.includes('[Bez podkategorii]') ? '[Bez podkategorii]' : (subs[0] || '[Bez podkategorii]');
            }
        } else {
            sub = matchedSub;
        }
    } else if (sub !== '[Bez podkategorii]') {
        sub = findAssistantCategoryName(sub, subs) || sub;
    } else if (!subs.includes('[Bez podkategorii]') && subs.length) {
        sub = subs[0];
    }
    return { mainCategory: main, subCategory: sub };
}

function resolveAssistantCategories(type, mainCategory, subCategory) {
    return validateAssistantCategories(type, mainCategory, subCategory);
}

function resolveCategoryFromUserPhrase(phrase, type = 'expense') {
    const tree = type === 'income'
        ? (categoryTree?.income || DEFAULT_CATEGORY_TREE.income)
        : (categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense);
    const raw = String(phrase || '').trim();
    if (!raw) return null;

    const splitParts = raw.split(/\s*[>›/]\s*/);
    if (splitParts.length >= 2) {
        const main = findAssistantCategoryName(splitParts[0], Object.keys(tree));
        if (main) {
            const subs = tree[main] || [];
            const subPart = splitParts.slice(1).join(' ').trim();
            const sub = findAssistantCategoryName(subPart, subs) || '[Bez podkategorii]';
            return { mainCategory: main, subCategory: sub };
        }
    }

    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        const main = findAssistantCategoryName(words[0], Object.keys(tree));
        if (main) {
            const subs = tree[main] || [];
            const sub = findAssistantCategoryName(words.slice(1).join(' '), subs)
                || findAssistantCategoryName(words[words.length - 1], subs)
                || '[Bez podkategorii]';
            return { mainCategory: main, subCategory: sub };
        }
    }

    for (const [main, subs] of Object.entries(tree)) {
        const sub = findAssistantCategoryName(raw, subs || []);
        if (sub) return { mainCategory: main, subCategory: sub };
    }

    const mainOnly = findAssistantCategoryName(raw, Object.keys(tree));
    if (mainOnly) {
        const subs = tree[mainOnly] || [];
        return {
            mainCategory: mainOnly,
            subCategory: subs.includes('[Bez podkategorii]') ? '[Bez podkategorii]' : (subs[0] || '[Bez podkategorii]')
        };
    }
    return null;
}

function normalizeAssistantTransaction(raw) {
    if (!raw || !Number.isFinite(parseFloat(raw.amount))) return null;
    const type = raw.type === 'income' ? 'income' : 'expense';
    const cats = resolveAssistantCategories(type, raw.mainCategory, raw.subCategory);
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    const tx = {
        amount: parseFloat(raw.amount),
        type,
        mainCategory: cats.mainCategory,
        subCategory: cats.subCategory,
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? raw.date : today,
        note: typeof raw.note === 'string' ? raw.note : '',
        affectsCash: true
    };
    return typeof normalizeTransaction === 'function' ? normalizeTransaction(tx) : null;
}

function parseSkrybaCorrectionDateToken(token) {
    const t = String(token || '').toLowerCase().trim();
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    if (t === 'dziś' || t === 'dzisiaj') return today;
    if (t === 'wczoraj') {
        const d = new Date(`${today}T12:00:00`);
        d.setDate(d.getDate() - 1);
        return typeof localIsoDate === 'function' ? localIsoDate(d) : today;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    return null;
}

function tryApplyLocalPendingCorrection(text, pending) {
    const t = String(text || '').trim();
    if (!t || !pending?.transaction) return null;

    if (/^(anuluj|nie dodawaj|odrzuć|rezygnuj)\b/i.test(t)) {
        return { action: 'cancel', reply: 'OK, nie dodaję transakcji.' };
    }

    const patch = { ...pending.transaction };
    let changed = false;

    const catMatch = t.match(/(?:zmie[nń]|ustaw)\s+kategori[eęę]\s+na\s+(.+)/i)
        || t.match(/^kategoria[:\s]+(.+)/i);
    if (catMatch) {
        const resolved = resolveCategoryFromUserPhrase(catMatch[1].trim(), patch.type);
        if (resolved) {
            patch.mainCategory = resolved.mainCategory;
            patch.subCategory = resolved.subCategory;
            changed = true;
        }
    }

    const amtMatch = t.match(/(?:kwota|zmie[nń]\s+kwot[eęę])\s+(?:na\s+)?(\d+(?:[.,]\d{1,2})?)/i)
        || (/^(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i.test(t) ? t.match(/^(\d+(?:[.,]\d{1,2})?)/) : null);
    if (amtMatch) {
        const amount = typeof parsePlnInput === 'function'
            ? parsePlnInput(amtMatch[1])
            : parseFloat(String(amtMatch[1]).replace(',', '.'));
        if (Number.isFinite(amount) && amount > 0) {
            patch.amount = amount;
            changed = true;
        }
    }

    const dateMatch = t.match(/(?:data|zmie[nń]\s+dat[eęę])\s+(?:na\s+)?(wczoraj|dzi[sś]|dzisiaj|\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
        const date = parseSkrybaCorrectionDateToken(dateMatch[1]);
        if (date) {
            patch.date = date;
            changed = true;
        }
    }

    const noteMatch = t.match(/(?:notatka|opis|zmie[nń]\s+opis)\s+(?:na\s+)?(.+)/i);
    if (noteMatch) {
        patch.note = noteMatch[1].trim();
        changed = true;
    }

    if (!changed) return null;
    return {
        action: 'update',
        transaction: patch,
        reply: 'Zaktualizowałem propozycję transakcji.'
    };
}

async function handleSkrybaPendingCorrectionResult(routed) {
    if (routed.kind === 'pending_cancel') {
        cancelSkrybaPendingTransaction();
        return routed.reply;
    }
    if (routed.kind === 'pending_update' && routed.transaction) {
        const ok = updateSkrybaPendingTransaction(routed.transaction, routed.reply);
        if (!ok) {
            const msg = 'Nie udało się zaktualizować propozycji — sprawdź kategorię i kwotę.';
            appendSkrybaMessage('assistant', msg);
            skrybaChatHistory.push({ role: 'assistant', text: msg });
            skrybaPersistActiveThread();
            return msg;
        }
        return routed.reply || 'Zaktualizowałem propozycję.';
    }
    if (routed.kind === 'pending_clarify') {
        appendSkrybaMessage('assistant', routed.reply);
        skrybaChatHistory.push({ role: 'assistant', text: routed.reply });
        skrybaPersistActiveThread();
        return routed.reply;
    }
    return null;
}

function tryParseLocalAddTransaction(text) {
    const t = String(text || '').trim();
    if (!t || t.length < 4) return null;

    if (typeof tryParseTransactionSplit === 'function') {
        const split = tryParseTransactionSplit(t);
        if (split) {
            const today = typeof localIsoDate === 'function'
                ? localIsoDate(new Date())
                : new Date().toISOString().slice(0, 10);
            const parts = typeof buildSplitTransactions === 'function'
                ? buildSplitTransactions({
                    amount: split.total,
                    type: 'expense',
                    mainCategory: 'Różne',
                    subCategory: '[Bez podkategorii]',
                    date: today,
                    note: '',
                    affectsCash: true
                }, split)
                : [];
            if (parts.length >= 2) {
                return {
                    intent: 'add_transaction_split',
                    reply: `Podzielę zakup na ${parts.length} pozycje (${split.total.toFixed(2)} zł).`,
                    transactions: parts
                };
            }
        }
    }

    let amount = null;
    let desc = '';
    const m1 = t.match(/^(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?\s+(.+)$/i);
    const m2 = t.match(/^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i);
    if (m1) {
        amount = typeof parsePlnInput === 'function' ? parsePlnInput(m1[1]) : parseFloat(m1[1].replace(',', '.'));
        desc = m1[2].trim();
    } else if (m2) {
        desc = m2[1].trim();
        amount = typeof parsePlnInput === 'function' ? parsePlnInput(m2[2]) : parseFloat(m2[2].replace(',', '.'));
    }
    if (!Number.isFinite(amount) || amount <= 0 || desc.length < 2) return null;

    const lower = desc.toLowerCase();
    let type = 'expense';
    let mainCategory = 'Różne';
    let subCategory = '[Bez podkategorii]';
    if (/wynagrodzenie|pensja|wpływ|wplyw|premia/.test(lower)) {
        type = 'income';
        mainCategory = 'Wynagrodzenie';
    } else if (/biedronka|lidl|kaufland|żabka|zabka|carrefour|aldi|dino|zakupy/.test(lower)) {
        mainCategory = 'Zakupy';
    } else if (/orlen|paliwo|bp |circle k|stacja/.test(lower)) {
        mainCategory = 'Samochód';
        subCategory = 'Paliwo';
    } else if (/netflix|spotify|hbo|subskrypcj/.test(lower)) {
        mainCategory = 'Subskrypcje';
    } else if (/uber|bolt|taxi|bilet/.test(lower)) {
        mainCategory = 'Transport';
    }

    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    const cats = resolveAssistantCategories(type, mainCategory, subCategory);
    return {
        intent: 'add_transaction',
        reply: `Dodaję: ${desc} — ${amount.toFixed(2)} zł.`,
        transaction: {
            amount,
            type,
            mainCategory: cats.mainCategory,
            subCategory: cats.subCategory,
            date: today,
            note: desc
        },
        search: null,
        summarize: null
    };
}

function getAssistantTransactionsSource() {
    return typeof getMergedTransactions === 'function'
        ? getMergedTransactions()
        : (appState?.transactions || []);
}

function runAssistantSearch(search) {
    const query = String(search?.query || '').toLowerCase().trim();
    const typeFilter = search?.type === 'income' || search?.type === 'expense' ? search.type : null;
    const daysBack = Number.isFinite(search?.daysBack) ? search.daysBack : null;
    const minDate = daysBack
        ? (typeof localIsoDate === 'function'
            ? localIsoDate(new Date(Date.now() - daysBack * 86400000))
            : '')
        : '';

    let items = getAssistantTransactionsSource();
    if (typeFilter) items = items.filter((t) => t.type === typeFilter);
    items = filterItemsByFuzzyCategoryField(items, 'mainCategory', search?.mainCategory);
    items = filterItemsByFuzzyCategoryField(items, 'subCategory', search?.subCategory);
    if (minDate) items = items.filter((t) => t.date >= minDate);
    if (query) items = items.filter((t) => transactionMatchesFuzzyQuery(t, query));

    return items.slice(0, 100);
}

function formatAssistantSearchResults(items) {
    if (!items.length) return 'Nie znalazłem pasujących transakcji.';
    const shown = items.slice(0, 12);
    const lines = shown.map((t) => formatAssistantTransactionPreview(t));
    if (items.length > shown.length) {
        lines.push(`… i ${items.length - shown.length} więcej (zapytaj o sumę).`);
    }
    return lines.join('\n');
}

function isAssistantSummarizeCommand(text) {
    const normalized = String(text || '').toLowerCase().trim().replace(/[?!.…]+$/g, '');
    if (!normalized) return false;
    if (/^(suma|razem|podsumuj|łącznie|lacznie|ile to)$/.test(normalized)) return true;
    if (/^ile (łącznie|lacznie|razem|to łącznie|to lacznie)$/.test(normalized)) return true;
    if (/^(policz|ile pozycji|ile transakcji)$/.test(normalized)) return true;
    return /^ile (jest|mam) (transakcj|pozycji)/.test(normalized);
}

function getAssistantSummarizeOperation(text, summarizePayload) {
    if (summarizePayload?.operation === 'count') return 'count';
    const normalized = String(text || '').toLowerCase();
    if (/policz|ile (jest|mam) (transakcj|pozycji)|ile pozycji|ile transakcji/.test(normalized)) {
        return 'count';
    }
    return 'sum';
}

function formatAssistantSummarize(items, operation = 'sum') {
    if (typeof formatAssistantSummarizeFriendly === 'function') {
        return formatAssistantSummarizeFriendly(items, operation);
    }
    if (!items.length) {
        return 'Najpierw wyszukaj transakcje, potem zapytam o sumę.';
    }
    if (operation === 'count') {
        return `Liczba transakcji: ${items.length}.`;
    }
    let expenseTotal = 0;
    let incomeTotal = 0;
    items.forEach((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') incomeTotal += amount;
        else expenseTotal += amount;
    });
    const format = typeof formatPlnAmount === 'function'
        ? formatPlnAmount
        : (n) => `${Number(n).toFixed(2)} zł`;
    const parts = [];
    if (expenseTotal > 0) parts.push(`wydatki: ${format(expenseTotal)}`);
    if (incomeTotal > 0) parts.push(`wpływy: ${format(incomeTotal)}`);
    const summary = parts.length ? parts.join(', ') : format(0);
    return `Łącznie (${items.length} transakcji): ${summary}.`;
}

async function dispatchAssistantParsed(parsed, userMessage, advisorMeta = null) {
    if (advisorMeta?.context && typeof captureSkrybaAdvisorContext === 'function') {
        captureSkrybaAdvisorContext(advisorMeta.context, advisorMeta.toolParams || {});
    }
    const displayText = await handleAssistantIntent(parsed, userMessage, advisorMeta);
    const pendingHandled = parsed?.intent === 'add_transaction'
        && isAssistantConfirmTxEnabled()
        && getSkrybaPendingTransactionState();
    if (displayText && !pendingHandled) {
        skrybaChatHistory.push({ role: 'assistant', text: displayText });
    }
    skrybaPersistActiveThread();
}

function isSkrybaCompareFollowUpCommand(text) {
    const normalized = String(text || '').toLowerCase().trim().replace(/[?!.…]+$/g, '');
    if (!normalized) return false;
    if (/^(porównaj|porownaj|a poprzedni|vs poprzedni|różnica|roznica)/.test(normalized)) return true;
    return /^porównaj z (poprzednim|zeszłym|zeszlym)/.test(normalized)
        || /^a (poprzedni|zeszły|zeszly)\s+miesi[aą]c/.test(normalized);
}

function tryHandleLocalSkrybaCommand(text) {
    if (isSkrybaCompareFollowUpCommand(text)
        && typeof formatSkrybaCompareFollowUp === 'function'
        && skrybaLastAdvisorContext?.context) {
        const compareReply = formatSkrybaCompareFollowUp(
            skrybaLastAdvisorContext.context,
            skrybaLastAdvisorContext.toolParams || {}
        );
        if (compareReply) {
            appendSkrybaMessage('assistant', compareReply);
            skrybaChatHistory.push({ role: 'assistant', text: compareReply });
            skrybaPersistActiveThread();
            return true;
        }
    }

    const normalizedMore = String(text || '').toLowerCase().trim().replace(/[?!.…]+$/g, '');
    if (/^poka[zż] wi[eę]cej$/.test(normalizedMore) && skrybaLastSearchResults.length) {
        const body = formatAssistantSearchResults(skrybaLastSearchResults);
        appendSkrybaMessage('assistant', body);
        skrybaChatHistory.push({ role: 'assistant', text: body });
        skrybaPersistActiveThread();
        return true;
    }

    if (!isAssistantSummarizeCommand(text)) return false;
    const operation = getAssistantSummarizeOperation(text);
    const reply = formatAssistantSummarize(skrybaLastSearchResults, operation);
    appendSkrybaMessage('assistant', reply);
    skrybaChatHistory.push({ role: 'assistant', text: reply });
    skrybaPersistActiveThread();
    return true;
}

function runAssistantDebtToday() {
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    const scheduled = typeof getScheduledDebtPaymentsOnDate === 'function'
        ? getScheduledDebtPaymentsOnDate(today)
        : [];
    const paid = getAssistantTransactionsSource().filter((t) => (
        t.date === today
        && (t.mainCategory === 'Długi' || t.creditCardId)
    ));

    const lines = [];
    if (scheduled.length) {
        lines.push('Planowane na dziś:');
        scheduled.forEach((p) => {
            lines.push(`· ${p.name}: ${typeof formatPlnAmount === 'function' ? formatPlnAmount(p.amount) : p.amount}`);
        });
    } else {
        lines.push('Brak zaplanowanych rat na dziś w harmonogramie.');
    }
    if (paid.length) {
        lines.push('Zaksięgowane dziś (długi/karta):');
        paid.forEach((t) => lines.push(`· ${formatAssistantTransactionPreview(t)}`));
    } else if (scheduled.length) {
        lines.push('Nie widzę jeszcze zaksięgowanej spłaty na dziś.');
    }
    return lines.join('\n');
}

async function handleAssistantIntent(parsed, userMessage = '', advisorMeta = null) {
    const reply = String(parsed?.reply || '').trim();

    if (parsed?.mode === 'advisor' && reply) {
        const polished = polishSkrybaText(reply);
        appendSkrybaTypewriterMessage(polished);
        const chips = typeof buildSkrybaFollowUpChips === 'function'
            ? buildSkrybaFollowUpChips(advisorMeta?.context || skrybaLastAdvisorContext?.context || {})
            : [];
        if (chips.length) {
            appendSkrybaFollowUpChips(chips);
        }
        return polished;
    }

    const intent = parsed?.intent || (parsed?.mode === 'action' ? parsed.intent : 'reply');

    if (intent === 'add_transaction_split' && Array.isArray(parsed.transactions) && parsed.transactions.length > 1) {
        const normalizedList = parsed.transactions
            .map((tx) => (typeof normalizeAssistantTransaction === 'function' ? normalizeAssistantTransaction(tx) : null))
            .filter(Boolean);
        if (!normalizedList.length) {
            const msg = reply || 'Nie udało się zbudować podzielonej transakcji.';
            appendSkrybaMessage('assistant', msg);
            return msg;
        }
        const preview = normalizedList.map((tx) => formatAssistantTransactionPreview(tx)).join('\n');
        if (isAssistantConfirmTxEnabled()) {
            appendSkrybaPendingAction({
                tool: 'add_transaction_split',
                params: { transactions: normalizedList },
                reply: reply || 'Potwierdź podział transakcji:',
                summary: preview
            });
            return reply || 'Potwierdź podział transakcji:';
        }
        const result = typeof commitMultipleTransactions === 'function'
            ? commitMultipleTransactions(normalizedList, { skipBudgetConfirm: true })
            : { ok: false };
        const msg = result.ok
            ? `Zapisano ${result.txs.length} transakcje:\n${preview}`
            : (result.error || 'Nie udało się zapisać.');
        appendSkrybaMessage('assistant', msg);
        if (result.ok && typeof hapticFeedback === 'function') hapticFeedback();
        return msg;
    }

    if (intent === 'add_transaction' && (parsed.transaction || parsed?.action?.params)) {
        const raw = parsed.transaction || parsed.action.params;
        const normalized = typeof normalizeAssistantTransaction === 'function'
            ? normalizeAssistantTransaction(raw)
            : null;
        if (!normalized) {
            const msg = reply || 'Nie udało się zbudować transakcji. Podaj kwotę i opis, np. „15 zł kawa”.';
            appendSkrybaMessage('assistant', msg);
            return msg;
        }
        if (isAssistantConfirmTxEnabled()) {
            appendSkrybaPendingTransaction(normalized, {
                replyText: reply || (typeof getSkrybaActionReplyPhrase === 'function'
                    ? getSkrybaActionReplyPhrase('add_transaction')
                    : 'Proponuję dodać taką transakcję — sprawdź szczegóły i potwierdź:'),
                source: 'ai'
            });
            return reply || (typeof getSkrybaActionReplyPhrase === 'function'
                ? getSkrybaActionReplyPhrase('add_transaction')
                : 'Proponuję dodać taką transakcję — sprawdź szczegóły i potwierdź:');
        }
        const result = commitAssistantTransaction(normalized);
        if (!result.ok) {
            const msg = result.error || 'Nie udało się zapisać.';
            appendSkrybaMessage('assistant', msg);
            return msg;
        }
        const msg = reply
            ? `${reply}\n${formatAssistantTransactionPreview(result.tx)}`
            : `Zapisano: ${formatAssistantTransactionPreview(result.tx)}`;
        appendSkrybaMessage('assistant', msg);
        if (typeof hapticFeedback === 'function') hapticFeedback();
        return msg;
    }

    if (intent === 'search') {
        const items = runAssistantSearch(parsed.search || {});
        skrybaLastSearchResults = items;
        const body = formatAssistantSearchResults(items);
        const msg = reply ? `${reply}\n${body}` : body;
        appendSkrybaMessage('assistant', msg);
        return msg;
    }

    if (intent === 'summarize') {
        const operation = getAssistantSummarizeOperation(userMessage, parsed.summarize);
        const scope = parsed?.summarize?.scope || 'last_search';
        if (scope !== 'last_search' || !skrybaLastSearchResults.length) {
            const msg = reply || 'Najpierw wyszukaj transakcje, potem zapytam o sumę.';
            appendSkrybaMessage('assistant', msg);
            return msg;
        }
        const body = formatAssistantSummarize(skrybaLastSearchResults, operation);
        const msg = reply ? `${reply}\n${body}` : body;
        appendSkrybaMessage('assistant', msg);
        return msg;
    }

    if (intent === 'debt_today') {
        const body = runAssistantDebtToday();
        const msg = reply ? `${reply}\n${body}` : body;
        appendSkrybaMessage('assistant', msg);
        return msg;
    }

    const msg = reply || (typeof SKRYBA_FALLBACK_REPLY !== 'undefined'
        ? SKRYBA_FALLBACK_REPLY
        : 'Napisz kwotę i opis (np. „30 zł obiad”), albo zapytaj o historię.');
    appendSkrybaMessage('assistant', msg);
    return msg;
}

async function sendSkrybaMessage() {
    const input = document.getElementById('skryba-input');
    const sendBtn = document.getElementById('btn-skryba-send');
    const text = input?.value.trim();
    if (!text) return;

    input.value = '';
    skrybaChatHistory.push({ role: 'user', text });
    appendSkrybaMessage('user', text);
    skrybaPersistActiveThread();

    if (tryHandleLocalSkrybaCommand(text)) return;

    if (getSkrybaPendingTransactionState()) {
        if (!getAssistantApiKey()) {
            const local = tryApplyLocalPendingCorrection(text, getSkrybaPendingTransactionState());
            if (local?.action === 'cancel') {
                cancelSkrybaPendingTransaction();
                return;
            }
            if (local?.action === 'update' && local.transaction) {
                updateSkrybaPendingTransaction(local.transaction, local.reply);
                return;
            }
            appendSkrybaMessage('assistant', 'Bez klucza API popraw propozycję ręcznie (np. „zmień kategorię na Zakupy”, „kwota 50”) albo kliknij Dodaj/Anuluj.');
            return;
        }
        if (sendBtn) sendBtn.disabled = true;
        appendSkrybaMessage('assistant', '…', '', { skipPersist: true });
        const list = document.getElementById('skryba-messages');
        const typingBubble = list?.lastElementChild;
        try {
            const routed = await processSkrybaUserMessage(text);
            typingBubble?.remove();
            await handleSkrybaPendingCorrectionResult(routed);
        } catch (err) {
            typingBubble?.remove();
            const msg = err.message || 'Błąd połączenia z Groq.';
            appendSkrybaMessage('assistant', msg);
            skrybaChatHistory.push({ role: 'assistant', text: msg });
            skrybaPersistActiveThread();
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            input?.focus();
        }
        return;
    }

    const localAction = typeof tryParseLocalSkrybaAction === 'function'
        ? tryParseLocalSkrybaAction(text)
        : null;
    if (localAction) {
        const displayText = await dispatchSkrybaAction(localAction);
        if (displayText) {
            skrybaChatHistory.push({ role: 'assistant', text: displayText });
        }
        skrybaPersistActiveThread();
        return;
    }

    const localTx = tryParseLocalAddTransaction(text);
    if (localTx) {
        await dispatchAssistantParsed(localTx, text);
        return;
    }

    const detection = typeof detectSkrybaToolsFromText === 'function'
        ? detectSkrybaToolsFromText(text)
        : { tools: [], toolParams: {} };
    if (typeof isSkrybaAdvisorQuery === 'function'
        && isSkrybaAdvisorQuery(detection)
        && detection.tools.length
        && !getAssistantApiKey()
        && typeof formatSkrybaOfflineReply === 'function') {
        const offlineMsg = formatSkrybaOfflineReply(detection.tools, detection.toolParams);
        if (offlineMsg) {
            const offlineContext = typeof buildSkrybaContextBundle === 'function'
                ? buildSkrybaContextBundle(detection.tools, detection.toolParams)
                : null;
            if (offlineContext && typeof captureSkrybaAdvisorContext === 'function') {
                captureSkrybaAdvisorContext(offlineContext, detection.toolParams);
            }
            appendSkrybaMessage('assistant', offlineMsg);
            skrybaChatHistory.push({ role: 'assistant', text: offlineMsg });
            skrybaPersistActiveThread();
            return;
        }
    }

    if (!getAssistantApiKey()) {
        appendSkrybaMessage('assistant', 'Brak klucza API. Ustaw go w Ustawienia → Asystent AI.');
        return;
    }

    if (sendBtn) sendBtn.disabled = true;
    appendSkrybaMessage('assistant', '…', '', { skipPersist: true });

    const list = document.getElementById('skryba-messages');
    const typingBubble = list?.lastElementChild;

    try {
        const routed = await processSkrybaUserMessage(text);
        typingBubble?.remove();
        if (routed.kind === 'pending_cancel' || routed.kind === 'pending_update' || routed.kind === 'pending_clarify') {
            await handleSkrybaPendingCorrectionResult(routed);
            return;
        }
        if (routed.kind === 'action') {
            const displayText = await dispatchSkrybaAction(routed.action);
            const pendingHandled = routed.action?.tool === 'add_transaction'
                && isAssistantConfirmTxEnabled()
                && getSkrybaPendingTransactionState();
            if (displayText && !pendingHandled) {
                skrybaChatHistory.push({ role: 'assistant', text: displayText });
            }
            skrybaPersistActiveThread();
            return;
        }
        if (!routed.parsed) {
            const fallback = typeof SKRYBA_FALLBACK_REPLY !== 'undefined'
                ? SKRYBA_FALLBACK_REPLY
                : 'Nie rozumiem odpowiedzi modelu — spróbuj inaczej sformułować.';
            appendSkrybaMessage('assistant', fallback);
            skrybaPersistActiveThread();
            return;
        }
        await dispatchAssistantParsed(routed.parsed, text, {
            context: routed.advisorContext,
            toolParams: routed.advisorToolParams
        });
    } catch (err) {
        typingBubble?.remove();
        const msg = err.message || 'Błąd połączenia z Groq.';
        appendSkrybaMessage('assistant', msg);
        skrybaChatHistory.push({ role: 'assistant', text: msg });
        skrybaPersistActiveThread();
        console.warn('sendSkrybaMessage', err);
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        input?.focus();
    }
}

function onSkrybaInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendSkrybaMessage();
    }
}

function onSkrybaInputInput() {
    autoResizeSkrybaInput();
}

function initSkrybaAssistant() {
    loadSkrybaThreadsFromStorage();
    syncSkrybaHeaderVisibility();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSkrybaAssistant);
} else {
    initSkrybaAssistant();
}
