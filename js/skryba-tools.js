const SKRYBA_READ_TOOLS = [
    'snapshot_wealth',
    'list_debts',
    'debt_overpay_hints',
    'filter_transactions',
    'debt_schedule_today'
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
        assetsPln: Math.round(assets * 100) / 100,
        totalDebtPln: Math.round(totalDebt * 100) / 100,
        loanDebtPln: Math.round(loanDebt * 100) / 100,
        cardDebtPln: Math.round(cardDebt * 100) / 100,
        netWorthPln: Math.round(netWorth * 100) / 100,
        operationalCashPln: Math.round(operationalCash * 100) / 100
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
            type: typeFilter,
            mainCategory: params.mainCategory || null,
            subCategory: params.subCategory || null,
            query: params.query || null
        },
        count: items.length,
        sumExpensesPln: Math.round(sumExpenses * 100) / 100,
        sumIncomePln: Math.round(sumIncome * 100) / 100,
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

function detectSkrybaToolsFromText(text) {
    const t = String(text || '').toLowerCase();
    const tools = [];
    const toolParams = {};

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

    const period = typeof parseSkrybaPeriodFromText === 'function'
        ? parseSkrybaPeriodFromText(text)
        : null;
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
