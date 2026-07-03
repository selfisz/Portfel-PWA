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

function addCategoryRule(rule) {
    const normalized = normalizeCategoryRule(rule);
    if (!normalized) return null;
    if (!Array.isArray(appState.categoryRules)) appState.categoryRules = [];
    appState.categoryRules.push(normalized);
    saveState();
    renderCategoryRulesEditor();
    return normalized;
}

function removeCategoryRule(ruleId) {
    if (!Array.isArray(appState.categoryRules)) return;
    appState.categoryRules = appState.categoryRules.filter((rule) => rule.id !== ruleId);
    saveState();
    renderCategoryRulesEditor();
}

function renderCategoryRulesEditor() {
    const list = document.getElementById('category-rules-list');
    if (!list) return;
    const rules = getCategoryRules();
    if (!rules.length) {
        list.innerHTML = '<p class="settings-hint">Brak reguł — dodaj wzorzec z notatki (np. „biedronka”) i przypisz kategorię.</p>';
        return;
    }
    list.innerHTML = rules.map((rule) => {
        const sub = rule.subCategory !== '[Bez podkategorii]' ? ` / ${escapeHtml(rule.subCategory)}` : '';
        const typeLabel = rule.type === 'income' ? 'Wpływ' : 'Wydatek';
        return `<div class="category-rule-item">
            <div class="category-rule-item-body">
                <strong>„${escapeHtml(rule.pattern)}”</strong>
                <span class="category-rule-item-meta">${typeLabel} → ${escapeHtml(rule.mainCategory)}${sub}</span>
            </div>
            <button type="button" class="category-rule-item-delete" onclick="removeCategoryRule('${escapeHtml(rule.id)}')" aria-label="Usuń regułę">×</button>
        </div>`;
    }).join('');
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
    addCategoryRule({ pattern, type, mainCategory, subCategory });
    const patternInput = document.getElementById('category-rule-pattern');
    if (patternInput) patternInput.value = '';
    if (typeof showSettingsToast === 'function') showSettingsToast('Dodano regułę');
}

function populateCategoryRuleMainSelect() {
    const select = document.getElementById('category-rule-main');
    const type = document.getElementById('category-rule-type')?.value === 'income' ? 'income' : 'expense';
    if (!select) return;
    const tree = type === 'income'
        ? (categoryTree?.income || DEFAULT_CATEGORY_TREE.income)
        : (categoryTree?.expense || DEFAULT_CATEGORY_TREE.expense);
    select.innerHTML = Object.keys(tree).map((main) =>
        `<option value="${escapeHtml(main)}">${escapeHtml(main)}</option>`
    ).join('');
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
    subSelect.innerHTML = ['[Bez podkategorii]', ...subs].map((sub) =>
        `<option value="${escapeHtml(sub)}">${escapeHtml(sub)}</option>`
    ).join('');
}

function initCategoryRulesEditor() {
    const typeSelect = document.getElementById('category-rule-type');
    const mainSelect = document.getElementById('category-rule-main');
    if (typeSelect) typeSelect.addEventListener('change', populateCategoryRuleMainSelect);
    if (mainSelect) mainSelect.addEventListener('change', populateCategoryRuleSubSelect);
    populateCategoryRuleMainSelect();
    renderCategoryRulesEditor();
}
