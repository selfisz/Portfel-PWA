import { describe, it, expect } from 'vitest';
import { generateDemoAppState } from '../scripts/generate-demo-state.mjs';

describe('generateDemoAppState', () => {
    it('generuje ok. 1000 transakcji', () => {
        const state = generateDemoAppState({ transactionCount: 1000, seed: 1 });
        expect(state.transactions).toHaveLength(1000);
    });

    it('zawiera kredyty, karty, PPK i akcje demo', () => {
        const state = generateDemoAppState({ transactionCount: 200, seed: 2 });
        expect(state.loans.length).toBeGreaterThanOrEqual(2);
        expect(state.creditCards.length).toBeGreaterThanOrEqual(2);
        expect(state.assets.length).toBeGreaterThanOrEqual(6);
        expect(state.loans.every((loan) => String(loan.id).startsWith('loan-demo-'))).toBe(true);
        expect(state.assets.some((asset) => asset.id === 'asset-demo-ppk')).toBe(true);
        expect(state.assets.some((asset) => asset.id === 'asset-demo-stock')).toBe(true);
    });

    it('ma transakcje wydatków i wpływów', () => {
        const state = generateDemoAppState({ transactionCount: 300, seed: 3 });
        const income = state.transactions.filter((t) => t.type === 'income');
        const expense = state.transactions.filter((t) => t.type === 'expense');
        expect(income.length).toBeGreaterThan(10);
        expect(expense.length).toBeGreaterThan(100);
    });
});
