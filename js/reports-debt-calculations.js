/* Raporty — obliczenia długów */

function getPeriodBoundsFromCtx(ctx) {
    if (ctx.rangeStart && ctx.rangeEnd) {
        return { start: ctx.rangeStart, end: ctx.rangeEnd };
    }
    if (ctx.mode === 'year' && ctx.period !== 'all') {
        return { start: `${ctx.period}-01-01`, end: `${ctx.period}-12-31` };
    }
    if (!ctx.periodTx.length) {
        const y = new Date().getFullYear();
        return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    const dates = ctx.periodTx.map((t) => t.date).sort();
    return { start: dates[0], end: dates[dates.length - 1] };
}

function getCreditCardMovementsInRange(start, end) {
    return (appState.creditCardMovements || [])
        .map(normalizeCreditCardMovement)
        .filter(Boolean)
        .filter((m) => {
            if (start && m.date < start) return false;
            if (end && m.date > end) return false;
            return true;
        });
}

function monthKeyToDateRange(key) {
    const { year, month, day } = key;
    if (day !== undefined) {
        const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { start: date, end: date };
    }
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const end = localIsoDate(new Date(year, month + 1, 0));
    return { start, end };
}

function sumLoanDebtPaymentsInRange(start, end) {
    return getTransactionsInRange(start, end)
        .filter((t) => t.type === 'expense' && isLoanOrDebtPayment(t))
        .reduce((s, t) => s + t.amount, 0);
}

function sumCardRepaymentsInRange(start, end) {
    return getCreditCardMovementsInRange(start, end)
        .filter((m) => m.type === 'repayment')
        .reduce((s, m) => s + m.amount, 0);
}

function isLoanOverpaymentTransaction(loan, tx) {
    if (!loan || !tx) return false;
    if (tx.loanPaymentKind === 'overpayment') return true;
    if (tx.loanPaymentKind === 'installment') return false;
    const note = (tx.note || '').toLowerCase();
    if (/nadpłat|nadplat/.test(note)) return true;
    if (/spłata kapitału|splata kapitalu/.test(note)) return true;
    const inst = loan.nextInstallmentAmount || 0;
    const amount = tx.amount || 0;
    if (inst > 0 && amount > inst * 1.05 && !/rata/.test(note)) return true;
    return false;
}

function sumLoanInstallmentPaymentsForLoanInRange(loan, start, end) {
    if (!loan) return 0;
    return getTransactionsInRange(start, end)
        .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
        .filter((t) => !isLoanOverpaymentTransaction(loan, t))
        .reduce((s, t) => {
            const inst = loan.nextInstallmentAmount || 0;
            if (inst > 0 && typeof classifyLoanPaymentAmount === 'function') {
                return s + classifyLoanPaymentAmount(loan, t.amount).regular;
            }
            return s + t.amount;
        }, 0);
}

function sumLoanPaymentsForLoanInRange(loan, start, end) {
    if (!loan) return 0;
    return getTransactionsInRange(start, end)
        .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
        .reduce((s, t) => s + t.amount, 0);
}

function sumCardRepaymentsForCardInRange(cardId, start, end) {
    return getCreditCardMovementsInRange(start, end)
        .filter((m) => m.cardId === cardId && m.type === 'repayment')
        .reduce((s, m) => s + m.amount, 0);
}

function sumScheduledDebtPaymentsInRange(startDate, endDate) {
    if (typeof getScheduledDebtPaymentsOnDate !== 'function' || !startDate || !endDate) return 0;
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

    let total = 0;
    const seen = new Set();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = localIsoDate(d);
        getScheduledDebtPaymentsOnDate(dateStr).forEach((payment) => {
            const key = `${payment.type}:${payment.id}:${dateStr}`;
            if (seen.has(key)) return;
            seen.add(key);
            total += payment.amount;
        });
    }
    return Math.round(total * 100) / 100;
}

function sumDebtInstallmentPaymentsInRange(startDate, endDate) {
    const loanPaid = getActiveLoans().reduce(
        (sum, loan) => sum + sumLoanInstallmentPaymentsForLoanInRange(loan, startDate, endDate),
        0
    );
    const cardPaid = sumCardRepaymentsInRange(startDate, endDate);
    return Math.round((loanPaid + cardPaid) * 100) / 100;
}

function getDebtInstallmentRemainingSummary(startDate, endDate, options = {}) {
    const rows = collectDebtInstallmentRows({ startDate, endDate });
    const filtered = options.loansOnly
        ? rows.filter((row) => row.kind === 'loan')
        : rows;
    const planned = filtered.reduce((sum, row) => sum + (row.scheduledAmount || 0), 0);
    const paid = filtered.reduce((sum, row) => sum + (row.paidAmount || 0), 0);
    const remaining = filtered.reduce((sum, row) => sum + (row.amount || 0), 0);
    return {
        planned: Math.round(planned * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        remaining: Math.round(remaining * 100) / 100
    };
}

function getDebtPaymentsInPeriod(ctx) {
    const loanPayments = ctx.periodTx
        .filter((t) => t.type === 'expense' && isLoanOrDebtPayment(t))
        .reduce((s, t) => s + t.amount, 0);
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const cardRepayments = sumCardRepaymentsInRange(start, end);
    return { loanPayments, cardRepayments, total: loanPayments + cardRepayments };
}

function getChartParamsFromCtx(ctx) {
    let chartPeriod = ctx.period;
    let chartRangeStart = ctx.rangeStart;
    let chartRangeEnd = ctx.rangeEnd;
    if (ctx.mode === 'month') {
        chartPeriod = 'month';
    } else if (ctx.mode === 'compare' && ctx.periodA) {
        chartPeriod = 'range';
        chartRangeStart = ctx.periodA.start;
        chartRangeEnd = ctx.periodA.end;
    }
    return { chartPeriod, chartRangeStart, chartRangeEnd };
}

function buildDebtPaymentsMonthData(ctx) {
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromCtx(ctx);
    const { monthLabels, monthKeys } = buildReportsMonthChartData(
        chartPeriod,
        ctx.periodTx,
        chartRangeStart,
        chartRangeEnd
    );
    const loanData = [];
    const cardData = [];
    monthKeys.forEach((key) => {
        const { start, end } = monthKeyToDateRange(key);
        loanData.push(sumLoanDebtPaymentsInRange(start, end));
        cardData.push(sumCardRepaymentsInRange(start, end));
    });
    return { monthLabels, loanData, cardData };
}

function sumCardDebtIncreasesInRange(start, end) {
    const transfers = getCreditCardMovementsInRange(start, end)
        .filter((m) => m.type === 'transfer_out')
        .reduce((s, m) => s + m.amount, 0);
    const purchases = getTransactionsInRange(start, end)
        .filter((t) => t.type === 'expense' && t.creditCardId)
        .reduce((s, t) => s + t.amount, 0);
    return transfers + purchases;
}

function buildDebtBalanceTrendData(ctx) {
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromCtx(ctx);
    const { monthLabels, monthKeys } = buildReportsMonthChartData(
        chartPeriod,
        ctx.periodTx,
        chartRangeStart,
        chartRangeEnd
    );
    if (!monthKeys.length) {
        return { monthLabels: [], totalData: [], loanData: [], cardData: [] };
    }

    const loanEnd = getLoanCapitalLeft();
    const cardEnd = getCreditCardDebtTotal();
    const totalData = new Array(monthKeys.length);
    const loanData = new Array(monthKeys.length);
    const cardData = new Array(monthKeys.length);

    totalData[totalData.length - 1] = loanEnd + cardEnd;
    loanData[loanData.length - 1] = loanEnd;
    cardData[cardData.length - 1] = cardEnd;

    for (let i = monthKeys.length - 2; i >= 0; i -= 1) {
        const { start, end } = monthKeyToDateRange(monthKeys[i + 1]);
        const loanPayments = sumLoanDebtPaymentsInRange(start, end);
        const cardRepayments = sumCardRepaymentsInRange(start, end);
        const cardIncreases = sumCardDebtIncreasesInRange(start, end);

        loanData[i] = Math.max(0, loanData[i + 1] + loanPayments);
        cardData[i] = Math.max(0, cardData[i + 1] + cardRepayments - cardIncreases);
        totalData[i] = loanData[i] + cardData[i];
    }

    return { monthLabels, totalData, loanData, cardData };
}

function addMonthsToToday(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return localIsoDate(d);
}

function medianOf(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getRecentCardRepaymentAverage(cardId, months = 3) {
    const end = localIsoDate(new Date());
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const start = localIsoDate(startDate);
    const repayments = getCreditCardMovementsInRange(start, end)
        .filter((m) => m.cardId === cardId && m.type === 'repayment');
    if (!repayments.length) return 0;

    const byMonth = {};
    repayments.forEach((m) => {
        const key = m.date.slice(0, 7);
        byMonth[key] = (byMonth[key] || 0) + m.amount;
    });
    let monthTotals = Object.values(byMonth);

    if (monthTotals.length === 1) {
        const card = typeof getCreditCardById === 'function' ? getCreditCardById(cardId) : null;
        const only = monthTotals[0];
        const balance = card?.currentBalance || 0;
        if (balance > 0 && only > balance * 1.05) return 0;
        return only;
    }

    const sorted = [...monthTotals].sort((a, b) => a - b);
    if (sorted.length === 2 && sorted[1] > sorted[0] * 2) {
        monthTotals = [sorted[0]];
    } else {
        const median = medianOf(sorted);
        const cap = Math.max(median * 2, median + 500);
        monthTotals = sorted.filter((total) => total <= cap);
    }
    if (!monthTotals.length) return 0;
    return Math.round(medianOf(monthTotals) * 100) / 100;
}

function estimateLoanPayoff(loan) {
    const capital = loan.currentCapitalLeft || 0;
    if (!capital) return { label: 'Spłacony', detail: '' };

    if (loan.details?.endDate) {
        return {
            label: formatTxDate(loan.details.endDate),
            detail: 'termin z umowy'
        };
    }
    if (loan.details?.remainingInstallments > 0) {
        const months = loan.details.remainingInstallments;
        return {
            label: `~${months} mies.`,
            detail: `${loan.details.remainingInstallments} rat wg umowy`
        };
    }
    if (loan.nextInstallmentAmount > 0) {
        const months = Math.ceil(capital / loan.nextInstallmentAmount);
        return {
            label: `~${months} mies.`,
            detail: `przy racie ${formatPlnAmount(loan.nextInstallmentAmount)}`
        };
    }
    return { label: '—', detail: 'brak danych o racie' };
}

function estimateCardPayoff(card) {
    const balance = card.currentBalance || 0;
    if (!balance) return { label: 'Spłacona', detail: '' };

    const avg = getRecentCardRepaymentAverage(card.id);
    if (avg < 1) {
        return { label: '—', detail: 'brak ostatnich spłat do wyliczenia' };
    }
    const months = Math.ceil(balance / avg);
    return {
        label: `~${months} mies.`,
        detail: `przy śr. ${formatPlnAmount(avg)}/mies. (3 mies.)`
    };
}

function classifyLoanPaymentAmount(loan, amount) {
    const inst = loan.nextInstallmentAmount || 0;
    if (!inst || amount <= inst * 1.05) {
        return { regular: amount, over: 0 };
    }
    return { regular: inst, over: amount - inst };
}

function analyzeLoanPaymentsInPeriod(ctx) {
    let regular = 0;
    let over = 0;
    getActiveLoans().forEach((loan) => {
        ctx.periodTx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .forEach((t) => {
                const noteOver = /nadpłat|nadplat/i.test(t.note || '');
                if (noteOver) {
                    over += t.amount;
                    return;
                }
                const split = classifyLoanPaymentAmount(loan, t.amount);
                regular += split.regular;
                over += split.over;
            });
    });
    return { regular, over, total: regular + over };
}

function buildDebtSplitData(ctx) {
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const slices = [];

    getActiveLoans().forEach((loan) => {
        const amount = ctx.periodTx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        if (amount > 0) slices.push({ label: getLoanDisplayName(loan), amount, kind: 'loan', id: loan.id });
    });

    getActiveCreditCards().forEach((card) => {
        const amount = getCreditCardMovementsInRange(start, end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);
        if (amount > 0) slices.push({ label: `${card.name} (karta)`, amount, kind: 'card', id: card.id });
    });

    slices.sort((a, b) => b.amount - a.amount);
    return slices;
}

function buildDebtSplitDrillData(ctx, drillLabel = null) {
    if (!drillLabel) return buildDebtSplitData(ctx);

    const rootSlices = buildDebtSplitData(ctx);
    const match = rootSlices.find((slice) => slice.label === drillLabel);
    if (!match) return [];

    if (match.kind === 'loan') {
        const loan = getActiveLoans().find((l) => l.id === match.id);
        if (!loan) return [];
        const txs = ctx.periodTx.filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan));
        const { sums } = getDashboardChartTransactionSums(txs);
        return Object.entries(sums).map(([label, amount]) => ({ label, amount }));
    }

    const card = getActiveCreditCards().find((c) => c.id === match.id);
    if (!card) return [];
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const movements = getCreditCardMovementsInRange(start, end)
        .filter((m) => m.cardId === card.id && m.type === 'repayment');
    if (!movements.length) return [];
    const { sums } = getDashboardChartTransactionSums(movements.map((m) => ({
        date: m.date,
        amount: m.amount,
        note: 'Spłata karty',
        subCategory: card.name,
        mainCategory: 'Długi'
    })));
    return Object.entries(sums).map(([label, amount]) => ({ label, amount }));
}
