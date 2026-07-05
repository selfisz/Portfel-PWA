/**
 * Smoke testy checklisty — logika + DOM helpers (bez Firebase auth).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadScript, runInContext } from './helpers/load.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((key) => delete store[key]); }
    };
    globalThis.document = {
        getElementById: (id) => mockDom[id] || null,
        querySelector: () => null,
        querySelectorAll: () => ({ forEach: () => {} }),
        addEventListener: () => {}
    };
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    globalThis.NET_WORTH_LABEL = 'Wartość netto';
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d;
    globalThis.escapeHtml = (s) => String(s ?? '');
    globalThis.formatTransactionCategoryLabel = (t) => t.subCategory === '[Bez podkategorii]' ? t.mainCategory : `${t.mainCategory} · ${t.subCategory}`;
    globalThis.localIsoDate = (d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));
    globalThis.saveState = () => {};
    globalThis.summarizePeriod = (txs) => {
        const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const balance = income - expense;
        return { income, expense, balance, savings: income > 0 ? Math.round((balance / income) * 100) : 0 };
    };
    globalThis.getMergedTransactions = () => globalThis.appState.transactions;
    globalThis.getTransactionYears = () => {
        const years = new Set([2026]);
        (globalThis.appState.transactions || []).forEach((t) => years.add(parseInt(t.date.slice(0, 4), 10)));
        return [...years].sort((a, b) => b - a);
    };
    globalThis.getReportsMonthValue = () => '2026-06';
    globalThis.reportsPeriodMode = 'month';
    globalThis.ANALYSIS_MONTH_SHORT = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

    loadScript('js/tx-row-html.js');
    loadScript('js/transaction-duplicates.js');
    loadScript('js/month-close.js');
    loadScript('js/reports-core.js');
    loadScript('js/reports-debt.js');
    loadScript('js/asset-analytics.js');
});

const mockDom = {};

function mockEl(id, html = '') {
    const el = {
        id,
        innerHTML: html,
        value: '',
        classList: {
            _c: new Set(),
            add: (...c) => c.forEach((x) => el.classList._c.add(x)),
            remove: (...c) => c.forEach((x) => el.classList._c.delete(x)),
            toggle: (c, force) => {
                if (force === true) el.classList._c.add(c);
                else if (force === false) el.classList._c.delete(c);
                else if (el.classList._c.has(c)) el.classList._c.delete(c);
                else el.classList._c.add(c);
            },
            contains: (c) => el.classList._c.has(c)
        }
    };
    mockDom[id] = el;
    return el;
}

describe('checklist: duplikaty', () => {
    beforeEach(() => {
        globalThis.appState = {
            transactions: [
                { date: '2026-06-10', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: '' }
            ]
        };
    });

    it('alert tylko przy pełnym dopasowaniu kategorii', () => {
        expect(findDuplicateCandidates({
            date: '2026-06-10', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Zakupy'
        })).toHaveLength(1);
        expect(findDuplicateCandidates({
            date: '2026-06-10', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Inne'
        })).toHaveLength(0);
        expect(findDuplicateCandidates({
            date: '2026-06-10', type: 'expense', amount: 99, mainCategory: 'Zakupy', subCategory: 'Zakupy'
        })).toHaveLength(0);
    });
});

describe('checklist: rozliczenie miesiąca', () => {
    beforeEach(() => {
        localStorage.clear();
        globalThis.appState = {
            transactions: [
                { date: '2024-01-01', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
                { date: '2024-02-01', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
                { date: '2024-03-01', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
                { date: '2024-04-01', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' },
                { date: '2024-05-01', type: 'expense', amount: 1, mainCategory: 'A', subCategory: 'B' }
            ]
        };
    });

    it('banery max 3 najnowsze nierozliczone w oknie', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 4, 31));
        expect(getMonthCloseBannerMonths()).toEqual(['2024-03', '2024-04', '2024-05']);
        vi.useRealTimers();
    });

    it('nierozliczony miesiąc pozostaje dostępny', () => {
        globalThis.captureAssetSnapshot = () => null;
        expect(isMonthClosed('2024-03')).toBe(false);
        markMonthClosed('2024-03');
        expect(isMonthClosed('2024-03')).toBe(true);
        expect(getUnclosedMonthsWithData()).not.toContain('2024-03');
        expect(getUnclosedMonthsWithData()).toContain('2024-04');
    });
});

describe('checklist: year in review', () => {
    it('buduje rozszerzone podsumowanie roku', () => {
        globalThis.appState = {
            transactions: [
                { date: '2025-03-15', type: 'expense', amount: 100, mainCategory: 'Zakupy', subCategory: 'Zakupy' },
                { date: '2025-06-01', type: 'income', amount: 5000, mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa' }
            ],
            assetSnapshots: []
        };
        globalThis.getSnapshotForMonthKey = () => null;
        globalThis.getIkzeContributionsFromTransactions = () => 0;
        globalThis.getAllRecurringEntries = () => [];

        const data = buildYearReviewData(2025);
        expect(data).not.toBeNull();
        expect(data.txCount).toBe(2);
        expect(data.topCats.length).toBeGreaterThan(0);
        const html = buildYearReviewHtml(data);
        expect(html).toContain('PDF podsumowania roku');
    });
});

describe('checklist: snapshot m/m', () => {
    it('liczy deltę net worth z procentem', () => {
        globalThis.getPortfolioValuePln = () => 0;
        globalThis.getLoanCapitalLeft = () => 0;
        globalThis.getCreditCardDebtTotal = () => 0;
        globalThis.getSummaryAssets = () => [];
        globalThis.getAssetsHorizonTotals = () => ({ short: 0, long: 0 });
        globalThis.normalizeAssetSnapshot = (s) => s;
        globalThis.appState = {
            assetSnapshots: [
                { id: '1', monthKey: '2026-04', date: '2026-04-30', totalAssets: 100000, totalDebt: 50000, netWorth: 50000, shortAssets: 0, longAssets: 0, byType: {}, source: 'auto' },
                { id: '2', monthKey: '2026-05', date: '2026-05-31', totalAssets: 110000, totalDebt: 48000, netWorth: 62000, shortAssets: 0, longAssets: 0, byType: {}, source: 'auto' }
            ],
            assetValueHistory: []
        };

        const ch = getSnapshotMonthChange();
        expect(ch.netWorth).toBe(12000);
        expect(ch.pctNet).toBeCloseTo(24, 0);
        expect(formatSnapshotDelta(ch.netWorth, ch.pctNet)).toContain('+');
    });
});

describe('checklist: HTML przycisków overlay', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

    it('duplikat: Nie dodawaj + Zostaw obie (btn-cancel/btn-submit)', () => {
        expect(html).toContain('Wykryto duplikat');
        expect(html).toContain('resolveDuplicateConfirm(\'cancel\')">Nie dodawaj');
        expect(html).toContain('resolveDuplicateConfirm(\'keep\')">Zostaw obie');
        expect(html).toMatch(/duplicate-tx-actions[\s\S]*btn-cancel btn-cancel--form/);
        expect(html).toMatch(/duplicate-tx-actions[\s\S]*btn-submit btn-submit--form/);
        expect(html).not.toMatch(/duplicate-tx-actions[\s\S]*btn-primary/);
    });

    it('rozliczenie: btn-submit/btn-cancel w stopce', () => {
        expect(html).toMatch(/month-close-footer[\s\S]*btn-cancel btn-cancel--form/);
        expect(html).toMatch(/month-close-footer[\s\S]*btn-submit btn-submit--form/);
    });

    it('baner rozliczenia poza kartą okresu analizy', () => {
        const heroOpen = html.indexOf('id="reports-period-hero"');
        const bannerIdx = html.indexOf('id="reports-month-close-banner"');
        const compareIdx = html.indexOf('id="analysis-compare-banner"');
        expect(bannerIdx).toBeGreaterThan(heroOpen);
        expect(bannerIdx).toBeLessThan(compareIdx);
        const heroSection = html.slice(heroOpen, bannerIdx);
        expect(heroSection).not.toContain('reports-month-close-banner');
    });

    it('lata i miesiące: klasy 2-kolumnowe', () => {
        expect(html).toContain('analysis-period-chips--years');
        expect(html).toContain('analysis-period-chips--months');
    });
});

describe('checklist: układ chipów roku', () => {
    beforeEach(() => {
        mockEl('reports-year-select', '');
        mockDom['reports-year-select'].value = '2026';
        mockEl('reports-year-chips');
        globalThis.reportsPeriodMode = 'year';
        globalThis.getTransactionYears = () => [2026, 2025, 2024];
    });

    it('Całość osobno + lata w kolejności', () => {
        loadScript('js/reports-analysis.js');
        renderAnalysisYearChips();
        const out = mockDom['reports-year-chips'].innerHTML;
        expect(out.indexOf('Całość')).toBeLessThan(out.indexOf('2026'));
        expect(out).toContain('analysis-period-chip-all');
        expect(out).toContain('2026');
        expect(out).toContain('2025');
    });
});
