import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.appState = { loans: [], creditCards: [], transactions: [] };
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.parsePlnInput = (raw) => parseFloat(String(raw).replace(',', '.'));
    globalThis.localIsoDate = (d) => d.toISOString().slice(0, 10);
    globalThis.getLoanDisplayName = (loan) => loan.name || 'Kredyt';
    globalThis.getActiveLoans = () => [{
        id: 'loan-alior',
        name: 'Alior Rata',
        currentCapitalLeft: 10000,
        nextInstallmentAmount: 1200,
        nextInstallmentDue: '2025-07-01'
    }];
    globalThis.getActiveCreditCards = () => [{
        id: 'card-1',
        name: 'mBank',
        currentBalance: 3000,
        limit: 10000
    }];
    globalThis.getCreditCardAvailable = (c) => (c.limit || 0) - (c.currentBalance || 0);
    globalThis.getLoanById = (id) => globalThis.getActiveLoans().find((l) => l.id === id) || null;
    globalThis.getCreditCardById = (id) => globalThis.getActiveCreditCards().find((c) => c.id === id) || null;

    loadScript('js/search-utils.js');
    loadScript('js/skryba-entities.js');
    loadScript('js/skryba-actions.js');
});

describe('tryParseLocalSkrybaAction', () => {
    it('parsuje spłatę raty alior', () => {
        const action = tryParseLocalSkrybaAction('splac rate alior');
        expect(action?.tool).toBe('pay_installment');
        expect(action?.params.loanQuery).toBe('alior');
    });

    it('parsuje spłatę karty z kwotą', () => {
        const action = tryParseLocalSkrybaAction('spłać kartę 500 zł');
        expect(action?.tool).toBe('repay_card');
        expect(action?.params.amount).toBe(500);
    });
});

describe('buildSkrybaActionPreview', () => {
    it('buduje podgląd raty kredytu', () => {
        const preview = buildSkrybaActionPreview('pay_installment', { loanQuery: 'alior' });
        expect(preview.ok).toBe(true);
        expect(preview.summary).toContain('1200');
    });

    it('buduje podgląd spłaty karty', () => {
        const preview = buildSkrybaActionPreview('repay_card', { cardQuery: 'mbank', amount: 500 });
        expect(preview.ok).toBe(true);
        expect(preview.summary).toContain('500');
        expect(preview.summary).toContain('2500');
    });
});
