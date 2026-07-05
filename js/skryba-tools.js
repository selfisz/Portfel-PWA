const SKRYBA_READ_TOOLS = [
    'snapshot_wealth',
    'list_debts',
    'debt_overpay_hints',
    'filter_transactions',
    'debt_schedule_today',
    'budget_status',
    'month_summary',
    'top_categories',
    'debt_dsr',
    'spending_insights',
    'recurring_gaps',
    'suggest_budget',
    'weekly_briefing',
    'surplus_hints',
    'month_close_status',
    'savings_goal_status',
    'todo_overview'
];

const SKRYBA_ACTION_TOOLS = [
    'pay_installment',
    'repay_loan',
    'repay_card',
    'add_transaction',
    'set_budget',
    'add_category_rule',
    'set_savings_goal',
    'navigate'
];

function getSkrybaTransactionsSource() {
    return typeof getTransactionSearchSource === 'function'
        ? getTransactionSearchSource()
        : (typeof getMergedTransactions === 'function'
            ? getMergedTransactions()
            : (appState?.transactions || []));
}

function skrybaRoundPln(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function skrybaResolvePeriodParams(params = {}) {
    if (params.startDate && params.endDate) {
        return {
            startDate: params.startDate,
            endDate: params.endDate,
            label: params.label || `${params.startDate} — ${params.endDate}`
        };
    }
    const monthKey = params.monthKey
        || (typeof getCurrentMonthKey === 'function'
            ? getCurrentMonthKey()
            : new Date().toISOString().slice(0, 7));
    const [year, month] = monthKey.split('-').map(Number);
    if (typeof skrybaMonthBounds === 'function') {
        const bounds = skrybaMonthBounds(year, month - 1);
        return { ...bounds, label: params.label || monthKey };
    }
    const end = typeof localIsoDate === 'function'
        ? localIsoDate(new Date(year, month, 0))
        : `${monthKey}-28`;
    return { startDate: `${monthKey}-01`, endDate: end, label: params.label || monthKey };
}

function skrybaPreviousPeriodBounds(startDate, endDate) {
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    const monthEndDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    const isFullMonth = startDate.endsWith('-01')
        && end.getDate() === monthEndDay
        && start.getMonth() === end.getMonth();

    if (isFullMonth && typeof skrybaMonthBounds === 'function') {
        const prev = new Date(start.getFullYear(), start.getMonth() - 1, 1);
        const bounds = skrybaMonthBounds(prev.getFullYear(), prev.getMonth());
        return { ...bounds, label: 'poprzedni miesiąc' };
    }

    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    const fmt = typeof localIsoDate === 'function'
        ? localIsoDate
        : (d) => d.toISOString().slice(0, 10);
    return {
        startDate: fmt(prevStart),
        endDate: fmt(prevEnd),
        label: 'poprzedni okres'
    };
}

function skrybaSummarizeTransactions(items) {
    if (typeof summarizePeriod === 'function') {
        const summary = summarizePeriod(items);
        return {
            incomePln: skrybaRoundPln(summary.income),
            expensePln: skrybaRoundPln(summary.expense),
            balancePln: skrybaRoundPln(summary.balance),
            savingsRatePct: summary.savings
        };
    }
    let income = 0;
    let expense = 0;
    items.forEach((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') income += amount;
        else expense += amount;
    });
    const balance = income - expense;
    return {
        incomePln: skrybaRoundPln(income),
        expensePln: skrybaRoundPln(expense),
        balancePln: skrybaRoundPln(balance),
        savingsRatePct: income > 0 ? Math.round((balance / income) * 100) : 0
    };
}

function skrybaToolSnapshotWealth() {
    const assets = typeof getPortfolioValuePln === 'function' ? getPortfolioValuePln() : 0;
    const loanDebt = typeof getLoanCapitalLeft === 'function' ? getLoanCapitalLeft() : 0;
    const cardDebt = typeof getCreditCardDebtTotal === 'function' ? getCreditCardDebtTotal() : 0;
    const totalDebt = typeof getLoanSummaryTotal === 'function' ? getLoanSummaryTotal() : loanDebt + cardDebt;
    const operationalCash = typeof getOperationalCashPln === 'function' ? getOperationalCashPln() : 0;
    const netWorth = typeof calcNetWorthPln === 'function'
        ? calcNetWorthPln()
        : assets - loanDebt;

    return {
        assetsPln: skrybaRoundPln(assets),
        totalDebtPln: skrybaRoundPln(totalDebt),
        loanDebtPln: skrybaRoundPln(loanDebt),
        cardDebtPln: skrybaRoundPln(cardDebt),
        netWorthPln: skrybaRoundPln(netWorth),
        operationalCashPln: skrybaRoundPln(operationalCash)
    };
}

function skrybaToolListDebts() {
    const loans = typeof getActiveLoans === 'function' ? getActiveLoans() : [];
    const cards = typeof getActiveCreditCards === 'function' ? getActiveCreditCards() : [];
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${n} zł`;

    return {
        loans: loans.map((loan) => ({
            id: loan.id,
            name: typeof getLoanDisplayName === 'function' ? getLoanDisplayName(loan) : loan.name,
            capitalLeftPln: loan.currentCapitalLeft || 0,
            interestRatePct: loan.interestRate || 0,
            nextInstallmentDue: loan.nextInstallmentDue || null,
            nextInstallmentAmountPln: loan.nextInstallmentAmount || 0,
            nextInstallmentLabel: loan.nextInstallmentAmount
                ? `${fmt(loan.nextInstallmentAmount)}${loan.nextInstallmentDue ? ` (${loan.nextInstallmentDue})` : ''}`
                : null
        })),
        creditCards: cards.map((card) => ({
            id: card.id,
            name: card.name,
            balancePln: card.currentBalance || 0,
            limitPln: card.limit || 0,
            availablePln: typeof getCreditCardAvailable === 'function'
                ? getCreditCardAvailable(card)
                : Math.max(0, (card.limit || 0) - (card.currentBalance || 0))
        }))
    };
}

function skrybaToolDebtOverpayHints() {
    const snapshot = skrybaToolSnapshotWealth();
    const debts = skrybaToolListDebts();
    const rankedLoans = [...debts.loans]
        .filter((l) => l.capitalLeftPln > 0)
        .sort((a, b) => (b.interestRatePct || 0) - (a.interestRatePct || 0));

    return {
        operationalCashPln: snapshot.operationalCashPln,
        recommendation: rankedLoans.length
            ? 'Priorytet nadpłat: kredyty z najwyższym oprocentowaniem przy zachowaniu rezerwy gotówki.'
            : 'Brak aktywnych kredytów do nadpłaty.',
        loansByRate: rankedLoans.slice(0, 8)
    };
}

function skrybaToolFilterTransactions(params = {}) {
    const items = skrybaGetFilteredTransactionItems(params);
    let sumExpenses = 0;
    let sumIncome = 0;
    items.forEach((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') sumIncome += amount;
        else sumExpenses += amount;
    });

    return {
        period: params.startDate && params.endDate
            ? `${params.startDate} — ${params.endDate}`
            : (params.label || null),
        filters: {
            type: params.type === 'income' || params.type === 'expense' ? params.type : null,
            mainCategory: params.mainCategory || null,
            subCategory: params.subCategory || null,
            query: params.query || null,
            missingSubCategory: !!params.missingSubCategory
        },
        count: items.length,
        sumExpensesPln: skrybaRoundPln(sumExpenses),
        sumIncomePln: skrybaRoundPln(sumIncome),
        transactions: items.slice(0, 40).map((t) => ({
            date: t.date,
            amount: t.amount,
            type: t.type,
            mainCategory: t.mainCategory,
            subCategory: t.subCategory,
            note: t.note || ''
        }))
    };
}

function skrybaToolBudgetStatus(params = {}) {
    const monthKey = params.monthKey
        || (typeof getCurrentMonthKey === 'function'
            ? getCurrentMonthKey()
            : new Date().toISOString().slice(0, 7));
    const configured = typeof hasConfiguredCategoryBudgets === 'function'
        ? hasConfiguredCategoryBudgets()
        : false;

    if (!configured || typeof getAllCategoryBudgetStatuses !== 'function') {
        return { monthKey, configured: false, budgets: [], overCount: 0, warnCount: 0 };
    }

    const statuses = getAllCategoryBudgetStatuses(monthKey);
    return {
        monthKey,
        configured: true,
        overCount: statuses.filter((s) => s.state === 'over').length,
        warnCount: statuses.filter((s) => s.state === 'warn').length,
        budgets: statuses.map((s) => ({
            label: s.label,
            scope: s.scope,
            category: s.category,
            subCategory: s.subCategory,
            limitPln: skrybaRoundPln(s.limit),
            spentPln: skrybaRoundPln(s.spent),
            remainingPln: skrybaRoundPln(s.remaining),
            pct: s.pct,
            state: s.state
        }))
    };
}

function skrybaToolMonthSummary(params = {}) {
    const period = skrybaResolvePeriodParams(params);
    const items = getSkrybaTransactionsSource().filter((t) => (
        t.date >= period.startDate && t.date <= period.endDate
    ));
    const summary = skrybaSummarizeTransactions(items);
    const result = {
        period: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        ...summary,
        transactionCount: items.length
    };

    if (params.comparePrevious) {
        const prevPeriod = skrybaPreviousPeriodBounds(period.startDate, period.endDate);
        const prevItems = getSkrybaTransactionsSource().filter((t) => (
            t.date >= prevPeriod.startDate && t.date <= prevPeriod.endDate
        ));
        const prevSummary = skrybaSummarizeTransactions(prevItems);
        result.previous = {
            period: prevPeriod.label,
            startDate: prevPeriod.startDate,
            endDate: prevPeriod.endDate,
            ...prevSummary,
            transactionCount: prevItems.length
        };
        const expenseDelta = summary.expensePln - prevSummary.expensePln;
        const incomeDelta = summary.incomePln - prevSummary.incomePln;
        const balanceDelta = summary.balancePln - prevSummary.balancePln;
        result.deltas = {
            expenseDeltaPln: skrybaRoundPln(expenseDelta),
            expenseDeltaPct: prevSummary.expensePln > 0
                ? Math.round((expenseDelta / prevSummary.expensePln) * 100)
                : (summary.expensePln > 0 ? 100 : 0),
            incomeDeltaPln: skrybaRoundPln(incomeDelta),
            incomeDeltaPct: prevSummary.incomePln > 0
                ? Math.round((incomeDelta / prevSummary.incomePln) * 100)
                : (summary.incomePln > 0 ? 100 : 0),
            balanceDeltaPln: skrybaRoundPln(balanceDelta),
            savingsRateDeltaPct: summary.savingsRatePct - prevSummary.savingsRatePct
        };
    }

    return result;
}

function skrybaToolTopCategories(params = {}) {
    const period = skrybaResolvePeriodParams(params);
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 5;
    const items = getSkrybaTransactionsSource().filter((t) => (
        t.type === 'expense'
        && t.date >= period.startDate
        && t.date <= period.endDate
    ));
    const map = {};
    let totalExpenses = 0;
    items.forEach((t) => {
        const cat = t.mainCategory || 'Inne';
        map[cat] = (map[cat] || 0) + (Number(t.amount) || 0);
        totalExpenses += Number(t.amount) || 0;
    });
    const top = Object.entries(map)
        .map(([name, amountPln]) => ({
            name,
            amountPln: skrybaRoundPln(amountPln),
            pctOfTotal: totalExpenses > 0 ? Math.round((amountPln / totalExpenses) * 100) : 0
        }))
        .sort((a, b) => b.amountPln - a.amountPln)
        .slice(0, limit);

    return {
        period: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        totalExpensesPln: skrybaRoundPln(totalExpenses),
        transactionCount: items.length,
        top
    };
}

function skrybaToolDebtDsr(params = {}) {
    const period = skrybaResolvePeriodParams(params);
    const periodTx = getSkrybaTransactionsSource().filter((t) => (
        t.date >= period.startDate && t.date <= period.endDate
    ));
    const incomePln = skrybaRoundPln(
        periodTx.filter((t) => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0)
    );

    let loanPaymentsPln = 0;
    let cardRepaymentsPln = 0;
    if (typeof getDebtPaymentsInPeriod === 'function') {
        const payments = getDebtPaymentsInPeriod({
            periodTx,
            rangeStart: period.startDate,
            rangeEnd: period.endDate
        });
        loanPaymentsPln = skrybaRoundPln(payments.loanPayments);
        cardRepaymentsPln = skrybaRoundPln(payments.cardRepayments);
    } else {
        if (typeof sumLoanDebtPaymentsInRange === 'function') {
            loanPaymentsPln = skrybaRoundPln(sumLoanDebtPaymentsInRange(period.startDate, period.endDate));
        }
        if (typeof sumCardRepaymentsInRange === 'function') {
            cardRepaymentsPln = skrybaRoundPln(sumCardRepaymentsInRange(period.startDate, period.endDate));
        }
    }

    const totalDebtPaymentsPln = skrybaRoundPln(loanPaymentsPln + cardRepaymentsPln);
    const dsrPct = incomePln > 0 ? Math.round((totalDebtPaymentsPln / incomePln) * 100) : null;
    let riskLevel = 'unknown';
    if (dsrPct !== null) {
        riskLevel = dsrPct > 40 ? 'high' : dsrPct > 25 ? 'medium' : 'low';
    }

    return {
        period: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        incomePln,
        loanPaymentsPln,
        cardRepaymentsPln,
        totalDebtPaymentsPln,
        dsrPct,
        riskLevel
    };
}

function skrybaToolRecurringGaps() {
    const monthKey = typeof getCurrentMonthKey === 'function'
        ? getCurrentMonthKey()
        : new Date().toISOString().slice(0, 7);
    const dayOfMonth = new Date().getDate();
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${n} zł`;
    const missing = [];
    const seen = new Set();

    const recurringTxs = getSkrybaTransactionsSource().filter((t) => t.recurringId && t.type === 'expense');
    const recurringIds = [...new Set(recurringTxs.map((t) => t.recurringId))];

    recurringIds.forEach((recId) => {
        const history = recurringTxs.filter((t) => t.recurringId === recId);
        const hasThisMonth = history.some((t) => t.date.startsWith(monthKey));
        if (hasThisMonth) return;

        const latest = history.reduce((best, t) => (t.date > best.date ? t : best), history[0]);
        const typicalDay = typeof getTypicalDayFromTransactions === 'function'
            ? getTypicalDayFromTransactions(history)
            : 15;
        if (dayOfMonth < typicalDay + 3) return;

        const label = latest.subCategory && latest.subCategory !== '[Bez podkategorii]'
            ? `${latest.mainCategory} › ${latest.subCategory}`
            : latest.mainCategory;
        const key = `manual|${recId}`;
        if (seen.has(key)) return;
        seen.add(key);

        missing.push({
            label,
            mainCategory: latest.mainCategory,
            subCategory: latest.subCategory,
            amountPln: skrybaRoundPln(latest.amount),
            typicalDay,
            lastDate: latest.date,
            detail: `Zwykle ok. ${typicalDay}. dnia (~${fmt(latest.amount)}). Ostatnio: ${latest.date}.`
        });
    });

    if (typeof getAllRecurringEntries === 'function') {
        getAllRecurringEntries('sub')
            .filter((entry) => entry.source === 'detected')
            .forEach((entry) => {
                const hasExpense = typeof hasExpenseInCurrentMonth === 'function'
                    ? hasExpenseInCurrentMonth(entry.mainCategory, entry.subCategory, monthKey)
                    : getSkrybaTransactionsSource().some((t) => (
                        t.type === 'expense'
                        && t.mainCategory === entry.mainCategory
                        && t.date.startsWith(monthKey)
                    ));
                if (hasExpense) return;

                const typicalDay = entry.lastDate
                    ? parseInt(entry.lastDate.split('-')[2], 10)
                    : 15;
                if (Number.isNaN(typicalDay) || dayOfMonth < typicalDay + 3) return;

                const label = entry.subCategory && entry.subCategory !== '[Bez podkategorii]'
                    ? `${entry.mainCategory} › ${entry.subCategory}`
                    : entry.mainCategory;
                const key = `detected|${entry.key}`;
                if (seen.has(key)) return;
                seen.add(key);

                missing.push({
                    label,
                    mainCategory: entry.mainCategory,
                    subCategory: entry.subCategory,
                    amountPln: skrybaRoundPln(entry.amount),
                    typicalDay,
                    lastDate: entry.lastDate || null,
                    detail: `Wykryto cykliczny wydatek ~${fmt(entry.amount)}/mies.`
                });
            });
    }

    return { monthKey, missing: missing.slice(0, 12), count: missing.length };
}

function skrybaToolSpendingInsights() {
    const monthKey = typeof getCurrentMonthKey === 'function'
        ? getCurrentMonthKey()
        : new Date().toISOString().slice(0, 7);
    const now = new Date();
    const dayOfMonth = now.getDate();
    const todayStr = typeof localIsoDate === 'function'
        ? localIsoDate(now)
        : now.toISOString().slice(0, 10);
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${n} zł`;
    const insights = [];

    if (dayOfMonth >= 4 && typeof getAllCategoryBudgetStatuses === 'function') {
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        getAllCategoryBudgetStatuses(monthKey).forEach((status) => {
            if (status.pct >= 80) return;
            const dailyAvg = status.spent / dayOfMonth;
            if (dailyAvg <= 0) return;
            const forecast = dailyAvg * daysInMonth;
            if (forecast <= status.limit) return;
            const daysUntilLimit = Math.ceil((status.limit - status.spent) / dailyAvg);
            const hitDate = typeof addDaysToIsoDate === 'function'
                ? addDaysToIsoDate(todayStr, Math.max(1, daysUntilLimit))
                : todayStr;
            insights.push({
                kind: 'budget_pace',
                severity: 'warn',
                title: `Szybkie tempo: ${status.label}`,
                detail: `Przy ${fmt(dailyAvg)}/dzień limit ${fmt(status.limit)} skończy się ok. ${hitDate}.`
            });
        });
    }

    if (dayOfMonth >= 8 && typeof suggestCategoryBudget === 'function' && typeof getCategorySpentInMonth === 'function') {
        const categories = [...new Set(
            getSkrybaTransactionsSource()
                .filter((t) => t.type === 'expense')
                .map((t) => t.mainCategory)
        )];
        categories.forEach((category) => {
            const avg = suggestCategoryBudget(category);
            if (avg < 100) return;
            const spent = getCategorySpentInMonth(category, monthKey);
            if (spent < 200 || spent < avg * 1.8) return;
            const ratio = (spent / avg).toFixed(1).replace('.0', '');
            insights.push({
                kind: 'anomaly',
                severity: 'warn',
                title: `Nietypowo dużo: ${category}`,
                detail: `${fmt(spent)} w tym miesiącu — ${ratio}× więcej niż średnia 6m (${fmt(avg)}).`
            });
        });
    }

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (dayOfMonth >= Math.ceil(daysInMonth / 2) && typeof loadSavingsGoal === 'function') {
        const goal = loadSavingsGoal();
        const start = `${monthKey}-01`;
        const periodTx = getSkrybaTransactionsSource().filter((t) => t.date >= start && t.date <= todayStr);
        const income = periodTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = periodTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        if (income >= 500) {
            const rate = Math.round(((income - expense) / income) * 100);
            if (rate < goal) {
                insights.push({
                    kind: 'savings_goal',
                    severity: 'problem',
                    title: 'Cel oszczędności zagrożony',
                    detail: `Oszczędzasz ${rate}% wpływów (cel ${goal}%).`
                });
            }
        }
    }

    if (now.getMonth() + 1 >= 9
        && typeof getIkzeContributionsInYear === 'function'
        && typeof getIkzeAnnualLimitPln === 'function') {
        const year = now.getFullYear();
        const used = getIkzeContributionsInYear(year);
        const limit = getIkzeAnnualLimitPln();
        if (limit > 0) {
            const pct = Math.round((used / limit) * 100);
            if (pct < 50) {
                const daysLeft = Math.max(0, Math.round((new Date(year, 11, 31) - now) / 86400000));
                insights.push({
                    kind: 'ikze',
                    severity: 'warn',
                    title: `Limit IKZE ${year}`,
                    detail: `Wykorzystano ${fmt(used)} z ${fmt(limit)} (${pct}%). Do końca roku ${daysLeft} dni.`
                });
            }
        }
    }

    return { monthKey, insights: insights.slice(0, 8), count: insights.length };
}

function buildSkrybaDailyBriefing(limit = 3) {
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    const items = [];
    const push = (priority, text) => items.push({ priority, text });

    const schedule = skrybaToolDebtScheduleToday();
    if (schedule.scheduled?.length) {
        const total = schedule.scheduled.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        push(1, `Raty na dziś: ${schedule.scheduled.length} pozycji (${fmt(total)})`);
    }

    const budget = skrybaToolBudgetStatus({});
    if (budget.configured && budget.overCount > 0) {
        const over = budget.budgets.filter((b) => b.state === 'over').slice(0, 2);
        push(2, `Przekroczone budżety: ${over.map((b) => b.label).join(', ')}`);
    } else if (budget.configured && budget.warnCount > 0) {
        const warn = budget.budgets.filter((b) => b.state === 'warn').slice(0, 2);
        push(2, `Blisko limitu: ${warn.map((b) => `${b.label} (${b.pct}%)`).join(', ')}`);
    }

    const gaps = skrybaToolRecurringGaps();
    if (gaps.count > 0) {
        push(3, `Brak cyklicznych wpisów: ${gaps.missing.slice(0, 2).map((g) => g.label).join(', ')}`);
    }

    const insightData = skrybaToolSpendingInsights();
    insightData.insights.slice(0, 2).forEach((ins) => {
        push(ins.severity === 'problem' ? 2 : 4, `${ins.title}`);
    });

    const dsr = skrybaToolDebtDsr({});
    if (dsr.dsrPct !== null && dsr.riskLevel === 'high') {
        push(3, `DSR ${dsr.dsrPct}% — wysokie obciążenie dochodem`);
    }

    const month = skrybaToolMonthSummary({});
    if (month.balancePln < 0) {
        push(4, `Ujemny bilans miesiąca: ${fmt(month.balancePln)}`);
    }

    if (typeof skrybaToolTodoOverview === 'function') {
        const todos = skrybaToolTodoOverview();
        if (todos.urgentCount > 0) {
            push(2, `Twoje zadania: ${todos.urgentCount} z terminem dziś lub wcześniej`);
        } else if (todos.openCount > 0) {
            push(4, `Otwarte zadania: ${todos.openCount}`);
        }
    }

    items.sort((a, b) => a.priority - b.priority);
    const selected = items.slice(0, limit);
    if (!selected.length) return { items: [], text: null };

    return {
        items: selected,
        text: `Oto ${selected.length} ${selected.length === 1 ? 'rzecz' : 'rzeczy'} na dziś:\n`
            + `${selected.map((item, i) => `${i + 1}. ${item.text}`).join('\n')}`
    };
}

function getSkrybaIsoWeekKey(date = new Date()) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function skrybaToolSuggestBudget(params = {}) {
    const hints = typeof detectSkrybaCategoryHints === 'function'
        ? detectSkrybaCategoryHints(params.categoryQuery || params.mainCategory || '')
        : {};
    const mainCategory = params.mainCategory || hints.mainCategory;
    const subCategory = params.subCategory || hints.subCategory || '[Bez podkategorii]';
    if (!mainCategory) {
        return { configured: false, error: 'Podaj kategorię wydatków.' };
    }

    const monthKey = typeof getCurrentMonthKey === 'function'
        ? getCurrentMonthKey()
        : new Date().toISOString().slice(0, 7);
    const suggestedLimitPln = typeof suggestCategoryBudget === 'function'
        ? skrybaRoundPln(suggestCategoryBudget(mainCategory, subCategory !== '[Bez podkategorii]' ? subCategory : null))
        : 0;
    const currentLimitPln = typeof getCategoryBudgetLimit === 'function'
        ? skrybaRoundPln(getCategoryBudgetLimit(mainCategory))
        : 0;
    const spentThisMonthPln = typeof getCategorySpentInMonth === 'function'
        ? skrybaRoundPln(getCategorySpentInMonth(mainCategory, monthKey))
        : 0;

    return {
        mainCategory,
        subCategory,
        monthKey,
        suggestedLimitPln,
        currentLimitPln,
        spentThisMonthPln,
        hasHistory: suggestedLimitPln > 0
    };
}

function skrybaToolWeeklyBriefing() {
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    const addDays = typeof addDaysToIsoDate === 'function'
        ? addDaysToIsoDate
        : (iso, days) => {
            const d = new Date(`${iso}T12:00:00`);
            d.setDate(d.getDate() + days);
            return d.toISOString().slice(0, 10);
        };

    const currentEnd = today;
    const currentStart = addDays(today, -6);
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(previousEnd, -6);

    const currentTx = getSkrybaTransactionsSource().filter((t) => (
        t.date >= currentStart && t.date <= currentEnd
    ));
    const previousTx = getSkrybaTransactionsSource().filter((t) => (
        t.date >= previousStart && t.date <= previousEnd
    ));
    const current = skrybaSummarizeTransactions(currentTx);
    const previous = skrybaSummarizeTransactions(previousTx);
    const expenseDelta = current.expensePln - previous.expensePln;
    const expenseDeltaPct = previous.expensePln > 0
        ? Math.round((expenseDelta / previous.expensePln) * 100)
        : (current.expensePln > 0 ? 100 : 0);
    const top = skrybaToolTopCategories({
        startDate: currentStart,
        endDate: currentEnd,
        label: 'ostatnie 7 dni',
        limit: 3
    });
    const dsr = skrybaToolDebtDsr({
        startDate: currentStart,
        endDate: currentEnd,
        label: 'ostatnie 7 dni'
    });

    const lines = [
        `Wydatki: ${fmt(current.expensePln)} (${expenseDelta >= 0 ? '+' : '−'}${fmt(Math.abs(expenseDelta))}, ${expenseDeltaPct >= 0 ? '+' : ''}${expenseDeltaPct}% vs poprz. tydzień)`,
        `Bilans: ${fmt(current.balancePln)} (oszczędności ${current.savingsRatePct}%)`
    ];
    if (top.top.length) {
        lines.push(`Top: ${top.top.map((row) => `${row.name} ${fmt(row.amountPln)}`).join(', ')}`);
    }
    if (dsr.dsrPct !== null) {
        lines.push(`DSR: ${dsr.dsrPct}%`);
    }

    return {
        weekKey: getSkrybaIsoWeekKey(),
        period: `${currentStart} — ${currentEnd}`,
        previousPeriod: `${previousStart} — ${previousEnd}`,
        current,
        previous,
        expenseDeltaPln: skrybaRoundPln(expenseDelta),
        expenseDeltaPct,
        topCategories: top.top,
        dsrPct: dsr.dsrPct,
        text: lines.join('\n'),
        shortBody: `Wydatki ${fmt(current.expensePln)} (${expenseDeltaPct >= 0 ? '+' : ''}${expenseDeltaPct}% vs poprz. tydzień). Bilans ${fmt(current.balancePln)}.`
    };
}

function skrybaToolSurplusHints(params = {}) {
    const monthKey = typeof getCurrentMonthKey === 'function'
        ? getCurrentMonthKey()
        : new Date().toISOString().slice(0, 7);
    const period = skrybaResolvePeriodParams({ monthKey, label: 'ten miesiąc' });
    const periodTx = getSkrybaTransactionsSource().filter((t) => (
        t.date >= period.startDate && t.date <= period.endDate
    ));
    const ctx = {
        mode: 'month',
        period: monthKey,
        periodTx,
        rangeStart: period.startDate,
        rangeEnd: period.endDate
    };
    const base = typeof estimatePeriodMonthlySurplus === 'function'
        ? estimatePeriodMonthlySurplus(ctx)
        : { surplus: 0, income: 0, expense: 0, label: 'ten miesiąc' };
    const requested = Number(params.amountPln);
    const allocationAmountPln = Number.isFinite(requested) && requested > 0
        ? skrybaRoundPln(requested)
        : skrybaRoundPln(base.surplus);
    const scenarios = typeof buildSurplusScenarios === 'function'
        ? buildSurplusScenarios(allocationAmountPln, ctx)
        : [];

    return {
        period: base.label,
        estimatedSurplusPln: skrybaRoundPln(base.surplus),
        allocationAmountPln,
        operationalCashPln: typeof getOperationalCashBalance === 'function'
            ? skrybaRoundPln(getOperationalCashBalance())
            : null,
        scenarios: scenarios.slice(0, 6).map((s) => ({
            id: s.id,
            title: s.title,
            amountPln: skrybaRoundPln(s.amount),
            headline: s.headline,
            detail: s.detail
        }))
    };
}

function skrybaToolMonthCloseStatus() {
    const unclosed = typeof getUnclosedMonthsWithData === 'function'
        ? getUnclosedMonthsWithData()
        : [];
    const months = unclosed.map((monthKey) => {
        const label = typeof formatMonthKeyLabel === 'function'
            ? formatMonthKeyLabel(monthKey)
            : monthKey;
        let openIssues = 0;
        if (typeof buildMonthCloseSteps === 'function') {
            openIssues = buildMonthCloseSteps(monthKey)
                .filter((step) => !step.empty && step.id !== 'summary')
                .length;
        }
        return { monthKey, label, openIssues };
    });

    return {
        unclosedCount: months.length,
        months: months.slice(0, 8),
        latestMonthKey: months.length ? months[months.length - 1].monthKey : null
    };
}

function skrybaToolSavingsGoalStatus() {
    const goalPct = typeof loadSavingsGoal === 'function' ? loadSavingsGoal() : 20;
    const month = skrybaToolMonthSummary({});
    const gapPct = month.savingsRatePct - goalPct;
    return {
        goalPct,
        currentRatePct: month.savingsRatePct,
        onTrack: month.savingsRatePct >= goalPct,
        gapPct,
        incomePln: month.incomePln,
        expensePln: month.expensePln,
        balancePln: month.balancePln,
        period: month.period
    };
}

function buildSkrybaFollowUpChips(context = {}) {
    const chips = [];
    const add = (label) => {
        if (!chips.includes(label)) chips.push(label);
    };

    if (context?.filter_transactions) {
        add('suma');
        add('pokaż więcej');
        add('Pokaż transakcje');
        if (context.filter_transactions?.missingSubCategory) {
            add('Transakcje bez podkategorii');
        }
    }
    if (context?.month_summary) add('porównaj z poprzednim');
    if (context?.budget_status?.overCount > 0 || context?.budget_status?.warnCount > 0) {
        add('Pokaż transakcje');
        add('Co z budżetem?');
    }
    if (context?.top_categories?.top?.length) {
        add('Pokaż transakcje');
    }
    if (context?.month_close_status?.unclosedCount > 0) add('Rozlicz miesiąc');
    if (context?.surplus_hints?.estimatedSurplusPln > 0 || context?.month_summary?.balancePln > 0) {
        add('Co z nadwyżką?');
    }
    if (context?.recurring_gaps?.count > 0) add('Brakujące cykliczne');
    if (context?.savings_goal_status && !context.savings_goal_status.onTrack) {
        add('Cel oszczędności');
    }
    if (context?.open_tasks) add('Otwórz zadania');
    if (context?.todo_overview?.urgentCount > 0) add('Poranny przegląd');

    return chips.slice(0, 4);
}

function skrybaPreviousMonthPeriod(referenceDate = new Date()) {
    if (typeof skrybaMonthBounds !== 'function') return null;
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const bounds = skrybaMonthBounds(d.getFullYear(), d.getMonth());
    return { ...bounds, label: 'poprzedni miesiąc' };
}

function buildSkrybaDataCatalog() {
    const txs = getSkrybaTransactionsSource();
    const dates = txs.map((t) => t.date).filter(Boolean).sort();
    const loans = typeof getActiveLoans === 'function' ? getActiveLoans() : [];
    const cards = typeof getActiveCreditCards === 'function' ? getActiveCreditCards() : [];
    return {
        transactionCount: txs.length,
        earliestDate: dates[0] || null,
        latestDate: dates[dates.length - 1] || null,
        loansCount: loans.length,
        creditCardsCount: cards.length,
        scopes: [
            'transakcje (wszystkie okresy)',
            'budżety i limity',
            'kredyty i karty',
            'majątek i aktywa',
            'rozliczenia miesięcy',
            'cele oszczędności'
        ]
    };
}

function buildSkrybaLightContext() {
    const briefing = buildSkrybaDailyBriefing(3);
    const prevPeriod = skrybaPreviousMonthPeriod();
    return {
        data_catalog: buildSkrybaDataCatalog(),
        month_summary: skrybaToolMonthSummary({}),
        month_summary_compare: skrybaToolMonthSummary({ comparePrevious: true }),
        previous_month_summary: prevPeriod
            ? skrybaToolMonthSummary({
                startDate: prevPeriod.startDate,
                endDate: prevPeriod.endDate,
                label: prevPeriod.label
            })
            : null,
        list_debts: skrybaToolListDebts(),
        budget_status: skrybaToolBudgetStatus({}),
        snapshot_wealth: skrybaToolSnapshotWealth(),
        debt_dsr: skrybaToolDebtDsr({}),
        spending_insights: skrybaToolSpendingInsights(),
        savings_goal_status: skrybaToolSavingsGoalStatus(),
        month_close_status: skrybaToolMonthCloseStatus(),
        weekly_briefing: typeof skrybaToolWeeklyBriefing === 'function'
            ? skrybaToolWeeklyBriefing()
            : null,
        daily_briefing: briefing.items,
        week_key: getSkrybaIsoWeekKey()
    };
}

function skrybaToolDebtScheduleToday() {
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    const scheduled = typeof getScheduledDebtPaymentsOnDate === 'function'
        ? getScheduledDebtPaymentsOnDate(today)
        : [];
    const paid = getSkrybaTransactionsSource().filter((t) => (
        t.date === today && (t.mainCategory === 'Długi' || t.creditCardId)
    ));

    return { date: today, scheduled, paidCount: paid.length, paid };
}

function runSkrybaTool(toolId, params = {}) {
    switch (toolId) {
        case 'snapshot_wealth': return skrybaToolSnapshotWealth();
        case 'list_debts': return skrybaToolListDebts();
        case 'debt_overpay_hints': return skrybaToolDebtOverpayHints();
        case 'filter_transactions': return skrybaToolFilterTransactions(params);
        case 'debt_schedule_today': return skrybaToolDebtScheduleToday();
        case 'budget_status': return skrybaToolBudgetStatus(params);
        case 'month_summary': return skrybaToolMonthSummary(params);
        case 'top_categories': return skrybaToolTopCategories(params);
        case 'debt_dsr': return skrybaToolDebtDsr(params);
        case 'spending_insights': return skrybaToolSpendingInsights();
        case 'recurring_gaps': return skrybaToolRecurringGaps();
        case 'suggest_budget': return skrybaToolSuggestBudget(params);
        case 'weekly_briefing': return skrybaToolWeeklyBriefing();
        case 'surplus_hints': return skrybaToolSurplusHints(params);
        case 'month_close_status': return skrybaToolMonthCloseStatus();
        case 'savings_goal_status': return skrybaToolSavingsGoalStatus();
        case 'todo_overview': return typeof skrybaToolTodoOverview === 'function'
            ? skrybaToolTodoOverview(params)
            : null;
        default: return null;
    }
}

function buildSkrybaContextBundle(toolIds, toolParams = {}) {
    const context = {};
    toolIds.forEach((toolId) => {
        const data = runSkrybaTool(toolId, toolParams[toolId] || {});
        if (data !== null) context[toolId] = data;
    });
    return context;
}

function skrybaMonthBoundsFromMonthKey(monthKey) {
    if (!monthKey || typeof skrybaMonthBounds !== 'function') return null;
    const [year, month] = String(monthKey).split('-').map(Number);
    if (!year || !month) return null;
    return skrybaMonthBounds(year, month - 1);
}

function parseSkrybaCategoryLabel(label) {
    const raw = String(label || '').trim();
    if (!raw) return { mainCategory: null, subCategory: null };
    const parts = raw.split(/\s*[›\-–]\s*/);
    if (parts.length >= 2) {
        return { mainCategory: parts[0].trim(), subCategory: parts[1].trim() };
    }
    return { mainCategory: raw, subCategory: null };
}

function deriveSkrybaTransactionFilterFromContext(context, toolParams = {}) {
    if (!context || typeof context !== 'object') return null;

    if (context.filter_transactions) {
        const params = toolParams.filter_transactions || {};
        return {
            mainCategory: params.mainCategory || null,
            subCategory: params.subCategory || null,
            startDate: params.startDate || null,
            endDate: params.endDate || null,
            type: params.type === 'income' ? 'income' : 'expense',
            label: params.label || null
        };
    }

    const monthKey = context.budget_status?.monthKey
        || toolParams.budget_status?.monthKey
        || (typeof getCurrentMonthKey === 'function' ? getCurrentMonthKey() : null);
    const monthBounds = skrybaMonthBoundsFromMonthKey(monthKey);

    if (context.budget_status?.budgets?.length) {
        const troubled = context.budget_status.budgets.filter((b) => b.state === 'over' || b.state === 'warn');
        const focus = troubled[0] || context.budget_status.budgets[0];
        if (focus) {
            const filter = {
                mainCategory: focus.category,
                subCategory: focus.scope === 'sub' ? focus.subCategory : null,
                startDate: monthBounds?.startDate || null,
                endDate: monthBounds?.endDate || null,
                type: 'expense',
                label: focus.label
            };
            if (filter.subCategory === '[Bez podkategorii]') filter.subCategory = null;
            return filter;
        }
    }

    if (context.top_categories?.top?.length) {
        const top = context.top_categories.top[0];
        const periodParams = toolParams.top_categories || {};
        return {
            mainCategory: top.name,
            subCategory: null,
            startDate: periodParams.startDate || context.top_categories.startDate || null,
            endDate: periodParams.endDate || context.top_categories.endDate || null,
            type: 'expense',
            label: top.name
        };
    }

    return null;
}

function hasScopedSkrybaTransactionFilter(filter) {
    return !!(filter?.missingSubCategory || filter?.mainCategory || filter?.subCategory || filter?.query
        || filter?.startDate || Number.isFinite(filter?.minAmount) || Number.isFinite(filter?.maxAmount));
}

function extractSkrybaTransactionListParams(text, referenceDate = new Date()) {
    const period = typeof parseSkrybaPeriodFromText === 'function'
        ? parseSkrybaPeriodFromText(text, referenceDate)
        : null;
    const amountFilter = typeof parseSkrybaAmountFilterFromText === 'function'
        ? parseSkrybaAmountFilterFromText(text)
        : null;
    const bareAmount = (!amountFilter && typeof parseSkrybaBareTransactionAmount === 'function')
        ? parseSkrybaBareTransactionAmount(text)
        : null;
    const hints = typeof resolveSkrybaCategoryFromText === 'function'
        ? resolveSkrybaCategoryFromText(text)
        : detectSkrybaCategoryHints(text);
    const lower = String(text || '').toLowerCase();
    const missingSubCategory = typeof parseSkrybaMissingSubCategoryIntent === 'function'
        ? parseSkrybaMissingSubCategoryIntent(text)
        : false;
    return {
        startDate: period?.startDate || null,
        endDate: period?.endDate || null,
        label: period?.label || null,
        mainCategory: hints?.mainCategory || null,
        subCategory: hints?.subCategory || null,
        query: hints?.query || null,
        missingSubCategory,
        type: /wpływ|wplyw|zarobi|przychód|przychod/.test(lower) ? 'income' : 'expense',
        minAmount: amountFilter?.minAmount ?? bareAmount?.minAmount,
        maxAmount: amountFilter?.maxAmount ?? bareAmount?.maxAmount
    };
}

function mergeSkrybaTransactionListParams(partial, base) {
    if (!base || typeof base !== 'object') return partial;
    const merged = { ...base };
    if (partial.startDate) {
        merged.startDate = partial.startDate;
        merged.endDate = partial.endDate;
        merged.label = partial.label;
    }
    if (partial.mainCategory) merged.mainCategory = partial.mainCategory;
    if (partial.subCategory) merged.subCategory = partial.subCategory;
    if (partial.query) merged.query = partial.query;
    if (partial.type) merged.type = partial.type;
    if (partial.missingSubCategory) merged.missingSubCategory = true;
    if (Number.isFinite(partial.minAmount)) merged.minAmount = partial.minAmount;
    if (Number.isFinite(partial.maxAmount)) merged.maxAmount = partial.maxAmount;
    return merged;
}

function shouldMergeSkrybaTransactionFilter(text, partial, previous) {
    if (!previous || !hasSkrybaTransactionListFilter(previous)) return false;
    if (typeof isSkrybaTransactionFilterRefinement === 'function'
        && isSkrybaTransactionFilterRefinement(text)) {
        return true;
    }
    const addsPeriod = !!partial.startDate && !Number.isFinite(partial.minAmount) && !Number.isFinite(partial.maxAmount)
        && (Number.isFinite(previous.minAmount) || Number.isFinite(previous.maxAmount));
    const addsAmount = (Number.isFinite(partial.minAmount) || Number.isFinite(partial.maxAmount))
        && !partial.startDate && !!previous.startDate;
    return addsPeriod || addsAmount;
}

function applySkrybaTransactionListDefaults(params, referenceDate = new Date()) {
    const next = { ...params };
    if (!next.missingSubCategory || next.startDate) return next;
    const bounds = typeof skrybaMonthBounds === 'function'
        ? skrybaMonthBounds(referenceDate.getFullYear(), referenceDate.getMonth())
        : null;
    if (!bounds) return next;
    next.startDate = bounds.startDate;
    next.endDate = bounds.endDate;
    if (!next.label) next.label = 'ten miesiąc';
    return next;
}

function resolveSkrybaTransactionListParams(text, referenceDate = new Date()) {
    const partial = extractSkrybaTransactionListParams(text, referenceDate);
    const previous = typeof skrybaLastTransactionFilter !== 'undefined'
        ? skrybaLastTransactionFilter
        : null;
    let resolved = shouldMergeSkrybaTransactionFilter(text, partial, previous)
        ? mergeSkrybaTransactionListParams(partial, previous)
        : partial;
    resolved = applySkrybaTransactionListDefaults(resolved, referenceDate);
    return resolved;
}

function hasSkrybaTransactionListFilter(params) {
    if (!params || typeof params !== 'object') return false;
    return !!(params.missingSubCategory || params.mainCategory || params.subCategory || params.query
        || params.startDate || Number.isFinite(params.minAmount) || Number.isFinite(params.maxAmount));
}

function formatSkrybaTransactionListIntro(params, summary, items) {
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    const scopeParts = [];
    if (params.missingSubCategory) scopeParts.push('bez podkategorii');
    if (params.label) scopeParts.push(params.label);
    if (params.mainCategory) scopeParts.push(params.mainCategory);
    if (params.subCategory) scopeParts.push(params.subCategory);
    if (Number.isFinite(params.minAmount)) scopeParts.push(`powyżej ${fmt(params.minAmount)}`);
    if (Number.isFinite(params.maxAmount)) scopeParts.push(`poniżej ${fmt(params.maxAmount)}`);
    const scope = scopeParts.length ? scopeParts.join(' · ') : 'wybrane';
    if (!items.length) {
        return `Nie znalazłem transakcji dla „${scope}” w tym okresie.`;
    }
    const base = `${scope}: ${summary.count} pozycji, łącznie ${fmt(summary.sumExpensesPln)}.`;
    if (params.missingSubCategory) {
        return `${base} Kliknij pozycję, aby dodać podkategorię.`;
    }
    return base;
}

function inferSkrybaFilterFromAssistantText(text, monthKey = null) {
    const raw = String(text || '');
    if (!raw) return null;

    const period = typeof parseSkrybaPeriodFromText === 'function'
        ? parseSkrybaPeriodFromText(raw, new Date())
        : null;
    const monthBounds = skrybaMonthBoundsFromMonthKey(
        monthKey || (typeof getCurrentMonthKey === 'function' ? getCurrentMonthKey() : null)
    );
    const periodDates = period || monthBounds;

    const buildFromLabel = (label) => {
        const resolved = typeof resolveSkrybaCategoryFromText === 'function'
            ? resolveSkrybaCategoryFromText(label)
            : detectSkrybaCategoryHints(label);
        if (!resolved?.mainCategory) return null;
        return {
            mainCategory: resolved.mainCategory,
            subCategory: resolved.subCategory || null,
            query: resolved.query || null,
            startDate: periodDates?.startDate || null,
            endDate: periodDates?.endDate || null,
            type: 'expense',
            label: String(label || '').trim()
        };
    };

    const labelPatterns = [
        /\bwyda\w*\s+[\d\s.,]+\s*zł\s+na\s+([^,\n.]+?)(?:\s+w\s+|\s*$|\.|,)/i,
        /\bna\s+([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż][^,\n.]*?)(?:\s+w\s+|\s*$|\.|,)/i,
        /(?:PRZEKROCZONY|UWAGA|przekrocz\w*|limit)\s+([^:\n]+)/i,
        /kategorii\s+([^:\n.]+)/i,
        /([^\n:.,]+?)\s*[›\-–]\s*([^\n:.,]+)/i
    ];

    for (const pattern of labelPatterns) {
        const match = raw.match(pattern);
        if (!match) continue;
        const label = match[2] ? `${match[1].trim()} › ${match[2].trim()}` : match[1].trim();
        const filter = buildFromLabel(label);
        if (filter) return filter;
    }

    return null;
}

function captureSkrybaAdvisorContext(context, toolParams = {}) {
    if (typeof skrybaLastAdvisorContext !== 'undefined') {
        skrybaLastAdvisorContext = { context, toolParams };
    }

    const filter = deriveSkrybaTransactionFilterFromContext(context, toolParams);
    if (filter && typeof skrybaLastTransactionFilter !== 'undefined') {
        skrybaLastTransactionFilter = filter;
    }

    if (context?.filter_transactions) {
        const params = toolParams.filter_transactions || {};
        const items = skrybaGetFilteredTransactionItems(params);
        if (typeof skrybaLastSearchResults !== 'undefined') {
            skrybaLastSearchResults = items;
        }
        return;
    }

    if (filter && typeof skrybaLastSearchResults !== 'undefined') {
        skrybaLastSearchResults = skrybaGetFilteredTransactionItems(filter);
    }
}

function detectSkrybaToolsFromText(text, referenceDate = new Date()) {
    const t = String(text || '').toLowerCase();
    const tools = [];
    const toolParams = {};
    const period = typeof parseSkrybaPeriodFromText === 'function'
        ? parseSkrybaPeriodFromText(text, referenceDate)
        : null;
    const currentMonthBounds = typeof skrybaMonthBounds === 'function'
        ? skrybaMonthBounds(referenceDate.getFullYear(), referenceDate.getMonth())
        : null;
    const defaultPeriod = period || (currentMonthBounds
        ? { ...currentMonthBounds, label: 'ten miesiąc' }
        : null);
    const asksCompare = /porównaj|porownaj|vs\b|w porównaniu|w porownaniu|różnic|roznica|a poprzedni/.test(t);
    const wantsFinancialSummary = /wpływ|wplyw|zarobi[lł]|przychód|przychod|wydatk|bilans|oszczędno|oszczedn|podsumowanie|ile (wpad|dosz|zarobi|wyda)|miesi[aą]c finansowo|jak wygl[aą]da[lł]/.test(t);
    const comparePrevious = asksCompare && !period;

    if (/majątek|majetek|net worth|wartość portfel|wartosc portfel|ile mam (na koncie|łącznie)|bogactwo|aktywa razem/.test(t)) {
        tools.push('snapshot_wealth');
    }

    if (/nadpłac|nadplac|co spłacić|co splacic|zobowiązan|zobowiazan|kredyt|karta kredytowa|dług|dlug|zadłużen|zadluzen/.test(t)) {
        tools.push('list_debts');
        if (/nadpłac|nadplac|najlepiej|opłaca|oplaca|priorytet/.test(t)) {
            tools.push('debt_overpay_hints');
        }
    }

    if ((/dziś|dzis|na dziś|na dzis/.test(t) || /harmonogram/.test(t)) && /rat|spłat|splac|dług|dlug/.test(t)) {
        tools.push('debt_schedule_today');
    }

    if (/budżet|budzet|limit kategor|przekrocz|nad limitem|ile zostało|ile zostalo|ile mi zostało|ile mi zostalo/.test(t)) {
        tools.push('budget_status');
        toolParams.budget_status = {
            monthKey: defaultPeriod?.startDate?.slice(0, 7)
                || (typeof getCurrentMonthKey === 'function' ? getCurrentMonthKey() : null)
        };
    }

    if (/podsumowanie|wpływy i wydatki|wplywy i wydatki|bilans (miesi[aą]ca|miesiaca)|stopa oszczędności|stopa oszczednosci|jak wygl[aą]da[lł]|ile zarobi[lł]em i wyda[lł]em|miesi[aą]c finansowo/.test(t)
        || wantsFinancialSummary
        || (asksCompare && defaultPeriod)
        || (period && wantsFinancialSummary)) {
        tools.push('month_summary');
        toolParams.month_summary = {
            startDate: (period || defaultPeriod)?.startDate,
            endDate: (period || defaultPeriod)?.endDate,
            label: (period || defaultPeriod)?.label,
            comparePrevious: asksCompare && !period
        };
    }

    if (/top\s*\d*|najwi[eę]cej wyd|najwiecej wyd|gdzie najwi[eę]cej|ranking kategorii|kategorie wydatk/.test(t)) {
        tools.push('top_categories');
        const topLimitMatch = t.match(/top\s*(\d+)/);
        toolParams.top_categories = {
            startDate: defaultPeriod?.startDate,
            endDate: defaultPeriod?.endDate,
            label: defaultPeriod?.label,
            limit: topLimitMatch ? parseInt(topLimitMatch[1], 10) : 5
        };
    }

    if (/dsr|obciążenie dochodem|obciazenie dochodem|ile (wpływ|wplyw).+na spłat|na splat/.test(t)) {
        tools.push('debt_dsr');
        toolParams.debt_dsr = {
            startDate: defaultPeriod?.startDate,
            endDate: defaultPeriod?.endDate,
            label: defaultPeriod?.label
        };
    }

    if (/insight|anomali|nietypow|zaskoczy|co (się|sie) zmieniło|co sie zmienilo|co warto wiedzieć|co warto wiedziec/.test(t)) {
        tools.push('spending_insights');
    }

    if (/cykliczn|brak wpisu|brak stałej|brak stalej|subskrypcj|co mi (brakuje|umknęło|umknelo)|powtarzające|powtarzajace/.test(t)) {
        tools.push('recurring_gaps');
    }

    if (/briefing tygodnia|podsumowanie tygodnia|ostatni tydzie[nń]|tydzie[nń] finansowo/.test(t)) {
        tools.push('weekly_briefing');
    }

    if (/zaproponuj (limit|budżet|budzet)|jaki limit|jaki budżet|jaki budzet|ile ustawić na|ile ustawic na/.test(t)) {
        tools.push('suggest_budget');
        const categoryHintsForBudget = typeof detectSkrybaCategoryHints === 'function'
            ? detectSkrybaCategoryHints(text)
            : {};
        toolParams.suggest_budget = {
            mainCategory: categoryHintsForBudget.mainCategory,
            subCategory: categoryHintsForBudget.subCategory,
            categoryQuery: text
        };
    }

    if (/nadwyżk|nadwyzk|co zrobić z|co zrobic z|alokacj|gdzie ulokować|gdzie ulokowac|co z nadwyżk|co z nadwyzk/.test(t)) {
        tools.push('surplus_hints');
        const amountMatch = t.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?/);
        toolParams.surplus_hints = amountMatch
            ? { amountPln: parseFloat(amountMatch[1].replace(',', '.')) }
            : {};
    }

    if (/rozlicz|nierozliczon|zamknij miesiąc|zamknij miesiac|status rozliczenia|co do rozliczenia/.test(t)) {
        tools.push('month_close_status');
    }

    if (/cel oszczędności|cel oszczednosci|stopa oszczędności|stopa oszczednosci|osiągam cel|osiagam cel/.test(t)) {
        tools.push('savings_goal_status');
    }

    if (/(?:moje\s+)?zadani|list[aę]\s+zakup|do\s+zapłat|do\s+zaplat|co\s+mam\s+(?:na\s+)?(?:liście|liste)|płatnoś.*tydzie|platnos.*tydzie/.test(t)
        && !/(?:dodaj|odhacz|przypomnij)/.test(t)) {
        tools.push('todo_overview');
        toolParams.todo_overview = {
            kind: typeof parseSkrybaTodoListKind === 'function' ? parseSkrybaTodoListKind(text) : null,
            scope: /tydzie[nń]|7\s*dni|najbliższ|najblizsz/.test(t) ? 'week' : null
        };
    }

    const categoryHints = typeof resolveSkrybaCategoryFromText === 'function'
        ? resolveSkrybaCategoryFromText(text)
        : detectSkrybaCategoryHints(text);
    const missingSubCategory = typeof parseSkrybaMissingSubCategoryIntent === 'function'
        ? parseSkrybaMissingSubCategoryIntent(text)
        : false;
    const wantsTx = /wyda[lł]em|wydalem|wydatki|ile\s+(wyda|koszt|bylo|było|poszlo|poszło|łącznie|lacznie)|ile\s+\w+\s+(w|na)|kosztowa[lł]|kosztowal|transakcj|tankowan|paliwo|zakup|czynsz|przyjemnos|przyjemnoś|rata\b|najem\b/.test(t);

    if (missingSubCategory) {
        tools.push('filter_transactions');
        toolParams.filter_transactions = {
            startDate: (period || defaultPeriod)?.startDate,
            endDate: (period || defaultPeriod)?.endDate,
            label: (period || defaultPeriod)?.label,
            mainCategory: categoryHints.mainCategory,
            subCategory: null,
            query: categoryHints.query,
            missingSubCategory: true,
            type: /wpływ|wplyw|zarobiłem|zarobilem|przychód|przychod/.test(t) ? 'income' : 'expense'
        };
    } else if (period || wantsTx || categoryHints.mainCategory || categoryHints.query) {
        tools.push('filter_transactions');
        const amountFilter = typeof parseSkrybaAmountFilterFromText === 'function'
            ? parseSkrybaAmountFilterFromText(text)
            : null;
        toolParams.filter_transactions = {
            startDate: period?.startDate,
            endDate: period?.endDate,
            label: period?.label,
            mainCategory: categoryHints.mainCategory,
            subCategory: categoryHints.subCategory,
            query: categoryHints.query,
            type: /wpływ|wplyw|zarobiłem|zarobilem|przychód|przychod/.test(t) ? 'income' : 'expense',
            minAmount: amountFilter?.minAmount,
            maxAmount: amountFilter?.maxAmount
        };
    }

    return { tools: [...new Set(tools)], toolParams };
}

function tryAnswerSkrybaTransactionQuery(text) {
    if (typeof isSkrybaReadOnlyQuery !== 'function' || !isSkrybaReadOnlyQuery(text)) return null;

    let params = typeof resolveSkrybaTransactionListParams === 'function'
        ? resolveSkrybaTransactionListParams(text)
        : (typeof extractSkrybaTransactionListParams === 'function'
            ? extractSkrybaTransactionListParams(text)
            : {});
    if (!hasSkrybaTransactionListFilter(params)) {
        const detection = detectSkrybaToolsFromText(text);
        params = detection.toolParams?.filter_transactions || {};
        const period = typeof parseSkrybaPeriodFromText === 'function'
            ? parseSkrybaPeriodFromText(text, new Date())
            : null;
        const hints = typeof resolveSkrybaCategoryFromText === 'function'
            ? resolveSkrybaCategoryFromText(text)
            : detectSkrybaCategoryHints(text);
        if (!params.mainCategory && !params.subCategory && !params.query) {
            params = {
                ...params,
                startDate: period?.startDate || params.startDate,
                endDate: period?.endDate || params.endDate,
                label: period?.label || params.label,
                mainCategory: hints.mainCategory,
                subCategory: hints.subCategory,
                query: hints.query,
                type: 'expense'
            };
        }
    }

    if (!hasSkrybaTransactionListFilter(params)) return null;

    const items = skrybaGetFilteredTransactionItems(params);
    const summary = skrybaToolFilterTransactions(params);
    const intro = typeof formatSkrybaTransactionListIntro === 'function'
        ? formatSkrybaTransactionListIntro(params, summary, items)
        : `${items.length} pozycji.`;

    if (typeof skrybaLastSearchResults !== 'undefined') skrybaLastSearchResults = items;
    if (typeof skrybaLastTransactionFilter !== 'undefined') skrybaLastTransactionFilter = params;

    return { intro, items, filter: params };
}

function isSkrybaAdvisorQuery(detection) {
    return detection.tools.some((toolId) => SKRYBA_READ_TOOLS.includes(toolId));
}

function formatSkrybaOfflineReply(tools, toolParams = {}) {
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    const lines = [];

    if (tools.includes('snapshot_wealth')) {
        const w = skrybaToolSnapshotWealth();
        const nwLabel = typeof NET_WORTH_LABEL !== 'undefined' ? NET_WORTH_LABEL : 'Net worth';
        lines.push(
            `Majątek (aktywa): ${fmt(w.assetsPln)}. ${nwLabel}: ${fmt(w.netWorthPln)}. `
            + `Gotówka operacyjna: ${fmt(w.operationalCashPln)}. Zobowiązania: ${fmt(w.totalDebtPln)}.`
        );
    }

    if (tools.includes('month_summary')) {
        const m = skrybaToolMonthSummary(toolParams.month_summary || {});
        lines.push(
            `${m.period}: wpływy ${fmt(m.incomePln)}, wydatki ${fmt(m.expensePln)}, `
            + `bilans ${fmt(m.balancePln)}, oszczędności ${m.savingsRatePct}%.`
        );
        if (m.deltas) {
            const sign = m.deltas.expenseDeltaPln >= 0 ? '+' : '−';
            lines.push(
                `vs ${m.previous.period}: wydatki ${sign}${fmt(Math.abs(m.deltas.expenseDeltaPln))} `
                + `(${m.deltas.expenseDeltaPct >= 0 ? '+' : ''}${m.deltas.expenseDeltaPct}%).`
            );
        }
    }

    if (tools.includes('top_categories')) {
        const top = skrybaToolTopCategories(toolParams.top_categories || {});
        if (!top.top.length) {
            lines.push(`Brak wydatków w okresie ${top.period}.`);
        } else {
            lines.push(`Top kategorie (${top.period}, łącznie ${fmt(top.totalExpensesPln)}):`);
            top.top.forEach((row, idx) => {
                lines.push(`${idx + 1}. ${row.name}: ${fmt(row.amountPln)} (${row.pctOfTotal}%)`);
            });
        }
    }

    if (tools.includes('budget_status')) {
        const b = skrybaToolBudgetStatus(toolParams.budget_status || {});
        if (!b.configured) {
            lines.push('Brak skonfigurowanych limitów budżetowych w Ustawieniach.');
        } else if (!b.budgets.length) {
            lines.push('Brak aktywnych limitów na ten miesiąc.');
        } else {
            const troubled = b.budgets.filter((row) => row.state === 'over' || row.state === 'warn');
            if (troubled.length) {
                troubled.slice(0, 5).forEach((row) => {
                    const tag = row.state === 'over' ? 'PRZEKROCZONY' : 'UWAGA';
                    lines.push(`${tag} ${row.label}: ${fmt(row.spentPln)} / ${fmt(row.limitPln)} (${row.pct}%).`);
                });
            } else {
                lines.push(`Budżety (${b.monthKey}): wszystkie kategorie w limicie.`);
            }
        }
    }

    if (tools.includes('debt_dsr')) {
        const d = skrybaToolDebtDsr(toolParams.debt_dsr || {});
        if (d.dsrPct === null) {
            lines.push(`DSR (${d.period}): brak wpływów w okresie.`);
        } else {
            const risk = d.riskLevel === 'high' ? 'wysokie' : d.riskLevel === 'medium' ? 'umiarkowane' : 'niskie';
            lines.push(
                `DSR ${d.period}: ${d.dsrPct}% (${risk}). Spłaty ${fmt(d.totalDebtPaymentsPln)} `
                + `przy wpływach ${fmt(d.incomePln)}.`
            );
        }
    }

    if (tools.includes('spending_insights')) {
        const data = skrybaToolSpendingInsights();
        if (!data.count) {
            lines.push('Brak aktywnych insightów w tym miesiącu.');
        } else {
            data.insights.slice(0, 4).forEach((ins) => {
                lines.push(`${ins.severity === 'problem' ? '⚠' : '·'} ${ins.title}: ${ins.detail}`);
            });
        }
    }

    if (tools.includes('recurring_gaps')) {
        const gaps = skrybaToolRecurringGaps();
        if (!gaps.count) {
            lines.push('Wszystkie wykryte cykliczne wpisy są na bieżąco.');
        } else {
            gaps.missing.slice(0, 5).forEach((gap) => {
                lines.push(`Brak: ${gap.label} — ${gap.detail}`);
            });
        }
    }

    if (tools.includes('weekly_briefing')) {
        const week = skrybaToolWeeklyBriefing();
        lines.push(`Briefing tygodnia (${week.period}):`);
        lines.push(week.text);
    }

    if (tools.includes('suggest_budget')) {
        const suggestion = skrybaToolSuggestBudget(toolParams.suggest_budget || {});
        if (!suggestion.mainCategory) {
            lines.push('Podaj kategorię, np. „jaki limit na jedzenie?”.');
        } else if (!suggestion.hasHistory) {
            lines.push(`Brak historii dla ${suggestion.mainCategory} — trudno zaproponować limit.`);
        } else {
            lines.push(
                `${suggestion.mainCategory}: propozycja ${fmt(suggestion.suggestedLimitPln)}/mies. `
                + `(teraz ${fmt(suggestion.currentLimitPln || 0)}, wydano ${fmt(suggestion.spentThisMonthPln)}).`
            );
        }
    }

    if (tools.includes('surplus_hints')) {
        const surplus = skrybaToolSurplusHints(toolParams.surplus_hints || {});
        lines.push(`Nadwyżka (${surplus.period}): ${fmt(surplus.estimatedSurplusPln)}.`);
        surplus.scenarios.slice(0, 3).forEach((s) => {
            lines.push(`· ${s.title}: ${s.headline} — ${s.detail}`);
        });
    }

    if (tools.includes('month_close_status')) {
        const close = skrybaToolMonthCloseStatus();
        if (!close.unclosedCount) {
            lines.push('Wszystkie miesiące z danymi są rozliczone.');
        } else {
            close.months.forEach((m) => {
                lines.push(`${m.label}: ${m.openIssues} otwartych kroków rozliczenia.`);
            });
        }
    }

    if (tools.includes('savings_goal_status')) {
        const goal = skrybaToolSavingsGoalStatus();
        const status = goal.onTrack ? 'OK' : 'Poniżej celu';
        lines.push(
            `Cel oszczędności: ${goal.goalPct}% — teraz ${goal.currentRatePct}% (${status}). `
            + `Bilans miesiąca: ${fmt(goal.balancePln)}.`
        );
    }

    if (tools.includes('todo_overview') && typeof skrybaToolTodoOverview === 'function') {
        const data = skrybaToolTodoOverview(toolParams.todo_overview || {});
        if (!data.openCount) {
            lines.push('Nie masz otwartych zadań na listach.');
        } else if (data.items.length) {
            const label = data.scope === 'week' ? 'Płatności w najbliższym tygodniu' : 'Twoje zadania';
            lines.push(`${label} (${data.items.length}):`);
            data.items.forEach((item, index) => {
                const amount = item.amount ? `, ${fmt(item.amount)}` : '';
                const due = item.dueDate ? `, termin ${item.dueDate}` : '';
                lines.push(`${index + 1}. ${item.title} (${item.listName}${amount}${due})`);
            });
        } else {
            lines.push(`Masz ${data.openCount} otwartych zadań — bez pozycji w tym zakresie.`);
        }
    }

    if (tools.includes('filter_transactions')) {
        const f = skrybaToolFilterTransactions(toolParams.filter_transactions || {});
        const period = f.period ? ` (${f.period})` : '';
        if (f.filters?.type === 'income') {
            lines.push(`Wpływy${period}: ${fmt(f.sumIncomePln)} — ${f.count} transakcji.`);
        } else {
            lines.push(`Wydatki${period}: ${fmt(f.sumExpensesPln)} — ${f.count} transakcji.`);
        }
    }

    if (tools.includes('list_debts')) {
        const d = skrybaToolListDebts();
        if (!d.loans.length && !d.creditCards.length) {
            lines.push('Brak aktywnych kredytów i kart.');
        } else {
            d.loans.forEach((l) => {
                lines.push(`Kredyt ${l.name}: kapitał ${fmt(l.capitalLeftPln)}`
                    + (l.nextInstallmentLabel ? `, rata ${l.nextInstallmentLabel}` : ''));
            });
            d.creditCards.forEach((c) => {
                lines.push(`Karta ${c.name}: zadłużenie ${fmt(c.balancePln)}`);
            });
        }
    }

    if (tools.includes('debt_overpay_hints')) {
        const h = skrybaToolDebtOverpayHints();
        if (h.loansByRate.length) {
            const top = h.loansByRate[0];
            lines.push(`Przy wolnej gotówce ${fmt(h.operationalCashPln)} rozważ nadpłatę: ${top.name} (${top.interestRatePct}%).`);
        }
    }

    if (tools.includes('debt_schedule_today')) {
        const s = skrybaToolDebtScheduleToday();
        if (!s.scheduled.length) {
            lines.push('Brak zaplanowanych rat na dziś.');
        } else {
            s.scheduled.forEach((p) => lines.push(`· ${p.name}: ${fmt(p.amount)}`));
        }
    }

    return lines.join('\n');
}

function formatSkrybaCompareFollowUp(context, toolParams = {}) {
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    if (context?.month_summary && !context.month_summary.deltas) {
        const compared = skrybaToolMonthSummary({
            ...(toolParams.month_summary || {}),
            startDate: context.month_summary.startDate,
            endDate: context.month_summary.endDate,
            label: context.month_summary.period,
            comparePrevious: true
        });
        if (!compared.deltas) return null;
        const sign = compared.deltas.expenseDeltaPln >= 0 ? '+' : '−';
        return `Porównanie ${compared.period} vs ${compared.previous.period}: `
            + `wydatki ${sign}${fmt(Math.abs(compared.deltas.expenseDeltaPln))} `
            + `(${compared.deltas.expenseDeltaPct >= 0 ? '+' : ''}${compared.deltas.expenseDeltaPct}%), `
            + `bilans ${compared.deltas.balanceDeltaPln >= 0 ? '+' : '−'}${fmt(Math.abs(compared.deltas.balanceDeltaPln))}.`;
    }
    return null;
}
