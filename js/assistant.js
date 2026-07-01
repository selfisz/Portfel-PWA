let skrybaChatHistory = [];
let skrybaPendingTransaction = null;
let skrybaLastSearchResults = [];
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
        return (localStorage.getItem(ASSISTANT_API_KEY_KEY) || '').trim();
    } catch {
        return '';
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
        lastSearchResults: []
    };
}

function skrybaPersistActiveThread() {
    if (!skrybaActiveThreadId) return;
    const thread = getSkrybaThreadById(skrybaActiveThreadId);
    if (!thread) return;
    thread.messages = skrybaChatHistory.map((m) => ({ role: m.role, text: m.text }));
    thread.lastSearchResults = skrybaLastSearchResults;
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
    skrybaPendingTransaction = null;
    const list = document.getElementById('skryba-messages');
    if (list) list.innerHTML = '';
    if (!skrybaChatHistory.length) {
        renderSkrybaWelcomeIfEmpty();
    } else {
        skrybaChatHistory.forEach((entry) => {
            if (entry.role === 'user' || entry.role === 'assistant') {
                appendSkrybaMessage(entry.role, entry.text, '', { skipPersist: true, skipScroll: true });
            }
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
    appendSkrybaMessage('assistant', 'Cześć! Mogę dodać wydatek (np. „20 zł biedronka”), wyszukać w historii albo podsumować wyniki („suma?”). Płatności kartą ustaw ręcznie w formularzu.', '', { skipPersist: true });
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
    if (!list) return;
    const row = document.createElement('div');
    row.className = `skryba-msg skryba-msg--${role}${text === '…' ? ' skryba-msg--typing' : ''}`;

    const body = document.createElement('div');
    body.className = 'skryba-msg-body';
    const bubble = document.createElement('div');
    bubble.className = 'skryba-msg-bubble';
    bubble.textContent = text;
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
}

function appendSkrybaPendingTransaction(tx) {
    skrybaPendingTransaction = tx;
    const label = formatAssistantTransactionPreview(tx);
    const extraHtml = `<div class="skryba-tx-preview">${escapeHtml(label)}</div>
        <div class="skryba-tx-actions">
            <button type="button" class="skryba-btn skryba-btn--primary" onclick="confirmSkrybaPendingTransaction()">Dodaj</button>
            <button type="button" class="skryba-btn" onclick="cancelSkrybaPendingTransaction()">Anuluj</button>
        </div>`;
    appendSkrybaMessage('assistant', 'Proponuję dodać transakcję:', extraHtml);
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
    if (!skrybaPendingTransaction) return;
    const result = commitAssistantTransaction(skrybaPendingTransaction);
    skrybaPendingTransaction = null;
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
    const msg = 'OK, nie dodaję transakcji.';
    appendSkrybaMessage('assistant', msg);
    skrybaChatHistory.push({ role: 'assistant', text: msg });
    skrybaPersistActiveThread();
}

function commitAssistantTransaction(txData) {
    if (typeof commitTransactionData !== 'function') {
        return { ok: false, error: 'Brak obsługi zapisu transakcji.' };
    }
    const sanitized = {
        amount: txData.amount,
        type: txData.type,
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

function buildAssistantSystemPrompt() {
    const { expense, income } = getAssistantCategoryCatalog();
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    return `Jesteś Skryba — asystent finansowy aplikacji Portfel (język polski).
Odpowiadaj WYŁĄCZNIE jednym obiektem JSON. Bez markdown, bez tekstu poza JSON.

Dzisiejsza data: ${today}.
Kategorie wydatków: ${JSON.stringify(expense)}
Kategorie wpływów: ${JSON.stringify(income)}

Schemat:
{"intent":"add_transaction|search|summarize|debt_today|reply","reply":"po polsku","transaction":{...}|null,"search":{...}|null,"summarize":{...}|null}

Zasady:
- add_transaction: użytkownik podaje kwotę i opis. Zwykły wydatek gotówkowy — bez karty kredytowej.
- search: pytania o historię. query = słowo kluczowe (np. ubezpieczenie). mainCategory/subCategory tylko gdy pewny, inaczej null.
- summarize: „suma?”, „ile łącznie?” po wcześniejszej liście → operation sum|count, scope last_search.
- debt_today: raty/spłaty na dziś.
- reply: small talk lub gdy brak danych.
- Biedronka/Lidl → Zakupy. Paliwo → Samochód › Paliwo.
- amount: liczba, kropka dziesiętna. Brak daty → ${today}.
- Analizuj kontekst poprzednich wiadomości w rozmowie.

Przykład: "20 zł biedronka"
{"intent":"add_transaction","reply":"Zakupy w Biedronce.","transaction":{"amount":20,"type":"expense","mainCategory":"Zakupy","subCategory":"[Bez podkategorii]","date":"${today}","note":"Biedronka"},"search":null,"summarize":null}`;
}

function resolveAssistantCategories(type, mainCategory, subCategory) {
    const tree = type === 'income'
        ? (categoryTree?.income || DEFAULT_CATEGORY_TREE.income)
        : (categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense);
    const mains = Object.keys(tree);
    let main = String(mainCategory || '').trim();
    if (!mains.includes(main)) {
        const lower = main.toLowerCase();
        main = mains.find((m) => m.toLowerCase() === lower)
            || mains.find((m) => m.toLowerCase().includes(lower) || lower.includes(m.toLowerCase()))
            || (type === 'income' ? 'Inne' : 'Różne');
    }
    const subs = tree[main] || [];
    let sub = String(subCategory || '').trim() || '[Bez podkategorii]';
    if (sub !== '[Bez podkategorii]' && !subs.includes(sub)) {
        const lower = sub.toLowerCase();
        sub = subs.find((s) => s.toLowerCase() === lower)
            || subs.find((s) => s.toLowerCase().includes(lower))
            || (subs[0] || '[Bez podkategorii]');
    }
    return { mainCategory: main, subCategory: sub };
}

function parseAssistantResponse(raw) {
    const text = String(raw || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
        return JSON.parse(jsonMatch[0]);
    } catch {
        return null;
    }
}

function tryParseLocalAddTransaction(text) {
    const t = String(text || '').trim();
    if (!t || t.length < 4) return null;
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
    return {
        intent: 'add_transaction',
        reply: `Dodaję: ${desc} — ${amount.toFixed(2)} zł.`,
        transaction: {
            amount,
            type,
            mainCategory,
            subCategory,
            date: today,
            note: desc
        },
        search: null,
        summarize: null
    };
}

function buildGroqAssistantMessages(userMessage) {
    const historyMessages = skrybaChatHistory.slice(-12).map((entry) => ({
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: entry.text
    }));
    return [
        { role: 'system', content: buildAssistantSystemPrompt() },
        ...historyMessages,
        { role: 'user', content: userMessage }
    ];
}

async function callGroqAssistant(userMessage, { retry = true } = {}) {
    const apiKey = getAssistantApiKey();
    if (!apiKey) {
        throw new Error('Ustaw klucz API Groq w Ustawienia → Asystent AI.');
    }

    const response = await fetch(ASSISTANT_GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: ASSISTANT_GROQ_MODEL,
            temperature: 0.2,
            max_tokens: 1024,
            response_format: { type: 'json_object' },
            messages: buildGroqAssistantMessages(userMessage)
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) throw new Error('Pusta odpowiedź modelu.');
    const parsed = parseAssistantResponse(rawText);
    if (!parsed && retry) {
        return callGroqAssistant(userMessage, { retry: false });
    }
    return parsed;
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

async function dispatchAssistantParsed(parsed, userMessage) {
    const displayText = await handleAssistantIntent(parsed, userMessage);
    if (displayText) {
        skrybaChatHistory.push({ role: 'assistant', text: displayText });
    }
    skrybaPersistActiveThread();
}

function tryHandleLocalSkrybaCommand(text) {
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

async function handleAssistantIntent(parsed, userMessage = '') {
    const intent = parsed?.intent || 'reply';
    const reply = String(parsed?.reply || '').trim();

    if (intent === 'add_transaction' && parsed.transaction) {
        const raw = parsed.transaction;
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
        const normalized = typeof normalizeTransaction === 'function'
            ? normalizeTransaction(tx)
            : null;
        if (!normalized) {
            const msg = reply || 'Nie udało się zbudować transakcji. Podaj kwotę i opis, np. „15 zł kawa”.';
            appendSkrybaMessage('assistant', msg);
            return msg;
        }
        if (isAssistantConfirmTxEnabled()) {
            appendSkrybaMessage('assistant', reply || 'Sprawdź propozycję:');
            appendSkrybaPendingTransaction(normalized);
            return reply || 'Sprawdź propozycję:';
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

    const msg = reply || 'Napisz kwotę i opis (np. „30 zł obiad”), albo zapytaj o historię.';
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

    const localTx = tryParseLocalAddTransaction(text);
    if (localTx) {
        await dispatchAssistantParsed(localTx, text);
        return;
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
        const parsed = await callGroqAssistant(text);
        typingBubble?.remove();
        if (!parsed) {
            appendSkrybaMessage('assistant', 'Nie rozumiem odpowiedzi modelu — spróbuj inaczej sformułować.');
            skrybaPersistActiveThread();
            return;
        }
        await dispatchAssistantParsed(parsed, text);
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

function initSkrybaAssistant() {
    loadSkrybaThreadsFromStorage();
    syncSkrybaHeaderVisibility();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSkrybaAssistant);
} else {
    initSkrybaAssistant();
}
