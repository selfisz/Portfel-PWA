import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.appState = {
        transactions: [
            { date: '2025-05-03', type: 'expense', amount: 250, mainCategory: 'Samochód', subCategory: 'Paliwo', note: 'Orlen' },
            { date: '2025-05-18', type: 'expense', amount: 180, mainCategory: 'Samochód', subCategory: 'Paliwo', note: 'BP' },
            { date: '2025-06-01', type: 'expense', amount: 90, mainCategory: 'Samochód', subCategory: 'Paliwo', note: 'Orlen' }
        ],
        loans: [],
        creditCards: []
    };
    globalThis.getMergedTransactions = () => globalThis.appState.transactions;
    globalThis.localIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.getPortfolioValuePln = () => 100000;
    globalThis.getLoanCapitalLeft = () => 20000;
    globalThis.getCreditCardDebtTotal = () => 5000;
    globalThis.getLoanSummaryTotal = () => 25000;
    globalThis.getOperationalCashPln = () => 8000;
    globalThis.calcNetWorthPln = () => 80000;
    globalThis.getActiveLoans = () => [];
    globalThis.getActiveCreditCards = () => [];

    loadScript('js/search-utils.js');
    loadScript('js/skryba-dates.js');
    loadScript('js/skryba-entities.js');
    loadScript('js/skryba-tools.js');
});

describe('parseSkrybaPeriodFromText', () => {
    it('rozpoznaje „w maju”', () => {
        const period = parseSkrybaPeriodFromText('Ile wydałem na paliwo w maju?', new Date('2025-06-15'));
        expect(period?.startDate).toBe('2025-05-01');
        expect(period?.endDate).toBe('2025-05-31');
    });
});

describe('skrybaToolFilterTransactions', () => {
    it('sumuje paliwo w maju', () => {
        const result = skrybaToolFilterTransactions({
            startDate: '2025-05-01',
            endDate: '2025-05-31',
            mainCategory: 'Samochód',
            subCategory: 'Paliwo',
            type: 'expense'
        });
        expect(result.count).toBe(2);
        expect(result.sumExpensesPln).toBe(430);
    });
});

describe('detectSkrybaToolsFromText', () => {
    it('wykrywa zapytanie o majątek', () => {
        const d = detectSkrybaToolsFromText('Jaki jest mój majątek?');
        expect(d.tools).toContain('snapshot_wealth');
    });

    it('wykrywa filtr transakcji dla paliwa w maju', () => {
        const year = new Date().getFullYear();
        const d = detectSkrybaToolsFromText('Ile wydałem na paliwo w maju?');
        expect(d.tools).toContain('filter_transactions');
        expect(d.toolParams.filter_transactions.startDate).toBe(`${year}-05-01`);
        expect(d.toolParams.filter_transactions.mainCategory).toBe('Samochód');
    });
});

describe('formatSkrybaOfflineReply', () => {
    it('formatuje majątek bez API', () => {
        const text = formatSkrybaOfflineReply(['snapshot_wealth'], {});
        expect(text).toContain('100');
        expect(text).toContain('80');
    });
});
