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
        estimated: false,
        recurringId: t.recurringId || null
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

    (appState.transactions || []).forEach((t) => {
        if (t.date < startDate || t.date > endDate) return;
        if (typeof isPlannedTransaction === 'function' && isPlannedTransaction(t)) {
            items.push(transactionToPlannedForecastItem(t));
        }
    });

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

function isReportsForecastFixedItemPaid(item, monthStart, endDate) {
    return (appState.transactions || []).some((t) => {
        if (t.type !== 'expense' || t.date < monthStart || t.date > endDate) return false;
        if (item.recurringId && t.recurringId === item.recurringId) return true;
        if (item.source === 'debt-loan' || item.source === 'debt-card') {
            return t.mainCategory === 'Długi' && Math.abs(t.amount - item.amount) < 0.005;
        }
        const title = item.title;
        const catMatch = t.mainCategory === item.mainCategory;
        const labelMatch = (t.subCategory && t.subCategory !== '[Bez podkategorii]' && t.subCategory === title)
            || (t.subCategory === '[Bez podkategorii]' && t.mainCategory === title)
            || t.subCategory === title;
        return catMatch && labelMatch
            && Math.abs(t.amount - item.amount) <= Math.max(item.amount * 0.2, 10);
    });
}

function getReportsMonthForecastTotals(referenceDate = new Date()) {
    const year = referenceDate.getFullYear();
    const monthIndex = referenceDate.getMonth();
    const monthStart = localIsoDate(new Date(year, monthIndex, 1));
    const monthEnd = localIsoDate(new Date(year, monthIndex + 1, 0));
    const today = localIsoDate(referenceDate);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const dayOfMonth = referenceDate.getDate();
    const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);

    const monthExpenses = (appState.transactions || [])
        .filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= today)
        .reduce((sum, t) => sum + t.amount, 0);

    const naiveForecast = dayOfMonth > 0 ? (monthExpenses / dayOfMonth) * daysInMonth : monthExpenses;
    const baseResult = {
        monthExpenses,
        forecast: naiveForecast,
        remaining: naiveForecast - monthExpenses,
        fixedExpenseTotal: 0,
        fixedExpenseRemaining: 0,
        dayOfMonth,
        daysInMonth,
        usesFixedRecurring: false
    };

    const fixedExpenseItems = getDashboardForecastFixedItems(monthStart, monthEnd)
        .filter((item) => item.type === 'expense');
    const fixedExpenseTotal = fixedExpenseItems.reduce((sum, item) => sum + item.amount, 0);
    if (!fixedExpenseTotal) return baseResult;

    let fixedPaidThisMonth = 0;
    let fixedExpenseRemaining = 0;
    fixedExpenseItems.forEach((item) => {
        if (isReportsForecastFixedItemPaid(item, monthStart, today)) {
            fixedPaidThisMonth += item.amount;
        } else {
            fixedExpenseRemaining += item.amount;
        }
    });

    const variableSpent = Math.max(0, monthExpenses - fixedPaidThisMonth);
    const variableDailyAvg = dayOfMonth > 0 ? variableSpent / dayOfMonth : 0;
    const variableRemaining = variableDailyAvg * daysRemaining;
    const forecast = monthExpenses + fixedExpenseRemaining + variableRemaining;

    return {
        monthExpenses,
        forecast,
        remaining: forecast - monthExpenses,
        fixedExpenseTotal,
        fixedExpenseRemaining,
        fixedPaidThisMonth,
        variableSpent,
        variableDailyAvg,
        dayOfMonth,
        daysInMonth,
        daysRemaining,
        naiveForecast,
        usesFixedRecurring: true
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
        'planned': 'zaplanowane',
        'debt-loan': 'rata',
        'debt-card': 'karta',
        'variable-income': 'szacunek',
        'variable-expense': 'szacunek'
    };
    return labels[source] || 'plan';
}

function transactionToPlannedForecastItem(t) {
    const title = t.subCategory && t.subCategory !== '[Bez podkategorii]' ? t.subCategory : t.mainCategory;
    return {
        date: t.date,
        type: t.type,
        amount: t.amount,
        title,
        meta: typeof formatTransactionCategoryLabel === 'function'
            ? formatTransactionCategoryLabel(t)
            : t.mainCategory,
        mainCategory: t.mainCategory,
        subCategory: t.subCategory,
        source: 'planned',
        estimated: false
    };
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
        const badge = `<span class="forecast-plan-badge${item.source === 'planned' ? ' forecast-plan-badge--planned' : ''}">${formatForecastPlanSourceBadge(item.source)}</span>`;
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
            const badge = `<span class="forecast-plan-badge${item.source === 'planned' ? ' forecast-plan-badge--planned' : ''}">${formatForecastPlanSourceBadge(item.source)}</span>`;
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
