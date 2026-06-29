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
        name: 'Hipoteka',
        interestRate: 6.5,
        currentCapitalLeft: 300000,
        archived: false
    }];
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
        expect(scenarios.some((s) => s.id === 'loan')).toBe(true);
        expect(scenarios.some((s) => s.id === 'cushion')).toBe(true);
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
