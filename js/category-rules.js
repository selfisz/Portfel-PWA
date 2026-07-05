function normalizeCategoryRule(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const pattern = String(raw.pattern || '').trim();
    const mainCategory = String(raw.mainCategory || '').trim();
    const subCategory = String(raw.subCategory || '[Bez podkategorii]').trim() || '[Bez podkategorii]';
    const type = raw.type === 'income' ? 'income' : 'expense';
    if (!pattern || !mainCategory) return null;
    return {
        id: raw.id || `rule_${Date.now().toString(36)}`,
        pattern,
        type,
        mainCategory,
        subCategory,
        priority: Number.isFinite(raw.priority) ? raw.priority : 0
    };
}

function getCategoryRules() {
    return (appState.categoryRules || [])
        .map(normalizeCategoryRule)
        .filter(Boolean)
        .sort((a, b) => b.priority - a.priority || a.pattern.localeCompare(b.pattern, 'pl'));
}

function mergeCategoryRulesById(...sources) {
    const map = new Map();
    sources.flat().forEach((raw) => {
        const rule = normalizeCategoryRule(raw);
        if (rule) map.set(rule.id, rule);
    });
    return [...map.values()].sort((a, b) => b.priority - a.priority || a.pattern.localeCompare(b.pattern, 'pl'));
}

function mergeCategoryRulesIntoFinancePayload(payload, ...sources) {
    const base = payload && typeof payload === 'object' ? payload : {};
    const ruleSources = sources.map((src) => (Array.isArray(src?.categoryRules) ? src.categoryRules : []));
    return {
        ...base,
        categoryRules: mergeCategoryRulesById(...ruleSources)
    };
}

function categoryRuleMatches(rule, text) {
    const haystack = String(text || '').toLowerCase();
    const needle = rule.pattern.toLowerCase();
    if (!haystack || !needle) return false;
    return haystack.includes(needle);
}

function applyCategoryRulesToTransaction(tx) {
    if (!tx) return tx;
    const rules = getCategoryRules().filter((rule) => rule.type === tx.type);
    const text = `${tx.note || ''} ${tx.mainCategory || ''} ${tx.subCategory || ''}`;
    for (const rule of rules) {
        if (!categoryRuleMatches(rule, text)) continue;
        if (!isAssistantCategoryPairValid(rule.type, rule.mainCategory, rule.subCategory)) continue;
        return {
            ...tx,
            mainCategory: rule.mainCategory,
            subCategory: rule.subCategory
        };
    }
    return tx;
}

function suggestCategoryFromRules(type, text) {
    const fakeTx = { type, note: text, mainCategory: '', subCategory: '' };
    const matched = applyCategoryRulesToTransaction(fakeTx);
    if (!matched.mainCategory) return null;
    return {
        mainCategory: matched.mainCategory,
        subCategory: matched.subCategory
    };
}

let categoryRuleEditingId = null;
let categoryRuleFormMode = 'new';
let categoryRulesPanelOpen = true;
let categoryRulesShowAll = false;
const CATEGORY_RULES_PREVIEW = 8;
const CATEGORY_RULE_DISMISSED_KEY = 'finanse_category_rule_dismissed_proposals';

const STARTER_CATEGORY_RULES = [
    { pattern: 'biedronka', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'lidl', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'żabka', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'carrefour', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'auchan', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'kaufland', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'bolt food', type: 'expense', mainCategory: 'Jedzenie na mieście', subCategory: 'Dowóz' },
    { pattern: 'pyszne', type: 'expense', mainCategory: 'Jedzenie na mieście', subCategory: 'Dowóz' },
    { pattern: 'glovo', type: 'expense', mainCategory: 'Jedzenie na mieście', subCategory: 'Dowóz' },
    { pattern: 'wolt', type: 'expense', mainCategory: 'Jedzenie na mieście', subCategory: 'Dowóz' },
    { pattern: 'uber eats', type: 'expense', mainCategory: 'Jedzenie na mieście', subCategory: 'Dowóz' },
    { pattern: 'netflix', type: 'expense', mainCategory: 'Subskrypcje', subCategory: 'Filmy' },
    { pattern: 'hbo max', type: 'expense', mainCategory: 'Subskrypcje', subCategory: 'Filmy' },
    { pattern: 'disney', type: 'expense', mainCategory: 'Subskrypcje', subCategory: 'Filmy' },
    { pattern: 'spotify', type: 'expense', mainCategory: 'Subskrypcje', subCategory: 'Muzyka' },
    { pattern: 'youtube premium', type: 'expense', mainCategory: 'Subskrypcje', subCategory: 'YouTube' },
    { pattern: 'orlen', type: 'expense', mainCategory: 'Samochód', subCategory: 'Paliwo' },
    { pattern: 'circle k', type: 'expense', mainCategory: 'Samochód', subCategory: 'Paliwo' },
    { pattern: 'shell', type: 'expense', mainCategory: 'Samochód', subCategory: 'Paliwo' },
    { pattern: 'allegro', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'amazon', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' },
    { pattern: 'play pl', type: 'expense', mainCategory: 'Rachunki/opłaty', subCategory: 'Telefon komórkowy' },
    { pattern: 'orange pl', type: 'expense', mainCategory: 'Rachunki/opłaty', subCategory: 'Telefon komórkowy' },
    { pattern: 'plus pl', type: 'expense', mainCategory: 'Rachunki/opłaty', subCategory: 'Telefon komórkowy' },
    { pattern: 'pge', type: 'expense', mainCategory: 'Rachunki/opłaty', subCategory: 'Elektryczność' },
    { pattern: 'tauron', type: 'expense', mainCategory: 'Rachunki/opłaty', subCategory: 'Elektryczność' },
    { pattern: 'wynagrodzenie', type: 'income', mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa' },
    { pattern: 'pensja', type: 'income', mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa' }
];

function getValidStarterCategoryRules() {
    return STARTER_CATEGORY_RULES.filter((rule) => {
        const normalized = normalizeCategoryRule(rule);
        return normalized && isAssistantCategoryPairValid(normalized.type, normalized.mainCategory, normalized.subCategory);
    });
}

function getStarterProposalKey(rule) {
    return `${rule.type}\u0001${String(rule.pattern || '').trim().toLowerCase()}`;
}

function readDismissedStarterProposals() {
    try {
        const raw = JSON.parse(localStorage.getItem(CATEGORY_RULE_DISMISSED_KEY) || '[]');
        return new Set(Array.isArray(raw) ? raw.filter(Boolean) : []);
    } catch {
        return new Set();
    }
}

function writeDismissedStarterProposals(keys) {
    localStorage.setItem(CATEGORY_RULE_DISMISSED_KEY, JSON.stringify([...keys]));
}

const GENERIC_PROPOSAL_PATTERNS = new Set([
    'przelew', 'platnosc', 'płatność', 'zakup', 'karta', 'blik', 'transakcja',
    'odbior', 'wplata', 'wpłata', 'automat', 'bankomat', 'sklep', 'oplata', 'opłata',
    'rata', 'splata', 'spłata', 'zwrot', 'cashback', 'portfel', 'finanse', 'konto'
]);

function normalizeProposalPattern(text) {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isGenericProposalPattern(pattern) {
    const p = normalizeProposalPattern(pattern);
    if (p.length < 3 || p.length > 48) return true;
    if (/^\d+([.,]\d+)?$/.test(p)) return true;
    if (GENERIC_PROPOSAL_PATTERNS.has(p)) return true;
    return false;
}

function isBuiltinStarterPattern(pattern, type) {
    const needle = normalizeProposalPattern(pattern);
    return STARTER_CATEGORY_RULES.some(
        (rule) => rule.type === type && normalizeProposalPattern(rule.pattern) === needle
    );
}

function noteWords(note) {
    return String(note || '')
        .toLowerCase()
        .split(/[^a-ząćęłńóśźż0-9]+/u)
        .filter((word) => word.length >= 4);
}

function getTransactionDerivedProposals() {
    const fullNotes = new Map();
    const words = new Map();

    (appState.transactions || []).forEach((tx) => {
        if (!tx?.mainCategory) return;
        const type = tx.type === 'income' ? 'income' : 'expense';
        const mainCategory = tx.mainCategory;
        const subCategory = tx.subCategory || '[Bez podkategorii]';
        if (typeof isAssistantCategoryPairValid === 'function'
            && !isAssistantCategoryPairValid(type, mainCategory, subCategory)) return;

        const note = String(tx.note || '').trim();
        if (note.length < 3) return;

        const fullPattern = normalizeProposalPattern(note);
        if (!isGenericProposalPattern(fullPattern) && fullPattern.length <= 40) {
            const key = `${type}\u0001${fullPattern}\u0001${mainCategory}\u0001${subCategory}`;
            fullNotes.set(key, (fullNotes.get(key) || 0) + 1);
        }

        noteWords(note).forEach((word) => {
            if (isGenericProposalPattern(word)) return;
            const key = `${type}\u0001${word}\u0001${mainCategory}\u0001${subCategory}`;
            words.set(key, (words.get(key) || 0) + 1);
        });
    });

    const proposals = [];
    const pushBucket = (bucket, minCount) => {
        bucket.forEach((count, key) => {
            if (count < minCount) return;
            const [type, pattern, mainCategory, subCategory] = key.split('\u0001');
            if (hasCategoryRulePattern(pattern, type)) return;
            if (isBuiltinStarterPattern(pattern, type)) return;
            proposals.push({
                pattern,
                type,
                mainCategory,
                subCategory,
                txCount: count,
                source: 'history'
            });
        });
    };
    pushBucket(fullNotes, 2);
    pushBucket(words, 3);

    const byPattern = new Map();
    proposals.forEach((rule) => {
        const key = `${getStarterProposalKey(rule)}\u0001${rule.mainCategory}\u0001${rule.subCategory}`;
        const prev = byPattern.get(key);
        if (!prev || rule.txCount > prev.txCount) byPattern.set(key, rule);
    });

    return [...byPattern.values()]
        .sort((a, b) => b.txCount - a.txCount || a.pattern.localeCompare(b.pattern, 'pl'));
}

function getAllCategoryRuleProposals() {
    const dismissed = readDismissedStarterProposals();
    const seen = new Set();
    const merged = [];

    getTransactionDerivedProposals().forEach((rule) => {
        const key = getStarterProposalKey(rule);
        if (dismissed.has(key) || seen.has(key)) return;
        seen.add(key);
        merged.push(rule);
    });

    getValidStarterCategoryRules().forEach((rule) => {
        const key = getStarterProposalKey(rule);
        if (dismissed.has(key) || seen.has(key)) return;
        seen.add(key);
        merged.push({ ...rule, source: 'builtin' });
    });

    return merged.filter((rule) =>
        !dismissed.has(getStarterProposalKey(rule))
        && !hasCategoryRulePattern(rule.pattern, rule.type)
    );
}

function findCategoryRuleByPattern(pattern, type) {
    const needle = String(pattern || '').trim().toLowerCase();
    if (!needle) return null;
    return getCategoryRules().find((rule) => rule.type === type && rule.pattern.toLowerCase() === needle) || null;
}

function fillCategoryRuleFormFromStarter(starter) {
    if (!starter) return;
    const patternInput = document.getElementById('category-rule-pattern');
    const typeSelect = document.getElementById('category-rule-type');
    const mainSelect = document.getElementById('category-rule-main');
    const subSelect = document.getElementById('category-rule-sub');
    if (patternInput) patternInput.value = starter.pattern;
    if (typeSelect) typeSelect.value = starter.type;
    populateCategoryRuleMainSelect();
    if (mainSelect) mainSelect.value = starter.mainCategory;
    populateCategoryRuleSubSelect();
    if (subSelect) subSelect.value = starter.subCategory;
}

function dismissStarterCategoryRuleAt(index) {
    const starter = getAllCategoryRuleProposals()[index];
    if (!starter) return;
    const dismissed = readDismissedStarterProposals();
    dismissed.add(getStarterProposalKey(starter));
    writeDismissedStarterProposals(dismissed);
    renderCategoryRuleProposals();
}

function openStarterProposalForEdit(index) {
    const starter = getAllCategoryRuleProposals()[index];
    if (!starter) return;
    const existing = findCategoryRuleByPattern(starter.pattern, starter.type);
    if (existing) {
        editCategoryRule(existing.id);
        return;
    }
    categoryRuleEditingId = null;
    fillCategoryRuleFormFromStarter(starter);
    setCategoryRuleFormMode('new');
    document.getElementById('category-rule-pattern')?.focus();
}

function removeCategoryRuleFromProposal(index) {
    const starter = getAllCategoryRuleProposals()[index];
    if (!starter) return;
    const existing = findCategoryRuleByPattern(starter.pattern, starter.type);
    if (!existing) return;
    removeCategoryRule(existing.id);
    renderCategoryRuleProposals();
}

function hasCategoryRulePattern(pattern, type) {
    const needle = String(pattern || '').trim().toLowerCase();
    if (!needle) return false;
    return getCategoryRules().some((rule) => rule.type === type && rule.pattern.toLowerCase() === needle);
}

function addStarterCategoryRule(starter) {
    if (!starter || hasCategoryRulePattern(starter.pattern, starter.type)) return false;
    if (!isAssistantCategoryPairValid(starter.type, starter.mainCategory, starter.subCategory)) return false;
    const normalized = normalizeCategoryRule(starter);
    if (!normalized) return false;
    if (!Array.isArray(appState.categoryRules)) appState.categoryRules = [];
    appState.categoryRules.push(normalized);
    saveState();
    renderCategoryRulesEditor();
    if (categoryRuleFormMode === 'proposals') renderCategoryRuleProposals();
    return true;
}

function addAllStarterCategoryRules() {
    const available = getAllCategoryRuleProposals().filter((rule) => !hasCategoryRulePattern(rule.pattern, rule.type));
    if (!available.length) {
        if (typeof showSettingsToast === 'function') showSettingsToast('Wszystkie propozycje są już na liście');
        renderCategoryRuleProposals();
        return;
    }
    if (!Array.isArray(appState.categoryRules)) appState.categoryRules = [];
    available.forEach((rule) => {
        const normalized = normalizeCategoryRule(rule);
        if (normalized) appState.categoryRules.push(normalized);
    });
    saveState();
    renderCategoryRulesEditor();
    renderCategoryRuleProposals();
    if (typeof showSettingsToast === 'function') {
        showSettingsToast(`Dodano ${available.length} propozycji`);
    }
}

function setCategoryRuleFormMode(mode) {
    if (categoryRuleEditingId) return;
    categoryRuleFormMode = mode === 'proposals' ? 'proposals' : 'new';
    updateCategoryRuleFormUi();
    if (categoryRuleFormMode === 'proposals') renderCategoryRuleProposals();
}

function renderCategoryRuleProposals() {
    const list = document.getElementById('category-rule-proposals-list');
    if (!list) return;
    const starters = getAllCategoryRuleProposals();
    if (!starters.length) {
        list.innerHTML = '<p class="settings-hint">Brak propozycji — wszystkie dodane lub ukryte. Możesz dodać własną regułę w zakładce „Nowa reguła”.</p>';
        return;
    }
    list.innerHTML = starters.map((rule, index) => {
        const sub = rule.subCategory !== '[Bez podkategorii]' ? ` / ${escapeHtml(rule.subCategory)}` : '';
        const historyMeta = rule.source === 'history' && rule.txCount
            ? ` · ${rule.txCount}× w historii`
            : '';
        return `<div class="category-rule-proposal-row">
            <button type="button" class="category-rule-proposal-open" onclick="openStarterProposalForEdit(${index})">
                <strong>„${escapeHtml(rule.pattern)}”</strong>
                <span class="category-rule-item-meta">→ ${escapeHtml(rule.mainCategory)}${sub}${historyMeta}</span>
            </button>
            <div class="category-rule-proposal-actions">
                <button type="button" class="btn-text-link category-rule-proposal-add" onclick="addStarterCategoryRuleAt(${index})">Dodaj</button>
                <button type="button" class="btn-text-link category-rule-proposal-dismiss" onclick="dismissStarterCategoryRuleAt(${index})">Pomiń</button>
            </div>
        </div>`;
    }).join('');
}

function addStarterCategoryRuleAt(index) {
    const starter = getAllCategoryRuleProposals()[index];
    if (!starter || !addStarterCategoryRule(starter)) return;
    renderCategoryRuleProposals();
    if (typeof showSettingsToast === 'function') showSettingsToast('Dodano regułę');
}

function addCategoryRule(rule) {
    const normalized = normalizeCategoryRule(rule);
    if (!normalized) return null;
    if (!Array.isArray(appState.categoryRules)) appState.categoryRules = [];
    appState.categoryRules.push(normalized);
    saveState();
    renderCategoryRulesEditor();
    if (categoryRuleFormMode === 'proposals') renderCategoryRuleProposals();
    return normalized;
}

function updateCategoryRule(ruleId, patch) {
    if (!ruleId || !Array.isArray(appState.categoryRules)) return null;
    const idx = appState.categoryRules.findIndex((rule) => rule.id === ruleId);
    if (idx < 0) return null;
    const merged = normalizeCategoryRule({ ...appState.categoryRules[idx], ...patch, id: ruleId });
    if (!merged) return null;
    appState.categoryRules[idx] = merged;
    saveState();
    renderCategoryRulesEditor();
    if (categoryRuleFormMode === 'proposals') renderCategoryRuleProposals();
    return merged;
}

function removeCategoryRule(ruleId) {
    if (!Array.isArray(appState.categoryRules)) return;
    if (ruleId === categoryRuleEditingId) closeCategoryRuleForm();
    appState.categoryRules = appState.categoryRules.filter((rule) => rule.id !== ruleId);
    saveState();
    renderCategoryRulesEditor();
    if (categoryRuleFormMode === 'proposals') renderCategoryRuleProposals();
}

function updateCategoryRuleFormUi() {
    const submit = document.getElementById('category-rule-submit-btn');
    const title = document.getElementById('category-rule-form-title');
    const modeWrap = document.getElementById('category-rule-form-mode');
    const manual = document.getElementById('category-rule-form-manual');
    const proposals = document.getElementById('category-rule-form-proposals');
    const modeNew = document.getElementById('category-rule-mode-new');
    const modeProposals = document.getElementById('category-rule-mode-proposals');
    const editing = !!categoryRuleEditingId;
    if (submit) submit.textContent = editing ? 'Zapisz zmiany' : 'Dodaj regułę';
    if (title) title.classList.toggle('hidden', !editing);
    if (modeWrap) modeWrap.classList.toggle('hidden', editing);
    if (modeNew) modeNew.classList.toggle('active', !editing && categoryRuleFormMode === 'new');
    if (modeProposals) modeProposals.classList.toggle('active', !editing && categoryRuleFormMode === 'proposals');
    if (manual) manual.classList.toggle('hidden', !editing && categoryRuleFormMode === 'proposals');
    if (proposals) proposals.classList.toggle('hidden', editing || categoryRuleFormMode !== 'proposals');
}

function clearCategoryRuleFormFields() {
    const patternInput = document.getElementById('category-rule-pattern');
    const typeSelect = document.getElementById('category-rule-type');
    if (patternInput) patternInput.value = '';
    if (typeSelect) typeSelect.value = 'expense';
    populateCategoryRuleMainSelect();
}

function openCategoryRuleForm() {
    categoryRuleEditingId = null;
    categoryRuleFormMode = 'new';
    clearCategoryRuleFormFields();
    updateCategoryRuleFormUi();
    const form = document.getElementById('category-rule-form');
    if (form) {
        form.classList.remove('hidden');
        form.setAttribute('aria-hidden', 'false');
    }
    document.getElementById('category-rule-pattern')?.focus();
}

function closeCategoryRuleForm() {
    categoryRuleEditingId = null;
    categoryRuleFormMode = 'new';
    const form = document.getElementById('category-rule-form');
    if (form) {
        form.classList.add('hidden');
        form.setAttribute('aria-hidden', 'true');
    }
    clearCategoryRuleFormFields();
    updateCategoryRuleFormUi();
    renderCategoryRulesEditor();
}

function editCategoryRule(ruleId) {
    const rule = getCategoryRules().find((item) => item.id === ruleId);
    if (!rule) return;
    categoryRuleEditingId = ruleId;
    const patternInput = document.getElementById('category-rule-pattern');
    const typeSelect = document.getElementById('category-rule-type');
    const mainSelect = document.getElementById('category-rule-main');
    const subSelect = document.getElementById('category-rule-sub');
    if (patternInput) patternInput.value = rule.pattern;
    if (typeSelect) typeSelect.value = rule.type;
    populateCategoryRuleMainSelect();
    if (mainSelect) mainSelect.value = rule.mainCategory;
    populateCategoryRuleSubSelect();
    if (subSelect) subSelect.value = rule.subCategory;
    categoryRuleFormMode = 'new';
    updateCategoryRuleFormUi();
    const form = document.getElementById('category-rule-form');
    if (form) {
        form.classList.remove('hidden');
        form.setAttribute('aria-hidden', 'false');
    }
    categoryRulesPanelOpen = true;
    renderCategoryRulesEditor();
    form?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function applyCategoryRulesPanelState() {
    const card = document.querySelector('#category-rules-list .category-rules-card');
    if (!card) return;
    card.classList.toggle('category-rules-card--open', categoryRulesPanelOpen);
    const toggle = card.querySelector('.category-rules-card-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', categoryRulesPanelOpen ? 'true' : 'false');
}

function toggleCategoryRulesPanel() {
    categoryRulesPanelOpen = !categoryRulesPanelOpen;
    applyCategoryRulesPanelState();
}

function toggleCategoryRulesShowAll() {
    categoryRulesShowAll = !categoryRulesShowAll;
    renderCategoryRulesEditor();
}

function filterCategoryRulesList(query) {
    const q = String(query || '').trim().toLowerCase();
    document.querySelectorAll('#category-rules-list .category-rule-item').forEach((item) => {
        const hay = (item.dataset.search || '').toLowerCase();
        const match = !q.length || hay.includes(q);
        item.classList.toggle('hidden', !match);
        item.classList.toggle('category-rule-item--filter-match', q.length > 0 && match);
    });
    document.querySelectorAll('#category-rules-list .category-rules-group').forEach((group) => {
        const visible = group.querySelectorAll('.category-rule-item:not(.hidden)').length;
        group.classList.toggle('hidden', q.length > 0 && visible === 0);
        if (q.length > 0 && visible > 0) group.open = true;
    });
}

function renderCategoryRuleItemHtml(rule, { extra = false } = {}) {
    const sub = rule.subCategory !== '[Bez podkategorii]' ? ` / ${escapeHtml(rule.subCategory)}` : '';
    const editingClass = rule.id === categoryRuleEditingId ? ' category-rule-item--editing' : '';
    const extraClass = extra ? ' category-rule-item--extra' : '';
    const searchBlob = `${rule.pattern} ${rule.mainCategory} ${rule.subCategory} ${rule.type}`;
    return `<div class="category-rule-item${editingClass}${extraClass}" data-search="${escapeHtml(searchBlob)}">
        <div class="category-rule-item-body">
            <strong>„${escapeHtml(rule.pattern)}”</strong>
            <span class="category-rule-item-meta">${escapeHtml(rule.mainCategory)}${sub}</span>
        </div>
        <div class="category-rule-item-actions">
            <button type="button" class="btn-text-link category-rule-item-edit" onclick="editCategoryRule('${escapeHtml(rule.id)}')">Edytuj</button>
            <button type="button" class="category-rule-item-delete" onclick="removeCategoryRule('${escapeHtml(rule.id)}')" aria-label="Usuń regułę">×</button>
        </div>
    </div>`;
}

function renderCategoryRulesGroupHtml(title, rules, previewState) {
    if (!rules.length) return '';
    const rows = rules.map((rule) => {
        const extra = previewState.shown >= previewState.max;
        if (!extra) previewState.shown += 1;
        return renderCategoryRuleItemHtml(rule, { extra });
    }).join('');
    const openAttr = rules.length <= 4 ? ' open' : '';
    return `<details class="category-rules-group"${openAttr}>
        <summary class="category-rules-group-summary">${escapeHtml(title)} <span class="category-rules-group-count">${rules.length}</span></summary>
        <div class="category-rules-group-list">${rows}</div>
    </details>`;
}

function renderCategoryRulesCardHeader(count) {
    return `<div class="category-rules-card-header">
        <button type="button" class="category-rules-card-toggle" aria-expanded="${categoryRulesPanelOpen ? 'true' : 'false'}" onclick="toggleCategoryRulesPanel()">
            <span class="category-rules-card-toggle-main">
                <span class="category-rules-card-title">Twoje reguły</span>
                <span class="category-rules-card-count">${count}</span>
            </span>
            <svg class="category-rules-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
        </button>
        <button type="button" class="category-rules-add-btn" onclick="openCategoryRuleForm()" aria-label="Dodaj regułę">+</button>
    </div>`;
}

function renderCategoryRulesEditor() {
    const host = document.getElementById('category-rules-list');
    if (!host) return;
    const rules = getCategoryRules();
    const header = renderCategoryRulesCardHeader(rules.length);

    if (!rules.length) {
        categoryRulesShowAll = false;
        host.innerHTML = `<div class="category-rules-card${categoryRulesPanelOpen ? ' category-rules-card--open' : ''}">
            ${header}
            <div class="category-rules-card-body">
                <p class="settings-hint category-rules-empty-hint">Brak reguł — kliknij +, aby dodać wzorzec z notatki (np. „biedronka”).</p>
            </div>
        </div>`;
        updateCategoryRuleFormUi();
        return;
    }

    const expenseRules = rules.filter((rule) => rule.type === 'expense');
    const incomeRules = rules.filter((rule) => rule.type === 'income');
    const hiddenCount = Math.max(0, rules.length - CATEGORY_RULES_PREVIEW);
    const showAll = categoryRulesShowAll || hiddenCount === 0;
    const previewState = { shown: 0, max: showAll ? Number.POSITIVE_INFINITY : CATEGORY_RULES_PREVIEW };
    const showAllBtn = hiddenCount > 0
        ? `<button type="button" class="btn-text-link category-rules-show-all" onclick="toggleCategoryRulesShowAll()">${showAll ? 'Pokaż mniej' : `Pokaż wszystkie (${rules.length})`}</button>`
        : '';
    const groups = [
        renderCategoryRulesGroupHtml('Wydatki', expenseRules, previewState),
        renderCategoryRulesGroupHtml('Wpływy', incomeRules, previewState)
    ].filter(Boolean).join('');

    host.innerHTML = `<div class="category-rules-card${categoryRulesPanelOpen ? ' category-rules-card--open' : ''}">
        ${header}
        <div class="category-rules-card-body">
            <input type="search" class="category-rules-search" placeholder="Szukaj wzorca lub kategorii…" oninput="filterCategoryRulesList(this.value)" aria-label="Szukaj reguł">
            <div class="category-rules-scroll">
                ${groups}
            </div>
            ${showAllBtn}
        </div>
    </div>`;
    updateCategoryRuleFormUi();
}

function saveCategoryRuleFromForm() {
    const pattern = document.getElementById('category-rule-pattern')?.value?.trim();
    const type = document.getElementById('category-rule-type')?.value === 'income' ? 'income' : 'expense';
    const mainCategory = document.getElementById('category-rule-main')?.value?.trim();
    const subCategory = document.getElementById('category-rule-sub')?.value?.trim() || '[Bez podkategorii]';
    if (!pattern || !mainCategory) {
        if (typeof showSettingsToast === 'function') showSettingsToast('Podaj wzorzec i kategorię');
        return;
    }
    if (!isAssistantCategoryPairValid(type, mainCategory, subCategory)) {
        if (typeof showSettingsToast === 'function') showSettingsToast('Nieprawidłowa para kategorii');
        return;
    }
    if (categoryRuleEditingId) {
        updateCategoryRule(categoryRuleEditingId, { pattern, type, mainCategory, subCategory });
        if (typeof showSettingsToast === 'function') showSettingsToast('Zapisano regułę');
    } else {
        addCategoryRule({ pattern, type, mainCategory, subCategory });
        if (typeof showSettingsToast === 'function') showSettingsToast('Dodano regułę');
    }
    closeCategoryRuleForm();
}

function populateCategoryRuleMainSelect() {
    const select = document.getElementById('category-rule-main');
    const type = document.getElementById('category-rule-type')?.value === 'income' ? 'income' : 'expense';
    if (!select) return;
    const tree = type === 'income'
        ? (categoryTree?.income || DEFAULT_CATEGORY_TREE.income)
        : (categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense);
    const prev = select.value;
    select.innerHTML = Object.keys(tree).map((main) =>
        `<option value="${escapeHtml(main)}">${escapeHtml(main)}</option>`
    ).join('');
    if (prev && [...select.options].some((opt) => opt.value === prev)) {
        select.value = prev;
    }
    populateCategoryRuleSubSelect();
}

function populateCategoryRuleSubSelect() {
    const mainSelect = document.getElementById('category-rule-main');
    const subSelect = document.getElementById('category-rule-sub');
    if (!mainSelect || !subSelect) return;
    const type = document.getElementById('category-rule-type')?.value === 'income' ? 'income' : 'expense';
    const tree = type === 'income'
        ? (categoryTree?.income || DEFAULT_CATEGORY_TREE.income)
        : (categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense);
    const subs = tree[mainSelect.value] || [];
    const prev = subSelect.value;
    subSelect.innerHTML = ['[Bez podkategorii]', ...subs].map((sub) =>
        `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`
    ).join('');
    if (prev && [...subSelect.options].some((opt) => opt.value === prev)) {
        subSelect.value = prev;
    }
}

function initCategoryRulesEditor() {
    const typeSelect = document.getElementById('category-rule-type');
    const mainSelect = document.getElementById('category-rule-main');
    if (typeSelect) typeSelect.addEventListener('change', populateCategoryRuleMainSelect);
    if (mainSelect) mainSelect.addEventListener('change', populateCategoryRuleSubSelect);
    populateCategoryRuleMainSelect();
    renderCategoryRulesEditor();
}
