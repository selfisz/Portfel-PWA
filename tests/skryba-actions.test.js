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
    globalThis.appState = { categoryBudgets: {}, subCategoryBudgets: {}, transactions: [] };
    globalThis.saveState = () => {};
    globalThis.isAssistantCategoryPairValid = () => true;
    globalThis.resolveCategoryFromUserPhrase = (phrase) => ({
        mainCategory: 'Zakupy',
        subCategory: '[Bez podkategorii]'
    });
    globalThis.hasCategoryRulePattern = () => false;
    globalThis.addCategoryRule = (rule) => rule;
    globalThis.openSettings = () => {};
    globalThis.switchView = () => {};
    globalThis.openMonthCloseWizard = () => {};
    globalThis.SAVINGS_GOAL_KEY = 'reports_savings_goal_pct';

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

    it('parsuje ustawienie limitu budżetu', () => {
        const action = tryParseLocalSkrybaAction('ustaw limit zakupy 800');
        expect(action?.tool).toBe('set_budget');
        expect(action?.params.limitPln).toBe(800);
        expect(action?.params.mainCategory).toBe('Zakupy');
    });

    it('parsuje nawigację do raportów', () => {
        const action = tryParseLocalSkrybaAction('otwórz raporty');
        expect(action?.tool).toBe('navigate');
        expect(action?.params.target).toBe('reports');
    });

    it('parsuje regułę kategoryzacji', () => {
        const action = tryParseLocalSkrybaAction('reguła biedronka → zakupy');
        expect(action?.tool).toBe('add_category_rule');
        expect(action?.params.pattern).toBe('biedronka');
    });

    it('parsuje cel oszczędności', () => {
        const action = tryParseLocalSkrybaAction('cel oszczędności 25%');
        expect(action?.tool).toBe('set_savings_goal');
        expect(action?.params.goalPct).toBe(25);
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

    it('rozwiązuje kredyt po loanId', () => {
        const preview = buildSkrybaActionPreview('pay_installment', { loanId: 'loan-alior' });
        expect(preview.ok).toBe(true);
        expect(preview.resolvedParams.loanId).toBe('loan-alior');
    });

    it('buduje podgląd ustawienia limitu', () => {
        const preview = buildSkrybaActionPreview('set_budget', {
            mainCategory: 'Zakupy',
            subCategory: '[Bez podkategorii]',
            limitPln: 800
        });
        expect(preview.ok).toBe(true);
        expect(preview.summary).toContain('800');
    });
});
