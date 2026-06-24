/* Raporty — analityka długów */

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

function sumLoanPaymentsForLoanInRange(loan, start, end) {
    return getTransactionsInRange(start, end)
        .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
        .reduce((s, t) => s + t.amount, 0);
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
    const monthTotals = Object.values(byMonth);
    return monthTotals.reduce((s, v) => s + v, 0) / monthTotals.length;
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
        if (amount > 0) slices.push({ label: getLoanDisplayName(loan), amount });
    });

    getActiveCreditCards().forEach((card) => {
        const amount = getCreditCardMovementsInRange(start, end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);
        if (amount > 0) slices.push({ label: `${card.name} (karta)`, amount });
    });

    slices.sort((a, b) => b.amount - a.amount);
    return slices;
}

function renderReportsDebtTrendChart(ctx) {
    const canvas = document.getElementById('reportsDebtTrendChart');
    if (!canvas) return;

    const { monthLabels, totalData, loanData, cardData } = buildDebtBalanceTrendData(ctx);
    const theme = getReportsChartTheme();
    const chartCtx = canvas.getContext('2d');
    if (reportsDebtTrendChartInstance) reportsDebtTrendChartInstance.destroy();

    if (!monthLabels.length) return;

    const totalColor = isLightTheme() ? 'rgba(15, 23, 42, 0.9)' : 'rgba(245, 245, 245, 0.9)';
    const loanColor = isLightTheme() ? 'rgba(99, 102, 241, 0.85)' : 'rgba(129, 140, 248, 0.85)';
    const cardColor = isLightTheme() ? 'rgba(13, 148, 136, 0.85)' : 'rgba(45, 212, 191, 0.85)';

    reportsDebtTrendChartInstance = new Chart(chartCtx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'Razem',
                    data: totalData,
                    borderColor: totalColor,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 3,
                    borderWidth: 2.5
                },
                {
                    label: 'Kredyty',
                    data: loanData,
                    borderColor: loanColor,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: 1.5,
                    borderDash: [4, 4]
                },
                {
                    label: 'Karty',
                    data: cardData,
                    borderColor: cardColor,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 2,
                    borderWidth: 1.5,
                    borderDash: [4, 4]
                }
            ]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsDebtSplitChart(ctx, canvasId = 'reportsDebtSplitChart', legendId = 'reports-debt-split-legend') {
    const canvas = document.getElementById(canvasId);
    const legendEl = document.getElementById(legendId);
    if (!canvas) return;

    const slices = buildDebtSplitData(ctx);
    const isTabChart = canvasId === 'reportsDebtsSplitChart';
    if (isTabChart) {
        if (reportsDebtsTabSplitInstance) reportsDebtsTabSplitInstance.destroy();
    } else if (reportsDebtSplitChartInstance) {
        reportsDebtSplitChartInstance.destroy();
    }

    if (!slices.length) {
        if (legendEl) legendEl.innerHTML = '<p class="reports-hint">Brak spłat w wybranym okresie.</p>';
        return;
    }

    const labels = slices.map((s) => s.label);
    const values = slices.map((s) => s.amount);
    const colors = getChartSliceColors(labels, 'expense');
    const borderColor = getChartBorderColor();

    const chart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor,
                borderWidth: 3,
                borderRadius: 5,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.35,
            cutout: '58%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: getReportsChartTheme().tooltipBg,
                    callbacks: {
                        label: (context) => `${context.label}: ${formatPlnAmount(context.parsed)}`
                    }
                }
            }
        }
    });

    if (isTabChart) reportsDebtsTabSplitInstance = chart;
    else reportsDebtSplitChartInstance = chart;

    if (legendEl) {
        const total = values.reduce((s, v) => s + v, 0);
        legendEl.innerHTML = slices.map((slice, i) => {
            const pct = total > 0 ? Math.round((slice.amount / total) * 100) : 0;
            return `<div class="reports-debt-split-item">
                <span class="reports-debt-split-dot" style="background:${colors[i]}"></span>
                <span class="reports-debt-split-label">${escapeHtml(slice.label)}</span>
                <strong>${formatPlnAmount(slice.amount)}</strong>
                <em>${pct}%</em>
            </div>`;
        }).join('');
    }
}

function renderReportsDebtForecast(targetId = 'reports-debt-forecast') {
    const el = document.getElementById(targetId);
    if (!el) return;

    const loans = getActiveLoans();
    const cards = getActiveCreditCards();
    if (!loans.length && !cards.length) {
        el.innerHTML = '';
        return;
    }

    const loanRows = loans.map((loan) => {
        const est = estimateLoanPayoff(loan);
        return `<div class="debt-forecast-row loan-clickable" role="button" tabindex="0"
            onclick="openLoanDetails('${escapeHtml(loan.id)}')"
            onkeydown="if (event.key === 'Enter') openLoanDetails('${escapeHtml(loan.id)}')">
            <div class="debt-forecast-info">
                <strong>${escapeHtml(getLoanDisplayName(loan))}</strong>
                <span class="reports-hint">${est.detail}</span>
            </div>
            <div class="debt-forecast-meta">
                <span class="label">Kapitał</span>
                <strong>${formatPlnAmount(loan.currentCapitalLeft || 0)}</strong>
                <span class="debt-forecast-date">${est.label}</span>
            </div>
        </div>`;
    }).join('');

    const cardRows = cards.map((card) => {
        const est = estimateCardPayoff(card);
        return `<div class="debt-forecast-row credit-clickable" role="button" tabindex="0"
            onclick="openCreditCardDetails('${escapeHtml(card.id)}')"
            onkeydown="if (event.key === 'Enter') openCreditCardDetails('${escapeHtml(card.id)}')">
            <div class="debt-forecast-info">
                <strong>${escapeHtml(card.name)}</strong>
                <span class="reports-hint">${est.detail}</span>
            </div>
            <div class="debt-forecast-meta">
                <span class="label">Zadłużenie</span>
                <strong>${formatPlnAmount(card.currentBalance)}</strong>
                <span class="debt-forecast-date">${est.label}</span>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <div class="reports-debt-forecast-box">
            <h3 class="analysis-subsection-label">Prognoza spłaty</h3>
            <p class="reports-hint">Szacunek na podstawie rat z umowy lub średniej spłat kart.</p>
            ${loanRows}${cardRows}
        </div>`;
}

function renderReportsDebtOverpayment(ctx, targetId = 'reports-debt-overpayment') {
    const el = document.getElementById(targetId);
    if (!el) return;

    const { regular, over, total } = analyzeLoanPaymentsInPeriod(ctx);
    if (!total) {
        el.innerHTML = '';
        return;
    }

    const overPct = Math.round((over / total) * 100);
    el.innerHTML = `
        <div class="reports-debt-overpayment-box">
            <h3 class="analysis-subsection-label">Raty vs nadpłaty (kredyty)</h3>
            <div class="loan-report-grid">
                <div><span class="label">Raty</span><strong>${formatPlnAmount(regular)}</strong></div>
                <div><span class="label">Nadpłaty</span><strong class="income">${formatPlnAmount(over)}</strong></div>
                <div><span class="label">Razem</span><strong class="expense">${formatPlnAmount(total)}</strong></div>
                <div><span class="label">Udział nadpłat</span><strong>${overPct}%</strong></div>
            </div>
            <div class="progress-bar-bg" style="margin-top:12px">
                <div class="progress-bar-fill" style="width:${overPct}%;background:var(--success)"></div>
            </div>
        </div>`;
}

function renderReportsDebtDsr(ctx) {
    const el = document.getElementById('reports-debt-dsr');
    if (!el) return;

    const income = ctx.periodTx
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const { loanPayments, cardRepayments, total } = getDebtPaymentsInPeriod(ctx);
    const dsr = income > 0 ? Math.round((total / income) * 100) : null;
    const dsrClass = dsr === null ? '' : (dsr > 40 ? 'expense' : (dsr > 25 ? '' : 'income'));

    el.innerHTML = `
        <div class="reports-debt-dsr-box">
            <div class="reports-debt-dsr-hero">
                <span class="label">Obciążenie dochodem (DSR)</span>
                <strong class="${dsrClass}">${dsr !== null ? `${dsr}%` : '—'}</strong>
            </div>
            <p class="reports-hint reports-debt-dsr-hint">Udział wpływów przeznaczony na spłaty w wybranym okresie.</p>
            <div class="loan-report-grid reports-debt-dsr-grid">
                <div><span class="label">Raty kredytów</span><strong class="expense">${formatPlnAmount(loanPayments)}</strong></div>
                <div><span class="label">Spłaty kart</span><strong class="expense">${formatPlnAmount(cardRepayments)}</strong></div>
                <div><span class="label">Razem spłaty</span><strong class="expense">${formatPlnAmount(total)}</strong></div>
                <div><span class="label">Wpływy w okresie</span><strong class="income">${formatPlnAmount(income)}</strong></div>
            </div>
        </div>`;
}

function renderReportsCreditCardSummary(ctx, targetId = 'reports-credit-card-summary') {
    const el = document.getElementById(targetId);
    if (!el) return;

    const cards = getActiveCreditCards();
    if (!cards.length) {
        el.innerHTML = '';
        return;
    }

    const { start, end } = getPeriodBoundsFromCtx(ctx);

    el.innerHTML = `<div class="analysis-subsection-label">Karty kredytowe</div>` + cards.map((card) => {
        const available = getCreditCardAvailable(card);
        const usedPct = card.limit > 0 ? Math.round((card.currentBalance / card.limit) * 100) : 0;
        const cardId = escapeHtml(card.id);
        const repayments = getCreditCardMovementsInRange(start, end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);
        const transfers = getCreditCardMovementsInRange(start, end)
            .filter((m) => m.cardId === card.id && m.type === 'transfer_out')
            .reduce((s, m) => s + m.amount, 0);

        return `<div class="analysis-loan-click credit-clickable" role="button" tabindex="0"
            onclick="openCreditCardDetails('${cardId}')" onkeydown="if (event.key === 'Enter') openCreditCardDetails('${cardId}')">
            <div class="analysis-subsection-label">${escapeHtml(card.name)}</div>
            <div class="loan-report-grid">
                <div><span class="label">Zadłużenie</span><strong>${formatPlnAmount(card.currentBalance)}</strong></div>
                <div><span class="label">Wykorzystanie</span><strong>${usedPct}%</strong></div>
                <div><span class="label">Spłaty w okresie</span><strong class="expense">${formatPlnAmount(repayments)}</strong></div>
                <div><span class="label">Przelewy z karty</span><strong>${formatPlnAmount(transfers)}</strong></div>
            </div>
            <div class="progress-bar-bg" style="margin-top:12px"><div class="progress-bar-fill" style="width:${Math.min(100, usedPct)}%;background:var(--accent)"></div></div>
            <p class="reports-hint" style="margin-top:8px">Wolne: ${formatPlnAmount(available)} z ${formatPlnAmount(card.limit)}</p>
        </div>`;
    }).join('');
}

function renderReportsDebtPaymentsChart(ctx, canvasId = 'reportsDebtChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { monthLabels, loanData, cardData } = buildDebtPaymentsMonthData(ctx);
    const theme = getReportsChartTheme();
    const chartCtx = canvas.getContext('2d');
    const isTabChart = canvasId === 'reportsDebtsChart';
    if (isTabChart) {
        if (reportsDebtsTabChartInstance) reportsDebtsTabChartInstance.destroy();
    } else if (reportsDebtChartInstance) {
        reportsDebtChartInstance.destroy();
    }

    const debtColor = isLightTheme() ? 'rgba(99, 102, 241, 0.85)' : 'rgba(129, 140, 248, 0.85)';
    const cardColor = isLightTheme() ? 'rgba(13, 148, 136, 0.85)' : 'rgba(45, 212, 191, 0.85)';

    const chart = new Chart(chartCtx, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'Raty kredytów',
                    data: loanData,
                    backgroundColor: debtColor,
                    borderRadius: 6,
                    borderSkipped: false
                },
                {
                    label: 'Spłaty kart',
                    data: cardData,
                    backgroundColor: cardColor,
                    borderRadius: 6,
                    borderSkipped: false
                }
            ]
        },
        options: getReportsChartOptions(theme)
    });

    if (isTabChart) reportsDebtsTabChartInstance = chart;
    else reportsDebtChartInstance = chart;
}

function renderReportsLoanSummary(ctx, targetId = 'reports-loan-summary') {
    const el = document.getElementById(targetId);
    if (!el) return;

    const loans = getActiveLoans();
    if (!loans.length) {
        el.innerHTML = '<p class="reports-hint">Brak aktywnych kredytów.</p>';
        return;
    }

    el.innerHTML = loans.map((loan) => {
        const paidPct = Math.round(getLoanPaidPercent(loan));
        const loanName = escapeHtml(getLoanDisplayName(loan));
        const loanId = escapeHtml(loan.id);

        const debtPayments = ctx.periodTx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);

        return `<div class="analysis-loan-click loan-clickable" role="button" tabindex="0"
            onclick="openLoanDetails('${loanId}')" onkeydown="if (event.key === 'Enter') openLoanDetails('${loanId}')">
            <div class="analysis-subsection-label">${loanName}</div>
            <div class="loan-report-grid">
                <div><span class="label">Spłacono</span><strong>${paidPct}%</strong></div>
                <div><span class="label">Kapitał</span><strong>${formatPlnAmount(loan.currentCapitalLeft || 0)}</strong></div>
                <div><span class="label">Raty/nadpłaty w okresie</span><strong class="expense">${formatPlnAmount(debtPayments)}</strong></div>
                <div><span class="label">Następna rata</span><strong>${loan.nextInstallmentAmount ? formatPlnAmount(loan.nextInstallmentAmount) : '—'}</strong></div>
            </div>
            <div class="progress-bar-bg" style="margin-top:12px"><div class="progress-bar-fill" style="width:${paidPct}%;background:var(--success)"></div></div>
        </div>`;
    }).join('');
}

function renderReportsYearReview(ctx) {
    const el = document.getElementById('reports-year-review');
    if (!el) return;

    let year = new Date().getFullYear();
    if (ctx.mode === 'year' && ctx.period !== 'all') year = parseInt(ctx.period, 10);
    else if (ctx.rangeStart) year = parseInt(ctx.rangeStart.slice(0, 4), 10);

    const yearTx = appState.transactions.filter((t) => t.date.startsWith(String(year)));
    if (!yearTx.length) {
        el.innerHTML = '<div class="empty-state"><p>Brak danych za rok</p></div>';
        return;
    }

    const s = summarizePeriod(yearTx);
    const expenses = yearTx.filter((t) => t.type === 'expense');
    const biggest = [...expenses].sort((a, b) => b.amount - a.amount)[0];
    const byDay = {};
    expenses.forEach((t) => { byDay[t.date] = (byDay[t.date] || 0) + t.amount; });
    const costliestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];

    const catSums = {};
    expenses.forEach((t) => { catSums[t.mainCategory] = (catSums[t.mainCategory] || 0) + t.amount; });
    const topCat = Object.entries(catSums).sort((a, b) => b[1] - a[1])[0];

    el.innerHTML = `
        <div class="year-review-hero">${year} — podsumowanie roku</div>
        <div class="year-review-grid">
            <div><span>Wydatki</span><strong>${formatPlnAmount(s.expense)}</strong></div>
            <div><span>Wpływy</span><strong>${formatPlnAmount(s.income)}</strong></div>
            <div><span>Oszczędności</span><strong>${s.savings}%</strong></div>
            <div><span>Top kategoria</span><strong>${topCat ? escapeHtml(topCat[0]) : '—'}</strong></div>
            <div><span>Najdroższy dzień</span><strong>${costliestDay ? formatTxDate(costliestDay[0]) : '—'}</strong></div>
            <div><span>Największy wydatek</span><strong>${biggest ? formatPlnAmount(biggest.amount) : '—'}</strong></div>
        </div>`;
}

function buildReportsPrintHtml(ctx, savingsRate) {
    const s = summarizePeriod(ctx.periodTx);
    return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><title>Raport Portfel</title>
        <style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#f5f5f5}</style></head><body>
        <h1>Raport finansowy — ${escapeHtml(ctx.label)}</h1>
        <p>Wpływy: ${formatPlnAmount(s.income)} | Wydatki: ${formatPlnAmount(s.expense)} | Bilans: ${formatPlnAmount(s.balance)} | Oszczędności: ${savingsRate}%</p>
        <table><thead><tr><th>Data</th><th>Typ</th><th>Kategoria</th><th>Kwota</th><th>Notatka</th></tr></thead><tbody>
        ${ctx.periodTx.sort((a, b) => a.date.localeCompare(b.date)).map((t) => `<tr>
            <td>${t.date}</td><td>${t.type === 'expense' ? 'Wydatek' : 'Wpływ'}</td>
            <td>${escapeHtml(t.mainCategory)}${t.subCategory !== '[Bez podkategorii]' ? ' / ' + escapeHtml(t.subCategory) : ''}</td>
            <td>${t.amount.toFixed(2)} zł</td><td>${escapeHtml(t.note || '')}</td>
        </tr>`).join('')}
        </tbody></table></body></html>`;
}

function estimateAnnualInterest(loan) {
    const capital = loan.currentCapitalLeft || 0;
    const rate = loan.interestRate || 0;
    if (!capital || !rate) return 0;
    return capital * (rate / 100);
}

function simulateOverpaymentMonths(loan, extraMonthly) {
    const capital = loan.currentCapitalLeft || 0;
    const installment = loan.nextInstallmentAmount || 0;
    if (!capital || !installment) return null;

    let baseMonths;
    if (loan.details?.remainingInstallments > 0) {
        baseMonths = loan.details.remainingInstallments;
    } else {
        baseMonths = Math.ceil(capital / installment);
    }

    const extra = Math.max(0, extraMonthly);
    const totalPayment = installment + extra;
    const newMonths = Math.ceil(capital / totalPayment);
    const annualInterestSaved = estimateAnnualInterest(loan) * (Math.max(0, baseMonths - newMonths) / 12);

    return {
        baseMonths,
        newMonths,
        savedMonths: Math.max(0, baseMonths - newMonths),
        installment,
        extraMonthly: extra,
        totalPayment,
        annualInterestSaved
    };
}

function populateDebtsScenarioLoanSelect() {
    const select = document.getElementById('debts-scenario-loan');
    if (!select) return;
    const loans = getActiveLoans().filter((l) => l.nextInstallmentAmount > 0 && l.currentCapitalLeft > 0);
    if (!loans.length) {
        select.innerHTML = '<option value="">— brak —</option>';
        select.disabled = true;
        debtsScenarioLoanId = null;
        return;
    }
    select.disabled = false;
    if (!debtsScenarioLoanId || !loans.some((l) => l.id === debtsScenarioLoanId)) {
        debtsScenarioLoanId = loans[0].id;
    }
    select.innerHTML = loans.map((l) =>
        `<option value="${escapeHtml(l.id)}"${l.id === debtsScenarioLoanId ? ' selected' : ''}>${escapeHtml(getLoanDisplayName(l))}</option>`
    ).join('');
}

function setDebtsScenarioExtra(amount) {
    debtsScenarioExtra = amount;
    const input = document.getElementById('debts-scenario-extra');
    if (input) input.value = String(amount);
    document.querySelectorAll('.debts-scenario-chips .toggle-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.textContent === `+${amount}`);
    });
    onDebtsScenarioChange();
}

function onDebtsScenarioChange() {
    debtsScenarioLoanId = document.getElementById('debts-scenario-loan')?.value || debtsScenarioLoanId;
    debtsScenarioExtra = parseFloat(document.getElementById('debts-scenario-extra')?.value) || 0;
    renderReportsDebtScenarios(getReportsPeriodContext());
}

function renderReportsDebtsHero(ctx) {
    const totalEl = document.getElementById('reports-debts-hero-total');
    const metaEl = document.getElementById('reports-debts-hero-meta');
    if (!totalEl) return;

    const totalDebt = getLoanSummaryTotal();
    const loanDebt = getLoanCapitalLeft();
    const cardDebt = getCreditCardDebtTotal();
    const { loanPayments, cardRepayments, total } = getDebtPaymentsInPeriod(ctx);
    const income = ctx.periodTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const dsr = income > 0 ? Math.round((total / income) * 100) : null;

    totalEl.textContent = formatPlnAmount(totalDebt);
    if (metaEl) {
        metaEl.textContent = [
            `kredyty ${formatPlnAmount(loanDebt)}`,
            `karty ${formatPlnAmount(cardDebt)}`,
            `spłaty w okresie ${formatPlnAmount(total)}`,
            dsr !== null ? `DSR ${dsr}%` : ''
        ].filter(Boolean).join(' · ');
    }
}

function renderReportsDebtInterest() {
    const el = document.getElementById('reports-debt-interest');
    if (!el) return;

    const loans = getActiveLoans().filter((l) => (l.currentCapitalLeft || 0) > 0);
    if (!loans.length) {
        el.innerHTML = '<p class="reports-hint">Brak aktywnych kredytów.</p>';
        return;
    }

    let totalAnnual = 0;
    const rows = loans.map((loan) => {
        const annual = estimateAnnualInterest(loan);
        const monthly = annual / 12;
        totalAnnual += annual;
        const loanId = escapeHtml(loan.id);
        return `<div class="debt-interest-row loan-clickable" role="button" tabindex="0"
            onclick="openLoanDetails('${loanId}')" onkeydown="if (event.key === 'Enter') openLoanDetails('${loanId}')">
            <div class="debt-interest-info">
                <strong>${escapeHtml(getLoanDisplayName(loan))}</strong>
                <span class="reports-hint">${loan.interestRate ? `${loan.interestRate}%` : 'brak stopy'} · kapitał ${formatPlnAmount(loan.currentCapitalLeft)}</span>
            </div>
            <div class="debt-interest-amounts">
                <div><span class="label">/ rok</span><strong class="expense">${formatPlnAmount(annual)}</strong></div>
                <div><span class="label">/ mies.</span><strong>${formatPlnAmount(monthly)}</strong></div>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `${rows}
        <div class="debt-interest-total">
            <span>Łączny szacunek odsetek / rok</span>
            <strong class="expense">${formatPlnAmount(totalAnnual)}</strong>
        </div>`;
}

function renderReportsDebtLtv() {
    const el = document.getElementById('reports-debt-ltv');
    if (!el) return;

    const mortgages = getActiveLoans().filter((l) => isMortgageLoan(l) && (l.details?.propertyValue || 0) > 0);
    if (!mortgages.length) {
        el.innerHTML = '<p class="reports-hint">Brak hipoteki z wartością nieruchomości w szczegółach umowy.</p>';
        return;
    }

    el.innerHTML = mortgages.map((loan) => {
        const propertyValue = loan.details.propertyValue;
        const capital = loan.currentCapitalLeft || 0;
        const ltv = propertyValue > 0 ? (capital / propertyValue) * 100 : 0;
        const contractLtv = loan.details.ltvPercent || 0;
        const loanId = escapeHtml(loan.id);
        const ltvClass = ltv > 80 ? 'expense' : '';

        return `<div class="debt-ltv-row loan-clickable" role="button" tabindex="0"
            onclick="openLoanDetails('${loanId}')" onkeydown="if (event.key === 'Enter') openLoanDetails('${loanId}')">
            <div class="debt-ltv-head">
                <strong>${escapeHtml(getLoanDisplayName(loan))}</strong>
                <span class="debt-ltv-value ${ltvClass}">${ltv.toFixed(1)}% LTV</span>
            </div>
            <div class="loan-report-grid">
                <div><span class="label">Kapitał</span><strong>${formatPlnAmount(capital)}</strong></div>
                <div><span class="label">Wartość nieruchomości</span><strong>${formatPlnAmount(propertyValue)}</strong></div>
                <div><span class="label">LTV z umowy</span><strong>${contractLtv ? `${contractLtv}%` : '—'}</strong></div>
                <div><span class="label">Wolny kapitał</span><strong class="income">${formatPlnAmount(Math.max(0, propertyValue - capital))}</strong></div>
            </div>
            <div class="progress-bar-bg" style="margin-top:12px">
                <div class="progress-bar-fill" style="width:${Math.min(100, ltv)}%;background:${ltv > 80 ? 'var(--danger)' : 'var(--accent)'}"></div>
            </div>
        </div>`;
    }).join('');
}

function renderReportsDebtScenarios(ctx) {
    const el = document.getElementById('reports-debt-scenarios');
    if (!el) return;

    const loan = getLoanById(debtsScenarioLoanId);
    if (!loan) {
        el.innerHTML = '<p class="reports-hint">Wybierz kredyt z ratą, aby policzyć scenariusz.</p>';
        return;
    }

    const sim = simulateOverpaymentMonths(loan, debtsScenarioExtra);
    if (!sim) {
        el.innerHTML = '<p class="reports-hint">Brak danych o racie dla tego kredytu.</p>';
        return;
    }

    const savedYears = Math.floor(sim.savedMonths / 12);
    const savedRemMonths = sim.savedMonths % 12;
    const savedLabel = sim.savedMonths
        ? (savedYears > 0 ? `${savedYears} lat ${savedRemMonths} mies.` : `${sim.savedMonths} mies.`)
        : 'brak skrócenia';
    const liquidity = typeof getLiquidityAfterOverpayment === 'function'
        ? getLiquidityAfterOverpayment(debtsScenarioExtra)
        : null;

    el.innerHTML = `
        <div class="debt-scenario-result">
            <div class="loan-report-grid">
                <div><span class="label">Obecna rata</span><strong>${formatPlnAmount(sim.installment)}</strong></div>
                <div><span class="label">Z nadpłatą +${formatPlnAmount(sim.extraMonthly)}</span><strong class="income">${formatPlnAmount(sim.totalPayment)}</strong></div>
                <div><span class="label">Czas spłaty teraz</span><strong>~${sim.baseMonths} mies.</strong></div>
                <div><span class="label">Po nadpłacie</span><strong>~${sim.newMonths} mies.</strong></div>
            </div>
            ${liquidity ? `<div class="loan-report-grid debt-scenario-liquidity">
                <div><span class="label">Gotówka operacyjna</span><strong>${formatPlnAmount(liquidity.liquid)}</strong></div>
                <div><span class="label">Po nadpłacie / mies.</span><strong class="${liquidity.after < 0 ? 'expense' : ''}">${formatPlnAmount(liquidity.after)}</strong></div>
                <div><span class="label">Rezerwa po nadpłacie</span><strong>${liquidity.runway !== null ? `${liquidity.runway.toFixed(1)} mies.` : '—'}</strong></div>
            </div>` : ''}
            <div class="debt-scenario-highlight">
                <span>Skrócenie</span>
                <strong class="income">${savedLabel}</strong>
            </div>
            <p class="reports-hint">Szacunek uproszczony: stała rata + nadpłata, bez zmian oprocentowania. Oszczędność odsetek ~${formatPlnAmount(sim.annualInterestSaved)} (przybliżenie).</p>
        </div>`;
}

function renderReportsDebtsSection(ctx) {
    renderReportsDebtsHero(ctx);
    renderReportsDebtInterest();
    renderReportsDebtLtv();
    populateDebtsScenarioLoanSelect();
    renderReportsDebtScenarios(ctx);
    renderReportsDebtForecast('reports-debts-forecast');
    renderReportsDebtOverpayment(ctx, 'reports-debts-overpayment');
    renderReportsLoanSummary(ctx, 'reports-debts-loans');
    renderReportsCreditCardSummary(ctx, 'reports-debts-cards');
    renderReportsDebtPaymentsChart(ctx, 'reportsDebtsChart');
    renderReportsDebtSplitChart(ctx, 'reportsDebtsSplitChart', 'reports-debts-split-legend');
}
