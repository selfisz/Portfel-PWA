function getTypicalDayFromTransactions(txs) {
    const days = txs
        .map((t) => parseInt(String(t.date || '').split('-')[2], 10))
        .filter((d) => !Number.isNaN(d));
    if (!days.length) return 15;
    return Math.round(days.reduce((sum, d) => sum + d, 0) / days.length);
}

function hasExpenseInCurrentMonth(mainCategory, subCategory, monthKey) {
    return (appState.transactions || []).some((t) => {
        if (t.type !== 'expense' || t.mainCategory !== mainCategory || !t.date.startsWith(monthKey)) return false;
        if (!subCategory || subCategory === '[Bez podkategorii]') return true;
        return t.subCategory === subCategory;
    });
}

function evaluateSpendingPaceAlerts() {
    const monthKey = getCurrentMonthKey();
    const now = new Date();
    const dayOfMonth = now.getDate();
    if (dayOfMonth < 4) return [];

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = daysInMonth - dayOfMonth;
    const todayStr = localIsoDate(now);
    const created = [];
    const statuses = typeof getAllCategoryBudgetStatuses === 'function'
        ? getAllCategoryBudgetStatuses(monthKey)
        : [];

    statuses.forEach((status) => {
        if (status.pct >= 80) return;
        const dailyAvg = status.spent / dayOfMonth;
        if (dailyAvg <= 0) return;
        const forecast = dailyAvg * daysInMonth;
        if (forecast <= status.limit) return;

        const daysUntilLimit = Math.ceil((status.limit - status.spent) / dailyAvg);
        const hitDate = addDaysToIsoDate(todayStr, Math.max(1, daysUntilLimit));

        const result = upsertNotification({
            id: `budget-pace|${monthKey}|${status.key}`,
            type: 'budget_pace',
            title: `Szybkie tempo: ${status.label}`,
            body: `Przy ${formatPlnAmount(dailyAvg)}/dzień limit ${formatPlnAmount(status.limit)} skończy się ok. ${formatTxDate(hitDate)} — zostało ${daysRemaining} dni miesiąca.`,
            payload: {
                scope: status.scope,
                category: status.category,
                subCategory: status.subCategory,
                budgetKey: status.key,
                monthKey
            }
        });
        if (result?.isNew) created.push(result.item);
    });

    return created;
}

function evaluateMissingRecurringAlerts() {
    const monthKey = getCurrentMonthKey();
    const dayOfMonth = new Date().getDate();
    const created = [];
    const seen = new Set();

    const recurringTxs = (appState.transactions || []).filter((t) => t.recurringId && t.type === 'expense');
    const recurringIds = [...new Set(recurringTxs.map((t) => t.recurringId))];

    recurringIds.forEach((recId) => {
        const history = recurringTxs.filter((t) => t.recurringId === recId);
        const hasThisMonth = history.some((t) => t.date.startsWith(monthKey));
        if (hasThisMonth) return;

        const latest = history.reduce((best, t) => (t.date > best.date ? t : best), history[0]);
        const typicalDay = getTypicalDayFromTransactions(history);
        if (dayOfMonth < typicalDay + 3) return;

        const label = latest.subCategory && latest.subCategory !== '[Bez podkategorii]'
            ? `${latest.mainCategory} › ${latest.subCategory}`
            : latest.mainCategory;
        const id = `recurring-missing|${monthKey}|manual|${recId}`;
        if (seen.has(id)) return;
        seen.add(id);

        const result = upsertNotification({
            id,
            type: 'recurring_missing',
            title: `Brak wpisu: ${label}`,
            body: `Zwykle ok. ${typicalDay}. dnia miesiąca (~${formatPlnAmount(latest.amount)}). Ostatnio: ${formatTxDate(latest.date)}.`,
            payload: {
                monthKey,
                mainCategory: latest.mainCategory,
                subCategory: latest.subCategory,
                amount: latest.amount,
                recurringId: recId
            }
        });
        if (result?.isNew) created.push(result.item);
    });

    if (typeof getAllRecurringEntries === 'function') {
        getAllRecurringEntries('sub')
            .filter((entry) => entry.source === 'detected')
            .forEach((entry) => {
                if (hasExpenseInCurrentMonth(entry.mainCategory, entry.subCategory, monthKey)) return;

                const typicalDay = entry.lastDate
                    ? parseInt(entry.lastDate.split('-')[2], 10)
                    : 15;
                if (Number.isNaN(typicalDay) || dayOfMonth < typicalDay + 3) return;

                const label = entry.subCategory && entry.subCategory !== '[Bez podkategorii]'
                    ? `${entry.mainCategory} › ${entry.subCategory}`
                    : entry.mainCategory;
                const id = `recurring-missing|${monthKey}|detected|${entry.key}`;
                if (seen.has(id)) return;
                seen.add(id);

                const result = upsertNotification({
                    id,
                    type: 'recurring_missing',
                    title: `Brak stałej opłaty: ${label}`,
                    body: `Wykryto cykliczny wydatek ~${formatPlnAmount(entry.amount)}/mies. Ostatnio: ${entry.lastDate ? formatTxDate(entry.lastDate) : '—'}.`,
                    payload: {
                        monthKey,
                        mainCategory: entry.mainCategory,
                        subCategory: entry.subCategory,
                        amount: entry.amount
                    }
                });
                if (result?.isNew) created.push(result.item);
            });
    }

    return created;
}

function evaluateSpendingAnomalyAlerts() {
    const monthKey = getCurrentMonthKey();
    const dayOfMonth = new Date().getDate();
    if (dayOfMonth < 8) return [];

    const created = [];
    const categories = [...new Set(
        (appState.transactions || [])
            .filter((t) => t.type === 'expense')
            .map((t) => t.mainCategory)
    )];

    categories.forEach((category) => {
        if (typeof suggestCategoryBudget !== 'function') return;
        const avg = suggestCategoryBudget(category);
        if (avg < 100) return;

        const spent = getCategorySpentInMonth(category, monthKey);
        if (spent < 200 || spent < avg * 1.8) return;

        const ratio = (spent / avg).toFixed(1).replace('.0', '');
        const result = upsertNotification({
            id: `spending-anomaly|${monthKey}|${category}`,
            type: 'spending_anomaly',
            title: `Nietypowo dużo: ${category}`,
            body: `${formatPlnAmount(spent)} w tym miesiącu — ${ratio}× więcej niż średnia 6m (${formatPlnAmount(avg)}).`,
            payload: { category, monthKey, avg, spent }
        });
        if (result?.isNew) created.push(result.item);
    });

    return created;
}

function evaluateIkzeAlerts() {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    if (month < 9) return [];

    if (typeof getIkzeContributionsInYear !== 'function' || typeof getIkzeAnnualLimitPln !== 'function') {
        return [];
    }

    const used = getIkzeContributionsInYear(year);
    const limit = getIkzeAnnualLimitPln();
    if (!limit || limit <= 0) return [];

    const pct = (used / limit) * 100;
    if (pct >= 50) return [];

    const endOfYear = new Date(year, 11, 31);
    const today = new Date();
    const daysLeft = Math.max(0, Math.round((endOfYear - today) / 86400000));
    const created = [];

    const result = upsertNotification({
        id: `ikze-limit|${year}`,
        type: 'ikze_limit',
        title: `Limit IKZE ${year}`,
        body: `Wykorzystano ${formatPlnAmount(used)} z ${formatPlnAmount(limit)} (${Math.round(pct)}%). Do końca roku zostało ${daysLeft} dni.`,
        payload: { year }
    });
    if (result?.isNew) created.push(result.item);
    return created;
}

function evaluateSavingsGoalAlerts() {
    const monthKey = getCurrentMonthKey();
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth < Math.ceil(daysInMonth / 2)) return [];

    if (typeof loadSavingsGoal !== 'function') return [];

    const goal = loadSavingsGoal();
    const todayStr = localIsoDate(now);
    const start = `${monthKey}-01`;
    const periodTx = (appState.transactions || []).filter((t) => t.date >= start && t.date <= todayStr);
    const income = periodTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = periodTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    if (income < 500) return [];

    const rate = Math.round(((income - expense) / income) * 100);
    if (rate >= goal) return [];

    const created = [];
    const result = upsertNotification({
        id: `savings-goal|${monthKey}`,
        type: 'savings_goal',
        title: 'Cel oszczędności zagrożony',
        body: `Oszczędzasz ${rate}% wpływów (cel ${goal}%). Wpływy ${formatPlnAmount(income)}, wydatki ${formatPlnAmount(expense)}.`,
        payload: { monthKey, goal, rate }
    });
    if (result?.isNew) created.push(result.item);
    return created;
}

function evaluateSpendingInsightAlerts() {
    const created = [];
    created.push(...evaluateSpendingAnomalyAlerts());
    created.push(...evaluateIkzeAlerts());
    created.push(...evaluateSavingsGoalAlerts());
    return created;
}
