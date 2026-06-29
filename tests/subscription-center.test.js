import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };
    globalThis.document = { getElementById: () => null, addEventListener: () => {} };
    globalThis.window = { addEventListener: () => {}, matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.escapeHtml = (t) => String(t ?? '');
    globalThis.renderCategoryIcon = () => '';
    globalThis.localIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    loadScript('js/constants.js');
    loadScript('js/portfolio.js');
    loadScript('js/reports-phase3.js');
    loadScript('js/subscription-center.js');

    runInContext(`
        appState = { transactions: [], loans: [], creditCards: [], assets: [], cashMovements: [] };
        function getExpenseGroupKey(t, rankLevel) {
            const sub = t.subCategory === '[Bez podkategorii]' ? '' : t.subCategory;
            return rankLevel === 'sub' ? t.mainCategory + '|' + sub : t.mainCategory;
        }
    `);
});

describe('subscription-center', () => {
    beforeEach(() => {
        localStorage.clear();
        subscriptionExpandedId = null;
        subscriptionDismissedExpanded = false;
    });
    it('wykrywa subskrypcje z kategorii Subskrypcje', () => {
        runInContext(`
            appState.transactions = [
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-04-01' },
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-05-01' },
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-06-01' }
            ];
        `);
        const entries = buildSubscriptionCatalog();
        expect(entries.length).toBeGreaterThan(0);
        expect(entries[0].label.toLowerCase()).toContain('netflix');
    });

    it('dismiss ukrywa pozycję', () => {
        runInContext(`
            appState.transactions = [
                { type: 'expense', amount: 30, mainCategory: 'Subskrypcje', subCategory: 'Spotify', date: '2026-04-01' },
                { type: 'expense', amount: 30, mainCategory: 'Subskrypcje', subCategory: 'Spotify', date: '2026-05-01' },
                { type: 'expense', amount: 30, mainCategory: 'Subskrypcje', subCategory: 'Spotify', date: '2026-06-01' }
            ];
        `);
        const entries = buildSubscriptionCatalog();
        expect(entries.length).toBe(1);
        dismissSubscription(entries[0].id);
        expect(buildSubscriptionCatalog()).toHaveLength(0);
        expect(buildDismissedSubscriptionCatalog()).toHaveLength(1);
    });

    it('restore przywraca pominiętą pozycję', () => {
        runInContext(`
            appState.transactions = [
                { type: 'expense', amount: 30, mainCategory: 'Subskrypcje', subCategory: 'Spotify', date: '2026-04-01' },
                { type: 'expense', amount: 30, mainCategory: 'Subskrypcje', subCategory: 'Spotify', date: '2026-05-01' },
                { type: 'expense', amount: 30, mainCategory: 'Subskrypcje', subCategory: 'Spotify', date: '2026-06-01' }
            ];
        `);
        const id = buildSubscriptionCatalog()[0].id;
        dismissSubscription(id);
        restoreSubscription(id);
        expect(buildSubscriptionCatalog()).toHaveLength(1);
        expect(buildDismissedSubscriptionCatalog()).toHaveLength(0);
    });

    it('render pokazuje transakcje po rozwinięciu', () => {
        let html = '';
        const card = { dataset: {}, addEventListener: () => {} };
        globalThis.document = {
            getElementById: (id) => {
                if (id === 'reports-subscription-card') return card;
                if (id === 'reports-subscription-center') {
                    return {
                        get innerHTML() { return html; },
                        set innerHTML(v) { html = v; }
                    };
                }
                if (id === 'reports-subscription-summary') {
                    return { textContent: '' };
                }
                if (id === 'reports-subscription-picker') {
                    return { classList: { add: () => {}, remove: () => {} }, innerHTML: '' };
                }
                return null;
            },
            addEventListener: () => {}
        };
        globalThis.renderReportsTxListHtml = (txs) => txs.map((t) => `<tx>${t.date}</tx>`).join('');
        runInContext(`
            appState.transactions = [
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-04-01' },
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-05-01' },
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-06-01' }
            ];
        `);
        const id = buildSubscriptionCatalog()[0].id;
        toggleSubscriptionTransactions(id);
        renderSubscriptionCenter();
        expect(html).toContain('subscription-tx-panel');
        expect(html).toContain('<tx>2026-06-01</tx>');
        expect(html).toContain('Ukryj transakcje');
    });

    it('customLabels zmienia wyświetlaną nazwę', () => {
        runInContext(`
            appState.transactions = [
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-04-01' },
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-05-01' },
                { type: 'expense', amount: 49, mainCategory: 'Subskrypcje', subCategory: 'Netflix', date: '2026-06-01' }
            ];
        `);
        const id = buildSubscriptionCatalog()[0].id;
        const prefs = readSubscriptionPrefs();
        prefs.customLabels[id] = 'Netflix rodzinny';
        writeSubscriptionPrefs(prefs);
        expect(buildSubscriptionCatalog()[0].label).toBe('Netflix rodzinny');
    });

    it('addSubscriptionFromTransaction oznacza powtarzalne i grupuje po podkategorii', () => {
        globalThis.saveState = () => {};
        runInContext(`
            appState.transactions = [
                { type: 'expense', amount: 25, mainCategory: 'Rozrywka', subCategory: 'HBO', date: '2026-04-01' },
                { type: 'expense', amount: 25, mainCategory: 'Rozrywka', subCategory: 'HBO', date: '2026-05-01' },
                { type: 'expense', amount: 99, mainCategory: 'Rozrywka', subCategory: 'Kino', date: '2026-06-01' }
            ];
        `);
        addSubscriptionFromTransaction(0);
        const hboTxs = appState.transactions.filter((t) => t.subCategory === 'HBO');
        expect(hboTxs.every((t) => t.recurringId)).toBe(true);
        expect(hboTxs[0].recurringId).toBe(hboTxs[1].recurringId);
        expect(appState.transactions.find((t) => t.subCategory === 'Kino')?.recurringId).toBeFalsy();
    });
});
