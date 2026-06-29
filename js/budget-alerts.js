function getBudgetAlertState() {
    try {
        const raw = JSON.parse(localStorage.getItem(NOTIFICATION_ALERT_STATE_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

function saveBudgetAlertState(state) {
    localStorage.setItem(NOTIFICATION_ALERT_STATE_KEY, JSON.stringify(state));
}

function getCategorySpentInMonth(mainCategory, monthKey) {
    const start = `${monthKey}-01`;
    const [year, month] = monthKey.split('-').map(Number);
    const end = localIsoDate(new Date(year, month, 0));
    return (appState.transactions || [])
        .filter((t) => t.type === 'expense' && t.mainCategory === mainCategory && t.date >= start && t.date <= end)
        .reduce((sum, t) => sum + t.amount, 0);
}

function isNotificationResolved(item) {
    const payload = item.payload || {};
    if (item.type === 'budget_warn' || item.type === 'budget_over') {
        const monthKey = payload.monthKey || getCurrentMonthKey();
        const limit = appState.categoryBudgets?.[payload.category];
        if (!limit || limit <= 0) return true;
        const spent = getCategorySpentInMonth(payload.category, monthKey);
        if (item.type === 'budget_over') return spent < limit;
        return spent < limit * 0.8;
    }
    if (item.type === 'loan_due_1d' || item.type === 'loan_due_0d') {
        const loan = typeof getLoanById === 'function' ? getLoanById(payload.loanId) : null;
        return !loan || !(loan.currentCapitalLeft > 0);
    }
    if (item.type === 'card_repay_50d') {
        const card = typeof getCreditCardById === 'function' ? getCreditCardById(payload.cardId) : null;
        if (!card || !(card.currentBalance > 0)) return true;
        if (payload.sourceDate && payload.amount) {
            return isCardRepaymentEventSettled(payload);
        }
        return false;
    }
    if (item.type === 'card_monthly_check') {
        return typeof getActiveCreditCards === 'function'
            && !getActiveCreditCards().some((c) => c.currentBalance > 0);
    }
    return false;
}

function evaluateBudgetAlerts() {
    const monthKey = getCurrentMonthKey();
    const budgets = appState.categoryBudgets || {};
    const alertState = getBudgetAlertState();
    const created = [];

    Object.keys(budgets).forEach((category) => {
        const limit = budgets[category];
        if (!limit || limit <= 0) return;
        const spent = getCategorySpentInMonth(category, monthKey);
        const pct = (spent / limit) * 100;
        const stateKey = `${monthKey}|${category}`;
        if (!alertState[stateKey]) alertState[stateKey] = { warned80: false, warned100: false };

        if (pct >= 100 && !alertState[stateKey].warned100) {
            alertState[stateKey].warned100 = true;
            const item = upsertNotification({
                id: `budget-over|${stateKey}`,
                type: 'budget_over',
                title: `Limit przekroczony: ${category}`,
                body: `${formatPlnAmount(spent)} z ${formatPlnAmount(limit)} (${Math.round(pct)}%)`,
                refreshRead: true,
                payload: { category, monthKey, threshold: 100 }
            });
            if (item) created.push(item);
        } else if (pct >= 80 && pct < 100 && !alertState[stateKey].warned80) {
            alertState[stateKey].warned80 = true;
            const item = upsertNotification({
                id: `budget-warn|${stateKey}`,
                type: 'budget_warn',
                title: `Limit 80%: ${category}`,
                body: `${formatPlnAmount(spent)} z ${formatPlnAmount(limit)} (${Math.round(pct)}%)`,
                refreshRead: true,
                payload: { category, monthKey, threshold: 80 }
            });
            if (item) created.push(item);
        }
    });

    saveBudgetAlertState(alertState);
    return created;
}
