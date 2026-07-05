import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

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
        querySelector: () => null,
        createElement: () => ({
            className: '', innerHTML: '', textContent: '',
            classList: { add: () => {}, remove: () => {}, toggle: () => {} },
            appendChild: () => {}, setAttribute: () => {}, dataset: {}
        })
    };
    globalThis.categoryTree = {
        expense: {
            Zakupy: ['Biedronka', '[Bez podkategorii]'],
            Kosmetyki: ['Higiena', 'Pielęgnacja'],
            Różne: ['[Bez podkategorii]'],
            Praca: ['[Bez podkategorii]']
        },
        income: { Inne: ['[Bez podkategorii]'], Wynagrodzenie: ['Podstawa', 'Prowizja'] }
    };
    globalThis.DEFAULT_CATEGORY_TREE = globalThis.categoryTree;
    globalThis.localIsoDate = (d) => d.toISOString().slice(0, 10);
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.parsePlnInput = (raw) => parseFloat(String(raw).replace(',', '.'));
    globalThis.escapeHtml = (t) => String(t ?? '');
    globalThis.normalizeTransaction = (tx) => ({ ...tx, id: 'tx-1' });
    globalThis.commitTransactionData = () => ({ ok: true, tx: {} });

    loadScript('js/constants.js');
    loadScript('js/search-utils.js');
    loadScript('js/skryba-style.js');
    loadScript('js/skryba-prompts.js');
    loadScript('js/skryba-chat-ui.js');
    loadScript('js/skryba-threads.js');
    loadScript('js/skryba-router.js');
    loadScript('js/assistant.js');
    loadScript('js/skryba-local-parser.js');
});

describe('validateAssistantCategories', () => {
    it('nie traktuje nazwy innej kategorii głównej jako podkategorii', () => {
        const cats = validateAssistantCategories('expense', 'Różne', 'Praca');
        expect(cats.mainCategory).toBe('Różne');
        expect(cats.subCategory).toBe('[Bez podkategorii]');
    });

    it('przenosi podkategorię do właściwej kategorii głównej', () => {
        const cats = validateAssistantCategories('expense', 'Różne', 'Higiena');
        expect(cats.mainCategory).toBe('Kosmetyki');
        expect(cats.subCategory).toBe('Higiena');
    });

    it('dopasowuje dokładną podkategorię', () => {
        const cats = validateAssistantCategories('expense', 'Kosmetyki', 'Higiena');
        expect(cats.mainCategory).toBe('Kosmetyki');
        expect(cats.subCategory).toBe('Higiena');
    });
});

describe('resolveCategoryFromUserPhrase', () => {
    it('rozpoznaje frazę użytkownika z podkategorią', () => {
        const cats = resolveCategoryFromUserPhrase('Kosmetyki > Higiena', 'expense');
        expect(cats?.mainCategory).toBe('Kosmetyki');
        expect(cats?.subCategory).toBe('Higiena');
    });
});

describe('tryApplyLocalPendingCorrection', () => {
    it('aktualizuje kategorię w oczekującej transakcji', () => {
        const pending = {
            transaction: {
                amount: 25,
                type: 'expense',
                mainCategory: 'Różne',
                subCategory: '[Bez podkategorii]',
                date: '2026-07-02',
                note: 'żel'
            }
        };
        const result = tryApplyLocalPendingCorrection('zmień kategorię na Kosmetyki Higiena', pending);
        expect(result?.action).toBe('update');
        expect(result.transaction.mainCategory).toBe('Kosmetyki');
        expect(result.transaction.subCategory).toBe('Higiena');
    });

    it('aktualizuje kwotę', () => {
        const pending = {
            transaction: {
                amount: 25,
                type: 'expense',
                mainCategory: 'Różne',
                subCategory: '[Bez podkategorii]',
                date: '2026-07-02',
                note: 'żel'
            }
        };
        const result = tryApplyLocalPendingCorrection('kwota 50', pending);
        expect(result?.action).toBe('update');
        expect(result.transaction.amount).toBe(50);
    });

    it('zmienia wydatek na wpływ po „jako wpływ”', () => {
        const pending = {
            transaction: {
                amount: 42672,
                type: 'expense',
                mainCategory: 'Różne',
                subCategory: 'Praca',
                date: '2026-07-05',
                note: 'Prowizja'
            }
        };
        const result = tryApplyLocalPendingCorrection('Jako wpływ', pending);
        expect(result?.action).toBe('update');
        expect(result.transaction.type).toBe('income');
        expect(result.transaction.mainCategory).toBe('Wynagrodzenie');
        expect(result.transaction.subCategory).toBe('Prowizja');
    });

    it('zmienia typ po „dodaj to jako wpływ do prowizji”', () => {
        const pending = {
            transaction: {
                amount: 42672,
                type: 'expense',
                mainCategory: 'Różne',
                subCategory: 'Praca',
                date: '2026-07-05',
                note: 'Prowizja'
            }
        };
        const result = tryApplyLocalPendingCorrection('Dodaj to jako wpływ do prowizji', pending);
        expect(result?.action).toBe('update');
        expect(result.transaction.type).toBe('income');
    });
});

describe('formatSkrybaHistoryEntryContent', () => {
    it('dołącza pending JSON do historii dla modelu', () => {
        const content = formatSkrybaHistoryEntryContent({
            role: 'assistant',
            text: 'Proponuję',
            meta: { pending: { transaction: { amount: 20, type: 'expense' } } }
        });
        expect(content).toContain('[[PENDING_TX]]:');
        expect(content).toContain('"amount":20');
    });
});

describe('tryParseLocalAddTransaction', () => {
    beforeAll(() => {
        globalThis.resolveAssistantCategories = (type, main, sub) => ({ mainCategory: main, subCategory: sub });
        globalThis.isSkrybaReadOnlyQuery = () => false;
        globalThis.isLikelySkrybaYearAmount = () => false;
    });

    it('rozpoznaje prowizję jako wpływ', () => {
        const parsed = tryParseLocalAddTransaction('Prowizja 42672');
        expect(parsed?.transaction?.type).toBe('income');
        expect(parsed?.transaction?.mainCategory).toBe('Wynagrodzenie');
        expect(parsed?.transaction?.subCategory).toBe('Prowizja');
        expect(parsed?.transaction?.amount).toBe(42672);
    });
});
