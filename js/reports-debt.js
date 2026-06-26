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

let reportsDebtSplitDrillLabel = null;

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

function updateDebtSplitDrillChrome(drillLabel) {
    const titleEl = document.getElementById('reports-debt-split-title');
    const backBtn = document.getElementById('btn-reset-reports-debt-split');
    if (titleEl) {
        titleEl.textContent = drillLabel ? `Podział: ${drillLabel}` : 'Podział spłat';
    }
    backBtn?.classList.toggle('hidden', !drillLabel);
}

function resetReportsDebtSplitDrill(silent = false) {
    reportsDebtSplitDrillLabel = null;
    updateDebtSplitDrillChrome(null);
    if (!silent && reportsLastCtx) {
        renderReportsDebtSplitChart(reportsLastCtx, 'reportsDebtsSplitChart', 'reports-debts-split-legend');
    }
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

function renderReportsDebtSplitChart(ctx, canvasId = 'reportsDebtsSplitChart', legendId = 'reports-debts-split-legend') {
    const canvas = document.getElementById(canvasId);
    const legendEl = document.getElementById(legendId);
    if (!canvas) return;

    const isTabChart = canvasId === 'reportsDebtsSplitChart';
    const drillLabel = isTabChart ? reportsDebtSplitDrillLabel : null;
    const slices = isTabChart ? buildDebtSplitDrillData(ctx, drillLabel) : buildDebtSplitData(ctx);
    if (isTabChart) updateDebtSplitDrillChrome(drillLabel);
    if (isTabChart) {
        if (reportsDebtsTabSplitInstance) reportsDebtsTabSplitInstance.destroy();
    } else if (reportsDebtSplitChartInstance) {
        reportsDebtSplitChartInstance.destroy();
    }

    if (!slices.length) {
        if (legendEl) {
            const backRow = drillLabel
                ? `<button type="button" class="reports-allocation-legend-back" onclick="resetReportsDebtSplitDrill()"><span aria-hidden="true">←</span> Wróć do podziału</button>`
                : '';
            legendEl.innerHTML = `${backRow}<p class="reports-hint">Brak spłat w wybranym okresie.</p>`;
        }
        return;
    }

    const labels = slices.map((s) => s.label);
    const values = slices.map((s) => s.amount);
    const colors = getChartSliceColors(labels, 'expense');
    const borderColor = getChartBorderColor();
    const canDrill = isTabChart && !drillLabel;

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
            },
            onClick: canDrill ? (_event, elements, chartRef) => {
                if (!elements[0]) return;
                reportsDebtSplitDrillLabel = chartRef.data.labels[elements[0].index];
                renderReportsDebtSplitChart(ctx, canvasId, legendId);
            } : undefined
        }
    });

    if (isTabChart) reportsDebtsTabSplitInstance = chart;
    else reportsDebtSplitChartInstance = chart;

    if (legendEl) {
        const total = values.reduce((s, v) => s + v, 0);
        const backRow = drillLabel
            ? `<button type="button" class="reports-allocation-legend-back" onclick="resetReportsDebtSplitDrill()"><span aria-hidden="true">←</span> Wróć do podziału</button>`
            : '';
        legendEl.innerHTML = backRow + slices.map((slice, i) => {
            const pct = total > 0 ? Math.round((slice.amount / total) * 100) : 0;
            const drillClass = canDrill ? ' chart-legend-item--drill' : '';
            const tag = canDrill ? 'button' : 'div';
            const attrs = canDrill
                ? ` type="button" data-label="${String(slice.label).replace(/"/g, '&quot;')}"`
                : '';
            return `<${tag} class="reports-debt-split-item chart-legend-item${drillClass}"${attrs}>
                <span class="reports-debt-split-dot" style="background:${colors[i]}"></span>
                <span class="reports-debt-split-label">${escapeHtml(slice.label)}</span>
                <strong>${formatPlnAmount(slice.amount)}</strong>
                <em>${pct}%</em>
            </${tag}>`;
        }).join('');
        if (canDrill) {
            legendEl.querySelectorAll('.chart-legend-item--drill').forEach((btn) => {
                btn.addEventListener('click', () => {
                    reportsDebtSplitDrillLabel = btn.dataset.label;
                    renderReportsDebtSplitChart(ctx, canvasId, legendId);
                });
            });
        }
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
    const compact = targetId === 'reports-debts-cards';

    el.innerHTML = cards.map((card) => {
        const available = getCreditCardAvailable(card);
        const usedPct = card.limit > 0 ? Math.round((card.currentBalance / card.limit) * 100) : 0;
        const cardId = escapeHtml(card.id);
        const repayments = getCreditCardMovementsInRange(start, end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);

        if (compact) {
            return `<div class="debt-portfolio-row credit-clickable" role="button" tabindex="0"
                onclick="openCreditCardDetails('${cardId}')" onkeydown="if (event.key === 'Enter') openCreditCardDetails('${cardId}')">
                <div class="debt-portfolio-head">
                    <strong>${escapeHtml(card.name)}</strong>
                    <span class="debt-portfolio-tag">${usedPct}% limitu</span>
                </div>
                <span class="debt-portfolio-meta">${formatPlnAmount(card.currentBalance)} · spłaty ${formatPlnAmount(repayments)} · wolne ${formatPlnAmount(available)}</span>
                <div class="debt-portfolio-progress">
                    <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${Math.min(100, usedPct)}%;background:var(--accent)"></div></div>
                </div>
            </div>`;
        }

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

function getLoanRemainingMonths(loan) {
    if (loan.details?.remainingInstallments > 0) return loan.details.remainingInstallments;
    if (loan.details?.endDate && typeof daysUntilDate === 'function') {
        const days = daysUntilDate(loan.details.endDate);
        if (days !== null && days > 0) return Math.max(1, Math.ceil(days / 30.44));
    }
    const capital = loan.currentCapitalLeft || 0;
    const installment = loan.nextInstallmentAmount || 0;
    if (capital > 0 && installment > 0) return Math.max(1, Math.ceil(capital / installment));
    return 0;
}

function calcAmortPayment(balance, annualRate, months) {
    if (!(balance > 0) || !(months > 0)) return 0;
    const r = annualRate / 100 / 12;
    if (r === 0) return balance / months;
    const factor = Math.pow(1 + r, months);
    return balance * r * factor / (factor - 1);
}

function formatMonthsDuration(months) {
    if (!months || months <= 0) return '—';
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years > 0 && rem > 0) return `${years} lat ${rem} mies.`;
    if (years > 0) return `${years} lat`;
    return `${months} mies.`;
}

function runAmortizationShorten({ balance, annualRate, payment, extraMonthly = 0, lumpSum = 0 }) {
    let b = Math.max(0, balance - Math.max(0, lumpSum));
    const r = annualRate / 100 / 12;
    const extra = Math.max(0, extraMonthly);
    const monthlyOutflow = payment + extra;
    let totalInterest = 0;
    let months = 0;

    while (b > 0.01 && months < 600) {
        months += 1;
        const interest = b * r;
        totalInterest += interest;
        let principal = monthlyOutflow - interest;
        if (monthlyOutflow <= interest) {
            return {
                months,
                totalInterest,
                paidOff: false,
                monthlyPayment: payment,
                monthlyOutflow,
                extraMonthly: extra,
                endingBalance: b,
                payoffDate: null
            };
        }
        if (principal > b) principal = b;
        b -= principal;
    }

    const today = localIsoDate(new Date());
    return {
        months,
        totalInterest,
        paidOff: b <= 0.01,
        monthlyPayment: payment,
        monthlyOutflow,
        extraMonthly: extra,
        endingBalance: Math.max(0, b),
        payoffDate: addMonthsToToday(months)
    };
}

function runAmortizationLower({ balance, annualRate, payment, termMonths, extraMonthly = 0, lumpSum = 0 }) {
    const bStart = Math.max(0, balance - Math.max(0, lumpSum));
    const r = annualRate / 100 / 12;
    const extra = Math.max(0, extraMonthly);
    const recalculatedPayment = calcAmortPayment(bStart, annualRate, termMonths);

    let targetPayment = payment;
    if (lumpSum > 0 || extra > 0) {
        targetPayment = extra > 0
            ? Math.max(recalculatedPayment, payment - extra)
            : recalculatedPayment;
    }

    const savedPerMonth = Math.max(0, payment - targetPayment);

    let endingBalance = bStart;
    let totalInterest = 0;
    let monthsUsed = 0;

    for (let m = 0; m < termMonths && endingBalance > 0.01; m += 1) {
        monthsUsed += 1;
        const interest = endingBalance * r;
        totalInterest += interest;
        let principal = targetPayment - interest;
        if (principal < 0) principal = 0;
        if (principal > endingBalance) principal = endingBalance;
        endingBalance -= principal;
    }

    return {
        months: termMonths,
        monthsUsed,
        totalInterest,
        paidOff: endingBalance <= 0.01,
        monthlyPayment: targetPayment,
        monthlyOutflow: targetPayment,
        savedPerMonth,
        recalculatedPayment,
        extraMonthly: extra,
        lumpSum: Math.max(0, lumpSum),
        endingBalance: Math.max(0, endingBalance),
        payoffDate: loanPayoffDateFromMonths(termMonths)
    };
}

function loanPayoffDateFromMonths(months) {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return localIsoDate(d);
}

function calculateOverpaymentScenarios(loan, { extraMonthly = 0, lumpSum = 0 } = {}) {
    const balance = loan.currentCapitalLeft || 0;
    const payment = loan.nextInstallmentAmount || 0;
    const annualRate = loan.interestRate || 0;
    const termMonths = getLoanRemainingMonths(loan);
    if (!(balance > 0) || !(payment > 0) || !(termMonths > 0)) return null;

    const baseline = runAmortizationShorten({ balance, annualRate, payment, extraMonthly: 0, lumpSum: 0 });
    const shorten = runAmortizationShorten({
        balance,
        annualRate,
        payment,
        extraMonthly: Math.max(0, extraMonthly),
        lumpSum: Math.max(0, lumpSum)
    });
    const lower = runAmortizationLower({
        balance,
        annualRate,
        payment,
        termMonths,
        extraMonthly: Math.max(0, extraMonthly),
        lumpSum: Math.max(0, lumpSum)
    });

    if (loan.details?.endDate) {
        baseline.payoffDate = loan.details.endDate;
        lower.payoffDate = loan.details.endDate;
    }

    return {
        params: { balance, annualRate, payment, termMonths },
        baseline,
        shorten,
        lower,
        savedMonthsShorten: Math.max(0, baseline.months - shorten.months),
        savedInterestShorten: Math.max(0, baseline.totalInterest - shorten.totalInterest),
        savedInterestLower: Math.max(0, baseline.totalInterest - lower.totalInterest)
    };
}

function estimateAnnualInterest(loan) {
    const capital = loan.currentCapitalLeft || 0;
    const rate = loan.interestRate || 0;
    if (!capital || !rate) return 0;
    return capital * (rate / 100);
}

function simulateOverpaymentMonths(loan, extraMonthly, mode = 'shorten') {
    const scenarios = calculateOverpaymentScenarios(loan, { extraMonthly, lumpSum: 0 });
    if (!scenarios) return null;

    const pick = mode === 'lower' ? scenarios.lower : scenarios.shorten;
    const base = scenarios.baseline;
    return {
        mode: mode === 'lower' ? 'lower' : 'shorten',
        baseMonths: base.months,
        newMonths: pick.months,
        savedMonths: mode === 'lower' ? 0 : Math.max(0, base.months - pick.months),
        installment: scenarios.params.payment,
        newInstallment: pick.monthlyPayment,
        extraMonthly: Math.max(0, extraMonthly),
        savedPerMonth: pick.savedPerMonth || 0,
        totalPayment: mode === 'lower' ? pick.monthlyPayment : pick.monthlyOutflow,
        annualInterestSaved: mode === 'lower'
            ? scenarios.savedInterestLower
            : scenarios.savedInterestShorten
    };
}

function populateDebtsOverpayLoanSelect() {
    const select = document.getElementById('debts-overpay-loan');
    if (!select) return;
    const loans = getActiveLoans().filter((l) => l.nextInstallmentAmount > 0 && l.currentCapitalLeft > 0);
    if (!loans.length) {
        select.innerHTML = '<option value="">— brak —</option>';
        select.disabled = true;
        debtsOverpayLoanId = null;
        return;
    }
    select.disabled = false;
    if (!debtsOverpayLoanId || !loans.some((l) => l.id === debtsOverpayLoanId)) {
        debtsOverpayLoanId = loans[0].id;
    }
    select.innerHTML = loans.map((l) =>
        `<option value="${escapeHtml(l.id)}"${l.id === debtsOverpayLoanId ? ' selected' : ''}>${escapeHtml(getLoanDisplayName(l))}</option>`
    ).join('');
}

function syncOverpayCalcChrome() {
    const isMonthly = debtsOverpayKind !== 'lump';
    document.getElementById('btn-overpay-monthly')?.classList.toggle('active', isMonthly);
    document.getElementById('btn-overpay-lump')?.classList.toggle('active', !isMonthly);
    const input = document.getElementById('debts-overpay-amount');
    if (input) input.placeholder = isMonthly ? 'Kwota / mies.' : 'Kwota jednorazowa';
}

function setDebtsOverpayKind(kind) {
    debtsOverpayKind = kind === 'lump' ? 'lump' : 'monthly';
    syncOverpayCalcChrome();
    onDebtsOverpayChange();
}

function getDebtsOverpayInputs() {
    const amount = Math.max(0, parseFloat(document.getElementById('debts-overpay-amount')?.value) || 0);
    debtsOverpayAmount = amount;
    if (debtsOverpayKind === 'lump') {
        return { extraMonthly: 0, lumpSum: amount };
    }
    return { extraMonthly: amount, lumpSum: 0 };
}

function onDebtsOverpayChange() {
    debtsOverpayLoanId = document.getElementById('debts-overpay-loan')?.value || debtsOverpayLoanId;
    renderReportsDebtOverpayCalc();
}

function renderReportsDebtOverpayCalc() {
    syncOverpayCalcChrome();
    const el = document.getElementById('reports-debt-overpay-results');
    const summaryEl = document.getElementById('debts-overpay-loan-summary');
    if (!el) return;

    const loan = getLoanById(debtsOverpayLoanId);
    if (!loan) {
        if (summaryEl) summaryEl.innerHTML = '';
        el.innerHTML = '<p class="reports-hint">Wybierz kredyt z ratą, aby zobaczyć symulację.</p>';
        return;
    }

    const overpay = getDebtsOverpayInputs();
    const scenarios = calculateOverpaymentScenarios(loan, overpay);
    if (!scenarios) {
        if (summaryEl) summaryEl.innerHTML = '';
        el.innerHTML = '<p class="reports-hint">Uzupełnij kapitał, ratę i pozostały okres w szczegółach kredytu.</p>';
        return;
    }

    const { params, shorten, lower } = scenarios;
    const hasOverpay = overpay.extraMonthly > 0 || overpay.lumpSum > 0;

    if (summaryEl) {
        summaryEl.innerHTML = `<div class="overpay-calc-loan-meta">
            <span>Kapitał <strong>${formatPlnAmount(params.balance)}</strong></span>
            <span>Rata <strong>${formatPlnAmount(params.payment)}</strong></span>
            <span>Stopa <strong>${params.annualRate ? `${params.annualRate}%` : '—'}</strong></span>
            <span>Okres <strong>${formatMonthsDuration(params.termMonths)}</strong></span>
        </div>`;
    }

    const ercNote = loan.details?.earlyRepaymentFee != null && loan.details.earlyRepaymentFee > 0
        ? `<p class="reports-hint overpay-calc-warning">Możliwa opłata za wcześniejszą spłatę (~${loan.details.earlyRepaymentFee}%).</p>`
        : '';

    const payoffLabel = (dateStr) => (dateStr ? formatTxDate(dateStr) : '—');
    const delta = (text, cls = 'income') => text ? ` <em class="overpay-stat-delta ${cls}">${text}</em>` : '';
    const stat = (label, value) => `<div class="overpay-stat"><span>${label}</span><strong>${value}</strong></div>`;

    if (!hasOverpay) {
        el.innerHTML = `<p class="reports-hint overpay-calc-empty">Wpisz kwotę nadpłaty, aby zobaczyć symulację.</p>${ercNote}`;
        return;
    }

    const shortenPayNote = shorten.extraMonthly > 0
        ? stat('Płatność', `${formatPlnAmount(shorten.monthlyOutflow)}/mies.${delta(`+${formatPlnAmount(shorten.extraMonthly)} nadpłata`)}`)
        : (overpay.lumpSum > 0 ? stat('Jednorazowo', formatPlnAmount(overpay.lumpSum)) : '');

    el.innerHTML = `
        <div class="overpay-scenarios">
            <div class="overpay-scenario">
                <div class="overpay-scenario-title">Skróć okres</div>
                ${shortenPayNote}
                ${stat('Koniec spłaty', `${payoffLabel(shorten.payoffDate)}${delta(scenarios.savedMonthsShorten > 0 ? `−${formatMonthsDuration(scenarios.savedMonthsShorten)}` : '')}`)}
                ${stat('Odsetki łącznie', `${formatPlnAmount(shorten.totalInterest)}${delta(scenarios.savedInterestShorten > 0 ? `−${formatPlnAmount(scenarios.savedInterestShorten)}` : '')}`)}
            </div>
            <div class="overpay-scenario">
                <div class="overpay-scenario-title">Obniż ratę</div>
                ${stat('Rata', `${formatPlnAmount(lower.monthlyPayment)}/mies.${delta(lower.savedPerMonth > 0 ? `−${formatPlnAmount(lower.savedPerMonth)}` : '')}`)}
                ${stat('Okres', formatMonthsDuration(lower.months))}
                ${stat('Odsetki łącznie', `${formatPlnAmount(lower.totalInterest)}${delta(scenarios.savedInterestLower > 0 ? `−${formatPlnAmount(scenarios.savedInterestLower)}` : '')}`)}
            </div>
        </div>
        ${!lower.paidOff && overpay.extraMonthly > 0 ? '<p class="reports-hint overpay-calc-warning">Przy obniżeniu raty kapitał może nie spłacić się w terminie.</p>' : ''}
        ${ercNote}`;
}

function populateDebtsScenarioLoanSelect() {
    populateDebtsOverpayLoanSelect();
}

function setDebtsScenarioExtra(amount) {
    const input = document.getElementById('debts-overpay-amount');
    if (input) input.value = String(amount);
    onDebtsOverpayChange();
}

function onDebtsScenarioChange() {
    onDebtsOverpayChange();
}

function getNextLoanPaymentSummary() {
    let next = null;
    getActiveLoans().forEach((loan) => {
        if (!loan.nextInstallmentDue || !loan.nextInstallmentAmount) return;
        if (!next || loan.nextInstallmentDue < next.date) {
            next = {
                date: loan.nextInstallmentDue,
                amount: loan.nextInstallmentAmount
            };
        }
    });
    return next;
}

function getDebtsFreedomLabel() {
    const loans = getActiveLoans().filter((l) => (l.currentCapitalLeft || 0) > 0);
    const cards = getActiveCreditCards().filter((c) => (c.currentBalance || 0) > 0);
    if (!loans.length && !cards.length) return 'Brak długów';

    let maxMonths = -1;
    let bestLabel = '—';

    const consider = (months, label) => {
        if (months === null || Number.isNaN(months)) return;
        if (months > maxMonths) {
            maxMonths = months;
            bestLabel = label;
        }
    };

    loans.forEach((loan) => {
        if (loan.details?.endDate && typeof daysUntilDate === 'function') {
            const days = daysUntilDate(loan.details.endDate);
            if (days !== null) {
                consider(days / 30.44, formatTxDate(loan.details.endDate));
                return;
            }
        }
        const est = estimateLoanPayoff(loan);
        const match = est.label.match(/~(\d+)\s*mies/);
        if (match) consider(parseInt(match[1], 10), est.label);
        else if (est.label && est.label !== '—' && est.label !== 'Spłacony') consider(0, est.label);
    });

    cards.forEach((card) => {
        const est = estimateCardPayoff(card);
        const match = est.label.match(/~(\d+)\s*mies/);
        if (match) consider(parseInt(match[1], 10), est.label);
        else if (est.label && est.label !== '—' && est.label !== 'Spłacona') consider(0, est.label);
    });

    return bestLabel;
}

function renderReportsDebtsHero(ctx) {
    const totalEl = document.getElementById('reports-debts-hero-total');
    const metaEl = document.getElementById('reports-debts-hero-meta');
    const interestEl = document.getElementById('reports-debts-kpi-interest');
    const nextEl = document.getElementById('reports-debts-kpi-next');
    const freedomEl = document.getElementById('reports-debts-kpi-freedom');
    if (!totalEl) return;

    const totalDebt = getLoanSummaryTotal();
    const loanDebt = getLoanCapitalLeft();
    const cardDebt = getCreditCardDebtTotal();
    const { total } = getDebtPaymentsInPeriod(ctx);
    const income = ctx.periodTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const dsr = income > 0 ? Math.round((total / income) * 100) : null;

    const annualInterest = getActiveLoans()
        .filter((l) => (l.currentCapitalLeft || 0) > 0)
        .reduce((sum, loan) => sum + estimateAnnualInterest(loan), 0);
    const nextPayment = getNextLoanPaymentSummary();

    totalEl.textContent = formatPlnAmount(totalDebt);
    if (interestEl) {
        interestEl.textContent = annualInterest > 0 ? formatPlnAmount(annualInterest) : '—';
        interestEl.classList.toggle('expense', annualInterest > 0);
    }
    if (nextEl) {
        nextEl.textContent = nextPayment
            ? `${formatPlnAmount(nextPayment.amount)} · ${formatTxDate(nextPayment.date)}`
            : '—';
    }
    if (freedomEl) freedomEl.textContent = getDebtsFreedomLabel();
    if (metaEl) {
        metaEl.textContent = [
            `kredyty ${formatPlnAmount(loanDebt)}`,
            `karty ${formatPlnAmount(cardDebt)}`,
            `spłaty w okresie ${formatPlnAmount(total)}`,
            dsr !== null ? `DSR ${dsr}%` : ''
        ].filter(Boolean).join(' · ');
    }
}

function renderReportsDebtLoansPortfolio(ctx) {
    const el = document.getElementById('reports-debt-loans-portfolio');
    if (!el) return;

    const loans = getActiveLoans();
    if (!loans.length) {
        el.innerHTML = '<p class="reports-hint">Brak aktywnych kredytów.</p>';
        return;
    }

    let totalAnnual = 0;
    const rows = loans.map((loan) => {
        const capital = loan.currentCapitalLeft || 0;
        const annual = estimateAnnualInterest(loan);
        totalAnnual += annual;
        const paidPct = Math.round(getLoanPaidPercent(loan));
        const debtPayments = ctx.periodTx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        const loanId = escapeHtml(loan.id);
        const isMortgage = typeof isMortgageLoan === 'function' && isMortgageLoan(loan);
        const propertyValue = loan.details?.propertyValue || 0;
        let ltvTag = '';
        if (isMortgage && propertyValue > 0) {
            const ltv = (capital / propertyValue) * 100;
            const ltvClass = ltv > 80 ? ' debt-portfolio-tag--warn' : '';
            ltvTag = `<span class="debt-portfolio-tag${ltvClass}">LTV ${ltv.toFixed(1)}%</span>`;
        }
        const metaBits = [
            loan.interestRate ? `${loan.interestRate}%` : null,
            annual > 0 ? `~${formatPlnAmount(annual)}/rok` : null,
            loan.nextInstallmentAmount ? `rata ${formatPlnAmount(loan.nextInstallmentAmount)}` : null,
            debtPayments > 0 ? `w okresie ${formatPlnAmount(debtPayments)}` : null
        ].filter(Boolean).join(' · ');

        const ltvHint = isMortgage && propertyValue > 0
            ? `<span class="debt-portfolio-ltv-hint">Nieruchomość ${formatPlnAmount(propertyValue)} · wolny kapitał ${formatPlnAmount(Math.max(0, propertyValue - capital))}</span>`
            : '';

        return `<div class="debt-portfolio-row loan-clickable" role="button" tabindex="0"
            onclick="openLoanDetails('${loanId}')" onkeydown="if (event.key === 'Enter') openLoanDetails('${loanId}')">
            <div class="debt-portfolio-head">
                <strong>${escapeHtml(getLoanDisplayName(loan))}</strong>
                ${ltvTag}
            </div>
            <span class="debt-portfolio-meta">${metaBits || 'Brak szczegółów stopy'}</span>
            <div class="debt-portfolio-progress">
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${paidPct}%;background:var(--success)"></div></div>
                <span class="reports-hint">Spłacono ${paidPct}% · kapitał ${formatPlnAmount(capital)}</span>
            </div>
            ${ltvHint}
        </div>`;
    }).join('');

    el.innerHTML = `${rows}
        <div class="debt-portfolio-total">
            <span>Szacunek odsetek łącznie</span>
            <strong class="expense">${formatPlnAmount(totalAnnual)}/rok</strong>
        </div>`;
}

function renderReportsDebtInstallmentList() {
    const el = document.getElementById('reports-debt-installment-list');
    if (!el) return;

    const rows = [];
    getActiveLoans().forEach((loan) => {
        if (!(loan.nextInstallmentAmount > 0 && loan.currentCapitalLeft > 0)) return;
        const due = loan.nextInstallmentDue || '';
        rows.push({
            sortKey: due || '9999-99-99',
            name: getLoanDisplayName(loan),
            amount: loan.nextInstallmentAmount,
            dateLabel: due ? formatTxDate(due) : '—',
            estimated: false,
            kind: 'loan',
            id: loan.id
        });
    });

    getActiveCreditCards().forEach((card) => {
        if (!(card.currentBalance > 0)) return;
        const hint = typeof getCardRepaymentHint === 'function' ? getCardRepaymentHint(card) : null;
        if (!hint) return;
        rows.push({
            sortKey: `9998-${String(hint.day).padStart(2, '0')}`,
            name: card.name,
            amount: hint.amount,
            dateLabel: `~${hint.day}. dnia miesiąca`,
            estimated: true,
            kind: 'card',
            id: card.id
        });
    });

    rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name, 'pl'));

    const summaryEl = document.getElementById('reports-debt-installment-summary');
    const monthlyTotal = rows.reduce((s, r) => s + r.amount, 0);
    const loanTotal = rows.filter((r) => !r.estimated).reduce((s, r) => s + r.amount, 0);
    const cardTotal = rows.filter((r) => r.estimated).reduce((s, r) => s + r.amount, 0);

    if (summaryEl) {
        const cardHint = cardTotal > 0
            ? `<span class="debt-installment-summary-detail">kredyty ${formatPlnAmount(loanTotal)} · karty ~${formatPlnAmount(cardTotal)}</span>`
            : '';
        summaryEl.innerHTML = `<div class="debt-installment-summary">
            <div class="debt-installment-summary-main">
                <span class="label">Suma rat / miesiąc</span>
                <strong class="expense">${formatPlnAmount(monthlyTotal)}</strong>
            </div>
            ${cardHint}
        </div>`;
    }

    if (!rows.length) {
        if (summaryEl) summaryEl.innerHTML = '';
        el.innerHTML = '<p class="reports-hint">Brak zaplanowanych rat — uzupełnij dane kredytów w portfelu.</p>';
        return;
    }

    el.innerHTML = rows.map((row) => {
        const openFn = row.kind === 'loan'
            ? `openLoanDetails('${escapeHtml(row.id)}')`
            : `openCreditCardDetails('${escapeHtml(row.id)}')`;
        const estClass = row.estimated ? ' debt-installment-row--estimated' : '';
        return `<div class="debt-installment-row${estClass} ${row.kind}-clickable" role="button" tabindex="0"
            onclick="${openFn}" onkeydown="if (event.key==='Enter') ${openFn}">
            <span class="debt-installment-name">${escapeHtml(row.name)}${row.estimated ? ' <em>szac.</em>' : ''}</span>
            <span class="debt-installment-amount">${formatPlnAmount(row.amount)}</span>
            <span class="debt-installment-date">${escapeHtml(row.dateLabel)}</span>
        </div>`;
    }).join('');
}

function renderReportsDebtsFreedomPanel(ctx) {
    const el = document.getElementById('reports-debts-freedom-panel');
    if (!el) return;

    const items = typeof buildDebtFreedomTimeline === 'function' ? buildDebtFreedomTimeline() : [];
    const { regular, over, total } = analyzeLoanPaymentsInPeriod(ctx);
    const hasPeriod = total > 0;
    const hasTimeline = items.length > 0;

    if (!hasPeriod && !hasTimeline) {
        el.innerHTML = '<p class="reports-hint">Brak długów lub spłat w wybranym okresie.</p>';
        return;
    }

    let periodHtml = '';
    if (hasPeriod) {
        const overPct = Math.round((over / total) * 100);
        periodHtml = `<div class="debt-freedom-period">
            <span class="analysis-subsection-label">Spłaty kredytów w okresie</span>
            <div class="debt-freedom-period-grid">
                <div><span class="label">Raty</span><strong>${formatPlnAmount(regular)}</strong></div>
                <div><span class="label">Nadpłaty</span><strong class="income">${formatPlnAmount(over)}</strong></div>
                <div><span class="label">Razem</span><strong class="expense">${formatPlnAmount(total)}</strong></div>
                ${over > 0 ? `<div><span class="label">Udział nadpłat</span><strong>${overPct}%</strong></div>` : ''}
            </div>
        </div>`;
    }

    let timelineHtml = '';
    if (hasTimeline) {
        const today = localIsoDate(new Date());
        const dated = items.filter((i) => i.endDate);
        const maxMonths = dated.length
            ? Math.max(...dated.map((i) => {
                const d = new Date(`${i.endDate}T12:00:00`);
                const n = new Date(`${today}T12:00:00`);
                return Math.max(1, (d.getFullYear() - n.getFullYear()) * 12 + (d.getMonth() - n.getMonth()));
            }))
            : 1;

        const rows = items.map((item) => {
            const monthsLeft = item.endDate
                ? Math.max(0, (() => {
                    const d = new Date(`${item.endDate}T12:00:00`);
                    const n = new Date(`${today}T12:00:00`);
                    return (d.getFullYear() - n.getFullYear()) * 12 + (d.getMonth() - n.getMonth());
                })())
                : null;
            const pct = monthsLeft !== null ? Math.min(100, Math.round((monthsLeft / maxMonths) * 100)) : 8;
            const dateLabel = item.endDate ? formatTxDate(item.endDate) : item.label;
            const openFn = item.kind === 'loan'
                ? `openLoanDetails('${escapeHtml(item.id)}')`
                : `openCreditCardDetails('${escapeHtml(item.id)}')`;
            return `<div class="debt-freedom-row ${item.kind}-clickable" role="button" tabindex="0" onclick="${openFn}" onkeydown="if (event.key==='Enter') ${openFn}">
                <div class="debt-freedom-head">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span class="debt-freedom-date">${escapeHtml(dateLabel)}</span>
                </div>
                <div class="debt-freedom-bar"><span style="width:${pct}%"></span></div>
                <div class="debt-freedom-meta">
                    <span>${formatPlnAmount(item.amount)} pozostało</span>
                    <span>${escapeHtml(item.detail || item.label)}</span>
                </div>
            </div>`;
        }).join('');

        timelineHtml = `<div class="debt-freedom-timeline-wrap">
            <span class="analysis-subsection-label">Koniec spłaty</span>
            ${rows}
        </div>`;
    }

    el.innerHTML = periodHtml + timelineHtml;
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

function renderReportsDebtsSection(ctx) {
    renderReportsDebtsHero(ctx);
    renderReportsDebtLoansPortfolio(ctx);
    renderReportsDebtInstallmentList();
    populateDebtsOverpayLoanSelect();
    renderReportsDebtOverpayCalc();
    renderReportsDebtsFreedomPanel(ctx);
    const cardsWrap = document.getElementById('reports-debts-cards-wrap');
    const cards = getActiveCreditCards();
    if (cardsWrap) cardsWrap.classList.toggle('hidden', !cards.length);
    renderReportsCreditCardSummary(ctx, 'reports-debts-cards');
    renderReportsDebtPaymentsChart(ctx, 'reportsDebtsChart');
    renderReportsDebtSplitChart(ctx, 'reportsDebtsSplitChart', 'reports-debts-split-legend');
}
