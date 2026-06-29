let reportsDayCompareMode = 'yesterday';
let reportsDaySummaryExpanded = false;
let reportsMonthSummaryExpanded = false;

function addDaysIso(dateStr, deltaDays) {
    const date = new Date(`${dateStr}T12:00:00`);
    date.setDate(date.getDate() + deltaDays);
    return localIsoDate(date);
}

function getSameDayPreviousMonthIso(dateStr) {
    const date = new Date(`${dateStr}T12:00:00`);
    const day = date.getDate();
    const target = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return localIsoDate(target);
}

function getMtdBounds(referenceDate = new Date()) {
    const start = localIsoDate(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1));
    const end = localIsoDate(referenceDate);
    return { start, end };
}

function getPreviousMtdBounds(referenceDate = new Date()) {
    const dayOfMonth = referenceDate.getDate();
    const prevMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const start = localIsoDate(prevMonth);
    const lastDay = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
    const end = localIsoDate(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(dayOfMonth, lastDay)));
    return { start, end };
}

function getDayCompareDate(today, mode = reportsDayCompareMode) {
    if (mode === 'same-month') return getSameDayPreviousMonthIso(today);
    return addDaysIso(today, -1);
}

function getDayCompareLabel(compareDate, mode = reportsDayCompareMode) {
    if (mode === 'same-month') return formatTxDate(compareDate);
    return 'wczoraj';
}

function formatSummaryDeltaPct(current, previous) {
    if (!previous) return current > 0 ? '+100%' : '0%';
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function formatSummaryDeltaItems(current, previous, compareLabel) {
    const metrics = [
        { key: 'income', label: 'wpływy', type: 'income' },
        { key: 'expense', label: 'wydatki', type: 'expense' },
        { key: 'balance', label: 'saldo', type: 'balance' }
    ];
    const items = metrics.map(({ key, label, type }) => {
        const pct = formatSummaryDeltaPct(current[key], previous[key]);
        return `<span class="reports-day-month-delta-item ${type}">${label} <strong>${pct}</strong></span>`;
    }).join('');
    return `<span class="reports-day-month-delta-label">vs ${escapeHtml(compareLabel)}:</span>${items}`;
}

function renderSummaryStatsHtml(summary) {
    const balanceClass = summary.balance >= 0 ? 'income' : 'expense';
    const balancePrefix = summary.balance >= 0 ? '+' : '−';
    return `<div class="reports-day-month-stat income">
            <span class="label">Wpływy</span>
            <strong class="value">${formatPlnAmount(summary.income)}</strong>
        </div>
        <div class="reports-day-month-stat expense">
            <span class="label">Wydatki</span>
            <strong class="value">${formatPlnAmount(summary.expense)}</strong>
        </div>
        <div class="reports-day-month-stat ${balanceClass}">
            <span class="label">Saldo</span>
            <strong class="value">${balancePrefix}${formatPlnAmount(Math.abs(summary.balance))}</strong>
        </div>`;
}

function getTopExpenseFromTransactions(transactions) {
    if (!transactions.length) return null;
    const top = transactions
        .filter((t) => t.type === 'expense')
        .sort((a, b) => b.amount - a.amount)[0];
    if (!top) return null;
    const title = top.subCategory === '[Bez podkategorii]' ? top.mainCategory : top.subCategory;
    return { title, amount: top.amount };
}

function buildDayAnalysisText(summary, compareSummary, compareLabel, dayTransactions) {
    const parts = [];
    if (summary.expense !== compareSummary.expense) {
        const higher = summary.expense > compareSummary.expense;
        const pct = formatSummaryDeltaPct(summary.expense, compareSummary.expense);
        parts.push(`Wydatki ${higher ? 'wyższe' : 'niższe'} o ${pct.replace(/^\+/, '')} niż ${compareLabel}.`);
    } else if (!summary.expense && !compareSummary.expense) {
        parts.push(`Brak wydatków dziś i ${compareLabel}.`);
    } else {
        parts.push(`Wydatki na tym samym poziomie co ${compareLabel}.`);
    }

    if (summary.balance !== compareSummary.balance) {
        const better = summary.balance > compareSummary.balance;
        parts.push(`Saldo dnia ${better ? 'lepsze' : 'gorsze'} (${formatPlnAmount(summary.balance)} vs ${formatPlnAmount(compareSummary.balance)}).`);
    }

    const top = getTopExpenseFromTransactions(dayTransactions);
    if (top) parts.push(`Największy wydatek: ${top.title} (${formatPlnAmount(top.amount)}).`);
    return parts.join(' ');
}

function buildMonthAnalysisText(summary, compareSummary, prevMtdBounds) {
    const rangeLabel = `${formatTxDate(prevMtdBounds.start)} – ${formatTxDate(prevMtdBounds.end)}`;
    const parts = [];
    if (summary.expense !== compareSummary.expense) {
        const higher = summary.expense > compareSummary.expense;
        const pct = formatSummaryDeltaPct(summary.expense, compareSummary.expense).replace(/^[+\-]/, '');
        parts.push(`Wydatki ${higher ? 'wyższe' : 'niższe'} o ${pct} niż w poprzednim miesiącu (${rangeLabel}).`);
    } else {
        parts.push(`Wydatki na podobnym poziomie jak w poprzednim miesiącu (${rangeLabel}).`);
    }

    if (summary.income !== compareSummary.income) {
        const pct = formatSummaryDeltaPct(summary.income, compareSummary.income);
        parts.push(`Wpływy: ${pct} vs poprzedni miesiąc (${rangeLabel}).`);
    }

    parts.push(`Saldo: ${formatPlnAmount(summary.balance)} (poprzedni miesiąc: ${formatPlnAmount(compareSummary.balance)}).`);
    return parts.join(' ');
}

function sortDayTransactions(transactions) {
    return transactions.slice().sort((a, b) => {
        if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
        return b.amount - a.amount;
    });
}

function sortMonthTransactions(transactions) {
    return transactions.slice().sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
        return b.amount - a.amount;
    });
}

function shouldShowCalendarScopeHint(ctx) {
    if (!ctx || ctx.mode === 'compare') return false;
    if (typeof isReportsCurrentMonthPeriod === 'function' && isReportsCurrentMonthPeriod(ctx)) {
        return false;
    }
    return true;
}

function setReportsDayCompareMode(mode) {
    if (reportsDayCompareMode === mode) return;
    reportsDayCompareMode = mode;
    document.getElementById('btn-day-compare-yesterday')?.classList.toggle('active', mode === 'yesterday');
    document.getElementById('btn-day-compare-som')?.classList.toggle('active', mode === 'same-month');
    if (reportsLastCtx) renderReportsDaySummary(reportsLastCtx);
}

function toggleReportsDaySummaryDetails() {
    const panel = document.getElementById('reports-day-summary-panel');
    const toggle = document.getElementById('reports-day-summary-toggle');
    if (!panel || !toggle) return;
    reportsDaySummaryExpanded = panel.classList.toggle('hidden') === false;
    toggle.setAttribute('aria-expanded', reportsDaySummaryExpanded ? 'true' : 'false');
}

function toggleReportsMonthSummaryDetails() {
    const panel = document.getElementById('reports-month-summary-panel');
    const toggle = document.getElementById('reports-month-summary-toggle');
    if (!panel || !toggle) return;
    reportsMonthSummaryExpanded = panel.classList.toggle('hidden') === false;
    toggle.setAttribute('aria-expanded', reportsMonthSummaryExpanded ? 'true' : 'false');
}

function updateReportsDaySummaryVisibility(ctx) {
    const card = document.getElementById('reports-day-summary-card');
    if (!card) return;
    const show = ctx?.mode !== 'compare';
    card.classList.toggle('hidden', !show);
    if (show) renderReportsDaySummary(ctx);
}

function updateReportsMonthSummaryVisibility(ctx) {
    const card = document.getElementById('reports-month-summary-card');
    if (!card) return;
    const show = ctx?.mode !== 'compare';
    card.classList.toggle('hidden', !show);
    if (show) renderReportsMonthSummary(ctx);
}

function renderReportsDaySummary(ctx) {
    const card = document.getElementById('reports-day-summary-card');
    if (!card || card.classList.contains('hidden')) return;

    const now = new Date();
    const today = localIsoDate(now);
    const compareDate = getDayCompareDate(today);
    const compareLabel = getDayCompareLabel(compareDate);

    const dayTx = appState.transactions.filter((t) => t.date === today);
    const compareDayTx = appState.transactions.filter((t) => t.date === compareDate);
    const daySummary = summarizePeriod(dayTx);
    const compareDaySummary = summarizePeriod(compareDayTx);

    document.getElementById('reports-day-summary-stats').innerHTML = renderSummaryStatsHtml(daySummary);
    document.getElementById('reports-day-summary-delta').innerHTML = formatSummaryDeltaItems(
        daySummary,
        compareDaySummary,
        compareLabel
    );

    const hintEl = document.getElementById('reports-day-scope-hint');
    if (hintEl) {
        const showHint = shouldShowCalendarScopeHint(ctx);
        hintEl.classList.toggle('hidden', !showHint);
    }

    document.getElementById('btn-day-compare-yesterday')?.classList.toggle('active', reportsDayCompareMode === 'yesterday');
    document.getElementById('btn-day-compare-som')?.classList.toggle('active', reportsDayCompareMode === 'same-month');

    const panel = document.getElementById('reports-day-summary-panel');
    const toggle = document.getElementById('reports-day-summary-toggle');
    if (panel && toggle) {
        panel.classList.toggle('hidden', !reportsDaySummaryExpanded);
        toggle.setAttribute('aria-expanded', reportsDaySummaryExpanded ? 'true' : 'false');
    }

    const dayAnalysisEl = document.getElementById('reports-day-analysis');
    const dayListEl = document.getElementById('reports-day-tx-list');
    if (dayAnalysisEl) {
        dayAnalysisEl.textContent = buildDayAnalysisText(daySummary, compareDaySummary, compareLabel, dayTx);
    }
    if (dayListEl && typeof renderReportsTxListHtml === 'function') {
        dayListEl.innerHTML = renderReportsTxListHtml(sortDayTransactions(dayTx), 30);
    }
}

function renderReportsMonthSummary(ctx) {
    const card = document.getElementById('reports-month-summary-card');
    if (!card || card.classList.contains('hidden')) return;

    const now = new Date();
    const mtd = getMtdBounds(now);
    const prevMtd = getPreviousMtdBounds(now);
    const monthTx = getTransactionsInRange(mtd.start, mtd.end);
    const prevMonthTx = getTransactionsInRange(prevMtd.start, prevMtd.end);
    const monthSummary = summarizePeriod(monthTx);
    const prevMonthSummary = summarizePeriod(prevMonthTx);

    const prevMonthLabel = `${formatTxDate(prevMtd.start)} – ${formatTxDate(prevMtd.end)}`;

    document.getElementById('reports-month-summary-stats').innerHTML = renderSummaryStatsHtml(monthSummary);
    document.getElementById('reports-month-summary-delta').innerHTML = formatSummaryDeltaItems(
        monthSummary,
        prevMonthSummary,
        prevMonthLabel
    );

    const hintEl = document.getElementById('reports-month-scope-hint');
    if (hintEl) {
        const showHint = shouldShowCalendarScopeHint(ctx);
        hintEl.classList.toggle('hidden', !showHint);
    }

    const panel = document.getElementById('reports-month-summary-panel');
    const toggle = document.getElementById('reports-month-summary-toggle');
    if (panel && toggle) {
        panel.classList.toggle('hidden', !reportsMonthSummaryExpanded);
        toggle.setAttribute('aria-expanded', reportsMonthSummaryExpanded ? 'true' : 'false');
    }

    const monthAnalysisEl = document.getElementById('reports-month-analysis');
    const monthListEl = document.getElementById('reports-month-tx-list');
    if (monthAnalysisEl) {
        monthAnalysisEl.textContent = buildMonthAnalysisText(monthSummary, prevMonthSummary, prevMtd);
    }
    if (monthListEl && typeof renderReportsTxListHtml === 'function') {
        monthListEl.innerHTML = renderReportsTxListHtml(sortMonthTransactions(monthTx), 50);
    }
}
