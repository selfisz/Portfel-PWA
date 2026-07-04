import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((key) => delete store[key]); }
    };
    globalThis.document = {
        getElementById: () => ({ classList: { add: () => {}, remove: () => {}, toggle: () => {} }, replaceChildren: () => {} }),
        querySelector: () => null,
        querySelectorAll: () => ({ forEach: () => {} })
    };
    globalThis.formatPlnAmount = (n) => `${n} zł`;
    globalThis.formatTxDate = (d) => d;
    globalThis.escapeHtml = (s) => s;
    globalThis.formatTransactionCategoryLabel = (t) => t.mainCategory;
    globalThis.localIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    globalThis.saveState = () => {};
    globalThis.summarizePeriod = () => ({ income: 0, expense: 10, balance: -10, savings: 0 });
    loadScript('js/transaction-duplicates.js');
    loadScript('js/month-close.js');
});

describe('transaction duplicates', () => {
    beforeEach(() => {
        globalThis.appState = {
            transactions: [
                { date: '2025-06-10', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: 'Biedronka' },
                { date: '2025-06-10', type: 'expense', amount: 50, mainCategory: 'Jedzenie na mieście', subCategory: 'Restauracje', note: '' },
                { date: '2025-06-11', type: 'income', amount: 5000, mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa', note: '' }
            ]
        };
    });

    it('finds duplicate only when date amount and category match', () => {
        const tx = { date: '2025-06-10', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: '' };
        expect(findDuplicateCandidates(tx)).toHaveLength(1);
    });

    it('ignores same date and amount with different category', () => {
        const tx = { date: '2025-06-10', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Inne', note: '' };
        expect(findDuplicateCandidates(tx)).toHaveLength(0);
    });

    it('finds duplicate pairs in range only for full match', () => {
        globalThis.appState.transactions.push({
            date: '2025-06-10', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: ''
        });
        const pairs = findDuplicatePairsInRange('2025-06-01', '2025-06-30');
        expect(pairs.length).toBe(1);
    });

    it('does not match different amounts', () => {
        const tx = { date: '2025-06-10', type: 'expense', amount: 99, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: '' };
        expect(findDuplicateCandidates(tx)).toHaveLength(0);
    });
});

describe('month close state', () => {
    beforeEach(() => {
        localStorage.clear();
        globalThis.appState = {
            transactions: [
                { date: '2025-05-12', type: 'expense', amount: 10, mainCategory: 'Zakupy', subCategory: 'Zakupy' }
            ]
        };
    });

    it('tracks closed months', () => {
        markMonthClosed('2025-05');
        expect(isMonthClosed('2025-05')).toBe(true);
        expect(isMonthClosed('2025-06')).toBe(false);
    });

    it('lists unclosed months with data', () => {
        const unclosed = getUnclosedMonthsWithData();
        expect(unclosed).toContain('2025-05');
    });

    it('limits dashboard banners to three newest unclosed in window', () => {
        globalThis.appState.transactions = [
            { date: '2024-01-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2024-02-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2024-03-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2024-04-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2024-05-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' }
        ];
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 4, 31));
        expect(getMonthCloseBannerMonths()).toEqual(['2024-03', '2024-04', '2024-05']);
        expect(isMonthAutoClosed('2024-01')).toBe(true);
        expect(isMonthAutoClosed('2024-02')).toBe(true);
        vi.useRealTimers();
    });

    it('po zamknięciu lipca nie wskakuje starszy kwiecień — tylko maj i czerwiec', () => {
        globalThis.appState.transactions = [
            { date: '2025-04-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2025-05-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2025-06-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2025-07-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' }
        ];
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2025, 6, 31));
        getMonthCloseBannerMonths();
        expect(isMonthAutoClosed('2025-04')).toBe(true);
        expect(getMonthCloseBannerMonths()).toEqual(['2025-05', '2025-06', '2025-07']);
        markMonthClosed('2025-07');
        expect(getMonthCloseBannerMonths()).toEqual(['2025-05', '2025-06']);
        vi.useRealTimers();
    });

    it('auto-zamyka miesiące starsze niż okno 3 ostatnich', () => {
        globalThis.appState.transactions = [
            { date: '2025-01-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
            { date: '2025-07-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' }
        ];
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2025, 7, 15));
        autoCloseStaleMonths();
        expect(isMonthAutoClosed('2025-01')).toBe(true);
        expect(isMonthClosed('2025-07')).toBe(false);
        vi.useRealTimers();
    });

    it('lists closed months for settings reopen', () => {
        markMonthClosed('2025-05');
        globalThis.appState.transactions.push(
            { date: '2025-06-10', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' }
        );
        markMonthClosed('2025-06');
        expect(getClosedMonthsWithData()).toEqual(['2025-06', '2025-05']);
        reopenMonthClose('2025-06');
        expect(getClosedMonthsWithData()).toEqual(['2025-05']);
    });

    it('blocks month close until the last day of the month', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2025, 5, 29));
        expect(isMonthCloseAvailable('2025-06')).toBe(false);
        vi.setSystemTime(new Date(2025, 5, 30));
        expect(isMonthCloseAvailable('2025-06')).toBe(true);
        expect(isMonthCloseAvailable('2025-05')).toBe(true);
        vi.useRealTimers();
    });
});
