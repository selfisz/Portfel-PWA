let dashboardTxVisibleCount = LIST_PAGE_SIZE;
let dashboardTxListSignature = '';

function resetDashboardTxListPagination() {
    dashboardTxVisibleCount = LIST_PAGE_SIZE;
    dashboardTxListSignature = '';
}

function showMoreDashboardTransactions() {
    dashboardTxVisibleCount += LIST_PAGE_SIZE;
    renderDashboard();
}

function getDashboardTxListSignature(listTx, searchQuery) {
    const period = document.getElementById('dashboard-period-select')?.value || '';
    const { startDate, endDate } = getDashboardDates();
    return [
        period,
        startDate,
        endDate,
        searchQuery,
        activeChartCategory || '',
        activeChartSubCategory || '',
        chartViewType,
        listTx.length,
        listTx[0]?.date ?? '',
        listTx[listTx.length - 1]?.date ?? ''
    ].join('|');
}

function handleDashboardPeriodChange() {
    const period = document.getElementById('dashboard-period-select').value;
    document.getElementById('dashboard-custom-dates').style.display = period === 'custom' ? 'flex' : 'none';
    updateDashboardPeriodResetVisibility();
    renderDashboard();
}

function resetDashboardPeriod() {
    document.getElementById('dashboard-period-select').value = 'current-month';
    document.getElementById('dashboard-custom-dates').style.display = 'none';
    updateDashboardPeriodResetVisibility();
    renderDashboard();
}

function updateDashboardPeriodResetVisibility() {
    const period = document.getElementById('dashboard-period-select').value;
    const btn = document.getElementById('dashboard-period-reset');
    if (btn) btn.classList.toggle('hidden', period === 'current-month');
}

function getTransactionDateBounds() {
    if (!appState.transactions.length) {
        const today = localIsoDate(new Date());
        return { startDate: today, endDate: today };
    }
    let min = appState.transactions[0].date;
    let max = appState.transactions[0].date;
    appState.transactions.forEach((t) => {
        if (t.date < min) min = t.date;
        if (t.date > max) max = t.date;
    });
    return { startDate: min, endDate: max };
}

function isDashboardForecastPeriod() {
    return document.getElementById('dashboard-period-select')?.value === 'next-month';
}

function getMonthTransactionTotal(year, monthIndex, type) {
    const startDate = localIsoDate(new Date(year, monthIndex, 1));
    const endDate = localIsoDate(new Date(year, monthIndex + 1, 0));
    return appState.transactions
        .filter((t) => t.type === type && t.date >= startDate && t.date <= endDate)
        .reduce((sum, t) => sum + t.amount, 0);
}

function getDashboardForecastTotals(referenceDate = new Date()) {
    const monthlyIncome = [];
    const monthlyExpense = [];
    for (let i = 1; i <= 3; i += 1) {
        const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
        monthlyIncome.push(getMonthTransactionTotal(monthDate.getFullYear(), monthDate.getMonth(), 'income'));
        monthlyExpense.push(getMonthTransactionTotal(monthDate.getFullYear(), monthDate.getMonth(), 'expense'));
    }
    const average = (values) => (values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0);
    return {
        income: average(monthlyIncome),
        expense: average(monthlyExpense)
    };
}

function getCategorySumsInRange(startDate, endDate, txType, mainCategoryFilter = null) {
    const catSums = {};
    appState.transactions
        .filter((t) => t.type === txType && t.date >= startDate && t.date <= endDate)
        .filter((t) => !mainCategoryFilter || t.mainCategory === mainCategoryFilter)
        .forEach((t) => {
            const label = mainCategoryFilter
                ? (t.subCategory === '[Bez podkategorii]' ? 'Ogólne' : t.subCategory)
                : t.mainCategory;
            catSums[label] = (catSums[label] || 0) + t.amount;
        });
    return catSums;
}

function getDashboardForecastCategorySums(txType, mainCategoryFilter = null, referenceDate = new Date()) {
    const monthSums = [];
    for (let i = 1; i <= 3; i += 1) {
        const monthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
        const startDate = localIsoDate(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1));
        const endDate = localIsoDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0));
        monthSums.push(getCategorySumsInRange(startDate, endDate, txType, mainCategoryFilter));
    }
    const keys = new Set(monthSums.flatMap((sums) => Object.keys(sums)));
    const averaged = {};
    keys.forEach((key) => {
        averaged[key] = monthSums.reduce((sum, sums) => sum + (sums[key] || 0), 0) / monthSums.length;
    });
    return averaged;
}

function projectForecastDateIntoRange(sourceDate, rangeStart) {
    const [year, month] = rangeStart.split('-').map(Number);
    const day = parseInt(String(sourceDate || '').split('-')[2], 10);
    if (Number.isNaN(day)) return rangeStart;
    const monthIndex = month - 1;
    const effectiveDay = typeof getEffectiveDueDay === 'function'
        ? getEffectiveDueDay(day, year, monthIndex)
        : Math.min(day, new Date(year, month, 0).getDate());
    return `${year}-${String(month).padStart(2, '0')}-${String(effectiveDay).padStart(2, '0')}`;
}

function getLatestRecurringTransactions(type) {
    const byId = {};
    appState.transactions.forEach((t) => {
        if (!t.recurringId || t.type !== type) return;
        const prev = byId[t.recurringId];
        if (!prev || t.date >= prev.date) byId[t.recurringId] = t;
    });
    return Object.values(byId);
}

function transactionToForecastPlanItem(t, rangeStart) {
    const title = t.subCategory && t.subCategory !== '[Bez podkategorii]' ? t.subCategory : t.mainCategory;
    return {
        date: projectForecastDateIntoRange(t.date, rangeStart),
        type: t.type,
        amount: t.amount,
        title,
        meta: t.mainCategory,
        mainCategory: t.mainCategory,
        source: 'recurring-manual',
        estimated: false
    };
}

function recurringEntryToForecastPlanItem(entry, rangeStart) {
    const title = entry.subCategory && entry.subCategory !== '[Bez podkategorii]'
        ? entry.subCategory
        : entry.mainCategory;
    return {
        date: projectForecastDateIntoRange(entry.lastDate || rangeStart, rangeStart),
        type: 'expense',
        amount: entry.amount,
        title,
        meta: entry.mainCategory,
        mainCategory: entry.mainCategory,
        source: entry.source === 'manual' ? 'recurring-manual' : 'recurring-detected',
        estimated: entry.source !== 'manual'
    };
}

function getDashboardForecastFixedItems(startDate, endDate) {
    const items = [];

    getLatestRecurringTransactions('income').forEach((t) => {
        items.push(transactionToForecastPlanItem(t, startDate));
    });

    if (typeof getAllRecurringEntries === 'function') {
        getAllRecurringEntries('sub').forEach((entry) => {
            items.push(recurringEntryToForecastPlanItem(entry, startDate));
        });
    } else {
        getLatestRecurringTransactions('expense').forEach((t) => {
            items.push(transactionToForecastPlanItem(t, startDate));
        });
    }

    if (typeof getScheduledDebtPaymentsOnDate === 'function') {
        const start = new Date(`${startDate}T12:00:00`);
        const end = new Date(`${endDate}T12:00:00`);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
            const seen = new Set();
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = localIsoDate(d);
                getScheduledDebtPaymentsOnDate(dateStr).forEach((payment) => {
                    const key = `${payment.type}|${payment.id}|${dateStr}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    items.push({
                        date: dateStr,
                        type: 'expense',
                        amount: payment.amount,
                        title: payment.name,
                        meta: payment.type === 'loan' ? 'Rata kredytu' : 'Spłata karty',
                        mainCategory: 'Długi',
                        source: payment.type === 'loan' ? 'debt-loan' : 'debt-card',
                        estimated: !!payment.estimated
                    });
                });
            }
        }
    }

    return items.sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
        return a.title.localeCompare(b.title, 'pl');
    });
}

function summarizeDashboardForecastPlan(fixedItems, forecastTotals) {
    const fixedIncome = fixedItems
        .filter((item) => item.type === 'income')
        .reduce((sum, item) => sum + item.amount, 0);
    const fixedExpense = fixedItems
        .filter((item) => item.type === 'expense')
        .reduce((sum, item) => sum + item.amount, 0);
    const variableIncome = Math.max(0, forecastTotals.income - fixedIncome);
    const variableExpense = Math.max(0, forecastTotals.expense - fixedExpense);
    return {
        fixedIncome,
        fixedExpense,
        variableIncome,
        variableExpense,
        totalIncome: forecastTotals.income,
        totalExpense: forecastTotals.expense,
        plannedBalance: forecastTotals.income - forecastTotals.expense
    };
}

function getDashboardForecastPlanItems(startDate, endDate) {
    const forecastTotals = getDashboardForecastTotals();
    const fixedItems = getDashboardForecastFixedItems(startDate, endDate);
    const summary = summarizeDashboardForecastPlan(fixedItems, forecastTotals);
    const items = [...fixedItems];

    if (summary.variableIncome >= 0.005) {
        items.push({
            date: endDate,
            type: 'income',
            amount: summary.variableIncome,
            title: 'Pozostałe wpływy (średnia)',
            meta: 'Szacunek ze średniej 3 miesięcy',
            mainCategory: '',
            source: 'variable-income',
            estimated: true,
            sortLast: true
        });
    }
    if (summary.variableExpense >= 0.005) {
        items.push({
            date: endDate,
            type: 'expense',
            amount: summary.variableExpense,
            title: 'Pozostałe wydatki (średnia)',
            meta: 'Szacunek ze średniej 3 miesięcy',
            mainCategory: '',
            source: 'variable-expense',
            estimated: true,
            sortLast: true
        });
    }

    return { items, summary };
}

function formatForecastPlanSourceBadge(source) {
    const labels = {
        'recurring-manual': 'cykliczna',
        'recurring-detected': 'wykryte',
        'debt-loan': 'rata',
        'debt-card': 'karta',
        'variable-income': 'szacunek',
        'variable-expense': 'szacunek'
    };
    return labels[source] || 'plan';
}

function renderDashboardForecastPlan(listEl, startDate, endDate, categoryFilter = null, typeFilter = null, subCategoryFilter = null) {
    const { items: allItems, summary } = getDashboardForecastPlanItems(startDate, endDate);
    let items = allItems;

    if (categoryFilter) {
        items = items.filter((item) => {
            if (item.source.startsWith('variable-')) return false;
            if (item.mainCategory !== categoryFilter || item.type !== typeFilter) return false;
            if (!subCategoryFilter) return true;
            return item.title === subCategoryFilter
                || (subCategoryFilter === 'Ogólne' && item.title === item.mainCategory);
        });
    }

    const balanceClass = summary.plannedBalance >= 0 ? 'positive' : 'negative';
    const summaryHtml = categoryFilter
        ? ''
        : `<div class="forecast-plan-summary">
            <div class="forecast-plan-summary-grid">
                <div class="forecast-plan-block income">
                    <div class="forecast-plan-block-head">
                        <span class="forecast-plan-block-label">Wpływy (prognoza)</span>
                        <strong class="forecast-plan-block-total">${formatPlnAmount(summary.totalIncome)}</strong>
                    </div>
                    <div class="forecast-plan-rows">
                        <div class="forecast-plan-row-stat"><span>Stałe</span><strong>${formatPlnAmount(summary.fixedIncome)}</strong></div>
                        <div class="forecast-plan-row-stat"><span>Zmienne (śr.)</span><strong>${formatPlnAmount(summary.variableIncome)}</strong></div>
                    </div>
                </div>
                <div class="forecast-plan-block expense">
                    <div class="forecast-plan-block-head">
                        <span class="forecast-plan-block-label">Wydatki (prognoza)</span>
                        <strong class="forecast-plan-block-total">${formatPlnAmount(summary.totalExpense)}</strong>
                    </div>
                    <div class="forecast-plan-rows">
                        <div class="forecast-plan-row-stat"><span>Stałe</span><strong>${formatPlnAmount(summary.fixedExpense)}</strong></div>
                        <div class="forecast-plan-row-stat"><span>Zmienne (śr.)</span><strong>${formatPlnAmount(summary.variableExpense)}</strong></div>
                    </div>
                </div>
            </div>
            <div class="forecast-plan-balance ${balanceClass}">
                Bilans planowany: ${summary.plannedBalance >= 0 ? '+' : ''}${formatPlnAmount(summary.plannedBalance)}
            </div>
        </div>`;

    if (!items.length) {
        listEl.innerHTML = summaryHtml + '<div class="empty-state"><p>Brak zaplanowanych pozycji w tym widoku.</p></div>';
        return;
    }

    const fixedItems = items.filter((item) => !item.sortLast);
    const variableItems = items.filter((item) => item.sortLast);
    let lastGroup = '';
    const rowsHtml = fixedItems.map((item) => {
        const group = formatDateGroup(item.date);
        const groupHtml = group !== lastGroup
            ? `<div class="tx-group-label">${escapeHtml(group)}</div>`
            : '';
        lastGroup = group;
        const badge = `<span class="forecast-plan-badge">${formatForecastPlanSourceBadge(item.source)}</span>`;
        const sign = item.type === 'expense' ? '−' : '+';
        return `${groupHtml}<div class="forecast-plan-item">
            <div class="forecast-plan-info">
                <div class="forecast-plan-title">${escapeHtml(item.title)}${badge}</div>
                <div class="forecast-plan-meta">${escapeHtml(item.meta)}</div>
            </div>
            <div class="forecast-plan-amount ${item.type}">${sign}${item.amount.toFixed(2)} zł</div>
        </div>`;
    }).join('');

    const variableHtml = variableItems.length
        ? `<div class="forecast-plan-variable-block">${variableItems.map((item) => {
            const badge = `<span class="forecast-plan-badge">${formatForecastPlanSourceBadge(item.source)}</span>`;
            const sign = item.type === 'expense' ? '−' : '+';
            return `<div class="forecast-plan-item forecast-plan-item--variable">
                <div class="forecast-plan-info">
                    <div class="forecast-plan-title">${escapeHtml(item.title)}${badge}</div>
                    <div class="forecast-plan-meta">${escapeHtml(item.meta)}</div>
                </div>
                <div class="forecast-plan-amount ${item.type}">${sign}${item.amount.toFixed(2)} zł</div>
            </div>`;
        }).join('')}</div>`
        : '';

    listEl.innerHTML = summaryHtml + rowsHtml + variableHtml;
}

function getDashboardDates() {
    const period = document.getElementById('dashboard-period-select').value;
    let startDate, endDate;
    const now = new Date();
    if (period === 'current-month') {
        startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
        endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (period === 'next-month') {
        startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
        endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    } else if (period === 'previous-month') {
        startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (period === 'current-year') {
        startDate = localIsoDate(new Date(now.getFullYear(), 0, 1));
        endDate = localIsoDate(new Date(now.getFullYear(), 11, 31));
    } else if (period === 'previous-year') {
        const y = now.getFullYear() - 1;
        startDate = `${y}-01-01`;
        endDate = `${y}-12-31`;
    } else if (period === 'all') {
        ({ startDate, endDate } = getTransactionDateBounds());
    } else {
        startDate = document.getElementById('db-start-date').value || '1970-01-01';
        endDate = document.getElementById('db-end-date').value || '2099-12-31';
    }
    return { startDate, endDate };
}
function transactionMatchesSearch(t, searchQuery) {
    return t.mainCategory.toLowerCase().includes(searchQuery) ||
        t.subCategory.toLowerCase().includes(searchQuery) ||
        (t.note && t.note.toLowerCase().includes(searchQuery)) ||
        t.amount.toString().includes(searchQuery) ||
        t.date.includes(searchQuery);
}

function getTransactionSubCategoryLabel(t) {
    return t.subCategory === '[Bez podkategorii]' ? 'Ogólne' : t.subCategory;
}

function transactionMatchesChartDrill(t, type, mainCategory, subCategoryLabel = null) {
    if (t.type !== type || t.mainCategory !== mainCategory) return false;
    if (!subCategoryLabel) return true;
    return getTransactionSubCategoryLabel(t) === subCategoryLabel;
}

function formatLegendCategoryName(name) {
    return escapeHtml(String(name ?? ''))
        .replace(/\/(\s*)/g, '/<wbr>$1');
}

function renderChartLegend(catSums, sliceColors, labels) {
    const legendEl = document.getElementById('chart-legend');
    const centerEl = document.getElementById('chart-center-amount');
    const total = Object.values(catSums).reduce((sum, value) => sum + value, 0);

    if (centerEl) centerEl.textContent = formatPlnAmount(total);

    if (!labels.length) {
        legendEl.innerHTML = '';
        return;
    }

    const entries = labels
        .map((label, index) => ({
            label,
            amount: catSums[label],
            color: sliceColors[index],
            index
        }))
        .sort((a, b) => b.amount - a.amount);

    legendEl.innerHTML = entries.map(({ label, amount, color, index }) => {
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
        const isDrillable = !activeChartCategory || !activeChartSubCategory;
        const isActive = activeChartSubCategory === label;
        const classNames = [
            'chart-legend-item',
            isDrillable ? 'chart-legend-item--drill' : '',
            isActive ? 'chart-legend-item--active' : '',
            activeChartCategory && !isDrillable && !isActive ? 'chart-legend-item--selectable' : ''
        ].filter(Boolean).join(' ');
        return `<button type="button" class="${classNames}" data-index="${index}" data-label="${label.replace(/"/g, '&quot;')}">
            <span class="chart-legend-swatch" style="background:${color}"></span>
            <span class="chart-legend-text">
                <span class="chart-legend-name">${formatLegendCategoryName(label)}</span>
                <span class="chart-legend-amount">${formatPlnAmount(amount)}</span>
            </span>
            <span class="chart-legend-pct">${pct}%</span>
        </button>`;
    }).join('');

    legendEl.querySelectorAll('.chart-legend-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!activeChartCategory) {
                activeChartCategory = btn.dataset.label;
                activeChartSubCategory = null;
                renderDashboard();
                return;
            }
            const label = btn.dataset.label;
            activeChartSubCategory = activeChartSubCategory === label ? null : label;
            renderDashboard();
        });
    });
}

function resetDashboardChart() {
    activeChartCategory = null;
    activeChartSubCategory = null;
    renderDashboard();
}

function setChartViewType(type) {
    if (chartViewType === type) return;
    chartViewType = type;
    activeChartCategory = null;
    activeChartSubCategory = null;
    renderDashboard();
}

function formatDashboardPeriodLabel() {
    const period = document.getElementById('dashboard-period-select').value;
    const now = new Date();
    if (period === 'current-month') {
        const label = now.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (period === 'next-month') {
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const label = next.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return `${label.charAt(0).toUpperCase() + label.slice(1)} · prognoza`;
    }
    if (period === 'previous-month') {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const label = prev.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (period === 'current-year') {
        return String(now.getFullYear());
    }
    if (period === 'previous-year') {
        return String(now.getFullYear() - 1);
    }
    if (period === 'all') {
        return 'Wszystko';
    }
    const { startDate, endDate } = getDashboardDates();
    return `${startDate} – ${endDate}`;
}

function formatDueLabel(days) {
    if (days === null) return '';
    if (days === 0) return 'dzisiaj';
    if (days === 1) return 'jutro';
    if (days < 0) return `${Math.abs(days)} dni temu`;
    return `za ${days} dni`;
}

function formatDashboardInstallmentsTitle() {
    const period = document.getElementById('dashboard-period-select')?.value;
    if (period === 'current-month') return 'Raty w tym miesiącu';
    if (period === 'next-month') return 'Raty w następnym miesiącu';
    if (period === 'previous-month') return 'Raty w poprzednim miesiącu';
    if (period === 'current-year') return 'Raty w bieżącym roku';
    if (period === 'previous-year') return 'Raty w poprzednim roku';
    if (period === 'all') return 'Raty (wszystkie terminy)';
    const { startDate, endDate } = getDashboardDates();
    if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
        const [year, month] = startDate.split('-').map(Number);
        const label = new Date(year, month - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return `Raty — ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    }
    return 'Raty w wybranym okresie';
}

function renderUpcomingLoanInstallments() {
    const section = document.getElementById('dashboard-upcoming-loans');
    const list = document.getElementById('dashboard-upcoming-loans-list');
    const titleEl = document.getElementById('dashboard-upcoming-loans-title');
    if (!section || !list) return;

    if (!hasScheduledLoanInstallments()) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    if (titleEl) titleEl.textContent = formatDashboardInstallmentsTitle();

    const { startDate, endDate } = getDashboardDates();
    const installments = getUpcomingLoanInstallments({ startDate, endDate });
    const emptyLabel = isDashboardForecastPeriod()
        ? 'Brak zaplanowanych rat w następnym miesiącu.'
        : 'W tym okresie wszystko spłacone.';
    if (!installments.length) {
        list.innerHTML = `<p class="upcoming-loans-empty">${emptyLabel}</p>`;
        return;
    }

    list.innerHTML = installments.map((loan) => {
        const days = daysUntilDate(loan.nextInstallmentDue);
        const overdue = days !== null && days < 0;
        const dueLabel = formatDueLabel(days);
        return `<div class="dashboard-action-row${overdue ? ' dashboard-action-row--overdue' : ''}">
            <div class="dashboard-action-info">
                <strong class="dashboard-action-name">${escapeHtml(getLoanDisplayName(loan))}</strong>
                <span class="dashboard-action-meta">${formatPlnAmount(loan.nextInstallmentAmount)} · ${formatTxDate(loan.nextInstallmentDue)}${dueLabel ? ` · ${dueLabel}` : ''}</span>
            </div>
            <button type="button" class="dashboard-quick-action-btn" onclick="payLoanInstallment('${escapeHtml(loan.id)}')">Zapłać</button>
        </div>`;
    }).join('');
}

function renderDashboardWealth() {
    const section = document.getElementById('dashboard-wealth');
    const el = document.getElementById('dashboard-wealth-content');
    if (!section || !el || typeof getPortfolioValuePln !== 'function') return;

    const assets = getPortfolioValuePln();
    if (!assets && !getLoanSummaryTotal()) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');

    const debt = typeof getLoanSummaryTotal === 'function' ? getLoanSummaryTotal() : 0;
    const net = assets - debt;
    const monthChange = typeof getSnapshotMonthChange === 'function' ? getSnapshotMonthChange() : null;
    const operational = typeof getOperationalCashPln === 'function' ? getOperationalCashPln() : 0;

    el.innerHTML = `
        <div class="dashboard-wealth-grid">
            <div><span class="label">Majątek</span><strong class="income">${formatPlnAmount(assets)}</strong></div>
            <div><span class="label">Net worth</span><strong style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatPlnAmount(net)}</strong></div>
            <div><span class="label">Gotówka oper.</span><strong>${formatPlnAmount(operational)}</strong></div>
            <div><span class="label">Zobowiązania</span><strong class="expense">${formatPlnAmount(debt)}</strong></div>
        </div>
        ${monthChange ? `<p class="dashboard-wealth-hint reports-hint">${monthChange.netWorth >= 0 ? '+' : ''}${formatPlnAmount(monthChange.netWorth)} net worth vs poprz. miesiąc</p>` : ''}`;
}

function renderDashboard() {
    renderUpcomingLoanInstallments();
    renderDashboardCreditCards();
    renderDashboardWealth();
    updateDashboardPeriodResetVisibility();
    const forecastMode = isDashboardForecastPeriod();
    const { startDate, endDate } = getDashboardDates();
    const searchQuery = document.getElementById('db-search').value.toLowerCase().trim();
    const dateFilteredTx = appState.transactions.filter(t => t.date >= startDate && t.date <= endDate);

    let totalIncomes;
    let totalExpenses;
    if (forecastMode) {
        const forecast = getDashboardForecastTotals();
        totalIncomes = forecast.income;
        totalExpenses = forecast.expense;
    } else {
        totalIncomes = dateFilteredTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        totalExpenses = dateFilteredTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    }
    const netBalance = totalIncomes - totalExpenses;

    document.getElementById('db-period-label').innerText = formatDashboardPeriodLabel();
    document.getElementById('db-total-incomes').innerText = `${totalIncomes.toFixed(2)} zł`;
    document.getElementById('db-total-expenses').innerText = `${totalExpenses.toFixed(2)} zł`;
    document.getElementById('db-incomes-label').textContent = forecastMode ? 'Wpływy (prognoza)' : 'Wpływy';
    document.getElementById('db-expenses-label').textContent = forecastMode ? 'Wydatki (prognoza)' : 'Wydatki';
    document.getElementById('db-forecast-hint')?.classList.toggle('hidden', !forecastMode);
    const netEl = document.getElementById('db-net-balance');
    netEl.innerText = `${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)} zł`;
    netEl.style.color = netBalance >= 0 ? '#6ee7b7' : '#fca5a5';

    const fillEl = document.getElementById('budget-progress-fill');
    if (totalIncomes > 0) {
        const pct = Math.min((totalExpenses / totalIncomes) * 100, 100);
        fillEl.style.width = `${pct}%`;
        fillEl.style.background = pct >= 100 ? 'var(--danger)' : 'var(--accent)';
    } else {
        fillEl.style.width = totalExpenses > 0 ? '100%' : '0%';
        fillEl.style.background = 'var(--danger)';
    }

    let listTx = dateFilteredTx;
    const searchHint = document.getElementById('db-search-hint');
    if (searchHint) searchHint.classList.toggle('visible', !!searchQuery);

    if (searchQuery) {
        listTx = appState.transactions.filter(t => transactionMatchesSearch(t, searchQuery));
    } else if (activeChartCategory) {
        listTx = listTx.filter((t) => transactionMatchesChartDrill(
            t,
            chartViewType,
            activeChartCategory,
            activeChartSubCategory
        ));
    }

    const chartTx = dateFilteredTx.filter(t => t.type === chartViewType);
    const chartTypeLabel = chartViewType === 'income' ? 'wpływów' : 'wydatków';
    const chartTypeSuffix = forecastMode ? ' (prognoza)' : '';
    document.getElementById('btn-reset-chart').style.display = activeChartCategory ? 'block' : 'none';
    document.getElementById('chart-title').innerText = activeChartSubCategory
        ? `Struktura: ${activeChartCategory} › ${activeChartSubCategory}${chartTypeSuffix}`
        : activeChartCategory
            ? `Struktura: ${activeChartCategory}${chartTypeSuffix}`
            : `Struktura ${chartTypeLabel}${chartTypeSuffix}`;
    document.getElementById('btn-chart-expense').classList.toggle('active', chartViewType === 'expense');
    document.getElementById('btn-chart-income').classList.toggle('active', chartViewType === 'income');

    const catSums = {};
    if (forecastMode) {
        Object.assign(
            catSums,
            getDashboardForecastCategorySums(chartViewType, activeChartCategory || null)
        );
    } else if (!activeChartCategory) {
        chartTx.forEach(t => { catSums[t.mainCategory] = (catSums[t.mainCategory] || 0) + t.amount; });
    } else {
        chartTx.filter(t => t.mainCategory === activeChartCategory).forEach(t => {
            const label = t.subCategory === '[Bez podkategorii]' ? 'Ogólne' : t.subCategory;
            catSums[label] = (catSums[label] || 0) + t.amount;
        });
    }

    const ctxDash = document.getElementById('dashboardChart').getContext('2d');
    if (dashboardChartInstance) dashboardChartInstance.destroy();

    if (Object.keys(catSums).length > 0) {
        const chartLabels = Object.keys(catSums);
        const sliceColors = getChartSliceColors(chartLabels);
        const borderColor = getChartBorderColor();

        dashboardChartInstance = new Chart(ctxDash, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: Object.values(catSums),
                    backgroundColor: sliceColors,
                    borderColor: borderColor,
                    borderWidth: 3,
                    borderRadius: 5,
                    spacing: 2,
                    hoverOffset: 10,
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                cutout: '58%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)',
                        titleFont: { family: 'DM Sans', weight: '700' },
                        bodyFont: { family: 'DM Sans', weight: '600' },
                        padding: 12,
                        cornerRadius: 10
                    }
                },
                onClick: (event, elements, chart) => {
                    if (!elements[0]) return;
                    const label = chart.data.labels[elements[0].index];
                    if (!activeChartCategory) {
                        activeChartCategory = label;
                        activeChartSubCategory = null;
                    } else {
                        activeChartSubCategory = activeChartSubCategory === label ? null : label;
                    }
                    renderDashboard();
                }
            }
        });
        renderChartLegend(catSums, sliceColors, chartLabels);
    } else {
        document.getElementById('chart-legend').innerHTML = '';
        const centerEl = document.getElementById('chart-center-amount');
        if (centerEl) centerEl.textContent = formatPlnAmount(0);
    }

    const txTitleEl = document.getElementById('dashboard-tx-title');
    const txHintEl = document.getElementById('dashboard-tx-list-hint');
    if (txTitleEl) {
        if (forecastMode && !searchQuery) {
            txTitleEl.textContent = 'Plan na następny miesiąc';
        } else if (!searchQuery && activeChartSubCategory) {
            txTitleEl.textContent = `Transakcje — ${activeChartSubCategory}`;
        } else if (!searchQuery && activeChartCategory) {
            txTitleEl.textContent = `Transakcje — ${activeChartCategory}`;
        } else {
            txTitleEl.textContent = 'Transakcje';
        }
    }
    if (txHintEl) txHintEl.classList.toggle('hidden', forecastMode && !searchQuery);

    const list = document.getElementById('recent-transactions-list');
    list.innerHTML = '';

    if (forecastMode && !searchQuery) {
        renderDashboardForecastPlan(
            list,
            startDate,
            endDate,
            activeChartCategory || null,
            chartViewType,
            activeChartSubCategory || null
        );
        const moreBtn = document.getElementById('dashboard-tx-show-more');
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }

    if (listTx.length === 0) {
        list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg><p>${searchQuery ? 'Brak wyników wyszukiwania' : 'Brak transakcji w tym okresie'}</p></div>`;
        const moreBtn = document.getElementById('dashboard-tx-show-more');
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }

    const signature = getDashboardTxListSignature(listTx, searchQuery);
    if (signature !== dashboardTxListSignature) {
        dashboardTxListSignature = signature;
        dashboardTxVisibleCount = LIST_PAGE_SIZE;
    }

    const visibleTx = listTx.slice(0, dashboardTxVisibleCount);
    let lastGroup = '';
    visibleTx.forEach(t => {
        const group = formatDateGroup(t.date);
        if (group !== lastGroup) {
            const label = document.createElement('div');
            label.className = 'tx-group-label';
            label.textContent = group;
            list.appendChild(label);
            lastGroup = group;
        }

        const globalIndex = appState.transactions.indexOf(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
        const isCard = t.creditCardId ? '<span class="tx-badge tx-badge--card" title="Karta kredytowa">&#128179;</span>' : '';
        const metaText = searchQuery ? `${formatTxDate(t.date)} · ${t.mainCategory}` : t.mainCategory;
        const row = document.createElement('div');
        row.className = 'tx-row';
        row.innerHTML = `
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)}
            <div class="tx-info">
                <div class="tx-title">${title}${isRec}${isCard}</div>
                <div class="tx-meta">${metaText}</div>
                ${t.note ? `<div class="tx-note">${t.note}</div>` : ''}
            </div>
            <div class="tx-amount-col">
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>
            <span class="tx-chevron" aria-hidden="true">›</span>
            <div class="tx-swipe-hint">Usuń</div>`;
        attachSwipeDelete(row, globalIndex);
        list.appendChild(row);
    });

    const moreBtn = getOrCreateShowMoreButton('dashboard-tx-show-more', showMoreDashboardTransactions);
    updateShowMoreButton(moreBtn, listTx.length, visibleTx.length, list.parentElement, list);
}
