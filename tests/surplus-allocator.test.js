import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
    globalThis.document = { getElementById: () => null, addEventListener: () => {} };
    globalThis.window = { addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    globalThis.localIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.escapeHtml = (t) => String(t ?? '');
    globalThis.getPrimaryCashAsset = () => ({ amount: 10000, type: 'cash' });
    globalThis.getActiveAssets = () => [{ amount: 10000, type: 'cash' }];
    globalThis.summarizePeriod = (tx) => tx.reduce((acc, t) => {
        if (t.type === 'income') acc.income += t.amount;
        else acc.expense += t.amount;
        return acc;
    }, { income: 0, expense: 0 });

    loadScript('js/constants.js');
    loadScript('js/portfolio.js');
    loadScript('js/reports-phase3.js');
    loadScript('js/surplus-allocator.js');

    globalThis.getActiveLoans = () => [{
        id: 'loan-1',
        name: 'Kredyt hipoteczny',
        subCategory: 'Kredyt hipoteczny',
        interestRate: 6.5,
        currentCapitalLeft: 300000,
        nextInstallmentAmount: 2500,
        archived: false,
        details: { remainingInstallments: 240 }
    }];
    globalThis.isMortgageLoan = () => true;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.formatMonthsDuration = (m) => `${m} mies.`;
    globalThis.calculateOverpaymentScenarios = (loan, { lumpSum = 0 } = {}) => ({
        params: { balance: loan.currentCapitalLeft, payment: 2500, annualRate: 6.5, termMonths: 240 },
        baseline: { months: 220, totalInterest: 120000, payoffDate: '2046-01-01' },
        shorten: { months: 200, totalInterest: 100000, payoffDate: '2044-06-01' },
        lower: { months: 220, totalInterest: 110000, monthlyPayment: 2300, savedPerMonth: 200, payoffDate: '2046-01-01' },
        savedMonthsShorten: 20,
        savedInterestShorten: 20000,
        savedInterestLower: 10000
    });
    globalThis.getPrimaryCashAsset = () => ({ amount: 10000, type: 'cash' });
    globalThis.getActiveAssets = () => [{ amount: 10000, type: 'cash' }];

    runInContext(`
        function getIkzeAnnualLimitPln() { return 11304; }
        function getIkzeContributionsInYear() { return 304; }
        appState = { transactions: [], loans: [], creditCards: [], assets: [], cashMovements: [] };
    `);
});

describe('surplus-allocator', () => {
    it('liczy scenariusze dla nadwyżki', () => {
        const scenarios = buildSurplusScenarios(1000, {
            periodTx: [
                { type: 'income', amount: 8000, date: '2026-06-01' },
                { type: 'expense', amount: 5000, date: '2026-06-02' }
            ],
            mode: 'month',
            period: '2026-06'
        });
        const ikze = scenarios.find((s) => s.id === 'ikze');
        expect(ikze).toBeTruthy();
        expect(ikze.headline).not.toBe('Limit wykorzystany');
        expect(ikze.amount).toBe(1000);
        expect(ikze.taxRefund).toBe(320);
        expect(ikze.detail).toContain('32%');
        const loan = scenarios.find((s) => String(s.id).startsWith('loan-'));
        expect(loan).toBeTruthy();
        expect(loan.title).toContain('hipoteczn');
        expect(loan.overpayHtml).toContain('Skróć okres');
        expect(loan.overpayHtml).toContain('Obniż ratę');
        expect(scenarios.some((s) => s.id === 'cushion')).toBe(true);
    });

    it('pokazuje nadpłatę dla każdego kredytu z oprocentowaniem', () => {
        globalThis.getActiveLoans = () => ([
            {
                id: 'loan-1',
                name: 'Kredyt hipoteczny',
                subCategory: 'Kredyt hipoteczny',
                interestRate: 6.5,
                currentCapitalLeft: 300000,
                nextInstallmentAmount: 2500,
                archived: false,
                details: { remainingInstallments: 240 }
            },
            {
                id: 'loan-2',
                name: 'Alior',
                subCategory: 'Raty',
                interestRate: 9.2,
                currentCapitalLeft: 20000,
                nextInstallmentAmount: 800,
                archived: false
            }
        ]);
        globalThis.getLoanDisplayName = (loan) => loan.name;
        const scenarios = buildSurplusScenarios(1000, { periodTx: [], mode: 'month', period: '2026-06' });
        const loanScenarios = scenarios.filter((s) => String(s.id).startsWith('loan-'));
        expect(loanScenarios).toHaveLength(2);
        expect(loanScenarios[0].title).toContain('Alior');
        globalThis.getActiveLoans = () => [{
            id: 'loan-1',
            name: 'Kredyt hipoteczny',
            subCategory: 'Kredyt hipoteczny',
            interestRate: 6.5,
            currentCapitalLeft: 300000,
            nextInstallmentAmount: 2500,
            archived: false,
            details: { remainingInstallments: 240 }
        }];
    });

    it('ukrywa nadpłatę bez kredytów z oprocentowaniem', () => {
        globalThis.getActiveLoans = () => [{
            id: 'loan-1',
            name: 'Kredyt 0%',
            interestRate: 0,
            currentCapitalLeft: 10000,
            archived: false
        }];
        const scenarios = buildSurplusScenarios(1000, { periodTx: [], mode: 'month', period: '2026-06' });
        expect(scenarios.some((s) => String(s.id).startsWith('loan-'))).toBe(false);
        globalThis.getActiveLoans = () => [{
            id: 'loan-1',
            name: 'Kredyt hipoteczny',
            subCategory: 'Kredyt hipoteczny',
            interestRate: 6.5,
            currentCapitalLeft: 300000,
            nextInstallmentAmount: 2500,
            archived: false,
            details: { remainingInstallments: 240 }
        }];
    });

    it('IKZE przy zerowej kwocie nie pokazuje wykorzystanego limitu', () => {
        const scenarios = buildSurplusScenarios(0, { periodTx: [], mode: 'month', period: '2026-06' });
        const ikze = scenarios.find((s) => s.id === 'ikze');
        expect(ikze.headline).not.toBe('Limit wykorzystany');
        expect(ikze.detail).toContain('wolne');
    });

    it('estimatePeriodMonthlySurplus dla roku dzieli przez 12', () => {
        const result = estimatePeriodMonthlySurplus({
            periodTx: [
                { type: 'income', amount: 120000, date: '2026-01-01' },
                { type: 'expense', amount: 96000, date: '2026-02-01' }
            ],
            mode: 'year',
            period: '2026'
        });
        expect(result.surplus).toBe(2000);
    });
});
