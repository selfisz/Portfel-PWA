/**
 * Testy helpers dat w reports-day-month-summary.js
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };
    globalThis.document = {
        getElementById: () => null,
        querySelector: () => null,
        addEventListener: () => {}
    };
    globalThis.summarizePeriod = (tx) => {
        const income = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return { income, expense, balance: income - expense, savings: 0 };
    };

    loadScript('js/constants.js');
    loadScript('js/portfolio.js');
    loadScript('js/format.js');
    loadScript('js/state-limits.js');
    loadScript('js/reports-core.js');
    loadScript('js/reports-day-month-summary.js');

    runInContext(`
        function _getAppState()  { return appState; }
        function _setAppState(s) { appState = s; }
    `);
});

beforeEach(() => {
    _setAppState({ transactions: [] });
    localStorage.removeItem('finanse_archived_transactions');
});

describe('reports day/month date helpers', () => {
    it('getSameDayPreviousMonthIso zachowuje dzień lub ostatni dzień miesiąca', () => {
        expect(getSameDayPreviousMonthIso('2024-03-31')).toBe('2024-02-29');
        expect(getSameDayPreviousMonthIso('2024-05-15')).toBe('2024-04-15');
    });

    it('getMtdBounds zwraca zakres od 1. do dziś', () => {
        const ref = new Date(2024, 5, 15);
        const bounds = getMtdBounds(ref);
        expect(bounds.start).toBe('2024-06-01');
        expect(bounds.end).toBe('2024-06-15');
    });

    it('getPreviousMtdBounds zwraca ten sam dzień w poprzednim miesiącu', () => {
        const ref = new Date(2024, 5, 15);
        const bounds = getPreviousMtdBounds(ref);
        expect(bounds.start).toBe('2024-05-01');
        expect(bounds.end).toBe('2024-05-15');
    });

    it('getDayCompareDate domyślnie zwraca wczoraj', () => {
        expect(getDayCompareDate('2024-06-15', 'yesterday')).toBe('2024-06-14');
    });

    it('formatSummaryDeltaPct liczy zmianę procentową', () => {
        expect(formatSummaryDeltaPct(120, 100)).toBe('+20%');
        expect(formatSummaryDeltaPct(80, 100)).toBe('-20%');
        expect(formatSummaryDeltaPct(50, 0)).toBe('+100%');
    });
});

describe('buildDaySummaryData', () => {
    it('liczy transakcje z dzisiejszej daty, także ze zarchiwizowanych', () => {
        const ref = new Date(2026, 5, 29);
        _setAppState({
            transactions: [
                { date: '2026-06-29', type: 'expense', amount: 100, mainCategory: 'Dom', subCategory: 'Jedzenie' }
            ]
        });
        localStorage.setItem('finanse_archived_transactions', JSON.stringify([
            { date: '2026-06-29', type: 'income', amount: 5000, mainCategory: 'Praca', subCategory: 'Pensja' }
        ]));

        const data = buildDaySummaryData(ref);
        expect(data.daySummary.income).toBe(5000);
        expect(data.daySummary.expense).toBe(100);
        expect(data.daySummary.balance).toBe(4900);
        expect(data.dayTx).toHaveLength(2);
    });
});
