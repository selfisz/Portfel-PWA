import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.appState = {
        transactions: [],
        loans: [{
            id: 'loan-1',
            name: 'Alior',
            subCategory: 'Raty',
            currentCapitalLeft: 10000,
            nextInstallmentAmount: 1200,
            nextInstallmentDue: '2026-06-15',
            interestRate: 7
        }],
        creditCards: [{
            id: 'card-1',
            name: 'mBank',
            limit: 10000,
            currentBalance: 500,
            archived: false
        }],
        creditCardMovements: []
    };
    globalThis.localIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.getActiveLoans = () => globalThis.appState.loans;
    globalThis.getLoanById = (id) => globalThis.appState.loans.find((l) => l.id === id) || null;
    globalThis.getActiveCreditCards = () => globalThis.appState.creditCards.filter((c) => !c.archived);
    globalThis.getLoanDisplayName = (loan) => loan.name || 'Kredyt';
    globalThis.getMonthDateBounds = (date = new Date('2026-06-15')) => ({
        startDate: '2026-06-01',
        endDate: '2026-06-30'
    });
    globalThis.getTransactionsInRange = (start, end) => (
        globalThis.appState.transactions.filter((t) => t.date >= start && t.date <= end)
    );
    globalThis.transactionMatchesLoan = (t, loan) => (
        t.mainCategory === 'Długi' && t.subCategory === loan.subCategory
    );
    globalThis.normalizeCreditCardMovement = (raw) => raw;
    globalThis.getScheduledDebtPaymentsOnDate = (dateStr) => {
        if (dateStr === '2026-06-15') {
            return [{ type: 'loan', id: 'loan-1', name: 'Alior', amount: 1200, estimated: false }];
        }
        return [];
    };
    globalThis.getCardRepaymentHint = (card) => (
        card.currentBalance > 0 ? { day: 20, amount: 400, estimated: true } : null
    );

    globalThis.normalizeLoanDetails = (details) => details || {};
    globalThis.isLegacyTestLoan = () => false;
    globalThis.categoryTree = { expense: { Długi: ['Raty', 'Kredyt hipoteczny'] } };

    globalThis.classifyLoanPaymentAmount = (loan, amount) => {
        const inst = loan.nextInstallmentAmount || 0;
        if (!inst || amount <= inst * 1.05) return { regular: amount, over: 0 };
        return { regular: inst, over: amount - inst };
    };

    loadScript('js/portfolio.js');
    loadScript('js/reports-debt-calculations.js');
    loadScript('js/reports-debt.js');
});

describe('getDebtInstallmentRemainingSummary', () => {
    it('liczy pozostałą kwotę rat w miesiącu', () => {
        appState.transactions = [{
            date: '2026-06-10',
            type: 'expense',
            amount: 1200,
            mainCategory: 'Długi',
            subCategory: 'Raty'
        }];
        const summary = getDebtInstallmentRemainingSummary('2026-06-01', '2026-06-30', { loansOnly: true });
        expect(summary.remaining).toBe(0);
    });

    it('nie odejmuje spłat karty od rat kredytów', () => {
        appState.transactions = [];
        appState.creditCardMovements = [{
            id: 'm1',
            cardId: 'card-1',
            type: 'repayment',
            amount: 10000,
            date: '2026-06-10'
        }];
        const summary = getDebtInstallmentRemainingSummary('2026-06-01', '2026-06-30', { loansOnly: true });
        expect(summary.remaining).toBe(1200);
        expect(getDebtInstallmentRemainingSummary('2026-06-01', '2026-06-30').remaining).toBe(1200);
    });

    it('nadpłata nie zaspokaja raty w bieżącym miesiącu', () => {
        appState.transactions = [{
            date: '2026-06-10',
            type: 'expense',
            amount: 5000,
            mainCategory: 'Długi',
            subCategory: 'Raty',
            note: 'Spłata kapitału',
            loanPaymentKind: 'overpayment'
        }];
        const summary = getDebtInstallmentRemainingSummary('2026-06-01', '2026-06-30', { loansOnly: true });
        expect(summary.remaining).toBe(1200);
        const rows = collectDebtInstallmentRows({ startDate: '2026-06-01', endDate: '2026-06-30' });
        expect(rows.some((row) => row.kind === 'loan' && row.id === 'loan-1')).toBe(true);
    });

    it('duża nadpłata bez loanPaymentKind nie liczy się jako rata', () => {
        appState.transactions = [{
            date: '2026-06-10',
            type: 'expense',
            amount: 5000,
            mainCategory: 'Długi',
            subCategory: 'Raty',
            note: 'Spłata kapitału'
        }];
        const summary = getDebtInstallmentRemainingSummary('2026-06-01', '2026-06-30', { loansOnly: true });
        expect(summary.remaining).toBe(1200);
    });

    it('mBank nadpłata nie chowa raty gdy drugi kredyt ma tę samą podkategorię', () => {
        appState.loans.push({
            id: 'loan-mbank-consolidation',
            name: 'Kredyt mBank (konsolidacja)',
            subCategory: 'Remont',
            currentCapitalLeft: 15000,
            nextInstallmentAmount: 604.60,
            nextInstallmentDue: '2026-06-27',
            interestRate: 7.9
        });
        globalThis.getScheduledDebtPaymentsOnDate = (dateStr) => {
            const items = [];
            if (dateStr === '2026-06-15') {
                items.push({ type: 'loan', id: 'loan-1', name: 'Alior', amount: 1200, estimated: false });
            }
            if (dateStr === '2026-06-27') {
                items.push({ type: 'loan', id: 'loan-mbank-consolidation', name: 'mBank', amount: 604.60, estimated: false });
            }
            return items;
        };
        appState.transactions = [{
            date: '2026-06-10',
            type: 'expense',
            amount: 3000,
            mainCategory: 'Długi',
            subCategory: 'Remont',
            note: 'Spłata kapitału',
            loanPaymentKind: 'overpayment',
            loanId: 'loan-mbank-consolidation'
        }];
        const rows = collectDebtInstallmentRows({ startDate: '2026-06-01', endDate: '2026-06-30' });
        const mbank = rows.find((row) => row.id === 'loan-mbank-consolidation');
        expect(mbank).toBeTruthy();
        expect(mbank.amount).toBe(604.60);
    });
});

describe('collectDebtInstallmentRows', () => {
    it('ukrywa kartę po pełnej spłacie w miesiącu', () => {
        appState.creditCardMovements = [{
            id: 'm1',
            cardId: 'card-1',
            type: 'repayment',
            amount: 400,
            date: '2026-06-05'
        }];
        const rows = collectDebtInstallmentRows({ startDate: '2026-06-01', endDate: '2026-06-30' });
        const cardRow = rows.find((r) => r.kind === 'card');
        expect(cardRow).toBeUndefined();
    });

    it('pokazuje pozostałą kwotę karty po częściowej spłacie', () => {
        appState.creditCardMovements = [{
            id: 'm1',
            cardId: 'card-1',
            type: 'repayment',
            amount: 150,
            date: '2026-06-05'
        }];
        const rows = collectDebtInstallmentRows({ startDate: '2026-06-01', endDate: '2026-06-30' });
        const cardRow = rows.find((r) => r.kind === 'card');
        expect(cardRow?.amount).toBe(250);
    });
});
