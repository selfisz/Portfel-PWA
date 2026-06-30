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

function getBudgetLimitForPayload(payload = {}) {
    if (payload.scope === 'sub' && payload.category && payload.subCategory) {
        return typeof getSubCategoryBudgetLimit === 'function'
            ? getSubCategoryBudgetLimit(payload.category, payload.subCategory)
            : 0;
    }
    return appState.categoryBudgets?.[payload.category] || 0;
}

function getBudgetSpentForPayload(payload = {}) {
    const monthKey = payload.monthKey || getCurrentMonthKey();
    if (payload.scope === 'sub' && payload.category && payload.subCategory) {
        return typeof getSubCategorySpentInMonth === 'function'
            ? getSubCategorySpentInMonth(payload.category, payload.subCategory, monthKey)
            : 0;
    }
    return getCategorySpentInMonth(payload.category, monthKey);
}

function isNotificationResolved(item) {
    const payload = item.payload || {};
    if (item.type === 'budget_warn' || item.type === 'budget_over') {
        const monthKey = payload.monthKey || getCurrentMonthKey();
        const limit = getBudgetLimitForPayload(payload);
        if (!limit || limit <= 0) return true;
        const spent = getBudgetSpentForPayload(payload);
        if (item.type === 'budget_over') return spent < limit;
        return spent < limit * 0.8;
    }
    if (item.type === 'budget_pace') {
        const monthKey = payload.monthKey || getCurrentMonthKey();
        if (monthKey !== getCurrentMonthKey()) return true;
        const limit = getBudgetLimitForPayload(payload);
        if (!limit || limit <= 0) return true;
        const spent = getBudgetSpentForPayload(payload);
        if (spent >= limit * 0.8) return true;
        const now = new Date();
        const dayOfMonth = now.getDate();
        if (dayOfMonth < 4) return false;
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dailyAvg = spent / dayOfMonth;
        if (dailyAvg <= 0) return true;
        return dailyAvg * daysInMonth <= limit;
    }
    if (item.type === 'recurring_missing') {
        const monthKey = getCurrentMonthKey();
        if (payload.recurringId) {
            return (appState.transactions || []).some(
                (t) => t.recurringId === payload.recurringId && t.date.startsWith(monthKey)
            );
        }
        return (appState.transactions || []).some((t) => {
            if (t.type !== 'expense' || t.mainCategory !== payload.mainCategory || !t.date.startsWith(monthKey)) {
                return false;
            }
            if (!payload.subCategory || payload.subCategory === '[Bez podkategorii]') return true;
            return t.subCategory === payload.subCategory;
        });
    }
    if (item.type === 'spending_anomaly') {
        const monthKey = payload.monthKey || getCurrentMonthKey();
        if (monthKey !== getCurrentMonthKey()) return true;
        const spent = getCategorySpentInMonth(payload.category, monthKey);
        const avg = typeof suggestCategoryBudget === 'function' ? suggestCategoryBudget(payload.category) : payload.avg;
        if (!avg || avg < 100) return true;
        return spent < avg * 1.8 || spent < 200;
    }
    if (item.type === 'ikze_limit') {
        const year = payload.year || new Date().getFullYear();
        if (year !== new Date().getFullYear()) return true;
        if (typeof getIkzeContributionsInYear !== 'function' || typeof getIkzeAnnualLimitPln !== 'function') {
            return true;
        }
        const limit = getIkzeAnnualLimitPln();
        if (!limit) return true;
        return getIkzeContributionsInYear(year) >= limit * 0.5;
    }
    if (item.type === 'savings_goal') {
        const monthKey = payload.monthKey || getCurrentMonthKey();
        if (monthKey !== getCurrentMonthKey()) return true;
        if (typeof loadSavingsGoal !== 'function') return true;
        const goal = loadSavingsGoal();
        const todayStr = localIsoDate(new Date());
        const start = `${monthKey}-01`;
        const periodTx = (appState.transactions || []).filter((t) => t.date >= start && t.date <= todayStr);
        const income = periodTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        if (income < 500) return true;
        const expense = periodTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        const rate = Math.round(((income - expense) / income) * 100);
        return rate >= goal;
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
    const alertState = getBudgetAlertState();
    const created = [];
    const statuses = typeof getAllCategoryBudgetStatuses === 'function'
        ? getAllCategoryBudgetStatuses(monthKey)
        : [];

    statuses.forEach((status) => {
        const stateKey = `${monthKey}|${status.key}`;
        if (!alertState[stateKey]) alertState[stateKey] = { warned80: false, warned100: false };
        const pct = status.pct;

        if (pct >= 100 && !alertState[stateKey].warned100) {
            alertState[stateKey].warned100 = true;
            const result = upsertNotification({
                id: `budget-over|${stateKey}`,
                type: 'budget_over',
                title: `Limit przekroczony: ${status.label}`,
                body: `${formatPlnAmount(status.spent)} z ${formatPlnAmount(status.limit)} (${pct}%)`,
                payload: {
                    scope: status.scope,
                    category: status.category,
                    subCategory: status.subCategory,
                    budgetKey: status.key,
                    monthKey,
                    threshold: 100
                }
            });
            if (result?.isNew) created.push(result.item);
        } else if (pct >= 80 && pct < 100 && !alertState[stateKey].warned80) {
            alertState[stateKey].warned80 = true;
            const result = upsertNotification({
                id: `budget-warn|${stateKey}`,
                type: 'budget_warn',
                title: `Limit 80%: ${status.label}`,
                body: `${formatPlnAmount(status.spent)} z ${formatPlnAmount(status.limit)} (${pct}%)`,
                payload: {
                    scope: status.scope,
                    category: status.category,
                    subCategory: status.subCategory,
                    budgetKey: status.key,
                    monthKey,
                    threshold: 80
                }
            });
            if (result?.isNew) created.push(result.item);
        }
    });

    saveBudgetAlertState(alertState);
    return created;
}
