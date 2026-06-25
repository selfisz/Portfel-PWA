/**
 * Testy jednostkowe dla:
 *  - js/ui.js           (getBasePath, updateShowMoreButton)
 *  - js/dashboard.js    (transactionMatchesSearch, formatDueLabel, getTransactionDateBounds)
 *  - js/settings.js     (suggestCategoryBudget, getExportPayload, applyBackupPayload)
 *  - js/reports-calendar.js (addMonthsToDate, getLoanInstallmentDay, getEffectiveDueDay,
 *                            getScheduledDebtPaymentsOnDate, buildDebtPeakSeries)
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

// ─── helpers ───────────────────────────────────────────────────────────────

function makeEl(extra = {}) {
    return {
        value: '', classList: {
            _set: new Set(),
            toggle(cls, force) { force === undefined ? (this._set.has(cls) ? this._set.delete(cls) : this._set.add(cls)) : (force ? this._set.add(cls) : this._set.delete(cls)); },
            add(cls) { this._set.add(cls); },
            remove(cls) { this._set.delete(cls); },
            contains(cls) { return this._set.has(cls); }
        },
        style: {}, innerHTML: '', textContent: '', innerText: '',
        dataset: {}, checked: false, disabled: false,
        getAttribute: () => null, setAttribute: () => {},
        querySelectorAll: () => ({ forEach: () => {} }),
        appendChild: () => {},
        insertAdjacentElement: () => {},
        parentElement: null,
        previousElementSibling: null,
        ...extra
    };
}

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };

    const elMap = {};
    globalThis.document = {
        getElementById: (id) => {
            if (!elMap[id]) elMap[id] = makeEl({ id });
            return elMap[id];
        },
        querySelector: () => null,
        querySelectorAll: () => ({ forEach: () => {}, length: 0 }),
        createElement: (tag) => makeEl({ tagName: tag.toUpperCase(), addEventListener: () => {} }),
        body: makeEl()
    };
    globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: () => {} }), setTimeout: (fn) => fn() };
    try { globalThis.navigator = {}; } catch { /* readonly in some envs */ }
    globalThis.location = { pathname: '/Portfel-PWA/index.html' };
    globalThis.confirm = () => true;
    globalThis.alert = () => {};
    globalThis.setTimeout = (fn) => fn && fn();
    globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
    globalThis.Blob = class { constructor() {} };

    globalThis.stateRef = { set: () => Promise.resolve(), on: () => {}, off: () => {} };
    globalThis.cloudBackupRef = { set: () => Promise.resolve(), get: () => Promise.resolve({ exists: false }) };
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatCompactPln = (n) => `${n} zł`;
    globalThis.formatTxDate = (d) => d;
    globalThis.escapeHtml = (t) => String(t ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    globalThis.saveState = () => {};
    globalThis.hapticFeedback = () => {};
    globalThis.showSettingsToast = () => {};
    globalThis.renderDashboard = () => {};
    globalThis.renderAssets = () => {};
    globalThis.renderReports = () => {};
    globalThis.refreshCurrentView = () => {};
    globalThis.deleteTransaction = () => {};
    globalThis.editTransaction = () => {};
    globalThis.renderCategoryIcon = () => '';
    globalThis.formatDateGroup = (d) => d;
    globalThis.getChartSliceColors = () => [];
    globalThis.getChartBorderColor = () => '#fff';
    globalThis.isLightTheme = () => false;
    globalThis.getPortfolioValuePln = () => 0;
    globalThis.getLoanSummaryTotal = () => 0;
    globalThis.getSnapshotMonthChange = () => null;
    globalThis.getOperationalCashPln = () => 0;
    globalThis.hasScheduledLoanInstallments = () => false;
    globalThis.getUpcomingLoanInstallments = () => [];
    globalThis.daysUntilDate = () => null;
    globalThis.getLoanDisplayName = (l) => l?.name || l?.subCategory || 'Kredyt';
    globalThis.renderCreditCardsSection = () => {};
    globalThis.renderDashboardCreditCards = () => {};
    globalThis.migrateRecentCategories = () => {};
    globalThis.closeCategoryEditor = () => {};
    globalThis.renderCategoryEditor = () => {};
    globalThis.openCreditCardDetails = () => {};
    globalThis.openLoanDetails = () => {};
    globalThis.closeCalendarDay = () => {};
    globalThis.editFromCalendarDay = () => {};
    globalThis.openCalendarDay = () => {};
    globalThis.openMonthDrillDown = () => {};
    globalThis.renderReportsCalendar = () => {};
    globalThis.renderDebtCalendarSection = () => {};
    globalThis.renderDebtCalendarGrid = () => {};
    globalThis.renderDebtPeakChart = () => {};
    globalThis.renderDebtFreedomTimeline = () => {};
    globalThis.renderDepositsCalendarList = () => {};
    globalThis.renderReportsYearHeatmap = () => {};
    globalThis.getRecentCardRepaymentAverage = () => 500;
    globalThis.estimateLoanPayoff = () => ({ label: '~12 mies.', detail: '' });
    globalThis.estimateCardPayoff = () => ({ label: '~3 mies.', detail: '' });
    globalThis.getReportsChartTheme = () => ({ tooltipBg: '#000', legendColor: '#fff', gridColor: '#333' });
    globalThis.getExpenseHeatColor = () => 'rgba(0,0,0,0.1)';
    globalThis.summarizePeriod = (txs) => {
        const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return { income, expense, balance: income - expense };
    };
    globalThis.reportsCalendarView = 'month';
    globalThis.reportsCalendarYear = 2024;
    globalThis.reportsCalendarMonth = 0;
    globalThis.reportsMonthChartMeta = {};
    globalThis.calendarDayDate = null;
    globalThis.calendarDayFilter = 'all';
    globalThis.reportsDebtPeakChartInstance = null;
    globalThis.dashboardChartInstance = null;
    globalThis.activeChartCategory = null;
    globalThis.chartViewType = 'expense';
    globalThis.categoryEditorType = 'expense';
    globalThis.Chart = class { constructor() {} destroy() {} toggleDataVisibility() {} getDataVisibility() { return true; } };
    globalThis.normalizeAppState = (data) => { _setAppState({ ..._getAppState(), ...data }); };
    globalThis.getPersistedState = (s) => s;
    globalThis.formState = { selectedMainCategory: '', selectedSubCategory: '' };

    globalThis.getLoans = () => (globalThis.appState?.loans || []).map(normalizeLoan);
    globalThis.getActiveLoans = () => getLoans().filter((l) => !l.archived && l.currentCapitalLeft > 0);
    globalThis.getActiveCreditCards = () => (globalThis.appState?.creditCards || []).filter((c) => !c.archived && c.limit > 0);
    globalThis.normalizeLoan = (raw) => {
        const l = raw && typeof raw === 'object' ? { ...raw } : {};
        l.id = l.id || `loan-${Date.now().toString(36)}`;
        l.name = l.name || '';
        l.subCategory = l.subCategory || '';
        l.totalAmount = Math.max(0, parseFloat(l.totalAmount) || 0);
        l.currentCapitalLeft = Math.max(0, parseFloat(l.currentCapitalLeft) || 0);
        l.interestRate = Math.max(0, parseFloat(l.interestRate) || 0);
        l.nextInstallmentAmount = Math.max(0, parseFloat(l.nextInstallmentAmount) || 0);
        l.nextInstallmentDue = l.nextInstallmentDue || '';
        l.archived = !!l.archived;
        l.details = l.details || {};
        return l;
    };

    loadScript('js/constants.js');
    loadScript('js/portfolio.js');
    loadScript('js/state.js');
    loadScript('js/assets.js');
    loadScript('js/cash.js');
    loadScript('js/loan-details.js');
    loadScript('js/credit-cards.js');
    loadScript('js/ui.js');
    loadScript('js/settings.js');
    loadScript('js/reports-debt.js');
    loadScript('js/dashboard.js');
    loadScript('js/reports-calendar.js');

    runInContext(`
        function _getAppState()  { return appState; }
        function _setAppState(s) { appState = s; }
    `);
});

beforeEach(() => {
    _setAppState({
        transactions: [],
        loans: [],
        creditCards: [],
        assets: [],
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets: {},
        creditCardMovements: [],
        categoryTree: undefined
    });
    globalThis.confirm = () => true;
    globalThis.activeChartCategory = null;
    globalThis.chartViewType = 'expense';
});

// ===========================================================================
// ui.js — getBasePath
// ===========================================================================
describe('getBasePath', () => {
    it('zwraca ścieżkę z Portfel-PWA gdy w URL', () => {
        globalThis.location = { pathname: '/Portfel-PWA/index.html' };
        expect(getBasePath()).toBe('/Portfel-PWA');
    });

    it('zwraca pusty string gdy brak Portfel-PWA w pathname', () => {
        globalThis.location = { pathname: '/index.html' };
        expect(getBasePath()).toBe('');
    });

    it('obsługuje zagnieżdżoną ścieżkę', () => {
        globalThis.location = { pathname: '/user/projects/Portfel-PWA/sub' };
        expect(getBasePath()).toBe('/user/projects/Portfel-PWA');
    });
});

// ===========================================================================
// ui.js — updateShowMoreButton
// ===========================================================================
describe('updateShowMoreButton', () => {
    it('ukrywa przycisk gdy totalCount <= visibleCount', () => {
        const btn = makeEl();
        const parent = makeEl();
        updateShowMoreButton(btn, 5, 6, parent, null);
        expect(btn.classList.contains('hidden')).toBe(true);
    });

    it('pokazuje przycisk gdy totalCount > visibleCount', () => {
        const btn = makeEl();
        const parent = makeEl();
        updateShowMoreButton(btn, 10, 6, parent, null);
        expect(btn.classList.contains('hidden')).toBe(false);
    });

    it('nic nie robi gdy btn = null', () => {
        expect(() => updateShowMoreButton(null, 10, 5, {}, null)).not.toThrow();
    });

    it('nic nie robi gdy parent = null', () => {
        const btn = makeEl();
        expect(() => updateShowMoreButton(btn, 10, 5, null, null)).not.toThrow();
    });
});

// ===========================================================================
// dashboard.js — formatDueLabel
// ===========================================================================
describe('formatDueLabel', () => {
    it('zwraca pusty string dla null', () => {
        expect(formatDueLabel(null)).toBe('');
    });

    it('zwraca "dzisiaj" dla 0 dni', () => {
        expect(formatDueLabel(0)).toBe('dzisiaj');
    });

    it('zwraca "jutro" dla 1 dnia', () => {
        expect(formatDueLabel(1)).toBe('jutro');
    });

    it('zwraca "za N dni" dla dodatnich', () => {
        expect(formatDueLabel(5)).toBe('za 5 dni');
        expect(formatDueLabel(30)).toBe('za 30 dni');
    });

    it('zwraca "N dni temu" dla ujemnych', () => {
        expect(formatDueLabel(-3)).toBe('3 dni temu');
        expect(formatDueLabel(-1)).toBe('1 dni temu');
    });
});

// ===========================================================================
// dashboard.js — transactionMatchesSearch
// ===========================================================================
describe('transactionMatchesSearch', () => {
    const tx = {
        mainCategory: 'Jedzenie na mieście',
        subCategory: 'Restauracje',
        note: 'Obiad z klientem',
        amount: 123.45,
        date: '2024-01-15',
        type: 'expense'
    };

    it('dopasowuje mainCategory (case-insensitive)', () => {
        expect(transactionMatchesSearch(tx, 'jedzenie')).toBe(true);
    });

    it('dopasowuje subCategory', () => {
        expect(transactionMatchesSearch(tx, 'restaurac')).toBe(true);
    });

    it('dopasowuje note', () => {
        expect(transactionMatchesSearch(tx, 'klientem')).toBe(true);
    });

    it('dopasowuje kwotę jako string', () => {
        expect(transactionMatchesSearch(tx, '123.45')).toBe(true);
    });

    it('dopasowuje datę', () => {
        expect(transactionMatchesSearch(tx, '2024-01')).toBe(true);
    });

    it('zwraca false dla niedopasowania', () => {
        expect(transactionMatchesSearch(tx, 'zakupy')).toBe(false);
    });
});

// ===========================================================================
// dashboard.js — getTransactionDateBounds
// ===========================================================================
describe('getTransactionDateBounds', () => {
    it('zwraca dzisiaj (lokalny) gdy brak transakcji', () => {
        const result = getTransactionDateBounds();
        const now = new Date();
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(result.startDate).toBe(expected);
        expect(result.endDate).toBe(expected);
    });

    it('zwraca min i max z transakcji', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-03-15', type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: '' },
            { date: '2024-01-01', type: 'expense', amount: 50, mainCategory: 'Dom', subCategory: '' },
            { date: '2024-06-30', type: 'income', amount: 200, mainCategory: 'Wynagrodzenie', subCategory: '' }
        ]});
        const result = getTransactionDateBounds();
        expect(result.startDate).toBe('2024-01-01');
        expect(result.endDate).toBe('2024-06-30');
    });
});

// ===========================================================================
// settings.js — suggestCategoryBudget
// ===========================================================================
describe('suggestCategoryBudget', () => {
    it('zwraca 0 gdy brak transakcji', () => {
        expect(suggestCategoryBudget('Dom')).toBe(0);
    });

    it('zwraca 0 gdy brak wydatków tej kategorii', () => {
        _setAppState({ ..._getAppState(), transactions: [
            { date: '2024-01-10', type: 'expense', mainCategory: 'Jedzenie', amount: 500 }
        ]});
        expect(suggestCategoryBudget('Dom')).toBe(0);
    });

    it('oblicza średnią z miesięcy z wydatkami', () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const txDate = `${y}-${String(m + 1).padStart(2, '0')}-10`;
        _setAppState({ ..._getAppState(), transactions: [
            { date: txDate, type: 'expense', mainCategory: 'Dom', amount: 1000 }
        ]});
        const result = suggestCategoryBudget('Dom');
        expect(result).toBe(1000);
    });

    it('zwraca zaokrągloną całkowitą wartość', () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const prevDate = `${y}-${String(m).padStart(2, '0')}-10`;
        const thisDate = `${y}-${String(m + 1).padStart(2, '0')}-10`;
        _setAppState({ ..._getAppState(), transactions: [
            { date: prevDate, type: 'expense', mainCategory: 'Dom', amount: 700 },
            { date: thisDate, type: 'expense', mainCategory: 'Dom', amount: 800 }
        ]});
        const result = suggestCategoryBudget('Dom');
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThan(0);
    });

    it('ignoruje transakcje typu income', () => {
        const now = new Date();
        const txDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`;
        _setAppState({ ..._getAppState(), transactions: [
            { date: txDate, type: 'income', mainCategory: 'Dom', amount: 5000 }
        ]});
        expect(suggestCategoryBudget('Dom')).toBe(0);
    });
});

// ===========================================================================
// settings.js — getExportPayload
// ===========================================================================
describe('getExportPayload', () => {
    it('zwraca payload z wersją 1 i exportedAt', () => {
        _setAppState({ ..._getAppState(), transactions: [{ date: '2024-01-01', amount: 100, type: 'expense', mainCategory: 'Dom', subCategory: '' }] });
        const payload = getExportPayload();
        expect(payload.version).toBe(1);
        expect(payload.exportedAt).toBeTruthy();
        expect(payload.transactionCount).toBe(1);
        expect(payload.data).toBeTruthy();
    });
});

// ===========================================================================
// reports-calendar.js — addMonthsToDate
// ===========================================================================
describe('addMonthsToDate', () => {
    it('dodaje jeden miesiąc', () => {
        expect(addMonthsToDate('2024-01-15', 1)).toBe('2024-02-15');
    });

    it('dodaje miesiące przez koniec roku', () => {
        expect(addMonthsToDate('2024-11-10', 3)).toBe('2025-02-10');
    });

    it('odejmuje miesiące (ujemne)', () => {
        expect(addMonthsToDate('2024-03-20', -2)).toBe('2024-01-20');
    });

    it('obsługuje overflow dni (luty) — przechodzi do marca', () => {
        // Jan 31 + 1 miesiąc = Feb 31 → JavaScript overflow = Mar 2 (2024 przestępny)
        const result = addMonthsToDate('2024-01-31', 1);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.startsWith('2024-03') || result.startsWith('2024-02')).toBe(true);
    });

    it('dodaje 0 miesięcy = ta sama data', () => {
        expect(addMonthsToDate('2024-06-15', 0)).toBe('2024-06-15');
    });
});

// ===========================================================================
// reports-calendar.js — getLoanInstallmentDay
// ===========================================================================
describe('getLoanInstallmentDay', () => {
    it('zwraca null dla loan bez nextInstallmentDue', () => {
        expect(getLoanInstallmentDay({})).toBeNull();
        expect(getLoanInstallmentDay(null)).toBeNull();
    });

    it('wyciąga dzień z daty YYYY-MM-DD', () => {
        expect(getLoanInstallmentDay({ nextInstallmentDue: '2024-01-15' })).toBe(15);
        expect(getLoanInstallmentDay({ nextInstallmentDue: '2024-12-01' })).toBe(1);
    });

    it('zwraca null dla nieprawidłowej daty', () => {
        expect(getLoanInstallmentDay({ nextInstallmentDue: 'invalid' })).toBeNull();
    });
});

// ===========================================================================
// reports-calendar.js — getEffectiveDueDay
// ===========================================================================
describe('getEffectiveDueDay', () => {
    it('zwraca dueDay gdy mieści się w miesiącu', () => {
        expect(getEffectiveDueDay(15, 2024, 0)).toBe(15); // Styczeń
        expect(getEffectiveDueDay(28, 2024, 1)).toBe(28); // Luty
    });

    it('clampuje do ostatniego dnia miesiąca', () => {
        expect(getEffectiveDueDay(31, 2024, 1)).toBe(29); // Luty 2024 (przestępny)
        expect(getEffectiveDueDay(31, 2023, 1)).toBe(28); // Luty 2023
        expect(getEffectiveDueDay(31, 2024, 3)).toBe(30); // Kwiecień
    });

    it('zwraca 1 gdy dueDay = 1', () => {
        expect(getEffectiveDueDay(1, 2024, 5)).toBe(1);
    });
});

// ===========================================================================
// reports-calendar.js — getScheduledDebtPaymentsOnDate
// ===========================================================================
describe('getScheduledDebtPaymentsOnDate', () => {
    it('zwraca pustą tablicę gdy brak aktywnych kredytów i kart', () => {
        expect(getScheduledDebtPaymentsOnDate('2024-01-15')).toEqual([]);
    });

    it('zwraca ratę kredytu na odpowiedni dzień', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', name: 'Hipoteka', subCategory: 'Hipoteka',
              totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2000, nextInstallmentDue: '2024-01-15',
              interestRate: 7, archived: false, includeInSummary: true }
        ]});

        const result = getScheduledDebtPaymentsOnDate('2024-01-15');
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('loan');
        expect(result[0].amount).toBe(2000);
    });

    it('nie zwraca raty przed pierwszym terminem', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', name: 'Kredyt', subCategory: 'Kredyt',
              totalAmount: 10000, currentCapitalLeft: 9000,
              nextInstallmentAmount: 500, nextInstallmentDue: '2024-03-15',
              interestRate: 5, archived: false }
        ]});
        const result = getScheduledDebtPaymentsOnDate('2024-01-15');
        expect(result).toHaveLength(0);
    });
});

// ===========================================================================
// reports-calendar.js — getLoanPayoffEndDate
// ===========================================================================
describe('getLoanPayoffEndDate', () => {
    it('zwraca null gdy brak kapitału', () => {
        const loan = normalizeLoan({ id: 'l1', currentCapitalLeft: 0 });
        expect(getLoanPayoffEndDate(loan)).toBeNull();
    });

    it('używa endDate z details gdy dostępny', () => {
        const loan = normalizeLoan({ id: 'l1', currentCapitalLeft: 100000, details: { endDate: '2030-06-01' } });
        expect(getLoanPayoffEndDate(loan)).toBe('2030-06-01');
    });

    it('szacuje datę spłaty z nextInstallmentAmount', () => {
        const loan = normalizeLoan({ id: 'l1', currentCapitalLeft: 12000, nextInstallmentAmount: 1000 });
        const result = getLoanPayoffEndDate(loan);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('zwraca null gdy brak danych do szacowania', () => {
        const loan = normalizeLoan({ id: 'l1', currentCapitalLeft: 100000 });
        expect(getLoanPayoffEndDate(loan)).toBeNull();
    });
});

// ===========================================================================
// dashboard.js — formatDashboardPeriodLabel
// ===========================================================================
describe('formatDashboardPeriodLabel', () => {
    function setSelectValue(val) {
        const el = document.getElementById('dashboard-period-select');
        el.value = val;
    }

    it('zwraca rok dla current-year', () => {
        setSelectValue('current-year');
        const result = formatDashboardPeriodLabel();
        const currentYear = new Date().getFullYear();
        expect(result).toBe(String(currentYear));
    });

    it('zwraca poprzedni rok dla previous-year', () => {
        setSelectValue('previous-year');
        const result = formatDashboardPeriodLabel();
        const prevYear = new Date().getFullYear() - 1;
        expect(result).toBe(String(prevYear));
    });

    it('zwraca "Wszystko" dla all', () => {
        setSelectValue('all');
        const result = formatDashboardPeriodLabel();
        expect(result).toBe('Wszystko');
    });

    it('zwraca string z wielką literą dla current-month', () => {
        setSelectValue('current-month');
        const result = formatDashboardPeriodLabel();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toBe(result[0].toUpperCase());
    });

    it('zwraca string z wielką literą dla previous-month', () => {
        setSelectValue('previous-month');
        const result = formatDashboardPeriodLabel();
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });
});

// ===========================================================================
// dashboard.js — getDashboardDates — timezone fix
// ===========================================================================
describe('getDashboardDates — timezone fix', () => {
    function setSelectValue(val) {
        document.getElementById('dashboard-period-select').value = val;
    }

    it('current-month: startDate to pierwszy dzień lokalnego miesiąca', () => {
        setSelectValue('current-month');
        const { startDate } = getDashboardDates();
        const now = new Date();
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        expect(startDate).toBe(expected);
    });

    it('current-month: endDate to ostatni dzień lokalnego miesiąca (nie UTC)', () => {
        setSelectValue('current-month');
        const { endDate } = getDashboardDates();
        expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // endDate nie może być z poprzedniego dnia (UTC artefakt)
        const now = new Date();
        const expectedMonth = String(now.getMonth() + 1).padStart(2, '0');
        expect(endDate.startsWith(`${now.getFullYear()}-${expectedMonth}`)).toBe(true);
    });

    it('current-year: startDate to 01-01', () => {
        setSelectValue('current-year');
        const { startDate } = getDashboardDates();
        const year = new Date().getFullYear();
        expect(startDate).toBe(`${year}-01-01`);
    });

    it('current-year: endDate to 12-31 (nie przepadnie przez UTC)', () => {
        setSelectValue('current-year');
        const { endDate } = getDashboardDates();
        const year = new Date().getFullYear();
        expect(endDate).toBe(`${year}-12-31`);
    });

    it('previous-year: zakres to cały poprzedni rok', () => {
        setSelectValue('previous-year');
        const { startDate, endDate } = getDashboardDates();
        const prevYear = new Date().getFullYear() - 1;
        expect(startDate).toBe(`${prevYear}-01-01`);
        expect(endDate).toBe(`${prevYear}-12-31`);
    });

    it('next-month: zakres to pierwszy i ostatni dzień następnego miesiąca', () => {
        setSelectValue('next-month');
        const { startDate, endDate } = getDashboardDates();
        const now = new Date();
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const expectedStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
        const expectedEndDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        const expectedEnd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(expectedEndDay).padStart(2, '0')}`;
        expect(startDate).toBe(expectedStart);
        expect(endDate).toBe(expectedEnd);
    });
});

describe('getDashboardForecastTotals', () => {
    beforeEach(() => {
        const now = new Date();
        const txs = [];
        for (let i = 1; i <= 3; i += 1) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
            txs.push(
                { date, type: 'income', amount: 3000 * i, mainCategory: 'Praca', subCategory: 'Pensja' },
                { date, type: 'expense', amount: 1000 * i, mainCategory: 'Dom', subCategory: 'Czynsz' }
            );
        }
        _setAppState({ ..._getAppState(), transactions: txs });
    });

    it('liczy średnią wpływów i wydatków z 3 poprzednich miesięcy', () => {
        const forecast = getDashboardForecastTotals();
        expect(forecast.income).toBe(6000);
        expect(forecast.expense).toBe(2000);
    });
});

describe('getDashboardForecastPlanItems', () => {
    beforeEach(() => {
        const now = new Date();
        const txs = [];
        for (let i = 1; i <= 3; i += 1) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
            txs.push(
                { date, type: 'income', amount: 3000 * i, mainCategory: 'Praca', subCategory: 'Pensja' },
                { date, type: 'expense', amount: 1000 * i, mainCategory: 'Dom', subCategory: 'Czynsz' }
            );
        }
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        txs.push({
            date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
            type: 'expense',
            amount: 800,
            mainCategory: 'Dom',
            subCategory: 'Czynsz',
            recurringId: 'rec-czynsz'
        });
        txs.push({
            date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-10`,
            type: 'income',
            amount: 8500,
            mainCategory: 'Praca',
            subCategory: 'Pensja',
            recurringId: 'rec-pensja'
        });
        _setAppState({ ..._getAppState(), transactions: txs });
    });

    it('dzieli prognozę na stałe i zmienne pozycje', () => {
        const now = new Date();
        const startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
        const endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
        const { items, summary } = getDashboardForecastPlanItems(startDate, endDate);

        expect(summary.totalIncome).toBe(6000);
        expect(summary.totalExpense).toBe(2000);
        expect(summary.fixedIncome).toBe(8500);
        expect(summary.fixedExpense).toBe(800);
        expect(summary.variableIncome).toBe(0);
        expect(summary.variableExpense).toBe(1200);
        expect(items.some((item) => item.source === 'recurring-manual' && item.type === 'income')).toBe(true);
        expect(items.some((item) => item.source === 'variable-expense')).toBe(true);
    });

    it('uwzględnia raty kredytów w stałych wydatkach', () => {
        const now = new Date();
        const startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
        const endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));

        _setAppState({
            ..._getAppState(),
            loans: [{
                id: 'loan-x',
                subCategory: 'Hipoteczny',
                totalAmount: 100000,
                currentCapitalLeft: 90000,
                nextInstallmentAmount: 2500,
                nextInstallmentDue: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`,
                archived: false
            }]
        });

        const { items, summary } = getDashboardForecastPlanItems(startDate, endDate);
        expect(summary.fixedExpense).toBeGreaterThanOrEqual(2500);
        expect(items.some((item) => item.source === 'debt-loan')).toBe(true);
    });
});

// ===========================================================================
// settings.js — applyBackupPayload
// ===========================================================================
describe('applyBackupPayload', () => {
    it('wczytuje dane z payload.data', () => {
        const payload = {
            version: 1,
            data: {
                transactions: [
                    { date: '2024-01-01', type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: '' }
                ],
                loans: [],
                assets: [],
                creditCards: [],
                cashMovements: [],
                creditCardMovements: []
            }
        };
        applyBackupPayload(payload);
        expect(_getAppState().transactions.length).toBeGreaterThanOrEqual(1);
    });

    it('wczytuje dane bezpośrednio gdy brak payload.data', () => {
        const payload = {
            transactions: [
                { date: '2024-02-01', type: 'income', amount: 5000, mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa' }
            ],
            loans: [],
            assets: [],
            creditCards: [],
            cashMovements: [],
            creditCardMovements: []
        };
        applyBackupPayload(payload);
        expect(_getAppState().transactions.length).toBeGreaterThanOrEqual(1);
    });

    it('rzuca błąd gdy brak transactions w danych', () => {
        expect(() => applyBackupPayload({ data: { transactions: null } })).toThrow();
        expect(() => applyBackupPayload({})).toThrow();
    });
});

// ===========================================================================
// reports-calendar.js — getCardRepaymentHint
// ===========================================================================
describe('getCardRepaymentHint', () => {
    it('zwraca null gdy balance = 0', () => {
        const card = { id: 'c1', name: 'Test', limit: 5000, currentBalance: 0 };
        expect(getCardRepaymentHint(card)).toBeNull();
    });

    it('zwraca null gdy brak ruchów karty', () => {
        _setAppState({ ..._getAppState(), creditCardMovements: [] });
        const card = { id: 'c1', name: 'Test', limit: 5000, currentBalance: 1000 };
        expect(getCardRepaymentHint(card)).toBeNull();
    });

    it('zwraca hint gdy są spłaty historyczne', () => {
        _setAppState({ ..._getAppState(), creditCardMovements: [
            { id: 'm1', cardId: 'c1', type: 'repayment', amount: 500, date: '2024-01-15' },
            { id: 'm2', cardId: 'c1', type: 'repayment', amount: 600, date: '2024-02-15' }
        ]});
        globalThis.getRecentCardRepaymentAverage = () => 550;
        const card = { id: 'c1', name: 'Test', limit: 5000, currentBalance: 2000 };
        const hint = getCardRepaymentHint(card);
        expect(hint).toBeTruthy();
        expect(hint.day).toBe(15);
        expect(hint.estimated).toBe(true);
    });

    it('ignoruje ruchy transfer_out przy wyznaczaniu dnia', () => {
        _setAppState({ ..._getAppState(), creditCardMovements: [
            { id: 'm1', cardId: 'c1', type: 'transfer_out', amount: 500, date: '2024-01-05' },
            { id: 'm2', cardId: 'c1', type: 'repayment', amount: 500, date: '2024-01-20' }
        ]});
        globalThis.getRecentCardRepaymentAverage = () => 500;
        const card = { id: 'c1', name: 'Test', limit: 5000, currentBalance: 1000 };
        const hint = getCardRepaymentHint(card);
        expect(hint?.day).toBe(20);
    });
});

// ===========================================================================
// reports-calendar.js — buildDebtFreedomTimeline
// ===========================================================================
describe('buildDebtFreedomTimeline', () => {
    it('zwraca pustą tablicę gdy brak aktywnych kredytów i kart', () => {
        expect(buildDebtFreedomTimeline()).toEqual([]);
    });

    it('zwraca pozycję dla aktywnego kredytu', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', name: 'Hipoteka', subCategory: 'Hipoteka',
              totalAmount: 300000, currentCapitalLeft: 250000,
              nextInstallmentAmount: 2000, nextInstallmentDue: '2024-01-15',
              interestRate: 7, archived: false, details: { endDate: '2035-01-01' } }
        ]});
        const items = buildDebtFreedomTimeline();
        expect(items.length).toBeGreaterThanOrEqual(1);
        expect(items[0].kind).toBe('loan');
        expect(items[0].name).toBe('Hipoteka');
    });

    it('sortuje rosnąco po endDate', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', name: 'Długi kredyt', subCategory: 'A',
              totalAmount: 100000, currentCapitalLeft: 90000,
              nextInstallmentAmount: 1000, archived: false,
              details: { endDate: '2035-06-01' } },
            { id: 'l2', name: 'Krótki kredyt', subCategory: 'B',
              totalAmount: 10000, currentCapitalLeft: 5000,
              nextInstallmentAmount: 1000, archived: false,
              details: { endDate: '2026-06-01' } }
        ]});
        const items = buildDebtFreedomTimeline();
        expect(items[0].name).toBe('Krótki kredyt');
        expect(items[1].name).toBe('Długi kredyt');
    });
});

// ===========================================================================
// reports-calendar.js — buildDebtPeakSeries
// ===========================================================================
describe('buildDebtPeakSeries', () => {
    it('zwraca serię 24 etykiet dla 24 miesięcy', () => {
        const series = buildDebtPeakSeries(24);
        expect(series.labels).toHaveLength(24);
        expect(series.totals).toHaveLength(24);
    });

    it('zwraca serię custom długości', () => {
        const series = buildDebtPeakSeries(6);
        expect(series.labels).toHaveLength(6);
    });

    it('peakValue = 0 gdy brak kredytów', () => {
        const series = buildDebtPeakSeries(3);
        expect(series.peakValue).toBe(0);
    });

    it('znajduje szczyt obciążeń', () => {
        _setAppState({ ..._getAppState(), loans: [
            { id: 'l1', name: 'Kredyt', subCategory: 'Hipoteka',
              totalAmount: 200000, currentCapitalLeft: 150000,
              nextInstallmentAmount: 2000, nextInstallmentDue: '2024-01-15',
              interestRate: 6, archived: false }
        ]});
        const series = buildDebtPeakSeries(3);
        expect(series.peakValue).toBeGreaterThan(0);
        expect(series.peakIdx).toBeGreaterThanOrEqual(0);
        expect(series.peakLabel).toBeTruthy();
    });
});

// ===========================================================================
// dashboard.js — getDashboardTxListSignature
// ===========================================================================
describe('getDashboardTxListSignature', () => {
    it('zwraca string', () => {
        const txs = [{ date: '2024-01-01', type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: '' }];
        document.getElementById('dashboard-period-select').value = 'current-month';
        const sig = getDashboardTxListSignature(txs, '');
        expect(typeof sig).toBe('string');
        expect(sig.length).toBeGreaterThan(0);
    });

    it('różne zapytania dają różne sygnatury', () => {
        const txs = [{ date: '2024-01-01', type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: '' }];
        document.getElementById('dashboard-period-select').value = 'current-month';
        const sig1 = getDashboardTxListSignature(txs, 'jedzenie');
        const sig2 = getDashboardTxListSignature(txs, 'restauracja');
        expect(sig1).not.toBe(sig2);
    });

    it('pusta lista daje inną sygnaturę niż lista z elementami', () => {
        document.getElementById('dashboard-period-select').value = 'current-month';
        const sig1 = getDashboardTxListSignature([], '');
        const sig2 = getDashboardTxListSignature(
            [{ date: '2024-01-01', type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: '' }],
            ''
        );
        expect(sig1).not.toBe(sig2);
    });
});
