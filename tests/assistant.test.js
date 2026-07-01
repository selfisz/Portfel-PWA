import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
    globalThis.localStorage = {
        _data: {},
        getItem(k) { return this._data[k] ?? null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; },
        clear() { this._data = {}; }
    };
    globalThis.document = {
        getElementById: () => null,
        createElement: () => ({
            className: '', innerHTML: '', textContent: '',
            classList: { add: () => {}, remove: () => {}, toggle: () => {} },
            appendChild: () => {}, setAttribute: () => {},
            onclick: null
        })
    };
    globalThis.appState = { transactions: [] };
    globalThis.categoryTree = {
        expense: { Samochód: ['Paliwo', 'Ubezpieczenie'] },
        income: { Inne: [] }
    };
    globalThis.DEFAULT_CATEGORY_TREE = globalThis.categoryTree;
    globalThis.getMergedTransactions = () => globalThis.appState.transactions;
    globalThis.localIsoDate = (d) => d.toISOString().slice(0, 10);
  globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
  globalThis.parsePlnInput = (raw) => parseFloat(String(raw).replace(',', '.'));
  globalThis.localIsoDate = (d) => d.toISOString().slice(0, 10);

  loadScript('js/constants.js');
    loadScript('js/search-utils.js');
    loadScript('js/assistant.js');

    runInContext(`
        function _setSkrybaSearchResults(items) { skrybaLastSearchResults = items; }
        function _getSkrybaSearchResults() { return skrybaLastSearchResults; }
        function _setTransactions(txs) { appState.transactions = txs; }
    `);
});

beforeEach(() => {
    _setTransactions([]);
    _setSkrybaSearchResults([]);
});

describe('fuzzyTextMatchesQuery', () => {
    it('dopasowuje dokładny fragment', () => {
        expect(fuzzyTextMatchesQuery('Ubezpieczenie OC', 'ubezpieczenie')).toBe(true);
    });

    it('radzi sobie z literówką w słowie', () => {
        expect(fuzzyTextMatchesQuery('Ubezpieczenie OC', 'ubezpiecznie')).toBe(true);
    });

    it('nie dopasowuje zupełnie innego słowa', () => {
        expect(fuzzyTextMatchesQuery('Paliwo Orlen', 'ubrania')).toBe(false);
    });
});

describe('runAssistantSearch', () => {
    it('znajduje transakcję po literówce w notatce', () => {
        _setTransactions([{
            date: '2026-01-10',
            type: 'expense',
            amount: 1200,
            mainCategory: 'Samochód',
            subCategory: 'Ubezpieczenie',
            note: 'Polisa OC/AC'
        }]);
        const items = runAssistantSearch({ query: 'ubezpiecznie', type: 'expense' });
        expect(items).toHaveLength(1);
        expect(items[0].subCategory).toBe('Ubezpieczenie');
    });

    it('nie zawęża wyników przy błędnym filtrze kategorii z AI', () => {
        _setTransactions([{
            date: '2026-02-01',
            type: 'expense',
            amount: 50,
            mainCategory: 'Zakupy',
            subCategory: '[Bez podkategorii]',
            note: 'Biedronka'
        }]);
        const items = runAssistantSearch({
            query: 'biedronka',
            mainCategory: 'ZłyFiltr',
            type: 'expense'
        });
        expect(items).toHaveLength(1);
    });
});

describe('formatAssistantSummarize', () => {
    it('sumuje wydatki z ostatniego wyszukiwania', () => {
        const items = [
            { type: 'expense', amount: 10 },
            { type: 'expense', amount: 25.5 }
        ];
        const text = formatAssistantSummarize(items, 'sum');
        expect(text).toContain('35.50 zł');
        expect(text).toContain('2 transakcji');
    });

    it('zwraca komunikat gdy brak wyników', () => {
        expect(formatAssistantSummarize([], 'sum')).toContain('Najpierw wyszukaj');
    });
});

describe('isAssistantSummarizeCommand', () => {
    it('rozpoznaje krótkie pytanie o sumę', () => {
        expect(isAssistantSummarizeCommand('Suma?')).toBe(true);
        expect(isAssistantSummarizeCommand('ile łącznie')).toBe(true);
        expect(isAssistantSummarizeCommand('pokaż ubezpieczenie')).toBe(false);
    });
});

describe('tryParseLocalAddTransaction', () => {
    it('parsuje prosty wydatek', () => {
        const parsed = tryParseLocalAddTransaction('20 zł biedronka');
        expect(parsed?.intent).toBe('add_transaction');
        expect(parsed?.transaction?.amount).toBe(20);
        expect(parsed?.transaction?.mainCategory).toBe('Zakupy');
    });
});
