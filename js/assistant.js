let skrybaChatHistory = [];
let skrybaPendingTransaction = null;

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
    const overlay = document.getElementById('skryba-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.classList.add('skryba-open');
    const btn = document.getElementById('btn-skryba');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    renderSkrybaWelcomeIfEmpty();
    document.getElementById('skryba-input')?.focus();
}

function closeSkrybaPanel() {
    document.getElementById('skryba-overlay')?.classList.add('hidden');
    document.body.classList.remove('skryba-open');
    const btn = document.getElementById('btn-skryba');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function renderSkrybaWelcomeIfEmpty() {
    const list = document.getElementById('skryba-messages');
    if (!list || list.children.length) return;
    appendSkrybaMessage('assistant', 'Cześć, jestem Skryba. Mogę dodać transakcję z opisu (np. „20 zł zakupy biedronka”) albo wyszukać w historii (np. „kiedy kupiłem ubrania?”).');
}

function appendSkrybaMessage(role, text, extraHtml = '') {
    const list = document.getElementById('skryba-messages');
    if (!list) return;
    const row = document.createElement('div');
    row.className = `skryba-msg skryba-msg--${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'skryba-msg-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    if (extraHtml) {
        const extra = document.createElement('div');
        extra.className = 'skryba-msg-extra';
        extra.innerHTML = extraHtml;
        row.appendChild(extra);
    }
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
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
        appendSkrybaMessage('assistant', result.error === 'cancelled'
            ? 'Anulowano zapis transakcji.'
            : (result.error || 'Nie udało się zapisać.'));
        return;
    }
    appendSkrybaMessage('assistant', `Zapisano: ${formatAssistantTransactionPreview(result.tx)}`);
    if (typeof hapticFeedback === 'function') hapticFeedback();
}

function cancelSkrybaPendingTransaction() {
    skrybaPendingTransaction = null;
    appendSkrybaMessage('assistant', 'OK, nie dodaję transakcji.');
}

function commitAssistantTransaction(txData) {
    if (typeof commitTransactionData !== 'function') {
        return { ok: false, error: 'Brak obsługi zapisu transakcji.' };
    }
    return commitTransactionData(txData, { skipBudgetConfirm: true });
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
    return `Jesteś API klasyfikującym intencje użytkownika aplikacji Portfel (język polski).
Odpowiadaj WYŁĄCZNIE jednym obiektem JSON. Bez markdown, bez \`\`\`json, bez tekstu przed ani po JSON.

Dzisiejsza data: ${today}.
Kategorie wydatków (main → sub): ${JSON.stringify(expense)}
Kategorie wpływów (main → sub): ${JSON.stringify(income)}

Schemat odpowiedzi:
{
  "intent": "add_transaction" | "search" | "debt_today" | "reply",
  "reply": "krótka odpowiedź po polsku",
  "transaction": { "amount": number, "type": "expense"|"income", "mainCategory": "...", "subCategory": "...", "date": "YYYY-MM-DD", "note": "..." } | null,
  "search": { "query": "...", "mainCategory": "..."|null, "subCategory": "..."|null, "type": "expense"|"income"|"all", "daysBack": number|null } | null
}

Zasady intencji:
- add_transaction: kwota + opis zakupu/wpływu → transaction wypełnione, search=null
- search: historia, „kiedy kupiłem…”, lista transakcji → search wypełnione, transaction=null
- debt_today: rata/spłata kredytu lub karty na dziś → transaction=null, search=null
- reply: ogólna rozmowa → transaction=null, search=null
- Używaj TYLKO kategorii z drzewa (dokładna wielkość liter). Biedronka/Lidl → Zakupy. Paliwo → Samochód › Paliwo.
- amount: liczba dodatnia (kropka dziesiętna, bez „zł”).
- Brak daty w tekście → ${today}.

Przykłady:
Użytkownik: "20 zł biedronka"
{"intent":"add_transaction","reply":"Dodaję zakup w Biedronce.","transaction":{"amount":20,"type":"expense","mainCategory":"Zakupy","subCategory":"[Bez podkategorii]","date":"${today}","note":"Biedronka"},"search":null}
Użytkownik: "kiedy kupowałem ubrania?"
{"intent":"search","reply":"Szukam transakcji z ubrań.","transaction":null,"search":{"query":"ubrania","mainCategory":"Osobista","subCategory":"Ubrania","type":"expense","daysBack":null}}
Użytkownik: "cześć"
{"intent":"reply","reply":"Cześć! Podaj kwotę i opis, a dodam transakcję.","transaction":null,"search":null}`;
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

function buildGroqAssistantMessages(userMessage) {
    const historyMessages = skrybaChatHistory.slice(-8).map((entry) => ({
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
            temperature: 0.15,
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
    if (search?.mainCategory) {
        items = items.filter((t) => t.mainCategory === search.mainCategory);
    }
    if (search?.subCategory) {
        items = items.filter((t) => t.subCategory === search.subCategory);
    }
    if (minDate) items = items.filter((t) => t.date >= minDate);
    if (query) {
        items = items.filter((t) => (
            t.mainCategory.toLowerCase().includes(query)
            || t.subCategory.toLowerCase().includes(query)
            || (t.note && t.note.toLowerCase().includes(query))
            || String(t.amount).includes(query)
        ));
    }

    return items.slice(0, 12);
}

function formatAssistantSearchResults(items) {
    if (!items.length) return 'Nie znalazłem pasujących transakcji.';
    return items.map((t) => formatAssistantTransactionPreview(t)).join('\n');
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

async function handleAssistantIntent(parsed) {
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
            note: typeof raw.note === 'string' ? raw.note : ''
        };
        const normalized = typeof normalizeTransaction === 'function'
            ? normalizeTransaction(tx)
            : null;
        if (!normalized) {
            appendSkrybaMessage('assistant', reply || 'Nie udało się zbudować transakcji z opisu.');
            return;
        }
        if (isAssistantConfirmTxEnabled()) {
            appendSkrybaMessage('assistant', reply || 'Sprawdź propozycję:');
            appendSkrybaPendingTransaction(normalized);
            return;
        }
        const result = commitAssistantTransaction(normalized);
        if (!result.ok) {
            appendSkrybaMessage('assistant', result.error || 'Nie udało się zapisać.');
            return;
        }
        appendSkrybaMessage('assistant', reply
            ? `${reply}\n${formatAssistantTransactionPreview(result.tx)}`
            : `Zapisano: ${formatAssistantTransactionPreview(result.tx)}`);
        if (typeof hapticFeedback === 'function') hapticFeedback();
        return;
    }

    if (intent === 'search') {
        const items = runAssistantSearch(parsed.search || {});
        const body = formatAssistantSearchResults(items);
        appendSkrybaMessage('assistant', reply ? `${reply}\n${body}` : body);
        return;
    }

    if (intent === 'debt_today') {
        const body = runAssistantDebtToday();
        appendSkrybaMessage('assistant', reply ? `${reply}\n${body}` : body);
        return;
    }

    appendSkrybaMessage('assistant', reply || 'Nie jestem pewien, jak pomóc — spróbuj inaczej sformułować.');
}

async function sendSkrybaMessage() {
    const input = document.getElementById('skryba-input');
    const sendBtn = document.getElementById('btn-skryba-send');
    const text = input?.value.trim();
    if (!text) return;

    if (!getAssistantApiKey()) {
        appendSkrybaMessage('assistant', 'Brak klucza API. Ustaw go w Ustawienia → Asystent AI.');
        return;
    }

    input.value = '';
    appendSkrybaMessage('user', text);
    skrybaChatHistory.push({ role: 'user', text });

    if (sendBtn) sendBtn.disabled = true;
    appendSkrybaMessage('assistant', '…');

    const list = document.getElementById('skryba-messages');
    const typingBubble = list?.lastElementChild;

    try {
        const parsed = await callGroqAssistant(text);
        typingBubble?.remove();
        if (!parsed) {
            appendSkrybaMessage('assistant', 'Nie rozumiem odpowiedzi modelu — spróbuj ponownie.');
            return;
        }
        skrybaChatHistory.push({ role: 'assistant', text: JSON.stringify(parsed) });
        await handleAssistantIntent(parsed);
    } catch (err) {
        typingBubble?.remove();
        appendSkrybaMessage('assistant', err.message || 'Błąd połączenia z Groq.');
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
    syncSkrybaHeaderVisibility();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSkrybaAssistant);
} else {
    initSkrybaAssistant();
}
