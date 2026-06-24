/* Raporty — faza 3 (A–F) */

const ANALYSIS_SECTION_KEY = 'analysis_section';
const ANALYSIS_PERIOD_KEY = 'analysis_period_mode';
let analysisSection = 'overview';

const ANALYSIS_SECTIONS = ['overview', 'calendar', 'charts', 'assets', 'debts', 'details'];
const PERIOD_MODES = ['year', 'month', 'range', 'compare'];

function shiftArrayIndex(items, current, delta) {
    const idx = items.indexOf(current);
    if (idx < 0) return items[0];
    return items[(idx + delta + items.length) % items.length];
}

function attachHorizontalSwipe(el, { onSwipeLeft, onSwipeRight, threshold = 56, dominance = 1.35, ignoreSelector = 'input, select, textarea, a, canvas, .cal-cell' }) {
    if (!el || el.dataset.swipeBound === '1') return;
    el.dataset.swipeBound = '1';
    let startX = 0;
    let startY = 0;
    let tracking = false;

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        if (ignoreSelector && e.target.closest(ignoreSelector)) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        if (Math.abs(dx) < threshold) return;
        if (Math.abs(dx) < Math.abs(dy) * dominance) return;
        el.classList.add('analysis-swipe-flash');
        setTimeout(() => el.classList.remove('analysis-swipe-flash'), 180);
        if (dx < 0) onSwipeLeft?.();
        else onSwipeRight?.();
    }, { passive: true });
}

function shiftAnalysisSection(delta) {
    setAnalysisSection(shiftArrayIndex(ANALYSIS_SECTIONS, analysisSection, delta));
}

function shiftReportsPeriodMode(delta) {
    setReportsPeriodMode(shiftArrayIndex(PERIOD_MODES, reportsPeriodMode, delta));
}

function initAnalysisSwipe() {
    attachHorizontalSwipe(document.querySelector('#analysis-period-swipe .reports-period-tabs'), {
        onSwipeLeft: () => shiftReportsPeriodMode(1),
        onSwipeRight: () => shiftReportsPeriodMode(-1),
        ignoreSelector: 'input, select, textarea'
    });
    attachHorizontalSwipe(document.getElementById('analysis-sections-body'), {
        onSwipeLeft: () => shiftAnalysisSection(1),
        onSwipeRight: () => shiftAnalysisSection(-1)
    });
}

function getReportsMonthValue() {
    const el = document.getElementById('reports-period-month');
    if (el?.value) return el.value;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthBoundsFromValue(monthValue) {
    const [year, month] = monthValue.split('-').map(Number);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    return { start, end, year, monthIndex: month - 1 };
}

function formatMonthLabel(monthValue) {
    const [y, m] = monthValue.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function onReportsMonthChange() {
    const { year, monthIndex } = getMonthBoundsFromValue(getReportsMonthValue());
    reportsCalendarYear = year;
    reportsCalendarMonth = monthIndex;
    renderReports();
}

function syncReportsCalendarFromContext(ctx) {
    if (!ctx) return;
    if (ctx.mode === 'month' && ctx.rangeStart) {
        const { year, monthIndex } = getMonthBoundsFromValue(ctx.rangeStart.slice(0, 7));
        reportsCalendarYear = year;
        reportsCalendarMonth = monthIndex;
        reportsLastPeriod = `month:${ctx.rangeStart.slice(0, 7)}`;
        return;
    }
    if (ctx.mode === 'year') {
        syncReportsCalendarToPeriod(ctx.period);
        return;
    }
    if (ctx.mode === 'range' && ctx.rangeStart) {
        syncReportsCalendarToPeriod(ctx.rangeStart.slice(0, 4));
    }
}

function setAnalysisSection(section) {
    if (!ANALYSIS_SECTIONS.includes(section)) return;
    analysisSection = section;
    try { localStorage.setItem(ANALYSIS_SECTION_KEY, section); } catch { /* ignore */ }

    ANALYSIS_SECTIONS.forEach((id) => {
        document.getElementById(`analysis-section-${id}`)?.classList.toggle('hidden', id !== section);
        document.getElementById(`btn-analysis-${id}`)?.classList.toggle('active', id === section);
    });

    if (section === 'charts' || section === 'assets' || section === 'debts' || section === 'calendar') {
        requestAnimationFrame(() => {
            [reportsChartInstance, reportsTrendChartInstance, reportsYoyChartInstance, reportsDowChartInstance, reportsDebtChartInstance, reportsDebtTrendChartInstance, reportsDebtSplitChartInstance, reportsDebtsTabChartInstance, reportsDebtsTabSplitInstance, reportsDebtPeakChartInstance, reportsAssetAllocationChartInstance, reportsAssetsTabAllocationInstance, reportsCashTrendChartInstance, reportsAssetsTabCashTrendInstance, reportsNetWorthTrendChartInstance, reportsAllocationTrendChartInstance, reportsDiversificationChartInstance]
                .forEach((chart) => chart?.resize());
        });
    }
}

function initAnalysisSection() {
    try {
        const saved = localStorage.getItem(ANALYSIS_SECTION_KEY);
        if (saved && ANALYSIS_SECTIONS.includes(saved)) analysisSection = saved;
    } catch { /* ignore */ }
    setAnalysisSection(analysisSection);
}

let debtsScenarioLoanId = null;
let debtsScenarioExtra = 500;
let reportsCalendarView = 'month';
let calendarDayDate = null;
let calendarDayFilter = 'all';
let reportsMonthChartMeta = { period: null, labels: [], ctx: null };

function getTransactionsInRange(start, end) {
    if (!start || !end) return [];
    return appState.transactions.filter((t) => t.date >= start && t.date <= end);
}

function initReportsPeriodDefaults() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    const setIfEmpty = (id, val) => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = val;
    };
    setIfEmpty('reports-range-start', monthStart);
    setIfEmpty('reports-range-end', monthEnd);
    setIfEmpty('reports-compare-a-start', prevStart);
    setIfEmpty('reports-compare-a-end', prevEnd);
    setIfEmpty('reports-compare-b-start', monthStart);
    setIfEmpty('reports-compare-b-end', monthEnd);
    const monthInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setIfEmpty('reports-period-month', monthInput);
}

function initAnalysisPeriodMode() {
    try {
        const saved = localStorage.getItem(ANALYSIS_PERIOD_KEY);
        if (saved && PERIOD_MODES.includes(saved)) reportsPeriodMode = saved;
    } catch { /* ignore */ }
    setReportsPeriodMode(reportsPeriodMode, true);
}

function setReportsPeriodMode(mode, skipRender = false) {
    reportsPeriodMode = mode;
    try { localStorage.setItem(ANALYSIS_PERIOD_KEY, mode); } catch { /* ignore */ }
    document.getElementById('btn-reports-mode-year')?.classList.toggle('active', mode === 'year');
    document.getElementById('btn-reports-mode-month')?.classList.toggle('active', mode === 'month');
    document.getElementById('btn-reports-mode-range')?.classList.toggle('active', mode === 'range');
    document.getElementById('btn-reports-mode-compare')?.classList.toggle('active', mode === 'compare');
    document.getElementById('reports-period-year-wrap')?.classList.toggle('hidden', mode !== 'year');
    document.getElementById('reports-period-month-wrap')?.classList.toggle('hidden', mode !== 'month');
    document.getElementById('reports-period-range-wrap')?.classList.toggle('hidden', mode !== 'range');
    document.getElementById('reports-period-compare-wrap')?.classList.toggle('hidden', mode !== 'compare');
    if (mode === 'compare') setAnalysisSection('overview');
    if (mode === 'month') {
        const { year, monthIndex } = getMonthBoundsFromValue(getReportsMonthValue());
        reportsCalendarYear = year;
        reportsCalendarMonth = monthIndex;
    }
    if (!skipRender) renderReports();
}

function getReportsPeriodContext() {
    initReportsPeriodDefaults();

    if (reportsPeriodMode === 'range') {
        const start = document.getElementById('reports-range-start')?.value || '1970-01-01';
        const end = document.getElementById('reports-range-end')?.value || '2099-12-31';
        const periodTx = getTransactionsInRange(start, end);
        return {
            mode: 'range',
            period: 'range',
            label: `${formatTxDate(start)} – ${formatTxDate(end)}`,
            periodTx,
            rangeStart: start,
            rangeEnd: end
        };
    }

    if (reportsPeriodMode === 'compare') {
        const aStart = document.getElementById('reports-compare-a-start')?.value;
        const aEnd = document.getElementById('reports-compare-a-end')?.value;
        const bStart = document.getElementById('reports-compare-b-start')?.value;
        const bEnd = document.getElementById('reports-compare-b-end')?.value;
        const periodA = getTransactionsInRange(aStart, aEnd);
        const periodB = getTransactionsInRange(bStart, bEnd);
        return {
            mode: 'compare',
            period: 'compare',
            label: 'Porównanie okresów',
            periodTx: periodA,
            periodA: { start: aStart, end: aEnd, tx: periodA },
            periodB: { start: bStart, end: bEnd, tx: periodB }
        };
    }

    if (reportsPeriodMode === 'month') {
        const monthValue = getReportsMonthValue();
        const { start, end } = getMonthBoundsFromValue(monthValue);
        const periodTx = getTransactionsInRange(start, end);
        return {
            mode: 'month',
            period: 'month',
            label: formatMonthLabel(monthValue),
            periodTx,
            rangeStart: start,
            rangeEnd: end,
            monthValue
        };
    }

    const period = document.getElementById('reports-year-select')?.value || String(new Date().getFullYear());
    return {
        mode: 'year',
        period,
        label: period === 'all' ? 'Całość' : period,
        periodTx: getTransactionsForReportsPeriod(period),
        rangeStart: null,
        rangeEnd: null
    };
}

function summarizePeriod(tx) {
    const income = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    const savings = income > 0 ? Math.round((balance / income) * 100) : 0;
    return { income, expense, balance, savings };
}

function renderReportsCompare(ctx) {
    const card = document.getElementById('reports-compare-card');
    if (!card) return;
    const visible = ctx.mode === 'compare';
    card.classList.toggle('hidden', !visible);
    if (!visible) return;

    const a = summarizePeriod(ctx.periodA.tx);
    const b = summarizePeriod(ctx.periodB.tx);
    const delta = (curr, prev) => {
        if (!prev) return curr > 0 ? '+100%' : '0%';
        const pct = Math.round(((curr - prev) / prev) * 100);
        return `${pct >= 0 ? '+' : ''}${pct}%`;
    };

    card.innerHTML = `<h2>Porównanie okresów</h2>
        <div class="compare-grid">
            <div class="compare-col">
                <div class="compare-col-label">Okres A</div>
                <div class="compare-dates">${formatTxDate(ctx.periodA.start)} – ${formatTxDate(ctx.periodA.end)}</div>
                <div class="compare-stat"><span>Wpływy</span><strong class="income">${formatPlnAmount(a.income)}</strong></div>
                <div class="compare-stat"><span>Wydatki</span><strong class="expense">${formatPlnAmount(a.expense)}</strong></div>
                <div class="compare-stat"><span>Bilans</span><strong>${formatPlnAmount(a.balance)}</strong></div>
                <div class="compare-stat"><span>Oszczędności</span><strong>${a.savings}%</strong></div>
            </div>
            <div class="compare-col">
                <div class="compare-col-label">Okres B</div>
                <div class="compare-dates">${formatTxDate(ctx.periodB.start)} – ${formatTxDate(ctx.periodB.end)}</div>
                <div class="compare-stat"><span>Wpływy</span><strong class="income">${formatPlnAmount(b.income)}</strong><em>${delta(b.income, a.income)}</em></div>
                <div class="compare-stat"><span>Wydatki</span><strong class="expense">${formatPlnAmount(b.expense)}</strong><em>${delta(b.expense, a.expense)}</em></div>
                <div class="compare-stat"><span>Bilans</span><strong>${formatPlnAmount(b.balance)}</strong><em>${delta(b.balance, a.balance)}</em></div>
                <div class="compare-stat"><span>Oszczędności</span><strong>${b.savings}%</strong><em>${delta(b.savings, a.savings)}</em></div>
            </div>
        </div>
        ${buildDebtCompareHtml(ctx)}`;
}

function getDebtPaymentsForBounds(start, end, txList) {
    const loanPayments = txList
        .filter((t) => t.type === 'expense' && isLoanOrDebtPayment(t))
        .reduce((s, t) => s + t.amount, 0);
    const cardRepayments = sumCardRepaymentsInRange(start, end);
    return { loanPayments, cardRepayments, total: loanPayments + cardRepayments };
}

function buildDebtCompareHtml(ctx) {
    const debtA = getDebtPaymentsForBounds(ctx.periodA.start, ctx.periodA.end, ctx.periodA.tx);
    const debtB = getDebtPaymentsForBounds(ctx.periodB.start, ctx.periodB.end, ctx.periodB.tx);
    const delta = (curr, prev) => {
        if (!prev) return curr > 0 ? '+100%' : '0%';
        const pct = Math.round(((curr - prev) / prev) * 100);
        return `${pct >= 0 ? '+' : ''}${pct}%`;
    };

    const loanRows = getActiveLoans().map((loan) => {
        const name = escapeHtml(getLoanDisplayName(loan));
        const a = ctx.periodA.tx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        const b = ctx.periodB.tx
            .filter((t) => t.type === 'expense' && transactionMatchesLoan(t, loan))
            .reduce((s, t) => s + t.amount, 0);
        if (!a && !b) return '';
        return `<div class="debt-compare-row">
            <span>${name}</span>
            <strong>${formatPlnAmount(a)}</strong>
            <strong>${formatPlnAmount(b)}</strong>
            <em>${delta(b, a)}</em>
        </div>`;
    }).filter(Boolean).join('');

    const cardRows = getActiveCreditCards().map((card) => {
        const name = escapeHtml(card.name);
        const a = getCreditCardMovementsInRange(ctx.periodA.start, ctx.periodA.end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);
        const b = getCreditCardMovementsInRange(ctx.periodB.start, ctx.periodB.end)
            .filter((m) => m.cardId === card.id && m.type === 'repayment')
            .reduce((s, m) => s + m.amount, 0);
        if (!a && !b) return '';
        return `<div class="debt-compare-row">
            <span>${name} (karta)</span>
            <strong>${formatPlnAmount(a)}</strong>
            <strong>${formatPlnAmount(b)}</strong>
            <em>${delta(b, a)}</em>
        </div>`;
    }).filter(Boolean).join('');

    const detailRows = loanRows + cardRows;
    const detailBlock = detailRows
        ? `<div class="debt-compare-details">
            <div class="debt-compare-row debt-compare-row--head">
                <span>Pozycja</span><span>Okres A</span><span>Okres B</span><span>Zmiana</span>
            </div>
            ${detailRows}
        </div>`
        : '';

    return `<div class="debt-compare-section">
        <h3 class="analysis-subsection-label">Spłaty długów</h3>
        <div class="compare-grid compare-grid--debt">
            <div class="compare-col">
                <div class="compare-stat"><span>Razem spłaty</span><strong class="expense">${formatPlnAmount(debtA.total)}</strong></div>
                <div class="compare-stat"><span>Raty kredytów</span><strong>${formatPlnAmount(debtA.loanPayments)}</strong></div>
                <div class="compare-stat"><span>Spłaty kart</span><strong>${formatPlnAmount(debtA.cardRepayments)}</strong></div>
            </div>
            <div class="compare-col">
                <div class="compare-stat"><span>Razem spłaty</span><strong class="expense">${formatPlnAmount(debtB.total)}</strong><em>${delta(debtB.total, debtA.total)}</em></div>
                <div class="compare-stat"><span>Raty kredytów</span><strong>${formatPlnAmount(debtB.loanPayments)}</strong><em>${delta(debtB.loanPayments, debtA.loanPayments)}</em></div>
                <div class="compare-stat"><span>Spłaty kart</span><strong>${formatPlnAmount(debtB.cardRepayments)}</strong><em>${delta(debtB.cardRepayments, debtA.cardRepayments)}</em></div>
            </div>
        </div>
        ${detailBlock}
    </div>`;
}

function renderReportsFlow(ctx) {
    const el = document.getElementById('reports-flow-chart');
    if (!el) return;

    const { income, expense, balance } = summarizePeriod(ctx.periodTx);
    if (!income && !expense) {
        el.innerHTML = '<div class="empty-state"><p>Brak danych</p></div>';
        return;
    }

    const catSums = {};
    ctx.periodTx.filter((t) => t.type === 'expense').forEach((t) => {
        catSums[t.mainCategory] = (catSums[t.mainCategory] || 0) + t.amount;
    });
    const topCats = Object.entries(catSums).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxCat = Math.max(...topCats.map(([, amt]) => amt), 1);

    el.innerHTML = `
        <div class="flow-total flow-total--income">
            <span>Wpływy</span>
            <strong>${formatPlnAmount(income)}</strong>
        </div>
        <div class="flow-lines">
            ${topCats.map(([name, amt]) => `<div class="flow-line">
                <div class="flow-line-head">
                    <span class="flow-line-name">${escapeHtml(name)}</span>
                    <span class="flow-line-amt">−${formatPlnAmount(amt)}</span>
                </div>
                <div class="flow-line-bar" aria-hidden="true"><i style="width:${Math.round((amt / maxCat) * 100)}%"></i></div>
            </div>`).join('')}
        </div>
        <div class="flow-total flow-total--balance ${balance >= 0 ? 'positive' : 'negative'}">
            <span>Bilans</span>
            <strong>${balance >= 0 ? '+' : ''}${formatPlnAmount(balance)}</strong>
        </div>`;
}

function isLoanOrDebtPayment(t) {
    if (t.type !== 'expense') return false;
    if (t.mainCategory === 'Długi') return true;
    const hay = `${t.mainCategory} ${t.subCategory} ${t.note || ''}`.toLowerCase();
    return /kredyt|hipotec|\brata\b|raty|spłat|splat|nadpłat|nadplat|lokat|pekao|hipotek/.test(hay);
}

function getRecurringGroupKey(t) {
    const sub = t.subCategory === '[Bez podkategorii]' ? '' : t.subCategory;
    return `${t.mainCategory}|${sub}`;
}

const RECURRING_KEYWORDS = /czynsz|\brata\b|raty|subskrypc|netflix|spotify|ubezpieczen|telefon|internet|najem|leasing|kredyt|hipotec|lokat|opłat|oplat|muzyk|youtube|disney|hbo|audiobook|kablówk|kablowk|delegac|abonament/i;

function getExpenseGroupKey(t, rankLevel) {
    if (rankLevel === 'sub') return getRecurringGroupKey(t);
    return t.mainCategory;
}

function getSixMonthsAgoDate() {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
}

function detectRecurringExpenses(rankLevel = 'main') {
    const cutoff = getSixMonthsAgoDate();
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 60);
    const recentCutoffStr = recentCutoff.toISOString().split('T')[0];
    const now = new Date();
    const fourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const byKey = {};
    appState.transactions
        .filter((t) => t.type === 'expense' && t.date >= cutoff)
        .forEach((t) => {
            const key = getExpenseGroupKey(t, rankLevel);
            if (!byKey[key]) byKey[key] = [];
            byKey[key].push(t);
        });

    const results = [];
    Object.entries(byKey).forEach(([key, txs]) => {
        const monthlyTotals = {};
        txs.forEach((t) => {
            const m = t.date.substring(0, 7);
            monthlyTotals[m] = (monthlyTotals[m] || 0) + t.amount;
        });
        const monthsWithSpending = Object.keys(monthlyTotals);
        if (monthsWithSpending.length < 2) return;

        const activeRecent = monthsWithSpending.filter((m) => {
            const [y, mo] = m.split('-').map(Number);
            return new Date(y, mo - 1, 1) >= fourMonthsAgo;
        });
        if (activeRecent.length < 2) return;

        const latest = [...txs].sort((a, b) => b.date.localeCompare(a.date))[0];
        if (latest.date < recentCutoffStr) return;

        const amounts = activeRecent.map((m) => monthlyTotals[m]).sort((a, b) => a - b);
        const median = amounts[Math.floor(amounts.length / 2)];
        const tolerance = Math.max(median * 0.3, 50);
        const stableRatio = amounts.filter((a) => Math.abs(a - median) <= tolerance).length / amounts.length;

        const subRaw = rankLevel === 'sub' ? key.split('|')[1] : '';
        const mainCategory = rankLevel === 'sub' ? key.split('|')[0] : key;
        const subCategory = rankLevel === 'sub' ? (subRaw || '[Bez podkategorii]') : '[Bez podkategorii]';
        const labelText = `${mainCategory} ${subRaw} ${txs.map((t) => t.note || '').join(' ')}`.toLowerCase();
        const hasKeyword = RECURRING_KEYWORDS.test(labelText);
        const minMonths = hasKeyword ? 2 : 3;
        if (activeRecent.length < minMonths || stableRatio < 0.6) return;

        const avgMonthly = Math.round(
            activeRecent.reduce((s, m) => s + monthlyTotals[m], 0) / activeRecent.length
        );

        results.push({
            key,
            amount: avgMonthly,
            avgMonthly,
            mainCategory,
            subCategory,
            source: 'detected',
            months: activeRecent.length,
            lastDate: latest.date,
            hasKeyword
        });
    });
    return results;
}

function getManualRecurringEntries(rankLevel = 'main') {
    const byId = {};
    appState.transactions.forEach((t) => {
        if (!t.recurringId || t.type !== 'expense') return;
        const prev = byId[t.recurringId];
        if (!prev || t.date >= prev.lastDate) {
            byId[t.recurringId] = {
                amount: t.amount,
                mainCategory: t.mainCategory,
                subCategory: t.subCategory,
                source: 'manual',
                months: null,
                lastDate: t.date
            };
        }
    });

    const entries = Object.values(byId);
    if (rankLevel === 'sub') {
        return entries.map((e) => ({
            ...e,
            key: getRecurringGroupKey(e)
        }));
    }

    const merged = {};
    entries.forEach((e) => {
        const k = e.mainCategory;
        if (!merged[k]) {
            merged[k] = { ...e, key: k, subCategory: '[Bez podkategorii]' };
        } else {
            merged[k].amount += e.amount;
            if (e.lastDate > merged[k].lastDate) merged[k].lastDate = e.lastDate;
        }
    });
    return Object.values(merged);
}

function getAllRecurringEntries(rankLevel = 'main') {
    const manual = getManualRecurringEntries(rankLevel);
    const manualKeys = new Set(manual.map((m) => m.key));
    const detected = detectRecurringExpenses(rankLevel).filter((d) => !manualKeys.has(d.key));
    return [...manual, ...detected].sort((a, b) => b.amount - a.amount);
}

function renderDetectedRecurringList() {
    const list = document.getElementById('reports-recurring-list');
    if (!list) return;

    const rankLevel = typeof reportsRankLevel !== 'undefined' ? reportsRankLevel : 'main';
    if (typeof syncReportsRankToggles === 'function') syncReportsRankToggles();

    const entries = getAllRecurringEntries(rankLevel);
    if (!entries.length) {
        list.innerHTML = '<div class="empty-state"><p>Brak aktywnych wydatków cyklicznych w ostatnich miesiącach</p></div>';
        return;
    }

    const monthlyTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
    list.innerHTML = entries.map((entry) => {
        const showSub = rankLevel === 'sub' && entry.subCategory !== '[Bez podkategorii]';
        const title = showSub ? entry.subCategory : entry.mainCategory;
        const metaLine = showSub ? escapeHtml(entry.mainCategory) : '';
        const badge = entry.source === 'manual'
            ? '<span class="recurring-badge recurring-badge--manual">Oznaczone ręcznie</span>'
            : `<span class="recurring-badge recurring-badge--detected">Wykryte · ${entry.months} mies.</span>`;
        const lastLine = entry.lastDate ? `ostatnio ${formatTxDate(entry.lastDate)}` : '';
        return `<div class="reports-recurring-item">
            ${renderCategoryIcon(entry.mainCategory, 'list', showSub ? entry.subCategory : null, 'expense')}
            <div class="reports-top-text">
                <span class="reports-top-name">${escapeHtml(title)}</span>
                <span class="reports-top-meta">${metaLine}${metaLine && lastLine ? ' · ' : ''}${lastLine} ${badge}</span>
            </div>
            <span class="reports-recurring-amount">${formatPlnAmount(entry.amount)}/mies.</span>
        </div>`;
    }).join('') + `<div class="reports-recurring-total">Szacunkowa suma: <strong>${formatPlnAmount(monthlyTotal)}</strong>/mies.</div>`;
}

function renderReportsOutliers(ctx) {
    const list = document.getElementById('reports-outliers-list');
    if (!list) return;

    const outliers = ctx.periodTx
        .filter((t) => t.type === 'expense' && !isLoanOrDebtPayment(t))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);

    if (!outliers.length) {
        list.innerHTML = '<div class="empty-state"><p>Brak nietypowych wydatków w tym okresie</p></div>';
        return;
    }

    list.innerHTML = outliers.map((t, i) => {
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        return `<div class="reports-top-item">
            <span class="reports-top-rank">${i + 1}</span>
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, 'expense')}
            <div class="reports-top-text">
                <span class="reports-top-name">${escapeHtml(title)}</span>
                <span class="reports-top-meta">${formatTxDate(t.date)} · ${escapeHtml(t.mainCategory)}</span>
            </div>
            <span class="reports-top-pct expense-pct">${formatPlnAmount(t.amount)}</span>
        </div>`;
    }).join('');
}

function getCategoryMonthlyTotals(mainCategory, subCategory, rankLevel, monthsBack = 3) {
    const now = new Date();
    const totals = [];
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        const sum = appState.transactions
            .filter((t) => {
                if (t.type !== 'expense' || t.mainCategory !== mainCategory || t.date < start || t.date > end) return false;
                if (rankLevel === 'sub' && subCategory) {
                    const sub = t.subCategory === '[Bez podkategorii]' ? null : t.subCategory;
                    return sub === subCategory;
                }
                return true;
            })
            .reduce((s, t) => s + t.amount, 0);
        totals.push(sum);
    }
    return totals;
}

function buildTrendEntries(rankLevel) {
    const keys = {};
    appState.transactions
        .filter((t) => t.type === 'expense')
        .forEach((t) => {
            if (rankLevel === 'sub') {
                const sub = t.subCategory === '[Bez podkategorii]' ? null : t.subCategory;
                const key = sub ? `${t.mainCategory}|${sub}` : t.mainCategory;
                if (!keys[key]) {
                    keys[key] = { mainCategory: t.mainCategory, subCategory: sub, label: sub || t.mainCategory };
                }
            } else if (!keys[t.mainCategory]) {
                keys[t.mainCategory] = { mainCategory: t.mainCategory, subCategory: null, label: t.mainCategory };
            }
        });
    return Object.values(keys);
}

function renderReportsCategoryTrends() {
    const list = document.getElementById('reports-trends-list');
    if (!list) return;

    const rankLevel = typeof reportsRankLevel !== 'undefined' ? reportsRankLevel : 'main';
    if (typeof syncReportsRankToggles === 'function') syncReportsRankToggles();

    const entries = buildTrendEntries(rankLevel).map((entry) => {
        const totals = getCategoryMonthlyTotals(entry.mainCategory, entry.subCategory, rankLevel, 3);
        const trend = totals[2] - totals[0];
        const rising = totals[0] < totals[1] && totals[1] < totals[2];
        const falling = totals[0] > totals[1] && totals[1] > totals[2];
        return { ...entry, totals, trend, rising, falling };
    }).filter((e) => e.totals.some((v) => v > 0))
        .sort((a, b) => Math.abs(b.trend) - Math.abs(a.trend))
        .slice(0, 8);

    if (!entries.length) {
        list.innerHTML = '<div class="empty-state"><p>Za mało danych (min. 2 miesiące)</p></div>';
        return;
    }

    list.innerHTML = entries.map((e) => {
        const arrow = e.rising ? '↑ rośnie' : (e.falling ? '↓ spada' : '→ stabilnie');
        const arrowClass = e.rising ? 'trend-up' : (e.falling ? 'trend-down' : 'trend-flat');
        const meta = rankLevel === 'sub' && e.subCategory ? escapeHtml(e.mainCategory) + ' · ' : '';
        return `<div class="trend-row">
            ${renderCategoryIcon(e.mainCategory, 'list', e.subCategory, 'expense')}
            <div class="trend-text">
                <span class="reports-top-name">${escapeHtml(e.label)}</span>
                <span class="reports-top-meta">${meta}${e.totals.map((v) => formatCompactPln(v)).join(' → ')} zł</span>
            </div>
            <span class="trend-badge ${arrowClass}">${arrow}</span>
        </div>`;
    }).join('');
}

function renderReportsForecast(ctx) {
    const el = document.getElementById('reports-forecast');
    if (!el) return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    const monthExpenses = appState.transactions
        .filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= now.toISOString().split('T')[0])
        .reduce((s, t) => s + t.amount, 0);

    const dailyAvg = dayOfMonth > 0 ? monthExpenses / dayOfMonth : 0;
    const forecast = dailyAvg * daysInMonth;
    const remaining = forecast - monthExpenses;

    el.innerHTML = `
        <div class="forecast-stats">
            <div class="forecast-stat">
                <span class="forecast-label">Wydano do dziś</span>
                <strong class="forecast-value expense">${formatPlnAmount(monthExpenses)}</strong>
            </div>
            <div class="forecast-stat">
                <span class="forecast-label">Prognoza na miesiąc</span>
                <strong class="forecast-value">${formatPlnAmount(forecast)}</strong>
            </div>
            <div class="forecast-stat">
                <span class="forecast-label">Szac. do końca mies.</span>
                <strong class="forecast-value">${formatPlnAmount(remaining)}</strong>
            </div>
        </div>
        <p class="reports-hint">Na podstawie średniej dziennej z ${dayOfMonth} dni.</p>`;
}

function setReportsCalendarView(view) {
    reportsCalendarView = view;
    document.getElementById('btn-cal-month')?.classList.toggle('active', view === 'month');
    document.getElementById('btn-cal-year')?.classList.toggle('active', view === 'year');
    document.getElementById('reports-calendar-grid')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-year-heatmap')?.classList.toggle('hidden', view === 'month');
    document.getElementById('reports-calendar-nav')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-calendar-legend')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-debt-calendar-card')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-debt-peak-card')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-debt-freedom-card')?.classList.toggle('hidden', view === 'year');
    renderReportsCalendarView();
}

function renderReportsCalendarView() {
    if (reportsCalendarView === 'year') {
        renderReportsYearHeatmap();
    } else {
        renderReportsCalendar();
        renderDebtCalendarSection();
    }
}

function addMonthsToDate(isoDate, months) {
    const d = new Date(`${isoDate}T12:00:00`);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

function getLoanInstallmentDay(loan) {
    if (!loan?.nextInstallmentDue) return null;
    const day = parseInt(loan.nextInstallmentDue.split('-')[2], 10);
    return Number.isNaN(day) ? null : day;
}

function getLoanPayoffEndDate(loan) {
    const capital = loan.currentCapitalLeft || 0;
    if (!capital) return null;
    if (loan.details?.endDate) return loan.details.endDate;
    const today = new Date().toISOString().split('T')[0];
    if (loan.details?.remainingInstallments > 0) {
        return addMonthsToDate(today, loan.details.remainingInstallments);
    }
    if (loan.nextInstallmentAmount > 0) {
        const months = Math.ceil(capital / loan.nextInstallmentAmount);
        return addMonthsToDate(today, months);
    }
    return null;
}

function getCardRepaymentHint(card) {
    if (!(card.currentBalance > 0)) return null;
    const movements = (appState.creditCardMovements || [])
        .filter((m) => m.cardId === card.id && m.type === 'repayment')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-8);
    if (!movements.length) return null;
    const days = movements.map((m) => parseInt(m.date.split('-')[2], 10)).filter((d) => !Number.isNaN(d));
    if (!days.length) return null;
    const avgDay = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
    const avgAmt = getRecentCardRepaymentAverage(card.id);
    if (avgAmt < 1) return null;
    return { day: avgDay, amount: avgAmt, estimated: true };
}

function getEffectiveDueDay(dueDay, year, monthIndex) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return Math.min(dueDay, daysInMonth);
}

function getScheduledDebtPaymentsOnDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const monthIndex = month - 1;
    const items = [];

    getActiveLoans().forEach((loan) => {
        if (!(loan.nextInstallmentAmount > 0 && loan.nextInstallmentDue && loan.currentCapitalLeft > 0)) return;
        const dueDay = getLoanInstallmentDay(loan);
        if (!dueDay) return;
        if (getEffectiveDueDay(dueDay, year, monthIndex) !== day) return;
        const firstYm = loan.nextInstallmentDue.slice(0, 7);
        const curYm = dateStr.slice(0, 7);
        if (curYm < firstYm) return;
        if (curYm === firstYm && day < getEffectiveDueDay(dueDay, year, monthIndex)) return;
        const payoffEnd = getLoanPayoffEndDate(loan);
        if (payoffEnd && dateStr > payoffEnd) return;
        items.push({
            type: 'loan',
            id: loan.id,
            name: getLoanDisplayName(loan),
            amount: loan.nextInstallmentAmount,
            estimated: false
        });
    });

    getActiveCreditCards().forEach((card) => {
        const hint = getCardRepaymentHint(card);
        if (!hint) return;
        if (getEffectiveDueDay(hint.day, year, monthIndex) !== day) return;
        items.push({
            type: 'card',
            id: card.id,
            name: card.name,
            amount: hint.amount,
            estimated: true
        });
    });

    return items;
}

function buildDebtPeakSeries(monthsAhead = 24) {
    const labels = [];
    const totals = [];
    const now = new Date();

    for (let i = 0; i < monthsAhead; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const year = d.getFullYear();
        const monthIndex = d.getMonth();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        labels.push(d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));

        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            getScheduledDebtPaymentsOnDate(dateStr).forEach((p) => { total += p.amount; });
        }
        totals.push(total);
    }

    const peakValue = Math.max(0, ...totals);
    const peakIdx = totals.indexOf(peakValue);
    return { labels, totals, peakIdx, peakValue, peakLabel: labels[peakIdx] || '' };
}

function buildDebtFreedomTimeline() {
    const today = new Date().toISOString().split('T')[0];
    const items = [];

    getActiveLoans().forEach((loan) => {
        if (!(loan.currentCapitalLeft > 0)) return;
        const est = estimateLoanPayoff(loan);
        const endDate = getLoanPayoffEndDate(loan);
        items.push({
            kind: 'loan',
            id: loan.id,
            name: getLoanDisplayName(loan),
            endDate,
            label: est.label,
            detail: est.detail,
            amount: loan.currentCapitalLeft || 0
        });
    });

    getActiveCreditCards().forEach((card) => {
        if (!(card.currentBalance > 0)) return;
        const est = estimateCardPayoff(card);
        let endDate = null;
        const monthMatch = /^~(\d+)\s*mies/.exec(est.label || '');
        if (monthMatch) endDate = addMonthsToDate(today, parseInt(monthMatch[1], 10));
        items.push({
            kind: 'card',
            id: card.id,
            name: card.name,
            endDate,
            label: est.label,
            detail: est.detail,
            amount: card.currentBalance
        });
    });

    return items.sort((a, b) => {
        if (!a.endDate && !b.endDate) return a.name.localeCompare(b.name, 'pl');
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return a.endDate.localeCompare(b.endDate);
    });
}

function renderDebtCalendarSection() {
    renderDebtCalendarGrid();
    renderDebtPeakChart();
    renderDebtFreedomTimeline();
    renderDepositsCalendarList();
}

function renderDebtCalendarGrid() {
    const grid = document.getElementById('reports-debt-calendar-grid');
    const totalEl = document.getElementById('reports-debt-calendar-month-total');
    const cardEl = document.getElementById('reports-debt-calendar-card');
    if (!grid || reportsCalendarYear === null) return;

    const loans = getActiveLoans().filter((l) => l.nextInstallmentAmount > 0 && l.nextInstallmentDue);
    const cards = getActiveCreditCards().filter((c) => c.currentBalance > 0);
    const hasHints = cards.some((c) => getCardRepaymentHint(c));

    if (!loans.length && !hasHints) {
        if (cardEl) cardEl.classList.add('hidden');
        return;
    }
    cardEl?.classList.remove('hidden');

    const year = reportsCalendarYear;
    const month = reportsCalendarMonth;
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];

    const byDay = {};
    let monthTotal = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const payments = getScheduledDebtPaymentsOnDate(dateStr);
        if (payments.length) {
            byDay[dateStr] = payments;
            monthTotal += payments.reduce((s, p) => s + p.amount, 0);
        }
    }

    const maxDay = Math.max(0, ...Object.values(byDay).map((list) => list.reduce((s, p) => s + p.amount, 0)));
    const parts = ['<div class="cal-weekday">Pn</div>', '<div class="cal-weekday">Wt</div>', '<div class="cal-weekday">Śr</div>', '<div class="cal-weekday">Cz</div>', '<div class="cal-weekday">Pt</div>', '<div class="cal-weekday">Sb</div>', '<div class="cal-weekday">Nd</div>'];

    for (let i = 0; i < firstDow; i++) parts.push('<div class="cal-cell cal-cell--empty"></div>');

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const payments = byDay[dateStr];
        const todayClass = dateStr === today ? ' cal-cell--today' : '';
        if (payments) {
            const total = payments.reduce((s, p) => s + p.amount, 0);
            const ratio = maxDay > 0 ? total / maxDay : 1;
            const heat = isLightTheme()
                ? `rgba(124, 58, 237, ${0.15 + ratio * 0.45})`
                : `rgba(167, 139, 250, ${0.18 + ratio * 0.5})`;
            const hasEstimate = payments.some((p) => p.estimated);
            parts.push(`<button type="button" class="cal-cell cal-cell--clickable cal-cell--debt${hasEstimate ? ' cal-cell--debt-est' : ''}${todayClass}" style="background:${heat}" onclick="openCalendarDay('${dateStr}')">
                <span class="cal-day-num">${day}</span>
                <span class="cal-day-amount debt">${formatCompactPln(total)}</span>
                <span class="cal-day-debt-count">${payments.length}×</span>
            </button>`);
        } else {
            parts.push(`<button type="button" class="cal-cell cal-cell--clickable${todayClass}" onclick="openCalendarDay('${dateStr}')">
                <span class="cal-day-num">${day}</span>
            </button>`);
        }
    }

    grid.innerHTML = parts.join('');

    if (totalEl) {
        totalEl.innerHTML = monthTotal > 0
            ? `<strong>Planowane spłaty w tym miesiącu: ${formatPlnAmount(monthTotal)}</strong>
               <span class="reports-hint">Raty z umów${hasHints ? ' + szac. spłaty kart (wg ostatnich mies.)' : ''}.</span>`
            : '<p class="reports-hint">Brak zaplanowanych rat w tym miesiącu.</p>';
    }
}

function renderDebtPeakChart() {
    const canvas = document.getElementById('reportsDebtPeakChart');
    const summaryEl = document.getElementById('reports-debt-peak-summary');
    const cardEl = document.getElementById('reports-debt-peak-card');
    if (!canvas) return;

    const series = buildDebtPeakSeries(24);
    if (!series.totals.some((v) => v > 0)) {
        cardEl?.classList.add('hidden');
        if (reportsDebtPeakChartInstance) {
            reportsDebtPeakChartInstance.destroy();
            reportsDebtPeakChartInstance = null;
        }
        return;
    }
    cardEl?.classList.remove('hidden');

    if (reportsDebtPeakChartInstance) reportsDebtPeakChartInstance.destroy();

    const theme = getReportsChartTheme();
    const peakColors = series.totals.map((_, i) => (
        i === series.peakIdx ? 'rgba(124, 58, 237, 0.95)' : 'rgba(124, 58, 237, 0.42)'
    ));

    reportsDebtPeakChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: series.labels,
            datasets: [{
                label: 'Raty i spłaty',
                data: series.totals,
                backgroundColor: peakColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.2,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: theme.tooltipBg,
                    callbacks: {
                        label: (ctx) => formatPlnAmount(ctx.parsed.y)
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: theme.legendColor, maxRotation: 45, minRotation: 0, font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: theme.legendColor, callback: (v) => `${Math.round(v / 1000)}k` },
                    grid: { color: theme.gridColor }
                }
            }
        }
    });

    if (summaryEl && series.peakValue > 0) {
        summaryEl.innerHTML = `<div class="debt-peak-highlight">
            <span class="label">Szczyt obciążenia</span>
            <strong>${formatPlnAmount(series.peakValue)}</strong>
            <span class="reports-hint">w ${escapeHtml(series.peakLabel)} — najwyższa suma planowanych rat w kolejnych 24 mies.</span>
        </div>`;
    }
}

function renderDebtFreedomTimeline() {
    const el = document.getElementById('reports-debt-freedom-timeline');
    const cardEl = document.getElementById('reports-debt-freedom-card');
    if (!el) return;

    const items = buildDebtFreedomTimeline();
    if (!items.length) {
        cardEl?.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    cardEl?.classList.remove('hidden');

    const today = new Date().toISOString().split('T')[0];
    const dated = items.filter((i) => i.endDate);
    const maxMonths = dated.length
        ? Math.max(...dated.map((i) => {
            const d = new Date(`${i.endDate}T12:00:00`);
            const n = new Date(`${today}T12:00:00`);
            return Math.max(1, (d.getFullYear() - n.getFullYear()) * 12 + (d.getMonth() - n.getMonth()));
        }))
        : 1;

    el.innerHTML = items.map((item) => {
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
}

function renderReportsYearHeatmap() {
    const wrap = document.getElementById('reports-year-heatmap');
    const labelEl = document.getElementById('reports-calendar-label');
    if (!wrap || reportsCalendarYear === null) return;

    const year = reportsCalendarYear;
    if (labelEl) labelEl.textContent = `Rok ${year}`;

    const yearExpenses = appState.transactions.filter(
        (t) => t.type === 'expense' && t.date.startsWith(String(year))
    );
    const yearIncome = appState.transactions.filter(
        (t) => t.type === 'income' && t.date.startsWith(String(year))
    );
    const byDayExpense = {};
    const byDayIncome = {};
    yearExpenses.forEach((t) => {
        byDayExpense[t.date] = (byDayExpense[t.date] || 0) + t.amount;
    });
    yearIncome.forEach((t) => {
        byDayIncome[t.date] = (byDayIncome[t.date] || 0) + t.amount;
    });
    const maxDay = Math.max(0, ...Object.values(byDayExpense));

    const months = [];
    for (let m = 0; m < 12; m++) {
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        const cells = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const expenseAmt = byDayExpense[dateStr] || 0;
            const incomeAmt = byDayIncome[dateStr] || 0;
            const heat = getExpenseHeatColor(expenseAmt, maxDay);
            const incomeClass = incomeAmt ? ' heat-dot--income' : '';
            const title = [
                expenseAmt ? `Wydatki: ${formatPlnAmount(expenseAmt)}` : null,
                incomeAmt ? `Wpływy: ${formatPlnAmount(incomeAmt)}` : null
            ].filter(Boolean).join(' · ') || '0 zł';
            cells.push(`<button type="button" class="heat-dot${expenseAmt ? ' heat-dot--active' : ''}${incomeClass}" style="background:${heat}"
                title="${d}: ${title}" onclick="openCalendarDay('${dateStr}')"></button>`);
        }
        const monthName = new Date(year, m, 1).toLocaleDateString('pl-PL', { month: 'short' });
        months.push(`<div class="heat-month">
            <div class="heat-month-label">${monthName}</div>
            <div class="heat-month-grid">${cells.join('')}</div>
        </div>`);
    }
    wrap.innerHTML = months.join('');
}

function openCalendarDayPanel(dateStr) {
    calendarDayDate = dateStr;
    calendarDayFilter = 'all';

    const overlay = document.getElementById('calendar-day-overlay');
    const filterEl = document.getElementById('calendar-day-filter');
    if (!overlay) return;

    if (filterEl) {
        const dayTx = appState.transactions.filter((t) => t.date === dateStr);
        const cats = new Set();
        dayTx.forEach((t) => cats.add(t.mainCategory));
        filterEl.innerHTML = `<option value="all">Wszystkie</option>
            <option value="expense">Tylko wydatki</option>
            <option value="income">Tylko wpływy</option>
            ${[...cats].map((c) => `<option value="cat:${c.replace(/"/g, '&quot;')}">${escapeHtml(c)}</option>`).join('')}`;
        filterEl.value = 'all';
    }

    renderCalendarDayPanel();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function onCalendarDayFilterChange() {
    const filterEl = document.getElementById('calendar-day-filter');
    calendarDayFilter = filterEl?.value || 'all';
    renderCalendarDayPanel();
}

function renderCalendarDayPanel() {
    const titleEl = document.getElementById('calendar-day-title');
    const summaryEl = document.getElementById('calendar-day-summary');
    const listEl = document.getElementById('calendar-day-list');
    if (!calendarDayDate || !titleEl || !summaryEl || !listEl) return;

    let dayTx = appState.transactions.filter((t) => t.date === calendarDayDate);
    if (calendarDayFilter === 'expense') dayTx = dayTx.filter((t) => t.type === 'expense');
    else if (calendarDayFilter === 'income') dayTx = dayTx.filter((t) => t.type === 'income');
    else if (calendarDayFilter.startsWith('cat:')) {
        const cat = calendarDayFilter.slice(4);
        dayTx = dayTx.filter((t) => t.mainCategory === cat);
    }

    dayTx.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
        return b.amount - a.amount;
    });

    const weekday = new Date(`${calendarDayDate}T12:00:00`).toLocaleDateString('pl-PL', { weekday: 'long' });
    titleEl.textContent = formatTxDate(calendarDayDate);

    const expenseTotal = dayTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const incomeTotal = dayTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const scheduled = getScheduledDebtPaymentsOnDate(calendarDayDate);
    const scheduledTotal = scheduled.reduce((s, p) => s + p.amount, 0);

    summaryEl.innerHTML = `<div class="calendar-day-summary-row">
        <span class="calendar-day-weekday">${weekday.charAt(0).toUpperCase() + weekday.slice(1)}</span>
        <div class="calendar-day-totals">
            ${expenseTotal > 0 ? `<span class="calendar-day-total expense">−${formatPlnAmount(expenseTotal)}</span>` : ''}
            ${incomeTotal > 0 ? `<span class="calendar-day-total income">+${formatPlnAmount(incomeTotal)}</span>` : ''}
            ${scheduledTotal > 0 ? `<span class="calendar-day-total debt">◎ ${formatPlnAmount(scheduledTotal)}</span>` : ''}
        </div>
    </div>`;

    const scheduledHtml = scheduled.length
        ? `<div class="calendar-day-scheduled">
            <div class="calendar-day-scheduled-title">Planowane spłaty</div>
            ${scheduled.map((p) => `<div class="calendar-day-scheduled-row">
                <span>${escapeHtml(p.name)}${p.estimated ? ' <em>(szac.)</em>' : ''}</span>
                <strong>${formatPlnAmount(p.amount)}</strong>
            </div>`).join('')}
        </div>`
        : '';

    if (!dayTx.length && !scheduled.length) {
        listEl.innerHTML = '<div class="empty-state"><p>Brak transakcji</p></div>';
        return;
    }

    if (!dayTx.length) {
        listEl.innerHTML = scheduledHtml + '<div class="empty-state"><p>Brak transakcji tego dnia</p></div>';
        return;
    }

    listEl.innerHTML = scheduledHtml + dayTx.map((t) => {
        const globalIndex = appState.transactions.indexOf(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const meta = t.subCategory === '[Bez podkategorii]' ? '' : t.mainCategory;
        const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
        return `<div class="calendar-day-tx">
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)}
            <div class="tx-info">
                <div class="tx-title">${escapeHtml(title)}${isRec}</div>
                ${meta ? `<div class="tx-meta">${escapeHtml(meta)}</div>` : ''}
                ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ''}
            </div>
            <div class="calendar-day-tx-actions">
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${t.amount.toFixed(2)} zł</div>
                ${globalIndex >= 0 ? `<button type="button" class="btn-cal-edit" onclick="editFromCalendarDay(${globalIndex})">Edytuj</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

function editFromCalendarDay(index) {
    closeCalendarDay();
    editTransaction(index);
}

function storeReportsMonthChartMeta(period, labels, ctx, monthKeys) {
    reportsMonthChartMeta = { period, labels, ctx, monthKeys: monthKeys || [] };
}

function resolveMonthFromChartIndex(index) {
    const { monthKeys } = reportsMonthChartMeta;
    if (monthKeys?.[index]) return monthKeys[index];
    const { period, ctx } = reportsMonthChartMeta;
    const now = new Date();
    if (period === 'all') {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
        return { year: monthDate.getFullYear(), month: monthDate.getMonth() };
    }
    if (ctx?.mode === 'range') return null;
    const year = parseInt(period, 10);
    if (Number.isNaN(year)) return null;
    return { year, month: index };
}

function attachReportsMonthChartClick(options) {
    options.onClick = (_evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const { period, monthKeys } = reportsMonthChartMeta;
        if (period === 'month' && monthKeys?.[idx]?.day) {
            const { year, month, day } = monthKeys[idx];
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            openCalendarDay(dateStr);
            return;
        }
        const resolved = resolveMonthFromChartIndex(idx);
        if (resolved) openMonthDrillDown(resolved.year, resolved.month);
    };
}

function openMonthDrillDown(year, month) {
    const overlay = document.getElementById('month-drill-overlay');
    const titleEl = document.getElementById('month-drill-title');
    const listEl = document.getElementById('month-drill-list');
    const summaryEl = document.getElementById('month-drill-summary');
    if (!overlay || !listEl) return;

    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const monthTx = appState.transactions.filter((t) => t.date >= start && t.date <= end);
    const label = new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

    if (titleEl) titleEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const s = summarizePeriod(monthTx);
    if (summaryEl) {
        summaryEl.innerHTML = `<div class="month-drill-stats">
            <span class="income">+${formatPlnAmount(s.income)}</span>
            <span class="expense">−${formatPlnAmount(s.expense)}</span>
            <span class="${s.balance >= 0 ? 'income' : 'expense'}">${s.balance >= 0 ? '+' : ''}${formatPlnAmount(s.balance)}</span>
        </div>`;
    }

    const expenses = monthTx.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount);
    listEl.innerHTML = expenses.length
        ? expenses.map((t) => {
            const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
            return `<div class="calendar-day-tx">
                ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, 'expense')}
                <div class="tx-info">
                    <div class="tx-title">${escapeHtml(title)}</div>
                    <div class="tx-meta">${formatTxDate(t.date)}</div>
                </div>
                <div class="tx-amount expense">−${t.amount.toFixed(2)} zł</div>
            </div>`;
        }).join('')
        : '<div class="empty-state"><p>Brak transakcji</p></div>';

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeMonthDrill() {
    document.getElementById('month-drill-overlay')?.classList.add('hidden');
    if (!document.getElementById('calendar-day-overlay')?.classList.contains('hidden')) return;
    document.body.style.overflow = '';
}

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
    const end = new Date(year, month + 1, 0).toISOString().split('T')[0];
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
    return d.toISOString().split('T')[0];
}

function getRecentCardRepaymentAverage(cardId, months = 3) {
    const end = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const start = startDate.toISOString().split('T')[0];
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

function getPeriodDayCount(ctx) {
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 30;
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function getAnalysisSummaryAssets() {
    if (typeof getSummaryAssets === 'function') return getSummaryAssets();
    if (typeof getActiveAssets === 'function') return getActiveAssets();
    return (appState.assets || []).filter((a) => !a.archived);
}

function getLiquidCashPln() {
    if (typeof getOperationalCashPln === 'function') return getOperationalCashPln();
    return getAnalysisSummaryAssets()
        .filter((a) => a.type === 'cash')
        .reduce((sum, a) => sum + getAssetValuePln(a), 0);
}

function getAssetsHorizonTotals() {
    if (typeof getAssetsByHorizon !== 'function' || typeof getActiveAssetsTotalPln !== 'function') {
        const total = getPortfolioValuePln();
        return { short: total, long: 0 };
    }
    const shortAssets = getAssetsByHorizon('short').filter((a) => a.includeInSummary !== false);
    const longAssets = getAssetsByHorizon('long').filter((a) => a.includeInSummary !== false);
    return {
        short: getActiveAssetsTotalPln(shortAssets),
        long: getActiveAssetsTotalPln(longAssets)
    };
}

function buildAssetAllocationSlices() {
    const byType = {};
    getAnalysisSummaryAssets().forEach((asset) => {
        const type = asset.type || 'investment';
        const label = typeof ASSET_TYPE_LABELS !== 'undefined'
            ? (ASSET_TYPE_LABELS[type] || type)
            : type;
        byType[label] = (byType[label] || 0) + getAssetValuePln(asset);
    });
    return Object.entries(byType)
        .map(([label, amount]) => ({ label, amount }))
        .filter((slice) => slice.amount > 0)
        .sort((a, b) => b.amount - a.amount);
}

function buildAssetHorizonSlices() {
    if (typeof getAssetHorizon !== 'function' || typeof ASSET_HORIZON_LABELS === 'undefined') {
        return buildAssetAllocationSlices();
    }
    const buckets = { short: 0, long: 0 };
    getAnalysisSummaryAssets().forEach((asset) => {
        const horizon = getAssetHorizon(asset);
        buckets[horizon] = (buckets[horizon] || 0) + getAssetValuePln(asset);
    });
    return ['short', 'long']
        .map((horizon) => ({
            label: ASSET_HORIZON_LABELS[horizon],
            amount: buckets[horizon] || 0,
            horizon
        }))
        .filter((slice) => slice.amount > 0);
}

function buildCashBalanceTrendData(ctx, assetId = PRIMARY_CASH_ASSET_ID) {
    const asset = typeof getAssetById === 'function' ? getAssetById(assetId) : null;
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromCtx(ctx);
    const { monthLabels, monthKeys } = buildReportsMonthChartData(
        chartPeriod,
        ctx.periodTx,
        chartRangeStart,
        chartRangeEnd
    );
    if (!asset || asset.type !== 'cash' || !monthKeys.length) {
        return { monthLabels: [], balanceData: [] };
    }

    const balanceData = new Array(monthKeys.length);
    balanceData[balanceData.length - 1] = asset.amount || 0;

    for (let i = monthKeys.length - 2; i >= 0; i -= 1) {
        const { start, end } = monthKeyToDateRange(monthKeys[i + 1]);
        const delta = getCashMovementsInRange(start, end, assetId)
            .reduce((s, m) => s + m.delta, 0);
        balanceData[i] = balanceData[i + 1] - delta;
    }

    return { monthLabels, balanceData };
}

function renderReportsAssetAllocationChart(ctx, canvasId = 'reportsAssetAllocationChart', legendId = 'reports-asset-allocation-legend') {
    const canvas = document.getElementById(canvasId);
    const legendEl = document.getElementById(legendId);
    if (!canvas) return;

    const slices = buildAssetAllocationSlices();
    const isTabChart = canvasId === 'reportsAssetsAllocationChart';
    if (isTabChart) {
        if (reportsAssetsTabAllocationInstance) reportsAssetsTabAllocationInstance.destroy();
    } else if (reportsAssetAllocationChartInstance) {
        reportsAssetAllocationChartInstance.destroy();
    }

    if (!slices.length) {
        if (legendEl) legendEl.innerHTML = '<p class="reports-hint">Brak aktywów w sumie.</p>';
        return;
    }

    const labels = slices.map((s) => s.label);
    const values = slices.map((s) => s.amount);
    const colors = getChartSliceColors(labels, 'income');
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

    if (isTabChart) reportsAssetsTabAllocationInstance = chart;
    else reportsAssetAllocationChartInstance = chart;

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

function renderReportsCashTrendChart(ctx, canvasId = 'reportsCashTrendChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { monthLabels, balanceData } = buildCashBalanceTrendData(ctx);
    const isTabChart = canvasId === 'reportsAssetsCashTrendChart';
    if (isTabChart) {
        if (reportsAssetsTabCashTrendInstance) reportsAssetsTabCashTrendInstance.destroy();
    } else if (reportsCashTrendChartInstance) {
        reportsCashTrendChartInstance.destroy();
    }

    if (!monthLabels.length) return;

    const theme = getReportsChartTheme();
    const lineColor = isLightTheme() ? 'rgba(13, 148, 136, 0.9)' : 'rgba(45, 212, 191, 0.9)';

    const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Gotówka',
                data: balanceData,
                borderColor: lineColor,
                backgroundColor: isLightTheme() ? 'rgba(13, 148, 136, 0.12)' : 'rgba(45, 212, 191, 0.12)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                borderWidth: 2
            }]
        },
        options: getReportsChartOptions(theme)
    });

    if (isTabChart) reportsAssetsTabCashTrendInstance = chart;
    else reportsCashTrendChartInstance = chart;
}

function renderReportsNetWorth() {
    const el = document.getElementById('reports-net-worth');
    if (!el) return;

    const ctx = getReportsPeriodContext();
    const assets = getPortfolioValuePln();
    const horizons = getAssetsHorizonTotals();
    const loanDebt = getLoanCapitalLeft();
    const cardDebt = getCreditCardDebtTotal();
    const totalDebt = loanDebt + cardDebt;
    const net = assets - totalDebt;
    const dta = assets > 0 ? Math.round((totalDebt / assets) * 100) : null;
    const liquidCash = getLiquidCashPln();
    const cardCoverage = cardDebt > 0 ? Math.round((liquidCash / cardDebt) * 100) : null;
    const { expense } = summarizePeriod(ctx.periodTx);
    const periodDays = getPeriodDayCount(ctx);
    const avgMonthlyExpense = (expense / periodDays) * 30.44;
    const runwayMonths = avgMonthlyExpense > 0 ? liquidCash / avgMonthlyExpense : null;
    const monthChange = typeof getSnapshotMonthChange === 'function' ? getSnapshotMonthChange() : null;
    const changeEl = document.getElementById('reports-net-worth-change');

    el.innerHTML = `
        <div class="networth-grid">
            <div><span class="label">Aktywa razem</span><strong class="income">${formatPlnAmount(assets)}</strong></div>
            <div><span class="label">Krótkoterminowe</span><strong>${formatPlnAmount(horizons.short)}</strong></div>
            <div><span class="label">Długoterminowe</span><strong>${formatPlnAmount(horizons.long)}</strong></div>
            <div><span class="label">Zadłużenie / majątek</span><strong class="${dta !== null && dta > 50 ? 'expense' : ''}">${dta !== null ? `${dta}%` : '—'}</strong></div>
            <div><span class="label">Kredyty (kapitał)</span><strong class="expense">−${formatPlnAmount(loanDebt)}</strong></div>
            <div><span class="label">Karty kredytowe</span><strong class="expense">−${formatPlnAmount(cardDebt)}</strong></div>
            <div><span class="label">Gotówka (płynna)</span><strong>${formatPlnAmount(liquidCash)}</strong></div>
            <div><span class="label">Pokrycie kart gotówką</span><strong class="${cardCoverage !== null && cardCoverage < 100 ? 'expense' : 'income'}">${cardCoverage !== null ? `${cardCoverage}%` : '—'}</strong></div>
            <div><span class="label">Rezerwa (mies.)</span><strong>${runwayMonths !== null ? runwayMonths.toFixed(1) : '—'}</strong></div>
            <div class="networth-total"><span class="label">Wartość netto</span><strong style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatPlnAmount(net)}</strong></div>
        </div>
        <p class="reports-hint reports-networth-hint">Rezerwa = gotówka operacyjna ÷ średnie miesięczne wydatki w wybranym okresie.</p>`;

    if (changeEl) {
        if (monthChange) {
            const sign = monthChange.netWorth >= 0 ? '+' : '';
            changeEl.textContent = `Zmiana net worth vs poprzedni miesiąc: ${sign}${formatPlnAmount(monthChange.netWorth)}`;
            changeEl.classList.remove('hidden');
        } else {
            changeEl.classList.add('hidden');
        }
    }
}

function renderReportsAssetsHero() {
    const totalEl = document.getElementById('reports-assets-hero-total');
    const metaEl = document.getElementById('reports-assets-hero-meta');
    if (!totalEl) return;

    const assets = getAnalysisSummaryAssets();
    const total = getPortfolioValuePln();
    const horizons = getAssetsHorizonTotals();
    const gainPct = typeof getActiveAssetsGainPct === 'function' ? getActiveAssetsGainPct() : 0;
    const gainPln = typeof getActiveAssetsGainPln === 'function' ? getActiveAssetsGainPln() : 0;
    const investments = assets.filter((a) => a.type === 'investment');

    totalEl.textContent = formatPlnAmount(total);
    if (metaEl) {
        const parts = [
            `${assets.length} pozycji w sumie`,
            `krótko ${formatPlnAmount(horizons.short)}`,
            `długo ${formatPlnAmount(horizons.long)}`
        ];
        if (investments.length) {
            parts.push(`P/L ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${gainPln >= 0 ? '+' : ''}${formatPlnAmount(gainPln)})`);
        }
        metaEl.textContent = parts.join(' · ');
    }
}

function renderReportsAssetsHorizon() {
    const el = document.getElementById('reports-assets-horizon');
    if (!el) return;

    const slices = buildAssetHorizonSlices();
    const total = slices.reduce((s, slice) => s + slice.amount, 0);
    if (!total) {
        el.innerHTML = '<p class="reports-hint">Brak aktywów w sumie.</p>';
        return;
    }

    el.innerHTML = slices.map((slice) => {
        const pct = Math.round((slice.amount / total) * 100);
        const hint = slice.horizon === 'short'
            ? 'Gotówka, Cele, akcje, lokaty'
            : 'PPK, IKZE, emerytura, KZP';
        return `<div class="assets-analysis-horizon-row">
            <div class="assets-analysis-horizon-head">
                <strong>${escapeHtml(slice.label)}</strong>
                <span>${formatPlnAmount(slice.amount)} · ${pct}%</span>
            </div>
            <p class="reports-hint">${hint}</p>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
        </div>`;
    }).join('');
}

function renderReportsAssetsInvestments() {
    const el = document.getElementById('reports-assets-investments');
    if (!el) return;

    const investments = getAnalysisSummaryAssets().filter((a) => a.type === 'investment');
    if (!investments.length) {
        el.innerHTML = '<p class="reports-hint">Brak inwestycji w sumie.</p>';
        return;
    }

    const totalValue = investments.reduce((s, a) => s + getAssetValuePln(a), 0);
    const totalCost = investments.reduce((s, a) => s + getAssetCostPln(a), 0);
    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const gainClass = totalGain >= 0 ? 'income' : 'expense';

    const rows = investments.map((asset) => {
        const value = getAssetValuePln(asset);
        const gain = typeof getAssetGainPln === 'function' ? getAssetGainPln(asset) : 0;
        const gainPct = typeof getAssetGainPct === 'function' ? getAssetGainPct(asset) : 0;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const assetId = escapeHtml(asset.id);
        const rowGainClass = gain >= 0 ? 'income' : 'expense';
        return `<div class="assets-analysis-row asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${assetId}')" onkeydown="if (event.key === 'Enter') openAssetDetails('${assetId}')">
            <div class="assets-analysis-info">
                <strong>${escapeHtml(name)}</strong>
                <span class="reports-hint">${formatPlnAmount(value)}</span>
            </div>
            <div class="assets-analysis-amounts">
                <span class="${rowGainClass}">${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%</span>
                <strong class="${rowGainClass}">${gain >= 0 ? '+' : ''}${formatPlnAmount(gain)}</strong>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <div class="assets-analysis-total">
            <div><span class="label">Wartość</span><strong>${formatPlnAmount(totalValue)}</strong></div>
            <div><span class="label">Koszt</span><strong>${formatPlnAmount(totalCost)}</strong></div>
            <div><span class="label">P/L</span><strong class="${gainClass}">${totalGainPct >= 0 ? '+' : ''}${totalGainPct.toFixed(1)}% (${totalGain >= 0 ? '+' : ''}${formatPlnAmount(totalGain)})</strong></div>
        </div>
        ${rows}`;
}

function renderReportsAssetsRetirement() {
    const el = document.getElementById('reports-assets-retirement');
    if (!el) return;

    const retirement = getAnalysisSummaryAssets().filter((a) => a.type === 'retirement');
    if (!retirement.length) {
        el.innerHTML = '<p class="reports-hint">Brak produktów emerytalnych w sumie.</p>';
        return;
    }

    const total = retirement.reduce((s, a) => s + getAssetValuePln(a), 0);
    el.innerHTML = retirement.map((asset) => {
        const kind = typeof RETIREMENT_KIND_LABELS !== 'undefined'
            ? (RETIREMENT_KIND_LABELS[asset.retirementKind] || asset.retirementKind)
            : asset.retirementKind;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const value = getAssetValuePln(asset);
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        const assetId = escapeHtml(asset.id);
        return `<div class="assets-analysis-row asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${assetId}')" onkeydown="if (event.key === 'Enter') openAssetDetails('${assetId}')">
            <div class="assets-analysis-info">
                <strong>${escapeHtml(name)}</strong>
                <span class="reports-hint">${escapeHtml(kind || 'Emerytura')} · ${pct}%</span>
            </div>
            <strong>${formatPlnAmount(value)}</strong>
        </div>`;
    }).join('');
}

function renderReportsAssetsList() {
    const el = document.getElementById('reports-assets-list');
    if (!el) return;

    const assets = getAnalysisSummaryAssets();
    if (!assets.length) {
        el.innerHTML = '<p class="reports-hint">Brak aktywów — dodaj je w zakładce Aktywa.</p>';
        return;
    }

    const total = getPortfolioValuePln();
    const sorted = [...assets].sort((a, b) => getAssetValuePln(b) - getAssetValuePln(a));

    el.innerHTML = sorted.map((asset) => {
        const value = getAssetValuePln(asset);
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        const typeLabel = typeof ASSET_TYPE_LABELS !== 'undefined'
            ? (ASSET_TYPE_LABELS[asset.type] || 'Aktywo')
            : 'Aktywo';
        const horizon = typeof getAssetHorizon === 'function' && typeof ASSET_HORIZON_LABELS !== 'undefined'
            ? ASSET_HORIZON_LABELS[getAssetHorizon(asset)]
            : '';
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const assetId = escapeHtml(asset.id);
        return `<div class="analysis-loan-click asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${assetId}')" onkeydown="if (event.key === 'Enter') openAssetDetails('${assetId}')">
            <div class="analysis-subsection-label">${escapeHtml(name)}</div>
            <div class="loan-report-grid">
                <div><span class="label">Wartość</span><strong>${formatPlnAmount(value)}</strong></div>
                <div><span class="label">Udział</span><strong>${pct}%</strong></div>
                <div><span class="label">Typ</span><strong>${escapeHtml(typeLabel)}</strong></div>
                <div><span class="label">Horyzont</span><strong>${escapeHtml(horizon)}</strong></div>
            </div>
        </div>`;
    }).join('');
}

function renderReportsAssetsDebtLink() {
    const el = document.getElementById('reports-assets-debt-link');
    if (!el) return;

    const assets = getPortfolioValuePln();
    const loanDebt = getLoanCapitalLeft();
    const cardDebt = getCreditCardDebtTotal();
    const totalDebt = loanDebt + cardDebt;
    const net = assets - totalDebt;
    const dta = assets > 0 ? Math.round((totalDebt / assets) * 100) : null;
    const liquidCash = getLiquidCashPln();
    const cardCoverage = cardDebt > 0 ? Math.round((liquidCash / cardDebt) * 100) : null;
    const longTotal = getAssetsHorizonTotals().long;

    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Wartość netto</span><strong style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatPlnAmount(net)}</strong></div>
            <div><span class="label">Zadłużenie / majątek</span><strong class="${dta !== null && dta > 50 ? 'expense' : ''}">${dta !== null ? `${dta}%` : '—'}</strong></div>
            <div><span class="label">Gotówka vs karty</span><strong class="${cardCoverage !== null && cardCoverage < 100 ? 'expense' : 'income'}">${cardCoverage !== null ? `${cardCoverage}%` : '—'}</strong></div>
            <div><span class="label">Długoterminowe</span><strong>${formatPlnAmount(longTotal)}</strong></div>
        </div>
        <p class="reports-hint">Porównanie aktywów z kredytami i kartami — te same wskaźniki co w Przeglądzie.</p>`;
}

function renderReportsAssetsCashFlow(ctx) {
    const el = document.getElementById('reports-assets-cash-flow');
    if (!el) return;

    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const income = ctx.periodTx
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const expenseFromCash = ctx.periodTx
        .filter((t) => t.type === 'expense' && shouldTransactionAffectCash(t))
        .reduce((s, t) => s + t.amount, 0);
    const txBalance = income - expenseFromCash;
    const cashDelta = getCashMovementsInRange(start, end, PRIMARY_CASH_ASSET_ID)
        .reduce((s, m) => s + m.delta, 0);
    const celeDelta = typeof CELE_ASSET_ID !== 'undefined'
        ? getCashMovementsInRange(start, end, CELE_ASSET_ID).reduce((s, m) => s + m.delta, 0)
        : 0;
    const diff = cashDelta - txBalance;
    const diffHint = Math.abs(diff) < 1
        ? 'Saldo gotówki zgadza się z transakcjami w okresie.'
        : `Różnica ${formatPlnAmount(diff)} — starsze ruchy, spłaty długów lub ręczne korekty.`;

    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Wpływy</span><strong class="income">${formatPlnAmount(income)}</strong></div>
            <div><span class="label">Wydatki z salda</span><strong class="expense">${formatPlnAmount(expenseFromCash)}</strong></div>
            <div><span class="label">Bilans transakcji</span><strong>${formatPlnAmount(txBalance)}</strong></div>
            <div><span class="label">Zmiana gotówki</span><strong class="${cashDelta >= 0 ? 'income' : 'expense'}">${cashDelta >= 0 ? '+' : ''}${formatPlnAmount(cashDelta)}</strong></div>
            ${celeDelta ? `<div><span class="label">Zmiana Cele</span><strong class="${celeDelta >= 0 ? 'income' : 'expense'}">${celeDelta >= 0 ? '+' : ''}${formatPlnAmount(celeDelta)}</strong></div>` : ''}
        </div>
        <p class="reports-hint">${diffHint}</p>`;
}

function renderReportsAssetsSnapshotsList() {
    const el = document.getElementById('reports-assets-snapshots-list');
    if (!el) return;
    const snapshots = typeof getAssetSnapshots === 'function' ? getAssetSnapshots() : [];
    if (!snapshots.length) {
        el.innerHTML = '<p class="reports-hint">Brak snapshotów — zapiszą się automatycznie lub użyj przycisku powyżej.</p>';
        return;
    }
    el.innerHTML = [...snapshots].reverse().slice(0, 12).map((snap) => {
        const [y, m] = snap.monthKey.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return `<div class="assets-snapshot-row">
            <strong>${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</strong>
            <span class="reports-hint">${snap.source === 'manual' ? 'ręcznie' : 'auto'}</span>
            <div class="loan-report-grid">
                <div><span class="label">Majątek</span><strong>${formatPlnAmount(snap.totalAssets)}</strong></div>
                <div><span class="label">Net worth</span><strong>${formatPlnAmount(snap.netWorth)}</strong></div>
                <div><span class="label">Krótko</span><strong>${formatPlnAmount(snap.shortAssets)}</strong></div>
                <div><span class="label">Długo</span><strong>${formatPlnAmount(snap.longAssets)}</strong></div>
            </div>
        </div>`;
    }).join('');
}

function renderReportsNetWorthTrendChart() {
    const canvas = document.getElementById('reportsNetWorthTrendChart');
    if (!canvas || typeof buildNetWorthTrendData !== 'function') return;
    const { monthLabels, assetsData, debtData, netData } = buildNetWorthTrendData();
    if (reportsNetWorthTrendChartInstance) reportsNetWorthTrendChartInstance.destroy();
    if (!monthLabels.length) return;
    const theme = getReportsChartTheme();
    reportsNetWorthTrendChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [
                { label: 'Net worth', data: netData, borderColor: 'var(--success)', tension: 0.3, pointRadius: 3 },
                { label: 'Aktywa', data: assetsData, borderColor: 'var(--accent)', tension: 0.3, pointRadius: 2, borderDash: [4, 4] },
                { label: 'Długi', data: debtData, borderColor: 'var(--danger)', tension: 0.3, pointRadius: 2, borderDash: [4, 4] }
            ]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsAllocationTrendChart() {
    const canvas = document.getElementById('reportsAllocationTrendChart');
    if (!canvas || typeof buildAllocationTrendData !== 'function') return;
    const data = buildAllocationTrendData();
    if (reportsAllocationTrendChartInstance) reportsAllocationTrendChartInstance.destroy();
    if (!data.monthLabels.length) return;
    const theme = getReportsChartTheme();
    reportsAllocationTrendChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.monthLabels,
            datasets: [
                { label: 'Inwestycje', data: data.investmentData, tension: 0.3, pointRadius: 2 },
                { label: 'Gotówka', data: data.cashData, tension: 0.3, pointRadius: 2 },
                { label: 'Lokaty', data: data.depositData, tension: 0.3, pointRadius: 2 },
                { label: 'Emerytura', data: data.retirementData, tension: 0.3, pointRadius: 2 }
            ]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsWealthFlows(ctx) {
    const el = document.getElementById('reports-wealth-flows');
    if (!el || typeof buildWealthFlowSummary !== 'function') return;
    const flow = buildWealthFlowSummary(ctx);
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Na aktywa (powiązane tx)</span><strong class="income">${formatPlnAmount(flow.toAssets)}</strong></div>
            <div><span class="label">Spłaty długów</span><strong class="expense">${formatPlnAmount(flow.debtPayments)}</strong></div>
            <div><span class="label">Zmiana gotówki</span><strong class="${flow.cashNet >= 0 ? 'income' : 'expense'}">${flow.cashNet >= 0 ? '+' : ''}${formatPlnAmount(flow.cashNet)}</strong></div>
        </div>`;
}

function renderReportsAssetsGoals() {
    const el = document.getElementById('reports-assets-goals');
    if (!el) return;
    const operational = typeof getOperationalCashPln === 'function' ? getOperationalCashPln() : 0;
    const cele = typeof getCeleCashPln === 'function' ? getCeleCashPln() : 0;
    const goals = typeof getGoalAssets === 'function' ? getGoalAssets() : [];
    const goalRows = goals.map((asset) => {
        const value = getAssetValuePln(asset);
        const target = asset.goalTarget || 0;
        const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        return `<div class="assets-analysis-horizon-row">
            <div class="assets-analysis-horizon-head"><strong>${escapeHtml(name)}</strong><span>${formatPlnAmount(value)}${target ? ` / ${formatPlnAmount(target)}` : ''}</span></div>
            ${pct !== null ? `<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:var(--success)"></div></div>` : ''}
        </div>`;
    }).join('');
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Gotówka operacyjna</span><strong>${formatPlnAmount(operational)}</strong></div>
            <div><span class="label">Cele (oszczędnościowe)</span><strong>${formatPlnAmount(cele)}</strong></div>
        </div>
        ${goalRows || '<p class="reports-hint">Ustaw cel w edycji aktywa gotówkowego (np. Cele).</p>'}`;
}

function renderReportsDiversificationChart() {
    const canvas = document.getElementById('reportsDiversificationChart');
    const legendEl = document.getElementById('reports-diversification-legend');
    if (!canvas || typeof buildDiversificationSlices !== 'function') return;
    const slices = buildDiversificationSlices();
    if (reportsDiversificationChartInstance) reportsDiversificationChartInstance.destroy();
    if (!slices.length) {
        if (legendEl) legendEl.innerHTML = '<p class="reports-hint">Brak danych.</p>';
        return;
    }
    const labels = slices.map((s) => s.label);
    const values = slices.map((s) => s.amount);
    const colors = getChartSliceColors(labels, 'income');
    reportsDiversificationChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2 }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
    if (legendEl) {
        const total = values.reduce((s, v) => s + v, 0);
        legendEl.innerHTML = slices.slice(0, 10).map((slice, i) => {
            const pct = total > 0 ? Math.round((slice.amount / total) * 100) : 0;
            return `<div class="reports-debt-split-item"><span class="reports-debt-split-dot" style="background:${colors[i]}"></span><span>${escapeHtml(slice.label)}</span><strong>${formatPlnAmount(slice.amount)}</strong><em>${pct}%</em></div>`;
        }).join('');
    }
}

function renderReportsIkzeLimit() {
    const el = document.getElementById('reports-ikze-limit');
    if (!el) return;
    const year = new Date().getFullYear();
    const used = typeof getIkzeContributionsInYear === 'function' ? getIkzeContributionsInYear(year) : 0;
    const limit = typeof IKZE_ANNUAL_LIMIT_PLN !== 'undefined' ? IKZE_ANNUAL_LIMIT_PLN : 8000;
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const left = Math.max(0, limit - used);
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Wpłaty ${year}</span><strong>${formatPlnAmount(used)}</strong></div>
            <div><span class="label">Limit</span><strong>${formatPlnAmount(limit)}</strong></div>
            <div><span class="label">Pozostało</span><strong class="income">${formatPlnAmount(left)}</strong></div>
        </div>
        <div class="progress-bar-bg" style="margin-top:12px"><div class="progress-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
        <p class="reports-hint">Liczone z transakcji powiązanych z IKZE. Limit orientacyjny — ${formatPlnAmount(limit)} / rok.</p>`;
}

function renderReportsMortgageVsRetirement() {
    const el = document.getElementById('reports-mortgage-retirement');
    if (!el) return;
    const mortgageCapital = getActiveLoans()
        .filter((l) => typeof isMortgageLoan === 'function' && isMortgageLoan(l))
        .reduce((s, l) => s + (l.currentCapitalLeft || 0), 0);
    const retirementTotal = getAnalysisSummaryAssets()
        .filter((a) => a.type === 'retirement')
        .reduce((s, a) => s + getAssetValuePln(a), 0);
    const payoff = typeof estimateNetWorthPayoffMonths === 'function' ? estimateNetWorthPayoffMonths() : null;
    let message = 'Budujesz majątek długoterminowy szybciej niż spłacasz hipotekę.';
    if (retirementTotal < mortgageCapital) {
        message = 'Kapitał hipoteki przewyższa majątek emerytalny — warto zwiększyć wpłaty długoterminowe.';
    } else if (mortgageCapital === 0) {
        message = 'Brak aktywnej hipoteki w kredytach.';
    }
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Kapitał hipoteki</span><strong class="expense">${formatPlnAmount(mortgageCapital)}</strong></div>
            <div><span class="label">Majątek emerytalny</span><strong class="income">${formatPlnAmount(retirementTotal)}</strong></div>
            <div><span class="label">Net worth zero</span><strong>${payoff?.label || '—'}</strong></div>
        </div>
        <p class="reports-hint">${message}</p>`;
}

function renderDepositsCalendarList() {
    const card = document.getElementById('reports-deposits-calendar-card');
    const el = document.getElementById('reports-deposits-calendar-list');
    if (!el) return;
    const deposits = typeof getActiveDeposits === 'function' ? getActiveDeposits() : [];
    if (!deposits.length) {
        card?.classList.add('hidden');
        return;
    }
    card?.classList.remove('hidden');
    const today = new Date().toISOString().split('T')[0];
    const sorted = [...deposits].sort((a, b) => a.endDate.localeCompare(b.endDate));
    el.innerHTML = sorted.map((asset) => {
        const days = typeof daysUntilDate === 'function' ? daysUntilDate(asset.endDate) : null;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const overdue = days !== null && days < 0;
        return `<div class="assets-analysis-row asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${escapeHtml(asset.id)}')">
            <div class="assets-analysis-info">
                <strong>${escapeHtml(name)}</strong>
                <span class="reports-hint${overdue ? ' expense' : ''}">${formatTxDate(asset.endDate)}${days !== null ? ` · ${days < 0 ? `${Math.abs(days)} dni temu` : `za ${days} dni`}` : ''}</span>
            </div>
            <strong>${formatPlnAmount(getAssetValuePln(asset))}</strong>
        </div>`;
    }).join('');
}

function renderReportsAssetsSection(ctx) {
    renderReportsAssetsHero();
    renderReportsAssetsHorizon();
    renderReportsAssetsInvestments();
    renderReportsAssetsRetirement();
    renderReportsAssetsList();
    renderReportsAssetsDebtLink();
    renderReportsAssetsCashFlow(ctx);
    renderReportsAssetAllocationChart(ctx, 'reportsAssetsAllocationChart', 'reports-assets-allocation-legend');
    renderReportsCashTrendChart(ctx, 'reportsAssetsCashTrendChart');
    renderReportsAssetsSnapshotsList();
    renderReportsNetWorthTrendChart();
    renderReportsAllocationTrendChart();
    renderReportsWealthFlows(ctx);
    renderReportsAssetsGoals();
    renderReportsDiversificationChart();
    renderReportsIkzeLimit();
    renderReportsMortgageVsRetirement();
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

function exportReportsPdf() {
    const ctx = getReportsPeriodContext();
    const savingsRate = summarizePeriod(ctx.periodTx).savings;
    const html = buildReportsPrintHtml(ctx, savingsRate);
    const win = window.open('', '_blank');
    if (!win) {
        alert('Zezwól na wyskakujące okna, aby wyeksportować PDF.');
        return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
}

function renderPhase3Reports(ctx, savingsRate) {
    renderReportsCompare(ctx);
    renderReportsFlow(ctx);
    renderReportsOutliers(ctx);
    renderReportsCategoryTrends();
    renderReportsForecast(ctx);
    renderReportsNetWorth();
    renderReportsDebtDsr(ctx);
    renderReportsLoanSummary(ctx);
    renderReportsCreditCardSummary(ctx);
    renderReportsDebtForecast();
    renderReportsDebtOverpayment(ctx);
    renderReportsDebtPaymentsChart(ctx);
    renderReportsDebtTrendChart(ctx);
    renderReportsDebtSplitChart(ctx);
    renderReportsAssetAllocationChart(ctx);
    renderReportsCashTrendChart(ctx);
    renderReportsAssetsSection(ctx);
    renderReportsDebtsSection(ctx);
    renderDebtCalendarSection();
    renderReportsYearReview(ctx);

    const printEl = document.getElementById('reports-print-meta');
    if (printEl) {
        const s = summarizePeriod(ctx.periodTx);
        printEl.dataset.label = ctx.label;
        printEl.dataset.income = formatPlnAmount(s.income);
        printEl.dataset.expense = formatPlnAmount(s.expense);
        printEl.dataset.balance = formatPlnAmount(s.balance);
        printEl.dataset.savings = `${savingsRate}%`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initReportsPeriodDefaults();
    initAnalysisPeriodMode();
    initAnalysisSection();
    initAnalysisSwipe();
});
