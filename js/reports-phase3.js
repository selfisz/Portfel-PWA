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
    const end = localIsoDate(new Date(year, month, 0));
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
    const monthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const prevStart = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));

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
    return localIsoDate(d);
}

function detectRecurringExpenses(rankLevel = 'main') {
    const cutoff = getSixMonthsAgoDate();
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 60);
    const recentCutoffStr = localIsoDate(recentCutoff);
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
        const end = localIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
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
    const monthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    const monthExpenses = appState.transactions
        .filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= localIsoDate(now))
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
