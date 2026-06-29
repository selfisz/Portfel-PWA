/**
 * Testy helpers dat w reports-day-month-summary.js
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
    loadScript('js/constants.js');
    loadScript('js/portfolio.js');
    loadScript('js/format.js');
    loadScript('js/reports-day-month-summary.js');
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
