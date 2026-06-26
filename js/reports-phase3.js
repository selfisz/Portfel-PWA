/* Raporty — faza 3 (A–F) */

const ANALYSIS_SECTION_KEY = 'analysis_section';
const ANALYSIS_PERIOD_KEY = 'analysis_period_mode';
let analysisSection = 'overview';
let reportsPeriodMode = 'month';
let analysisUiInitialized = false;

const ANALYSIS_SECTIONS = ['overview', 'expenses', 'assets', 'debts', 'advanced'];
const ANALYSIS_SECTION_ALIASES = {
    calendar: 'expenses',
    charts: 'advanced',
    details: 'expenses'
};
const PERIOD_MODES = ['year', 'month', 'range', 'compare'];
const COMPARE_PRESETS = ['mom', 'yoy', 'same-month', 'custom'];
const ANALYSIS_COMPARE_PRESET_KEY = 'analysis_compare_preset';
let reportsComparePreset = 'mom';
let reportsCompareChartInstance = null;
let reportsCompareWealthChartInstance = null;

let reportsLastCtx = null;
let reportsLastSavingsRate = 0;
let reportsContextCacheKey = '';
const reportsRenderedSections = {};

function normalizeAnalysisSection(section) {
    if (ANALYSIS_SECTIONS.includes(section)) return section;
    return ANALYSIS_SECTION_ALIASES[section] || 'overview';
}

function getReportsContextCacheKey(ctx) {
    if (!ctx) return '';
    const parts = [ctx.mode, ctx.period, ctx.label];
    if (ctx.rangeStart) parts.push(ctx.rangeStart, ctx.rangeEnd);
    if (ctx.periodA) {
        parts.push(ctx.periodA.start, ctx.periodA.end, ctx.periodB.start, ctx.periodB.end);
    }
    return parts.join('|');
}

function setAnalysisSectionLoading(section, loading) {
    document.getElementById(`analysis-section-${section}`)
        ?.classList.toggle('analysis-section--loading', loading);
}

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

let reportsPeriodMainExpanded = false;
let reportsPeriodSpecialExpanded = false;

function collapseReportsPeriodSpecial() {
    reportsPeriodSpecialExpanded = false;
    document.getElementById('reports-period-special-panel')?.classList.add('hidden');
    document.querySelector('#reports-period-special-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'false');
}

function confirmReportsSpecialPeriod() {
    if (reportsPeriodMode === 'compare') {
        syncCompareDatesFromPreset();
        const aStart = document.getElementById('reports-compare-a-start')?.value;
        const aEnd = document.getElementById('reports-compare-a-end')?.value;
        const bStart = document.getElementById('reports-compare-b-start')?.value;
        const bEnd = document.getElementById('reports-compare-b-end')?.value;
        if (!aStart || !aEnd || !bStart || !bEnd) return;
    } else if (reportsPeriodMode === 'range') {
        const start = document.getElementById('reports-range-start')?.value;
        const end = document.getElementById('reports-range-end')?.value;
        if (!start || !end) return;
    } else {
        return;
    }
    renderReports();
    collapseReportsPeriodSpecial();
}

function isReportsSpecialPeriodComplete() {
    if (reportsPeriodMode === 'compare') {
        syncCompareDatesFromPreset();
        return Boolean(
            document.getElementById('reports-compare-a-start')?.value
            && document.getElementById('reports-compare-a-end')?.value
            && document.getElementById('reports-compare-b-start')?.value
            && document.getElementById('reports-compare-b-end')?.value
        );
    }
    if (reportsPeriodMode === 'range') {
        return Boolean(
            document.getElementById('reports-range-start')?.value
            && document.getElementById('reports-range-end')?.value
        );
    }
    return false;
}

function collapseReportsPeriodPanels() {
    reportsPeriodMainExpanded = false;
    reportsPeriodSpecialExpanded = false;
    document.getElementById('reports-period-main-panel')?.classList.add('hidden');
    document.getElementById('reports-period-special-panel')?.classList.add('hidden');
    document.querySelector('#reports-period-main-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'false');
    document.querySelector('#reports-period-special-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'false');
}

function isReportsPeriodDefault() {
    if (reportsPeriodMode !== 'month') return false;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return getReportsMonthValue() === currentMonth;
}

function updateReportsPeriodResetVisibility() {
    document.getElementById('reports-period-reset')
        ?.classList.toggle('hidden', isReportsPeriodDefault());
}

function resetReportsPeriod() {
    const now = new Date();
    const currentYear = String(now.getFullYear());
    const yearSelect = document.getElementById('reports-year-select');
    if (yearSelect) yearSelect.value = currentYear;
    applyReportsPeriodDefaults();
    collapseReportsPeriodPanels();
    setReportsPeriodMode('month');
}

function toggleReportsPeriodMain() {
    reportsPeriodMainExpanded = !reportsPeriodMainExpanded;
    const panel = document.getElementById('reports-period-main-panel');
    const toggle = document.querySelector('#reports-period-main-block .loans-hero-summary-toggle');
    if (panel) panel.classList.toggle('hidden', !reportsPeriodMainExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', reportsPeriodMainExpanded ? 'true' : 'false');
}

function toggleReportsPeriodSpecial() {
    reportsPeriodSpecialExpanded = !reportsPeriodSpecialExpanded;
    const panel = document.getElementById('reports-period-special-panel');
    const toggle = document.querySelector('#reports-period-special-block .loans-hero-summary-toggle');
    if (panel) panel.classList.toggle('hidden', !reportsPeriodSpecialExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', reportsPeriodSpecialExpanded ? 'true' : 'false');
}

function expandReportsPeriodSpecial() {
    if (reportsPeriodSpecialExpanded) return;
    reportsPeriodSpecialExpanded = true;
    document.getElementById('reports-period-special-panel')?.classList.remove('hidden');
    document.querySelector('#reports-period-special-block .loans-hero-summary-toggle')
        ?.setAttribute('aria-expanded', 'true');
}

const ANALYSIS_MONTH_SHORT = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

function initAnalysisSwipe() {
    attachHorizontalSwipe(document.getElementById('analysis-sections-body'), {
        onSwipeLeft: () => shiftAnalysisSection(1),
        onSwipeRight: () => shiftAnalysisSection(-1)
    });
}

function getAnalysisContextYear() {
    if (reportsPeriodMode === 'month') {
        return parseInt(getReportsMonthValue().slice(0, 4), 10);
    }
    if (reportsPeriodMode === 'year') {
        const val = document.getElementById('reports-year-select')?.value;
        if (val && val !== 'all') return parseInt(val, 10);
    }
    return new Date().getFullYear();
}

function renderAnalysisYearChips() {
    const el = document.getElementById('reports-year-chips');
    if (!el) return;
    const years = getTransactionYears();
    const yearSelect = document.getElementById('reports-year-select');
    const currentVal = yearSelect?.value || String(new Date().getFullYear());
    const parts = [
        `<button type="button" class="toggle-btn loans-chip${reportsPeriodMode === 'year' && currentVal === 'all' ? ' active' : ''}" onclick="selectReportsYear('all')">Całość</button>`
    ];
    years.forEach((year) => {
        const value = String(year);
        const active = reportsPeriodMode === 'year' && currentVal === value;
        parts.push(`<button type="button" class="toggle-btn loans-chip${active ? ' active' : ''}" onclick="selectReportsYear('${value}')">${value}</button>`);
    });
    el.innerHTML = parts.join('');
}

function renderAnalysisMonthChips() {
    const el = document.getElementById('reports-month-chips');
    if (!el) return;
    const contextYear = getAnalysisContextYear();
    const monthValue = getReportsMonthValue();
    el.innerHTML = ANALYSIS_MONTH_SHORT.map((label, monthIndex) => {
        const value = `${contextYear}-${String(monthIndex + 1).padStart(2, '0')}`;
        const active = reportsPeriodMode === 'month' && monthValue === value;
        return `<button type="button" class="toggle-btn loans-chip analysis-period-month-chip${active ? ' active' : ''}" onclick="selectReportsMonthChip(${contextYear}, ${monthIndex})">${label}</button>`;
    }).join('');
}

function selectReportsYear(year) {
    const yearSelect = document.getElementById('reports-year-select');
    if (yearSelect) yearSelect.value = year;
    setReportsPeriodMode('year');
}

function selectReportsMonthChip(year, monthIndex) {
    const monthValue = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const monthInput = document.getElementById('reports-period-month');
    if (monthInput) monthInput.value = monthValue;
    const { year: y, monthIndex: mi } = getMonthBoundsFromValue(monthValue);
    reportsCalendarYear = y;
    reportsCalendarMonth = mi;
    setReportsPeriodMode('month');
}

function selectReportsSpecialMode(mode) {
    expandReportsPeriodSpecial();
    setReportsPeriodMode(mode);
    if (mode === 'compare') updateComparePresetUI();
}

function selectComparePreset(preset) {
    if (!COMPARE_PRESETS.includes(preset)) return;
    reportsComparePreset = preset;
    try { localStorage.setItem(ANALYSIS_COMPARE_PRESET_KEY, preset); } catch { /* ignore */ }
    updateComparePresetUI();
    if (preset === 'same-month') updateSameMonthCompareHint();
}

function updateSameMonthCompareHint() {
    const hint = document.getElementById('reports-compare-same-month-hint');
    const monthVal = document.getElementById('reports-compare-same-month')?.value;
    if (!hint || !monthVal) return;
    const [year, month] = monthVal.split('-').map(Number);
    const prevMonthVal = `${year - 1}-${String(month).padStart(2, '0')}`;
    const a = getMonthBoundsFromValue(prevMonthVal);
    const b = getMonthBoundsFromValue(monthVal);
    hint.textContent = `Okres A: ${formatTxDate(a.start)} – ${formatTxDate(a.end)}`;
}

function populateCompareYearSelects() {
    const years = getTransactionYears();
    const now = new Date().getFullYear();
    ['reports-compare-a-year', 'reports-compare-b-year'].forEach((id, index) => {
        const el = document.getElementById(id);
        if (!el) return;
        const previous = el.value;
        el.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
        if (previous && years.includes(parseInt(previous, 10))) {
            el.value = previous;
        } else {
            el.value = String(index === 0 ? now - 1 : now);
        }
    });
}

function updateComparePresetUI() {
    COMPARE_PRESETS.forEach((preset) => {
        const btnId = preset === 'same-month' ? 'btn-compare-preset-same-month' : `btn-compare-preset-${preset}`;
        document.getElementById(btnId)?.classList.toggle('active', reportsComparePreset === preset);
    });
    document.getElementById('compare-preset-mom-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'mom');
    document.getElementById('compare-preset-yoy-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'yoy');
    document.getElementById('compare-preset-same-month-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'same-month');
    document.getElementById('compare-preset-custom-wrap')?.classList.toggle('hidden', reportsComparePreset !== 'custom');
    if (reportsComparePreset === 'yoy') populateCompareYearSelects();
    if (reportsComparePreset === 'same-month') updateSameMonthCompareHint();
}

function syncCompareDatesFromPreset() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };

    if (reportsComparePreset === 'mom') {
        const aMonth = document.getElementById('reports-compare-a-month')?.value;
        const bMonth = document.getElementById('reports-compare-b-month')?.value;
        if (!aMonth || !bMonth) return;
        const a = getMonthBoundsFromValue(aMonth);
        const b = getMonthBoundsFromValue(bMonth);
        set('reports-compare-a-start', a.start);
        set('reports-compare-a-end', a.end);
        set('reports-compare-b-start', b.start);
        set('reports-compare-b-end', b.end);
        return;
    }

    if (reportsComparePreset === 'yoy') {
        const aYear = document.getElementById('reports-compare-a-year')?.value;
        const bYear = document.getElementById('reports-compare-b-year')?.value;
        if (!aYear || !bYear) return;
        set('reports-compare-a-start', `${aYear}-01-01`);
        set('reports-compare-a-end', `${aYear}-12-31`);
        set('reports-compare-b-start', `${bYear}-01-01`);
        set('reports-compare-b-end', `${bYear}-12-31`);
        return;
    }

    if (reportsComparePreset === 'same-month') {
        const bMonth = document.getElementById('reports-compare-same-month')?.value;
        if (!bMonth) return;
        const [year, month] = bMonth.split('-').map(Number);
        const aMonth = `${year - 1}-${String(month).padStart(2, '0')}`;
        const a = getMonthBoundsFromValue(aMonth);
        const b = getMonthBoundsFromValue(bMonth);
        set('reports-compare-a-start', a.start);
        set('reports-compare-a-end', a.end);
        set('reports-compare-b-start', b.start);
        set('reports-compare-b-end', b.end);
    }
}

function updateReportsPeriodFields(mode = reportsPeriodMode) {
    document.getElementById('reports-period-range-wrap')?.classList.toggle('hidden', mode !== 'range');
    document.getElementById('reports-period-compare-wrap')?.classList.toggle('hidden', mode !== 'compare');
    document.getElementById('reports-period-special-confirm')?.classList.toggle('hidden', mode !== 'range' && mode !== 'compare');
    document.getElementById('btn-reports-range-mode')?.classList.toggle('active', mode === 'range');
    document.getElementById('btn-reports-compare-mode')?.classList.toggle('active', mode === 'compare');
}

function updateReportsPeriodUI(ctx) {
    populateReportsYearSelect();
    renderAnalysisYearChips();
    renderAnalysisMonthChips();
    updateReportsPeriodFields();

    if (ctx?.mode === 'compare') updateComparePresetUI();

    const displayEl = document.getElementById('reports-period-display');
    const summaryEl = document.getElementById('reports-period-summary');
    if (ctx && displayEl) {
        displayEl.textContent = ctx.mode === 'compare' ? 'Porównanie okresów' : ctx.label;
    }
    if (summaryEl && ctx) {
        if (ctx.mode === 'compare' && ctx.periodA && ctx.periodB) {
            summaryEl.textContent = `${formatTxDate(ctx.periodA.start)} – ${formatTxDate(ctx.periodA.end)} vs ${formatTxDate(ctx.periodB.start)} – ${formatTxDate(ctx.periodB.end)}`;
        } else {
            summaryEl.textContent = `Wyświetlane dane: ${ctx.label}`;
        }
    }
    updateReportsPeriodResetVisibility();
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
    section = normalizeAnalysisSection(section);
    if (!ANALYSIS_SECTIONS.includes(section)) return;
    analysisSection = section;
    try { localStorage.setItem(ANALYSIS_SECTION_KEY, section); } catch { /* ignore */ }

    ANALYSIS_SECTIONS.forEach((id) => {
        document.getElementById(`analysis-section-${id}`)?.classList.toggle('hidden', id !== section);
        document.getElementById(`btn-analysis-${id}`)?.classList.toggle('active', id === section);
    });

    if (reportsLastCtx) {
        renderAnalysisSectionContent(section, reportsLastCtx, reportsLastSavingsRate);
    }
    resizeAnalysisSectionCharts(section);
}

function resizeAnalysisSectionCharts(section) {
    const chartsBySection = {
        overview: [reportsChartInstance, reportsStructureChartInstance],
        expenses: [],
        assets: [
            reportsAssetsTabAllocationInstance,
            reportsAssetsTabCashTrendInstance,
            reportsNetWorthTrendChartInstance
        ],
        debts: [
            reportsDebtsTabChartInstance,
            reportsDebtsTabSplitInstance,
            reportsDebtTrendChartInstance,
            reportsDebtPeakChartInstance
        ],
        advanced: [
            reportsTrendChartInstance,
            reportsYoyChartInstance,
            reportsDowChartInstance,
            reportsAllocationTrendChartInstance,
            reportsDiversificationChartInstance
        ]
    };
    requestAnimationFrame(() => {
        (chartsBySection[section] || []).forEach((chart) => chart?.resize());
    });
}

function initAnalysisUI() {
    if (analysisUiInitialized) return;
    const view = document.getElementById('view-reports');
    if (!view?.id || view.id !== 'view-reports') return;
    analysisUiInitialized = true;
    initReportsPeriodDefaults();
    initAnalysisPeriodMode();
    initAnalysisSection();
    initAnalysisSwipe();
}

function ensureAnalysisUIInit() {
    initAnalysisUI();
}

function initAnalysisSection() {
    try {
        const saved = localStorage.getItem(ANALYSIS_SECTION_KEY);
        if (saved) analysisSection = normalizeAnalysisSection(saved);
    } catch { /* ignore */ }
    setAnalysisSection(analysisSection);
}

let debtsOverpayLoanId = null;
let debtsOverpayKind = 'monthly';
let debtsOverpayAmount = 0;
let reportsCalendarView = 'month';
let calendarDayDate = null;
let calendarDayFilter = 'all';
let reportsMonthChartMeta = { period: null, labels: [], ctx: null };

function getTransactionsInRange(start, end) {
    if (!start || !end) return [];
    return appState.transactions.filter((t) => t.date >= start && t.date <= end);
}

function applyReportsPeriodDefaults() {
    const now = new Date();
    const monthStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const prevStart = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
    const monthInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    set('reports-range-start', monthStart);
    set('reports-range-end', monthEnd);
    set('reports-compare-a-start', prevStart);
    set('reports-compare-a-end', prevEnd);
    set('reports-compare-b-start', monthStart);
    set('reports-compare-b-end', monthEnd);
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    set('reports-compare-a-month', prevMonth);
    set('reports-compare-b-month', curMonth);
    set('reports-compare-same-month', curMonth);
    set('reports-period-month', monthInput);
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
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setIfEmpty('reports-compare-a-month', prevMonth);
    setIfEmpty('reports-compare-b-month', curMonth);
    setIfEmpty('reports-compare-same-month', curMonth);
    const monthInput = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setIfEmpty('reports-period-month', monthInput);
}

function initAnalysisPeriodMode() {
    try {
        const saved = localStorage.getItem(ANALYSIS_PERIOD_KEY);
        if (saved && PERIOD_MODES.includes(saved)) reportsPeriodMode = saved;
    } catch { /* ignore */ }
    try {
        const savedPreset = localStorage.getItem(ANALYSIS_COMPARE_PRESET_KEY);
        if (savedPreset && COMPARE_PRESETS.includes(savedPreset)) reportsComparePreset = savedPreset;
    } catch { /* ignore */ }
    if (reportsPeriodMode === 'range' || reportsPeriodMode === 'compare') {
        expandReportsPeriodSpecial();
    }
    setReportsPeriodMode(reportsPeriodMode, true);
    updateComparePresetUI();
}

function setReportsPeriodMode(mode, skipRender = false) {
    reportsPeriodMode = mode;
    try { localStorage.setItem(ANALYSIS_PERIOD_KEY, mode); } catch { /* ignore */ }
    updateReportsPeriodFields(mode);
    if (mode === 'compare') setAnalysisSection('overview');
    if (mode === 'month') {
        const { year, monthIndex } = getMonthBoundsFromValue(getReportsMonthValue());
        reportsCalendarYear = year;
        reportsCalendarMonth = monthIndex;
    }
    updateReportsPeriodResetVisibility();
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
        syncCompareDatesFromPreset();
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

function getPeriodInclusiveDays(start, end) {
    if (!start || !end) return 1;
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function getCategoryExpenseMap(tx) {
    const map = {};
    tx.filter((t) => t.type === 'expense').forEach((t) => {
        map[t.mainCategory] = (map[t.mainCategory] || 0) + t.amount;
    });
    return map;
}

function buildCompareCategoryMovers(txA, txB, limit = 5) {
    const mapA = getCategoryExpenseMap(txA);
    const mapB = getCategoryExpenseMap(txB);
    const names = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
    return [...names]
        .map((name) => {
            const a = mapA[name] || 0;
            const b = mapB[name] || 0;
            const diff = b - a;
            const pct = a > 0 ? Math.round((diff / a) * 100) : (b > 0 ? 100 : 0);
            return { name, a, b, diff, pct, absDiff: Math.abs(diff) };
        })
        .filter((row) => row.a || row.b)
        .sort((left, right) => right.absDiff - left.absDiff)
        .slice(0, limit);
}

function formatCompareDelta(curr, prev) {
    const diff = curr - prev;
    const pct = prev ? Math.round((diff / prev) * 100) : (curr > 0 ? 100 : 0);
    const sign = diff >= 0 ? '+' : '−';
    return `${sign}${formatPlnAmount(Math.abs(diff))} (${pct >= 0 ? '+' : ''}${pct}%)`;
}

function formatComparePct(curr, prev) {
    if (!prev) return curr > 0 ? '+100%' : '0%';
    const pct = Math.round(((curr - prev) / prev) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function buildCompareDailyStatsHtml(ctx, summaryA, summaryB) {
    const daysA = getPeriodInclusiveDays(ctx.periodA.start, ctx.periodA.end);
    const daysB = getPeriodInclusiveDays(ctx.periodB.start, ctx.periodB.end);
    const dailyExpenseA = summaryA.expense / daysA;
    const dailyExpenseB = summaryB.expense / daysB;
    const dailyIncomeA = summaryA.income / daysA;
    const dailyIncomeB = summaryB.income / daysB;
    return `<div class="compare-daily-grid">
        <div class="compare-daily-item">
            <span class="label">Śr. dzienna wydatków</span>
            <strong class="expense">${formatPlnAmount(dailyExpenseA)}</strong>
            <span class="compare-daily-vs">→</span>
            <strong class="expense">${formatPlnAmount(dailyExpenseB)}</strong>
            <em>${formatCompareDelta(dailyExpenseB, dailyExpenseA)}</em>
        </div>
        <div class="compare-daily-item">
            <span class="label">Śr. dzienna wpływów</span>
            <strong class="income">${formatPlnAmount(dailyIncomeA)}</strong>
            <span class="compare-daily-vs">→</span>
            <strong class="income">${formatPlnAmount(dailyIncomeB)}</strong>
            <em>${formatCompareDelta(dailyIncomeB, dailyIncomeA)}</em>
        </div>
        <p class="reports-hint compare-days-hint">Okres A: ${daysA} dni · Okres B: ${daysB} dni</p>
    </div>`;
}

function buildCompareCategoryMoversHtml(movers) {
    if (!movers.length) {
        return '<p class="reports-hint">Brak wydatków do porównania kategorii.</p>';
    }
    const rows = movers.map((row) => {
        const dir = row.diff > 0 ? 'up' : row.diff < 0 ? 'down' : 'flat';
        const sign = row.diff > 0 ? '+' : row.diff < 0 ? '−' : '';
        const arrow = row.diff > 0 ? '↑' : row.diff < 0 ? '↓' : '→';
        return `<div class="compare-mover-row compare-mover-row--${dir}">
            <span class="compare-mover-name">${escapeHtml(row.name)}</span>
            <span class="compare-mover-delta">${arrow} ${sign}${formatPlnAmount(Math.abs(row.diff))}</span>
            <span class="compare-mover-pct">${row.pct >= 0 ? '+' : ''}${row.pct}%</span>
        </div>`;
    }).join('');
    return `<div class="compare-movers-section">
        <h3 class="compare-subtitle">Największe zmiany kategorii</h3>
        ${rows}
    </div>`;
}

function destroyReportsCompareCharts() {
    if (reportsCompareChartInstance) {
        reportsCompareChartInstance.destroy();
        reportsCompareChartInstance = null;
    }
    if (reportsCompareWealthChartInstance) {
        reportsCompareWealthChartInstance.destroy();
        reportsCompareWealthChartInstance = null;
    }
}

function formatCompareSignedDelta(value) {
    const sign = value >= 0 ? '+' : '−';
    return `${sign}${formatPlnAmount(Math.abs(value))}`;
}

function buildCompareWealthHtml(ctx) {
    if (typeof buildCompareWealthSummary !== 'function') return '';
    const wealth = buildCompareWealthSummary(ctx.periodA.end, ctx.periodB.end);
    if (!wealth) {
        return `<div class="compare-wealth-section">
            <h3 class="compare-subtitle">Majątek i zobowiązania</h3>
            <p class="reports-hint">Brak snapshotów majątku dla wybranych okresów. Odwiedź zakładkę Majątek — snapshoty zapisują się automatycznie co miesiąc.</p>
        </div>`;
    }

    const debtDeltaLabel = wealth.deltaDebt <= 0 ? 'Spadek zobowiązań' : 'Wzrost zobowiązań';
    const debtDeltaClass = wealth.deltaDebt <= 0 ? 'income' : 'expense';

    return `<div class="compare-wealth-section">
        <h3 class="compare-subtitle">Majątek i zobowiązania (koniec okresu)</h3>
        <div class="compare-wealth-delta-grid">
            <div class="compare-wealth-delta compare-wealth-delta--assets">
                <span class="label">Zmiana majątku</span>
                <strong class="${wealth.deltaAssets >= 0 ? 'income' : 'expense'}">${formatCompareSignedDelta(wealth.deltaAssets)}</strong>
                <span class="compare-wealth-range">${formatPlnAmount(wealth.a.assets)} → ${formatPlnAmount(wealth.b.assets)}</span>
            </div>
            <div class="compare-wealth-delta compare-wealth-delta--debt">
                <span class="label">${debtDeltaLabel}</span>
                <strong class="${debtDeltaClass}">${formatCompareSignedDelta(Math.abs(wealth.deltaDebt))}</strong>
                <span class="compare-wealth-range">${formatPlnAmount(wealth.a.debt)} → ${formatPlnAmount(wealth.b.debt)}</span>
            </div>
            <div class="compare-wealth-delta compare-wealth-delta--net">
                <span class="label">Zmiana net worth</span>
                <strong class="${wealth.deltaNetWorth >= 0 ? 'income' : 'expense'}">${formatCompareSignedDelta(wealth.deltaNetWorth)}</strong>
                <span class="compare-wealth-range">${formatPlnAmount(wealth.a.netWorth)} → ${formatPlnAmount(wealth.b.netWorth)}</span>
            </div>
        </div>
        <div class="compare-chart-wrap compare-wealth-chart-wrap">
            <canvas id="reportsCompareWealthChart" aria-label="Wykres zmian majątku i zobowiązań"></canvas>
        </div>
        ${!wealth.hasBoth ? '<p class="reports-hint">Część danych oszacowana z najbliższego snapshotu lub bieżącego stanu.</p>' : ''}
    </div>`;
}

function renderReportsCompareWealthChart(ctx) {
    const canvas = document.getElementById('reportsCompareWealthChart');
    if (!canvas || typeof Chart === 'undefined' || typeof buildCompareWealthSummary !== 'function') return;

    const wealth = buildCompareWealthSummary(ctx.periodA.end, ctx.periodB.end);
    if (reportsCompareWealthChartInstance) {
        reportsCompareWealthChartInstance.destroy();
        reportsCompareWealthChartInstance = null;
    }
    if (!wealth) return;

    const theme = getReportsChartTheme();
    const deltas = [wealth.deltaAssets, -wealth.deltaDebt, wealth.deltaNetWorth];
    const colors = [
        wealth.deltaAssets >= 0 ? theme.incomeColor : theme.expenseColor,
        wealth.deltaDebt <= 0 ? theme.incomeColor : theme.expenseColor,
        wealth.deltaNetWorth >= 0 ? theme.incomeColor : theme.expenseColor
    ];

    const options = getReportsChartOptions(theme);
    options.aspectRatio = 1.85;
    options.plugins.legend.display = false;
    options.scales.x.grid.display = false;

    reportsCompareWealthChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Majątek', 'Zobowiązania', 'Net worth'],
            datasets: [{
                label: 'Zmiana A → B',
                data: deltas,
                backgroundColor: colors,
                borderRadius: 6,
                maxBarThickness: 44
            }]
        },
        options
    });
}

function renderReportsCompareChart(ctx) {
    const canvas = document.getElementById('reportsCompareChart');
    if (!canvas || typeof Chart === 'undefined' || typeof getReportsChartTheme !== 'function') return;

    const mapA = getCategoryExpenseMap(ctx.periodA.tx);
    const mapB = getCategoryExpenseMap(ctx.periodB.tx);
    const categories = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])]
        .map((name) => ({ name, max: Math.max(mapA[name] || 0, mapB[name] || 0) }))
        .sort((left, right) => right.max - left.max)
        .slice(0, 8)
        .map((entry) => entry.name);

    if (reportsCompareChartInstance) {
        reportsCompareChartInstance.destroy();
        reportsCompareChartInstance = null;
    }

    if (!categories.length) return;

    const theme = getReportsChartTheme();
    const options = getReportsChartOptions(theme);
    options.aspectRatio = 1.55;
    options.plugins.legend.position = 'bottom';

    reportsCompareChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: categories,
            datasets: [
                {
                    label: 'Okres A',
                    data: categories.map((name) => mapA[name] || 0),
                    backgroundColor: theme.prevYearColor,
                    borderRadius: 4,
                    maxBarThickness: 28
                },
                {
                    label: 'Okres B',
                    data: categories.map((name) => mapB[name] || 0),
                    backgroundColor: theme.expenseColor,
                    borderRadius: 4,
                    maxBarThickness: 28
                }
            ]
        },
        options
    });
}

function renderReportsCompare(ctx) {
    const card = document.getElementById('reports-compare-card');
    if (!card) return;
    const visible = ctx.mode === 'compare';
    card.classList.toggle('hidden', !visible);
    if (!visible) {
        destroyReportsCompareCharts();
        return;
    }

    const a = summarizePeriod(ctx.periodA.tx);
    const b = summarizePeriod(ctx.periodB.tx);
    const movers = buildCompareCategoryMovers(ctx.periodA.tx, ctx.periodB.tx);

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
                <div class="compare-stat"><span>Wpływy</span><strong class="income">${formatPlnAmount(b.income)}</strong><em>${formatComparePct(b.income, a.income)}</em></div>
                <div class="compare-stat"><span>Wydatki</span><strong class="expense">${formatPlnAmount(b.expense)}</strong><em>${formatComparePct(b.expense, a.expense)}</em></div>
                <div class="compare-stat"><span>Bilans</span><strong>${formatPlnAmount(b.balance)}</strong><em>${formatComparePct(b.balance, a.balance)}</em></div>
                <div class="compare-stat"><span>Oszczędności</span><strong>${b.savings}%</strong><em>${formatComparePct(b.savings, a.savings)}</em></div>
            </div>
        </div>
        ${buildCompareDailyStatsHtml(ctx, a, b)}
        ${buildCompareWealthHtml(ctx)}
        ${buildCompareCategoryMoversHtml(movers)}
        <div class="compare-chart-wrap">
            <h3 class="compare-subtitle">Wydatki wg kategorii</h3>
            <canvas id="reportsCompareChart" aria-label="Wykres porównania wydatków wg kategorii"></canvas>
        </div>
        ${buildDebtCompareHtml(ctx)}`;

    renderReportsCompareWealthChart(ctx);
    renderReportsCompareChart(ctx);
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
            <div class="reports-top-col">
                <span class="reports-top-amount expense">${formatPlnAmount(t.amount)}</span>
            </div>
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

function isReportsCurrentMonthPeriod(ctx) {
    if (!ctx || ctx.mode !== 'month' || !ctx.rangeStart || !ctx.rangeEnd) return false;
    const now = new Date();
    const currentStart = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const currentEnd = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return ctx.rangeStart === currentStart && ctx.rangeEnd === currentEnd;
}

function updateReportsForecastVisibility(ctx) {
    const card = document.getElementById('reports-forecast-card');
    if (!card) return;
    const show = isReportsCurrentMonthPeriod(ctx);
    card.classList.toggle('hidden', !show);
    if (show) renderReportsForecast(ctx);
}

function getPreviousPeriodBoundsForMom(ctx) {
    if (ctx.mode === 'month' && ctx.rangeStart) {
        const ref = new Date(`${ctx.rangeStart}T12:00:00`);
        const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
        return {
            start: localIsoDate(prev),
            end: localIsoDate(new Date(prev.getFullYear(), prev.getMonth() + 1, 0)),
            label: 'poprzedni miesiąc'
        };
    }
    if (ctx.mode === 'year' && ctx.period && ctx.period !== 'all') {
        const year = parseInt(ctx.period, 10);
        return {
            start: `${year - 1}-01-01`,
            end: `${year - 1}-12-31`,
            label: String(year - 1)
        };
    }
    return null;
}

function renderReportsMomSummary(ctx) {
    const el = document.getElementById('reports-mom-summary');
    if (!el) return;
    if (ctx.mode === 'compare') {
        el.classList.add('hidden');
        return;
    }

    const prevBounds = getPreviousPeriodBoundsForMom(ctx);
    if (!prevBounds) {
        el.classList.add('hidden');
        return;
    }

    const prevTx = getTransactionsInRange(prevBounds.start, prevBounds.end);
    const current = summarizePeriod(ctx.periodTx);
    const prev = summarizePeriod(prevTx);
    const deltaPct = (curr, prevVal) => {
        if (!prevVal) return curr > 0 ? '+100%' : '0%';
        const pct = Math.round(((curr - prevVal) / prevVal) * 100);
        return `${pct >= 0 ? '+' : ''}${pct}%`;
    };

    el.innerHTML = `<span class="reports-mom-label">vs ${prevBounds.label}:</span>
        <span class="reports-mom-item expense">wydatki <strong>${deltaPct(current.expense, prev.expense)}</strong></span>
        <span class="reports-mom-item income">wpływy <strong>${deltaPct(current.income, prev.income)}</strong></span>
        <span class="reports-mom-item">oszczędności <strong>${deltaPct(current.savings, prev.savings)}</strong></span>`;
    el.classList.remove('hidden');
}

function getChartParamsFromOverviewCtx(ctx) {
    let chartPeriod = ctx.period;
    let chartRangeStart = ctx.rangeStart;
    let chartRangeEnd = ctx.rangeEnd;
    if (ctx.mode === 'month') {
        chartPeriod = 'month';
    } else if (ctx.period === 'compare' && ctx.periodA) {
        chartPeriod = 'range';
        chartRangeStart = ctx.periodA.start;
        chartRangeEnd = ctx.periodA.end;
    }
    return { chartPeriod, chartRangeStart, chartRangeEnd };
}

function renderOverviewSection(ctx, savingsRate) {
    if (typeof renderReportsStructureChart === 'function') renderReportsStructureChart(ctx);
    if (typeof renderReportsMonthChart === 'function') renderReportsMonthChart(ctx);
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromOverviewCtx(ctx);
    renderReportsDailyAvg(chartPeriod, ctx.periodTx, chartRangeStart, chartRangeEnd);
    renderReportsSavingsGoal(savingsRate);
}

function renderExpensesSection(ctx) {
    const { chartPeriod, chartRangeStart } = getChartParamsFromOverviewCtx(ctx);
    if (typeof syncReportsCalendarFromContext === 'function') {
        syncReportsCalendarFromContext(ctx);
    } else {
        syncReportsCalendarToPeriod(chartPeriod === 'range' ? chartRangeStart?.slice(0, 4) : ctx.period);
    }
    if (typeof renderReportsCalendarView === 'function') {
        renderReportsCalendarView();
    } else if (typeof renderReportsCalendar === 'function') {
        renderReportsCalendar();
    }
    renderReportsTopCategories(ctx.periodTx);
    renderReportsOutliers(ctx);
    renderReportsCategoryTrends();
    renderDetectedRecurringList();
}

function renderAdvancedSection(ctx) {
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromOverviewCtx(ctx);
    renderReportsTrendChart(chartPeriod, ctx.periodTx, chartRangeStart, chartRangeEnd);
    renderReportsYoYChart(chartPeriod, ctx.periodTx, ctx);
    renderReportsDowChart(ctx.periodTx);
    renderReportsFlow(ctx);
    renderReportsYearReview(ctx);
    if (typeof renderReportsAllocationTrendChart === 'function') renderReportsAllocationTrendChart();
    if (typeof renderReportsDiversificationChart === 'function') renderReportsDiversificationChart(ctx);
    if (typeof renderReportsIkzeLimit === 'function') renderReportsIkzeLimit();
    if (typeof renderReportsMortgageVsRetirement === 'function') renderReportsMortgageVsRetirement();
}

function renderDebtsAnalysisSection(ctx) {
    renderReportsDebtsSection(ctx);
    renderReportsDebtTrendChart(ctx);
    if (typeof renderDebtPeakChart === 'function') renderDebtPeakChart();
}

function renderAnalysisSectionContent(section, ctx, savingsRate, options = {}) {
    if (!ctx || !section) return;
    const force = Boolean(options.force || options.forExport);
    const sectionKey = `${section}|${getReportsContextCacheKey(ctx)}`;
    if (!force && reportsRenderedSections[section] === sectionKey) return;

    setAnalysisSectionLoading(section, true);
    try {
        switch (section) {
            case 'overview':
                renderOverviewSection(ctx, savingsRate);
                break;
            case 'expenses':
                renderExpensesSection(ctx);
                break;
            case 'assets':
                renderReportsAssetsSection(ctx);
                break;
            case 'debts':
                renderDebtsAnalysisSection(ctx);
                break;
            case 'advanced':
                renderAdvancedSection(ctx);
                break;
            default:
                break;
        }
        reportsRenderedSections[section] = sectionKey;
    } finally {
        setAnalysisSectionLoading(section, false);
    }
}

function renderAllAnalysisSectionsForExport(ctx, savingsRate) {
    ANALYSIS_SECTIONS.forEach((section) => {
        renderAnalysisSectionContent(section, ctx, savingsRate, { forExport: true });
    });
}

function invalidateAnalysisRenderCache(ctx) {
    const ctxKey = getReportsContextCacheKey(ctx);
    if (reportsContextCacheKey !== ctxKey) {
        reportsContextCacheKey = ctxKey;
        ANALYSIS_SECTIONS.forEach((section) => {
            delete reportsRenderedSections[section];
        });
        if (typeof resetReportsAssetAllocationDrill === 'function') resetReportsAssetAllocationDrill(true);
        if (typeof resetReportsDebtSplitDrill === 'function') resetReportsDebtSplitDrill(true);
        if (typeof resetReportsDiversificationDrill === 'function') resetReportsDiversificationDrill(true);
        if (typeof reportsStructureMainCategory !== 'undefined') {
            reportsStructureMainCategory = null;
            reportsStructureSubCategory = null;
        }
    }
}


function exportReportsPdf() {
    const ctx = getReportsPeriodContext();
    const savingsRate = summarizePeriod(ctx.periodTx).savings;
    renderAllAnalysisSectionsForExport(ctx, savingsRate);
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
    reportsLastCtx = ctx;
    reportsLastSavingsRate = savingsRate;
    invalidateAnalysisRenderCache(ctx);

    updateReportsPeriodUI(ctx);
    renderReportsCompare(ctx);
    renderReportsMomSummary(ctx);
    updateReportsForecastVisibility(ctx);

    renderAnalysisSectionContent(analysisSection, ctx, savingsRate, { force: true });

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

document.addEventListener('DOMContentLoaded', initAnalysisUI);
if (document.readyState !== 'loading') initAnalysisUI();
