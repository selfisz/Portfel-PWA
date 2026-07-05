let skrybaViewportBound = false;

const SKRYBA_USER_AVATAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
const SKRYBA_ASSISTANT_AVATAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h3l3 3 3-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';

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
    if (typeof guardAppLockSensitiveAction === 'function' && !guardAppLockSensitiveAction()) return;
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
        'Poranny przegląd',
        'Podsumowanie miesiąca',
        'Briefing tygodnia',
        'Transakcje bez podkategorii',
        'Co mam na liście zakupów?',
        'Płatności na tydzień',
        'Co z nadwyżką?',
        'Rozlicz miesiąc',
        'Otwórz analizę'
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

function attachSkrybaMessageExtra(messageId, extraHtml) {
    if (!messageId || !extraHtml) return;
    const row = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!row) return;
    const body = row.querySelector('.skryba-msg-body');
    if (!body) return;
    let extra = body.querySelector('.skryba-msg-extra');
    if (!extra) {
        extra = document.createElement('div');
        extra.className = 'skryba-msg-extra';
        body.appendChild(extra);
    }
    extra.innerHTML = extraHtml;
    scrollSkrybaToBottom();
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
    const extraHtml = options.extraHtml || '';
    const attachExtra = () => {
        if (extraHtml) attachSkrybaMessageExtra(messageId, extraHtml);
    };
    if (!fullText || options.instant) {
        bubble.textContent = fullText;
        attachExtra();
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
        } else {
            attachExtra();
        }
    };
    window.requestAnimationFrame(tick);
    return messageId;
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
