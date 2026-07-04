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
let categoryRulesPanelOpen = true;
let categoryRulesShowAll = false;
const CATEGORY_RULES_PREVIEW = 8;

function addCategoryRule(rule) {
    const normalized = normalizeCategoryRule(rule);
    if (!normalized) return null;
    if (!Array.isArray(appState.categoryRules)) appState.categoryRules = [];
    appState.categoryRules.push(normalized);
    saveState();
    renderCategoryRulesEditor();
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
    return merged;
}

function removeCategoryRule(ruleId) {
    if (!Array.isArray(appState.categoryRules)) return;
    if (ruleId === categoryRuleEditingId) closeCategoryRuleForm();
    appState.categoryRules = appState.categoryRules.filter((rule) => rule.id !== ruleId);
    saveState();
    renderCategoryRulesEditor();
}

function updateCategoryRuleFormUi() {
    const submit = document.getElementById('category-rule-submit-btn');
    const title = document.getElementById('category-rule-form-title');
    const editing = !!categoryRuleEditingId;
    if (submit) submit.textContent = editing ? 'Zapisz zmiany' : 'Dodaj regułę';
    if (title) title.textContent = editing ? 'Edytuj regułę' : 'Nowa reguła';
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
