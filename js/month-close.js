const MONTH_CLOSE_STATE_KEY = 'finanse_month_close_state';
const MONTH_CLOSE_BANNER_LIMIT = 3;

let monthCloseWizardMonthKey = null;
let monthCloseWizardStep = 0;
let monthClosePendingRecurring = [];

function readMonthCloseState() {
    try {
        const raw = JSON.parse(localStorage.getItem(MONTH_CLOSE_STATE_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

function writeMonthCloseState(state) {
    localStorage.setItem(MONTH_CLOSE_STATE_KEY, JSON.stringify(state));
}

function isMonthClosed(monthKey) {
    return !!readMonthCloseState()[monthKey]?.closedAt;
}

function markMonthClosed(monthKey) {
    const state = readMonthCloseState();
    state[monthKey] = { closedAt: new Date().toISOString() };
    writeMonthCloseState(state);
    if (typeof captureAssetSnapshot === 'function') captureAssetSnapshot(monthKey, 'month-close');
    saveState();
}

function reopenMonthClose(monthKey) {
    const state = readMonthCloseState();
    delete state[monthKey];
    writeMonthCloseState(state);
}

function getMonthsWithTransactions() {
    const keys = new Set();
    (appState.transactions || []).forEach((t) => {
        if (t.date) keys.add(t.date.slice(0, 7));
    });
    return [...keys].sort();
}

function getUnclosedMonthsWithData() {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return getMonthsWithTransactions().filter((mk) => !isMonthClosed(mk) && mk <= currentKey);
}

function formatMonthKeyLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function getMonthBoundsFromKey(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    const start = localIsoDate(new Date(y, m - 1, 1));
    const end = localIsoDate(new Date(y, m, 0));
    return { start, end };
}

function collectMissingRecurringForMonth(monthKey) {
    const items = [];
    const seen = new Set();
    const recurringTxs = (appState.transactions || []).filter((t) => t.recurringId && t.type === 'expense');

    [...new Set(recurringTxs.map((t) => t.recurringId))].forEach((recId) => {
        const history = recurringTxs.filter((t) => t.recurringId === recId);
        if (history.some((t) => t.date.startsWith(monthKey))) return;
        const latest = history.reduce((best, t) => (t.date > best.date ? t : best), history[0]);
        const label = latest.subCategory && latest.subCategory !== '[Bez podkategorii]'
            ? `${latest.mainCategory} › ${latest.subCategory}`
            : latest.mainCategory;
        const id = `rec:${recId}`;
        if (seen.has(id)) return;
        seen.add(id);
        items.push({
            id,
            label,
            amount: latest.amount,
            mainCategory: latest.mainCategory,
            subCategory: latest.subCategory,
            recurringId: recId,
            lastDate: latest.date
        });
    });

    if (typeof getAllRecurringEntries === 'function') {
        getAllRecurringEntries('sub')
            .filter((entry) => entry.source === 'detected')
            .forEach((entry) => {
                const has = (appState.transactions || []).some((t) => {
                    if (t.type !== 'expense' || !t.date.startsWith(monthKey)) return false;
                    if (typeof getExpenseGroupKey === 'function') {
                        return getExpenseGroupKey(t, 'sub') === entry.key;
                    }
                    const sub = entry.subCategory === '[Bez podkategorii]' ? '' : entry.subCategory;
                    return `${t.mainCategory}|${sub}` === entry.key;
                });
                if (has) return;
                const id = `det:${entry.key}`;
                if (seen.has(id)) return;
                seen.add(id);
                const label = entry.subCategory && entry.subCategory !== '[Bez podkategorii]'
                    ? `${entry.mainCategory} › ${entry.subCategory}`
                    : entry.mainCategory;
                items.push({
                    id,
                    label,
                    amount: entry.amount,
                    mainCategory: entry.mainCategory,
                    subCategory: entry.subCategory,
                    lastDate: entry.lastDate
                });
            });
    }
    return items;
}

function collectMonthCloseBudgetIssues(monthKey) {
    if (typeof getAllCategoryBudgetStatuses !== 'function') return [];
    return getAllCategoryBudgetStatuses(monthKey).filter((s) => s.pct >= 100);
}

function collectUncategorizedMonthTx(monthKey) {
    return (appState.transactions || []).filter((t) => {
        if (!t.date.startsWith(monthKey)) return false;
        if (t.subCategory === '[Bez podkategorii]') return true;
        if (t.mainCategory === 'Różne') return true;
        return false;
    });
}

function buildMonthCloseSteps(monthKey) {
    const { start, end } = getMonthBoundsFromKey(monthKey);
    const monthTx = (appState.transactions || []).filter((t) => t.date >= start && t.date <= end);
    const summary = typeof summarizePeriod === 'function' ? summarizePeriod(monthTx) : { income: 0, expense: 0, balance: 0, savings: 0 };
    const duplicates = typeof findDuplicatePairsInRange === 'function'
        ? findDuplicatePairsInRange(start, end)
        : [];
    const missingRecurring = collectMissingRecurringForMonth(monthKey);
    monthClosePendingRecurring = missingRecurring;
    const budgetIssues = collectMonthCloseBudgetIssues(monthKey);
    const uncategorized = collectUncategorizedMonthTx(monthKey);

    return [
        {
            id: 'recurring',
            title: 'Brakujące cykliczne',
            empty: !missingRecurring.length,
            html: missingRecurring.length
                ? `<ul class="month-close-list">${missingRecurring.map((item, i) => `
                    <li class="month-close-item">
                        <span>${escapeHtml(item.label)} — ~${formatPlnAmount(item.amount)}</span>
                        <button type="button" class="btn-outline btn-sm" onclick="monthCloseAddRecurringByIndex(${i})">Dodaj</button>
                    </li>`).join('')}</ul>`
                : '<p class="reports-hint">Wszystkie znane cykliczne opłaty są w tym miesiącu.</p>'
        },
        {
            id: 'duplicates',
            title: 'Możliwe duplikaty',
            empty: !duplicates.length,
            html: duplicates.length
                ? `<ul class="month-close-list">${duplicates.slice(0, 8).map((pair, i) => `
                    <li class="month-close-item month-close-item--stack">
                        <div>${escapeHtml(formatDuplicateTransactionLine(pair.a.tx))}</div>
                        <div>${escapeHtml(formatDuplicateTransactionLine(pair.b.tx))}</div>
                        <button type="button" class="btn-outline btn-sm" onclick="monthCloseDeleteDuplicate(${pair.b.index})">Usuń drugi</button>
                    </li>`).join('')}</ul>`
                : '<p class="reports-hint">Nie znaleziono podejrzanych duplikatów.</p>'
        },
        {
            id: 'budget',
            title: 'Przekroczone budżety',
            empty: !budgetIssues.length,
            html: budgetIssues.length
                ? `<ul class="month-close-list">${budgetIssues.map((s) => `
                    <li class="month-close-item">
                        <span>${escapeHtml(s.label)} — ${s.pct}% (${formatPlnAmount(s.spent)} / ${formatPlnAmount(s.limit)})</span>
                    </li>`).join('')}</ul>`
                : '<p class="reports-hint">Żaden limit budżetu nie został przekroczony.</p>'
        },
        {
            id: 'uncategorized',
            title: 'Słaba kategoryzacja',
            empty: !uncategorized.length,
            html: uncategorized.length
                ? `<p class="reports-hint">${uncategorized.length} transakcji bez podkategorii lub w „Różne”.</p>
                   <button type="button" class="btn-outline" onclick="monthCloseOpenTransactions('${escapeHtml(monthKey)}')">Pokaż na pulpicie</button>`
                : '<p class="reports-hint">Kategoryzacja wygląda w porządku.</p>'
        },
        {
            id: 'summary',
            title: 'Podsumowanie',
            empty: false,
            html: `<div class="month-close-summary-grid">
                <div><span>Wpływy</span><strong class="income">${formatPlnAmount(summary.income)}</strong></div>
                <div><span>Wydatki</span><strong class="expense">${formatPlnAmount(summary.expense)}</strong></div>
                <div><span>Bilans</span><strong>${formatPlnAmount(summary.balance)}</strong></div>
                <div><span>Oszczędności</span><strong>${summary.savings}%</strong></div>
            </div>
            <p class="reports-hint">Po zamknięciu miesiąca zapisze się snapshot majątku. Rozliczenie możesz ponowić — „Otwórz ponownie” w ustawieniach miesiąca.</p>`
        }
    ];
}

function monthCloseAddRecurringByIndex(index) {
    const item = monthClosePendingRecurring[index];
    if (!item || !monthCloseWizardMonthKey) return;
    const day = `${monthCloseWizardMonthKey}-15`;
    const txData = {
        amount: item.amount,
        type: 'expense',
        mainCategory: item.mainCategory,
        subCategory: item.subCategory || '[Bez podkategorii]',
        date: day,
        note: 'Dodane przy rozliczeniu miesiąca'
    };
    if (item.recurringId) txData.recurringId = item.recurringId;
    if (typeof commitTransactionData === 'function') {
        const result = commitTransactionData(txData, { skipBudgetConfirm: true });
        if (result.ok) {
            showAppToast('Dodano transakcję', 'success');
            renderMonthCloseWizard();
        }
    }
}

function monthCloseDeleteDuplicate(index) {
    if (typeof deleteTransactionAtIndex === 'function' && deleteTransactionAtIndex(index)) {
        renderMonthCloseWizard();
    }
}

function monthCloseOpenTransactions(monthKey) {
    closeMonthCloseWizard();
    const { start, end } = getMonthBoundsFromKey(monthKey);
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
    const periodSelect = document.getElementById('dashboard-period-select');
    if (periodSelect) {
        periodSelect.value = 'custom';
        document.getElementById('dashboard-custom-dates').style.display = 'flex';
        document.getElementById('db-start-date').value = start;
        document.getElementById('db-end-date').value = end;
        renderDashboard();
    }
}

function openMonthCloseWizard(monthKey = null) {
    const target = monthKey || getActiveMonthCloseKey();
    if (!target) return;
    monthCloseWizardMonthKey = target;
    monthCloseWizardStep = 0;
    const overlay = document.getElementById('month-close-overlay');
    if (overlay) overlay.classList.remove('hidden');
    renderMonthCloseWizard();
}

function closeMonthCloseWizard() {
    const overlay = document.getElementById('month-close-overlay');
    if (overlay) overlay.classList.add('hidden');
    monthCloseWizardMonthKey = null;
    renderMonthCloseBanners();
}

function getActiveMonthCloseKey() {
    if (typeof getReportsMonthValue === 'function' && typeof reportsPeriodMode !== 'undefined' && reportsPeriodMode === 'month') {
        const mk = getReportsMonthValue();
        if (mk && !isMonthClosed(mk)) return mk;
    }
    const unclosed = getUnclosedMonthsWithData();
    return unclosed[unclosed.length - 1] || null;
}

function getMonthCloseBannerMonths() {
    return getUnclosedMonthsWithData().slice(-MONTH_CLOSE_BANNER_LIMIT);
}

function renderMonthCloseWizard() {
    const titleEl = document.getElementById('month-close-title');
    const bodyEl = document.getElementById('month-close-body');
    const stepsEl = document.getElementById('month-close-steps');
    const prevBtn = document.getElementById('month-close-prev');
    const nextBtn = document.getElementById('month-close-next');
    const finishBtn = document.getElementById('month-close-finish');
    if (!monthCloseWizardMonthKey || !bodyEl) return;

    const steps = buildMonthCloseSteps(monthCloseWizardMonthKey);
    const step = steps[monthCloseWizardStep] || steps[0];
    if (titleEl) titleEl.textContent = `Rozliczenie — ${formatMonthKeyLabel(monthCloseWizardMonthKey)}`;
    if (stepsEl) {
        stepsEl.innerHTML = steps.map((s, i) => `
            <span class="month-close-step-dot${i === monthCloseWizardStep ? ' active' : ''}${s.empty && i < steps.length - 1 ? ' done' : ''}"></span>`).join('');
    }
    bodyEl.innerHTML = `<h3 class="month-close-step-title">${escapeHtml(step.title)}</h3>${step.html}`;

    if (prevBtn) prevBtn.classList.toggle('hidden', monthCloseWizardStep <= 0);
    if (nextBtn) nextBtn.classList.toggle('hidden', monthCloseWizardStep >= steps.length - 1);
    if (finishBtn) finishBtn.classList.toggle('hidden', monthCloseWizardStep < steps.length - 1);
}

function monthCloseWizardPrev() {
    if (monthCloseWizardStep > 0) {
        monthCloseWizardStep -= 1;
        renderMonthCloseWizard();
    }
}

function monthCloseWizardNext() {
    const steps = buildMonthCloseSteps(monthCloseWizardMonthKey);
    if (monthCloseWizardStep < steps.length - 1) {
        monthCloseWizardStep += 1;
        renderMonthCloseWizard();
    }
}

function finishMonthCloseWizard() {
    if (!monthCloseWizardMonthKey) return;
    markMonthClosed(monthCloseWizardMonthKey);
    showAppToast(`Zamknięto ${formatMonthKeyLabel(monthCloseWizardMonthKey)}`, 'success');
    closeMonthCloseWizard();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof renderReports === 'function') renderReports();
}

function renderMonthCloseBannerHtml(monthKey) {
    const closed = isMonthClosed(monthKey);
    if (closed) return '';
    return `<div class="month-close-banner card dashboard-panel" data-month-key="${escapeHtml(monthKey)}">
        <div class="month-close-banner-text">
            <strong>Rozlicz ${escapeHtml(formatMonthKeyLabel(monthKey))}</strong>
            <span class="reports-hint">Sprawdź cykliczne, duplikaty i budżet przed zamknięciem miesiąca.</span>
        </div>
        <button type="button" class="btn-primary btn-sm" onclick="openMonthCloseWizard('${escapeHtml(monthKey)}')">Rozlicz</button>
    </div>`;
}

function renderMonthCloseBanners() {
    const dashboardHost = document.getElementById('dashboard-month-close-banner');
    const reportsHost = document.getElementById('reports-month-close-banner');
    const unclosed = getMonthCloseBannerMonths();

    if (dashboardHost) {
        const unclosed = getMonthCloseBannerMonths();
        dashboardHost.innerHTML = unclosed.map((mk) => renderMonthCloseBannerHtml(mk)).join('');
        dashboardHost.classList.toggle('hidden', !unclosed.length);
    }

    if (reportsHost) {
        let monthKey = null;
        if (typeof getReportsMonthValue === 'function' && typeof reportsPeriodMode !== 'undefined' && reportsPeriodMode === 'month') {
            monthKey = getReportsMonthValue();
        }
        if (monthKey && !isMonthClosed(monthKey)) {
            reportsHost.innerHTML = renderMonthCloseBannerHtml(monthKey);
            reportsHost.classList.remove('hidden');
        } else {
            reportsHost.innerHTML = '';
            reportsHost.classList.add('hidden');
        }
    }
}

function initMonthClose() {
    renderMonthCloseBanners();
}
