const SKRYBA_READ_TOOLS = [
    'snapshot_wealth',
    'list_debts',
    'debt_overpay_hints',
    'filter_transactions',
    'debt_schedule_today',
    'budget_status',
    'month_summary',
    'top_categories'
];

const SKRYBA_ACTION_TOOLS = [
    'pay_installment',
    'repay_loan',
    'repay_card',
    'add_transaction'
];

function getSkrybaTransactionsSource() {
    return typeof getMergedTransactions === 'function'
        ? getMergedTransactions()
        : (appState?.transactions || []);
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

function skrybaGetFilteredTransactionItems(params = {}) {
    let items = getSkrybaTransactionsSource();
    const typeFilter = params.type === 'income' || params.type === 'expense' ? params.type : null;

    if (typeFilter) items = items.filter((t) => t.type === typeFilter);
    if (params.startDate) items = items.filter((t) => t.date >= params.startDate);
    if (params.endDate) items = items.filter((t) => t.date <= params.endDate);
    if (typeof filterItemsByFuzzyCategoryField === 'function') {
        items = filterItemsByFuzzyCategoryField(items, 'mainCategory', params.mainCategory);
        items = filterItemsByFuzzyCategoryField(items, 'subCategory', params.subCategory);
    }
    if (params.query) {
        items = items.filter((t) => (
            typeof transactionMatchesFuzzyQuery === 'function'
                ? transactionMatchesFuzzyQuery(t, params.query)
                : true
        ));
    }
    return items;
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
            query: params.query || null
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

function captureSkrybaAdvisorContext(context, toolParams = {}) {
    if (typeof skrybaLastAdvisorContext !== 'undefined') {
        skrybaLastAdvisorContext = { context, toolParams };
    }
    if (!context?.filter_transactions) return;
    const params = toolParams.filter_transactions || {};
    const items = skrybaGetFilteredTransactionItems(params);
    if (typeof skrybaLastSearchResults !== 'undefined') {
        skrybaLastSearchResults = items;
    }
}

function detectSkrybaToolsFromText(text) {
    const t = String(text || '').toLowerCase();
    const tools = [];
    const toolParams = {};
    const period = typeof parseSkrybaPeriodFromText === 'function'
        ? parseSkrybaPeriodFromText(text)
        : null;
    const currentMonthBounds = typeof skrybaMonthBounds === 'function'
        ? skrybaMonthBounds(new Date().getFullYear(), new Date().getMonth())
        : null;
    const defaultPeriod = period || (currentMonthBounds
        ? { ...currentMonthBounds, label: 'ten miesiąc' }
        : null);
    const comparePrevious = /porównaj|porownaj|vs\b|w porównaniu|w porownaniu|różnic|roznica|poprzedni\s+miesi[aą]c/.test(t);

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
        || (comparePrevious && defaultPeriod)) {
        tools.push('month_summary');
        toolParams.month_summary = {
            startDate: defaultPeriod?.startDate,
            endDate: defaultPeriod?.endDate,
            label: defaultPeriod?.label,
            comparePrevious
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

    const categoryHints = typeof detectSkrybaCategoryHints === 'function'
        ? detectSkrybaCategoryHints(text)
        : {};
    const wantsTx = /wydałem|wydalem|wydatki|ile kosztował|ile kosztowal|ile wydane|ile łącznie|ile lacznie|transakcj|tankowan|paliwo|zakup/.test(t);

    if (period || wantsTx || categoryHints.mainCategory) {
        tools.push('filter_transactions');
        toolParams.filter_transactions = {
            startDate: period?.startDate,
            endDate: period?.endDate,
            label: period?.label,
            mainCategory: categoryHints.mainCategory,
            subCategory: categoryHints.subCategory,
            type: /wpływ|wplyw|zarobiłem|zarobilem|przychód|przychod/.test(t) ? 'income' : 'expense'
        };
    }

    return { tools: [...new Set(tools)], toolParams };
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
