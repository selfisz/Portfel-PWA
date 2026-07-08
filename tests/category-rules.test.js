/**
 * Testy jednostkowe dla js/category-rules.js (propozycje reguł)
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };
    globalThis.DEFAULT_CATEGORY_TREE = {
        expense: { Zakupy: ['Zakupy'], 'Jedzenie na mieście': ['Dowóz'] },
        income: { Wynagrodzenie: ['Podstawa'] }
    };
    globalThis.categoryTree = JSON.parse(JSON.stringify(globalThis.DEFAULT_CATEGORY_TREE));
    globalThis.appState = { categoryRules: [], transactions: [] };
    globalThis.saveState = () => {};
    globalThis.isAssistantCategoryPairValid = () => true;
    globalThis.escapeHtml = (s) => String(s ?? '');
    globalThis.document = {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => ({ forEach: () => {} })
    };
    loadScript('js/category-rules.js');
});

beforeEach(() => {
    appState.categoryRules = [];
    appState.transactions = [];
    localStorage.clear();
});

describe('getAllCategoryRuleProposals', () => {
    it('zawiera gotowe szablony gdy brak reguł', () => {
        const proposals = getAllCategoryRuleProposals();
        expect(proposals.some((r) => r.pattern === 'biedronka')).toBe(true);
    });

    it('ukrywa propozycję po dodaniu reguły o tym samym wzorcu', () => {
        addCategoryRule({
            pattern: 'biedronka',
            type: 'expense',
            mainCategory: 'Zakupy',
            subCategory: 'Zakupy'
        });
        const proposals = getAllCategoryRuleProposals();
        expect(proposals.some((r) => r.pattern === 'biedronka')).toBe(false);
    });

    it('przywraca propozycję po usunięciu reguły', () => {
        const added = addCategoryRule({
            pattern: 'lidl',
            type: 'expense',
            mainCategory: 'Zakupy',
            subCategory: 'Zakupy'
        });
        removeCategoryRule(added.id);
        const proposals = getAllCategoryRuleProposals();
        expect(proposals.some((r) => r.pattern === 'lidl')).toBe(true);
    });

    it('nie pokazuje propozycji oznaczonych jako pominięte', () => {
        const before = getAllCategoryRuleProposals();
        const index = before.findIndex((r) => r.pattern === 'netflix');
        const key = getStarterProposalKey(before[index]);
        dismissStarterCategoryRuleAt(index);
        const after = getAllCategoryRuleProposals();
        expect(after.some((r) => getStarterProposalKey(r) === key)).toBe(false);
    });
});

describe('addStarterCategoryRule', () => {
    it('nie dodaje duplikatu wzorca', () => {
        const starter = { pattern: 'żabka', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' };
        expect(addStarterCategoryRule(starter)).toBe(true);
        expect(addStarterCategoryRule(starter)).toBe(false);
        expect(appState.categoryRules).toHaveLength(1);
    });
});

describe('mergeCategoryRulesById', () => {
    it('scala reguły z wielu źródeł bez utraty lokalnych', () => {
        const remote = [{ id: 'r1', pattern: 'netflix', type: 'expense', mainCategory: 'Subskrypcje', subCategory: 'Filmy', priority: 0 }];
        const local = [{ id: 'r2', pattern: 'biedronka', type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy', priority: 0 }];
        const merged = mergeCategoryRulesById(remote, local);
        expect(merged).toHaveLength(2);
        expect(merged.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
    });
});

describe('applyCategoryRulesToTransaction', () => {
    it('nie nadpisuje kategorii gdy notatka jest pusta', () => {
        addCategoryRule({
            pattern: 'zakupy',
            type: 'expense',
            mainCategory: 'Zakupy',
            subCategory: 'Alko'
        });
        const tx = {
            type: 'expense',
            mainCategory: 'Zakupy',
            subCategory: 'Zakupy',
            note: ''
        };
        const ruled = applyCategoryRulesToTransaction(tx);
        expect(ruled.subCategory).toBe('Zakupy');
    });

    it('dopasowuje tylko po notatce, nie po wybranej kategorii', () => {
        addCategoryRule({
            pattern: 'biedronka',
            type: 'expense',
            mainCategory: 'Zakupy',
            subCategory: 'Zakupy'
        });
        const tx = {
            type: 'expense',
            mainCategory: 'Zakupy',
            subCategory: 'Alko',
            note: ''
        };
        expect(applyCategoryRulesToTransaction(tx).subCategory).toBe('Alko');
    });

    it('stosuje regułę gdy wzorzec jest w notatce', () => {
        addCategoryRule({
            pattern: 'biedronka',
            type: 'expense',
            mainCategory: 'Zakupy',
            subCategory: 'Zakupy'
        });
        const tx = {
            type: 'expense',
            mainCategory: 'Dom',
            subCategory: 'Czynsz',
            note: 'Biedronka centrum'
        };
        const ruled = applyCategoryRulesToTransaction(tx);
        expect(ruled.mainCategory).toBe('Zakupy');
        expect(ruled.subCategory).toBe('Zakupy');
    });
});
