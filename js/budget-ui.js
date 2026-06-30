const SUB_CATEGORY_BUDGET_SEP = '\u0001';

function getBudgetTransactions() {
    return typeof getMergedTransactions === 'function'
        ? getMergedTransactions()
        : (appState.transactions || []);
}

function isCategoryBudgetExpense(tx) {
    return tx?.type === 'expense' && !!tx.mainCategory;
}

function normalizeSubCategoryForBudget(subCategory) {
    const sub = String(subCategory || '').trim();
    return sub || '[Bez podkategorii]';
}

function makeSubCategoryBudgetKey(mainCategory, subCategory) {
    return `${mainCategory}${SUB_CATEGORY_BUDGET_SEP}${normalizeSubCategoryForBudget(subCategory)}`;
}

function parseSubCategoryBudgetKey(key) {
    const idx = String(key).indexOf(SUB_CATEGORY_BUDGET_SEP);
    if (idx < 0) return { mainCategory: key, subCategory: '[Bez podkategorii]' };
    return {
        mainCategory: key.slice(0, idx),
        subCategory: key.slice(idx + 1)
    };
}

function getTransactionBudgetMonthKey(tx) {
    return String(tx?.date || '').slice(0, 7);
}

function transactionInBudgetMonth(tx, monthKey) {
    return getTransactionBudgetMonthKey(tx) === monthKey;
}

function makeMainBudgetKey(category) {
    return `main:${category}`;
}

function makeSubBudgetKey(mainCategory, subCategory) {
    return `sub:${makeSubCategoryBudgetKey(mainCategory, subCategory)}`;
}

function getCategorySpentInMonth(mainCategory, monthKey) {
    const start = `${monthKey}-01`;
    const [year, month] = monthKey.split('-').map(Number);
    const end = localIsoDate(new Date(year, month, 0));
    return getBudgetTransactions()
        .filter((t) => isCategoryBudgetExpense(t)
            && t.mainCategory === mainCategory
            && t.date >= start
            && t.date <= end)
        .reduce((sum, t) => sum + t.amount, 0);
}

function getSubCategorySpentInMonth(mainCategory, subCategory, monthKey) {
    const sub = normalizeSubCategoryForBudget(subCategory);
    const start = `${monthKey}-01`;
    const [year, month] = monthKey.split('-').map(Number);
    const end = localIsoDate(new Date(year, month, 0));
    return getBudgetTransactions()
        .filter((t) => {
            if (!isCategoryBudgetExpense(t) || t.mainCategory !== mainCategory) return false;
            if (t.date < start || t.date > end) return false;
            return normalizeSubCategoryForBudget(t.subCategory) === sub;
        })
        .reduce((sum, t) => sum + t.amount, 0);
}

function getCategoryBudgetLimit(mainCategory) {
    const limit = appState.categoryBudgets?.[mainCategory];
    return Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 0;
}

function getSubCategoryBudgetLimit(mainCategory, subCategory) {
    const limit = appState.subCategoryBudgets?.[makeSubCategoryBudgetKey(mainCategory, subCategory)];
    return Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 0;
}

function getCategoryBudgetState(spent, limit) {
    if (!limit || limit <= 0) return 'none';
    const pct = (spent / limit) * 100;
    if (pct >= 100) return 'over';
    if (pct >= 80) return 'warn';
    return 'ok';
}

function buildBudgetStatusRecord({ scope, key, label, category, subCategory, limit, spent }) {
    const pct = Math.round((spent / limit) * 100);
    return {
        scope,
        key,
        label,
        category,
        subCategory: subCategory || null,
        limit,
        spent,
        remaining: limit - spent,
        pct,
        state: getCategoryBudgetState(spent, limit)
    };
}

function getCategoryBudgetStatus(mainCategory, monthKey) {
    const limit = getCategoryBudgetLimit(mainCategory);
    if (!limit) return null;
    const spent = getCategorySpentInMonth(mainCategory, monthKey);
    return buildBudgetStatusRecord({
        scope: 'main',
        key: makeMainBudgetKey(mainCategory),
        label: mainCategory,
        category: mainCategory,
        limit,
        spent
    });
}

function getSubCategoryBudgetStatus(mainCategory, subCategory, monthKey) {
    const limit = getSubCategoryBudgetLimit(mainCategory, subCategory);
    if (!limit) return null;
    const sub = normalizeSubCategoryForBudget(subCategory);
    const spent = getSubCategorySpentInMonth(mainCategory, subCategory, monthKey);
    const label = sub === '[Bez podkategorii]' ? mainCategory : `${mainCategory} · ${sub}`;
    return buildBudgetStatusRecord({
        scope: 'sub',
        key: makeSubBudgetKey(mainCategory, subCategory),
        label,
        category: mainCategory,
        subCategory: sub,
        limit,
        spent
    });
}

function getAllCategoryBudgetStatuses(monthKey) {
    const statuses = [];
    Object.keys(appState.categoryBudgets || {}).forEach((category) => {
        const status = getCategoryBudgetStatus(category, monthKey);
        if (status) statuses.push(status);
    });
    Object.keys(appState.subCategoryBudgets || {}).forEach((rawKey) => {
        const { mainCategory, subCategory } = parseSubCategoryBudgetKey(rawKey);
        const status = getSubCategoryBudgetStatus(mainCategory, subCategory, monthKey);
        if (status) statuses.push(status);
    });
    return statuses.sort((a, b) => {
        const rank = { over: 0, warn: 1, ok: 2 };
        const ra = rank[a.state] ?? 3;
        const rb = rank[b.state] ?? 3;
        if (ra !== rb) return ra - rb;
        return b.pct - a.pct;
    });
}

function hasConfiguredCategoryBudgets() {
    const main = Object.values(appState.categoryBudgets || {}).some((v) => Number(v) > 0);
    const sub = Object.values(appState.subCategoryBudgets || {}).some((v) => Number(v) > 0);
    return main || sub;
}

function transactionMatchesBudgetScope(tx, scope, mainCategory, subCategory = null) {
    if (!isCategoryBudgetExpense(tx) || tx.mainCategory !== mainCategory) return false;
    if (scope === 'main') return true;
    return normalizeSubCategoryForBudget(tx.subCategory) === normalizeSubCategoryForBudget(subCategory);
}

function projectBudgetSpentAfterTx(txData, previousTx, monthKey, scope, subCategory = null) {
    const spentFn = scope === 'sub'
        ? () => getSubCategorySpentInMonth(txData.mainCategory, subCategory, monthKey)
        : () => getCategorySpentInMonth(txData.mainCategory, monthKey);
    let spent = spentFn();
    if (
        previousTx
        && isCategoryBudgetExpense(previousTx)
        && transactionMatchesBudgetScope(previousTx, scope, txData.mainCategory, subCategory)
        && getTransactionBudgetMonthKey(previousTx) === monthKey
    ) {
        spent -= Number(previousTx.amount) || 0;
    }
    if (
        isCategoryBudgetExpense(txData)
        && transactionMatchesBudgetScope(txData, scope, txData.mainCategory, subCategory)
        && getTransactionBudgetMonthKey(txData) === monthKey
    ) {
        spent += Number(txData.amount) || 0;
    }
    return Math.max(0, spent);
}

function assessSingleBudgetImpact(txData, previousTx, scope, subCategory, limit, label) {
    if (!limit) return null;
    const monthKey = getTransactionBudgetMonthKey(txData) || getCurrentMonthKey();
    const spentBefore = projectBudgetSpentAfterTx({ ...txData, amount: 0 }, previousTx, monthKey, scope, subCategory);
    const spentAfter = projectBudgetSpentAfterTx(txData, previousTx, monthKey, scope, subCategory);
    const stateBefore = getCategoryBudgetState(spentBefore, limit);
    const stateAfter = getCategoryBudgetState(spentAfter, limit);
    return {
        scope,
        label,
        category: txData.mainCategory,
        subCategory,
        limit,
        spentBefore,
        spentAfter,
        stateBefore,
        stateAfter,
        pctAfter: Math.round((spentAfter / limit) * 100),
        monthKey
    };
}

function assessTransactionBudgetImpact(txData, previousTx = null) {
    if (!txData || txData.type !== 'expense') return [];
    const impacts = [];
    const mainLimit = getCategoryBudgetLimit(txData.mainCategory);
    const mainImpact = assessSingleBudgetImpact(
        txData,
        previousTx,
        'main',
        null,
        mainLimit,
        txData.mainCategory
    );
    if (mainImpact) impacts.push(mainImpact);

    const subLimit = getSubCategoryBudgetLimit(txData.mainCategory, txData.subCategory);
    if (subLimit) {
        const sub = normalizeSubCategoryForBudget(txData.subCategory);
        const subLabel = sub === '[Bez podkategorii]' ? txData.mainCategory : `${txData.mainCategory} · ${sub}`;
        const subImpact = assessSingleBudgetImpact(
            txData,
            previousTx,
            'sub',
            txData.subCategory,
            subLimit,
            subLabel
        );
        if (subImpact) impacts.push(subImpact);
    }
    return impacts;
}

function getCategoryBudgetMonthTransactions(mainCategory, monthKey) {
    const start = `${monthKey}-01`;
    const [year, month] = monthKey.split('-').map(Number);
    const end = localIsoDate(new Date(year, month, 0));
    return getBudgetTransactions()
        .filter((t) => isCategoryBudgetExpense(t) && t.mainCategory === mainCategory && t.date >= start && t.date <= end)
        .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

function getSubCategoryBudgetMonthTransactions(mainCategory, subCategory, monthKey) {
    const sub = normalizeSubCategoryForBudget(subCategory);
    const start = `${monthKey}-01`;
    const [year, month] = monthKey.split('-').map(Number);
    const end = localIsoDate(new Date(year, month, 0));
    return getBudgetTransactions()
        .filter((t) => {
            if (!isCategoryBudgetExpense(t) || t.mainCategory !== mainCategory) return false;
            if (t.date < start || t.date > end) return false;
            return normalizeSubCategoryForBudget(t.subCategory) === sub;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

function getBudgetMonthTransactions(status, monthKey) {
    if (!status) return [];
    if (status.scope === 'sub') {
        return getSubCategoryBudgetMonthTransactions(status.category, status.subCategory, monthKey);
    }
    return getCategoryBudgetMonthTransactions(status.category, monthKey);
}

function getTopCategoryBudgetStatus(entry, monthKey = getCurrentMonthKey()) {
    if (!entry) return null;
    if (entry.subCategory) {
        return getSubCategoryBudgetStatus(entry.mainCategory, entry.subCategory, monthKey);
    }
    return getCategoryBudgetStatus(entry.mainCategory, monthKey);
}

function renderInlineBudgetBar(status) {
    if (!status) return '';
    const pct = Math.min(status.pct, 100);
    const fillClass = status.state === 'over'
        ? 'budget-bar-fill--over'
        : (status.state === 'warn' ? 'budget-bar-fill--warn' : '');
    return `<div class="reports-top-budget">
        <div class="budget-row-meta reports-top-budget-meta">
            <span>Limit ${formatPlnAmount(status.spent)} / ${formatPlnAmount(status.limit)}</span>
            <span>${status.pct}%</span>
        </div>
        <div class="progress-bar-bg budget-bar reports-top-budget-bar">
            <div class="progress-bar-fill budget-bar-fill ${fillClass}" style="width:${pct}%"></div>
        </div>
    </div>`;
}

function isBudgetConfirmOnOverEnabled() {
    return appState.reportPrefs?.budgetConfirmOnOver !== false;
}

let reportsBudgetExpandedCategory = null;
let reportsBudgetOverviewShowAll = false;

function bindReportsBudgetList(container) {
    if (!container || container.dataset.budgetBound === '1' || typeof container.addEventListener !== 'function') return;
    container.dataset.budgetBound = '1';
    container.addEventListener('click', handleReportsBudgetCategoryClick);
}

function handleReportsBudgetCategoryClick(event) {
    const row = event.target.closest('[data-budget-key]');
    if (!row) return;
    const key = decodeURIComponent(row.dataset.budgetKey || '');
    reportsBudgetExpandedCategory = reportsBudgetExpandedCategory === key ? null : key;
    refreshVisibleReportsBudgetLists();
}

function refreshVisibleReportsBudgetLists() {
    const monthKey = getCurrentMonthKey();
    const statuses = getAllCategoryBudgetStatuses(monthKey);
    if (reportsBudgetExpandedCategory && !statuses.some((s) => s.key === reportsBudgetExpandedCategory)) {
        reportsBudgetExpandedCategory = null;
    }
    const overviewCard = document.getElementById('reports-budget-overview-card');
    if (overviewCard && !overviewCard.classList.contains('hidden')) {
        renderReportsBudgetOverview();
    }
}

function toggleReportsBudgetOverviewShowAll() {
    reportsBudgetOverviewShowAll = !reportsBudgetOverviewShowAll;
    renderReportsBudgetOverview();
}

function expandReportsBudgetFromNotification(payload = {}) {
    if (payload.budgetKey) {
        reportsBudgetExpandedCategory = payload.budgetKey;
    } else if (payload.subCategory) {
        reportsBudgetExpandedCategory = makeSubBudgetKey(payload.category, payload.subCategory);
    } else if (payload.category) {
        reportsBudgetExpandedCategory = makeMainBudgetKey(payload.category);
    }
    refreshVisibleReportsBudgetLists();
}

function renderBudgetStatusBody(status) {
    const pct = Math.min(status.pct, 100);
    const fillClass = status.state === 'over'
        ? 'budget-bar-fill--over'
        : (status.state === 'warn' ? 'budget-bar-fill--warn' : '');
    const overMsg = status.state === 'over'
        ? `<p class="budget-over-msg">+${formatPlnAmount(Math.max(0, status.spent - status.limit))} ponad limit</p>`
        : '';
    const iconSub = status.scope === 'sub' ? status.subCategory : null;
    const icon = renderCategoryIcon(status.category, 'list', iconSub === '[Bez podkategorii]' ? null : iconSub, 'expense');
    return `<div class="budget-row-head">
            ${icon}
            <span class="budget-cat-name">${escapeHtml(status.label)}</span>
            <span class="budget-row-amount">${formatPlnAmount(status.spent)} <span class="budget-row-limit">/ ${formatPlnAmount(status.limit)}</span></span>
        </div>
        <div class="budget-row-meta">
            <span>${status.pct}%</span>
            <span>${status.remaining >= 0 ? `zostało ${formatPlnAmount(status.remaining)}` : `przekroczenie ${formatPlnAmount(Math.abs(status.remaining))}`}</span>
        </div>
        <div class="progress-bar-bg budget-bar"><div class="progress-bar-fill budget-bar-fill ${fillClass}" style="width:${pct}%"></div></div>
        ${overMsg}`;
}

function renderBudgetStatusRow(status, { compact = false } = {}) {
    if (!status) return '';
    const rowClass = status.state === 'over' ? 'budget-row budget-row--over' : 'budget-row';
    return `<div class="${rowClass}${compact ? ' budget-row--compact' : ''}">
        ${renderBudgetStatusBody(status)}
    </div>`;
}

function renderBudgetStatusGroup(status, { compact = false, monthKey, expanded = false } = {}) {
    if (!status) return '';
    const rowClass = status.state === 'over' ? 'budget-row budget-row--over' : 'budget-row';
    const txs = expanded ? getBudgetMonthTransactions(status, monthKey) : [];
    const txListHtml = expanded && typeof renderReportsTxListHtml === 'function'
        ? `<div class="reports-top-tx-list">${renderReportsTxListHtml(txs)}</div>`
        : '';
    return `<div class="budget-status-group reports-top-group${expanded ? ' reports-top-group--open' : ''}${status.state === 'over' ? ' budget-status-group--over' : ''}">
        <button type="button" class="${rowClass} budget-row--clickable${compact ? ' budget-row--compact' : ''}" data-budget-key="${encodeURIComponent(status.key)}">
            ${renderBudgetStatusBody(status)}
            <span class="reports-top-chevron budget-row-chevron" aria-hidden="true">${expanded ? '▾' : '›'}</span>
        </button>
        ${txListHtml}
    </div>`;
}

function renderBudgetStatusListHtml(statuses, {
    limit = null,
    compact = false,
    emptyHint = '',
    expandable = false,
    monthKey = null,
    expandedCategory = null
} = {}) {
    if (!statuses.length) {
        return emptyHint
            ? `<div class="empty-state budget-empty-state"><p>${emptyHint}</p></div>`
            : '';
    }
    const visible = limit ? statuses.slice(0, limit) : statuses;
    const rows = visible
        .map((s) => (
            expandable && monthKey
                ? renderBudgetStatusGroup(s, {
                    compact,
                    monthKey,
                    expanded: expandedCategory === s.key
                })
                : renderBudgetStatusRow(s, { compact })
        ))
        .join('');
    return `<div class="budget-status-list">${rows}</div>`;
}

function buildBudgetSummaryLine(statuses) {
    const over = statuses.filter((s) => s.state === 'over').length;
    const warn = statuses.filter((s) => s.state === 'warn').length;
    if (!statuses.length) return '';
    const parts = [];
    if (over) parts.push(`${over} przekroczon${over === 1 ? 'a' : 'e'}`);
    if (warn) parts.push(`${warn} blisko limitu`);
    if (!parts.length) parts.push('wszystko w limicie');
    return `Budżet: ${parts.join(' · ')}`;
}

function updateReportsBudgetOverviewVisibility(ctx) {
    const card = document.getElementById('reports-budget-overview-card');
    if (!card) return;
    const show = ctx?.mode !== 'compare'
        && typeof isReportsCurrentMonthPeriod === 'function'
        && isReportsCurrentMonthPeriod(ctx)
        && hasConfiguredCategoryBudgets();
    card.classList.toggle('hidden', !show);
    if (show) renderReportsBudgetOverview(ctx);
}

function renderReportsBudgetOverview() {
    const root = document.getElementById('reports-budget-overview-list');
    const card = document.getElementById('reports-budget-overview-card');
    if (!root) return;
    bindReportsBudgetList(card || root);
    const monthKey = getCurrentMonthKey();
    const statuses = getAllCategoryBudgetStatuses(monthKey);
    const summaryEl = document.getElementById('reports-budget-overview-summary');
    if (summaryEl) summaryEl.textContent = buildBudgetSummaryLine(statuses);
    const showAll = reportsBudgetOverviewShowAll;
    const limit = showAll ? null : 8;
    root.innerHTML = renderBudgetStatusListHtml(statuses, {
        limit,
        emptyHint: 'Brak ustawionych limitów — dodaj je w Ustawieniach.',
        expandable: true,
        monthKey,
        expandedCategory: reportsBudgetExpandedCategory
    });
    const toggleEl = document.getElementById('reports-budget-overview-toggle');
    if (toggleEl) {
        const hidden = statuses.length <= 8;
        toggleEl.classList.toggle('hidden', hidden);
        toggleEl.textContent = showAll ? 'Zwiń listę' : `Pokaż wszystkie (${statuses.length})`;
    }
}

function updateTransactionBudgetPreview() {
    const el = document.getElementById('tx-budget-preview');
    if (!el) return;

    if (formState.currentType !== 'expense' || !formState.selectedMainCategory) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }

    const amount = typeof parsePlnInput === 'function'
        ? parsePlnInput(document.getElementById('tx-amount')?.value)
        : parseFloat(document.getElementById('tx-amount')?.value) || 0;
    const date = document.getElementById('tx-date')?.value || localIsoDate(new Date());
    const monthKey = getTransactionBudgetMonthKey({ date });
    const previousTx = editingTxIndex !== null ? appState.transactions[editingTxIndex] : null;
    const txDraft = {
        type: 'expense',
        mainCategory: formState.selectedMainCategory,
        subCategory: formState.selectedSubCategory,
        amount: Number.isFinite(amount) ? amount : 0,
        date
    };

    const blocks = [];
    const mainLimit = getCategoryBudgetLimit(formState.selectedMainCategory);
    if (mainLimit) {
        const spentAfter = projectBudgetSpentAfterTx(txDraft, previousTx, monthKey, 'main');
        blocks.push(buildBudgetStatusRecord({
            scope: 'main',
            key: makeMainBudgetKey(formState.selectedMainCategory),
            label: formState.selectedMainCategory,
            category: formState.selectedMainCategory,
            limit: mainLimit,
            spent: spentAfter
        }));
    }
    const subLimit = getSubCategoryBudgetLimit(formState.selectedMainCategory, formState.selectedSubCategory);
    if (subLimit && formState.selectedSubCategory) {
        const sub = normalizeSubCategoryForBudget(formState.selectedSubCategory);
        const spentAfter = projectBudgetSpentAfterTx(txDraft, previousTx, monthKey, 'sub', formState.selectedSubCategory);
        blocks.push(buildBudgetStatusRecord({
            scope: 'sub',
            key: makeSubBudgetKey(formState.selectedMainCategory, formState.selectedSubCategory),
            label: sub === '[Bez podkategorii]' ? formState.selectedMainCategory : `${formState.selectedMainCategory} · ${sub}`,
            category: formState.selectedMainCategory,
            subCategory: sub,
            limit: subLimit,
            spent: spentAfter
        }));
    }

    if (!blocks.length) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }

    const plannedHint = typeof isPlannedTransaction === 'function' && isPlannedTransaction(txDraft)
        ? '<p class="reports-hint tx-budget-preview-hint">Zaplanowany wydatek — limit liczony w miesiącu z daty transakcji.</p>'
        : '';
    const paidWithCard = document.getElementById('tx-credit-card')?.checked;
    const cardHint = paidWithCard
        ? '<p class="reports-hint tx-budget-preview-hint">Zakup kartą też wlicza się do limitu.</p>'
        : '';
    const label = amount > 0 ? 'Po zapisie' : 'Teraz';
    el.classList.remove('hidden');
    el.innerHTML = `<p class="tx-budget-preview-label">Limity — ${formatTxMonthLabel(monthKey)}</p>
        ${blocks.map((status) => renderBudgetStatusRow(status, { compact: true })).join('')}
        ${amount > 0 ? `<p class="reports-hint tx-budget-preview-hint">${label}</p>` : ''}${plannedHint}${cardHint}`;
}

function formatTxMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;
    const label = new Date(year, month - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function confirmTransactionBudgetIfNeeded(txData, previousTx) {
    const impacts = assessTransactionBudgetImpact(txData, previousTx);
    if (!impacts.length) return true;

    for (const impact of impacts) {
        if (impact.stateAfter === 'warn' && impact.stateBefore === 'ok' && typeof showAppToast === 'function') {
            showAppToast(`Zbliżasz się do limitu „${impact.label}” (${impact.pctAfter}%)`, 'info');
        }
    }

    const crossing = impacts.find((impact) => impact.stateAfter === 'over' && impact.stateBefore !== 'over');
    if (!crossing) return true;
    if (!isBudgetConfirmOnOverEnabled()) return true;

    return confirm(
        `Limit „${crossing.label}”: ${formatPlnAmount(crossing.spentAfter)} z ${formatPlnAmount(crossing.limit)} (${crossing.pctAfter}%). Zapisać mimo to?`
    );
}

function renderBudgetEditorUsagePreview(mainCategory, subCategory = null) {
    const monthKey = getCurrentMonthKey();
    const spent = subCategory
        ? getSubCategorySpentInMonth(mainCategory, subCategory, monthKey)
        : getCategorySpentInMonth(mainCategory, monthKey);
    const status = subCategory
        ? getSubCategoryBudgetStatus(mainCategory, subCategory, monthKey)
        : getCategoryBudgetStatus(mainCategory, monthKey);
    if (status) {
        return `<p class="budget-editor-usage-hint">Ten miesiąc: ${formatPlnAmount(status.spent)} / ${formatPlnAmount(status.limit)} (${status.pct}%)</p>`;
    }
    return `<p class="budget-editor-usage-hint">Ten miesiąc — wydano: ${formatPlnAmount(spent)}</p>`;
}
