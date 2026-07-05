import { describe, it, expect, beforeAll } from 'vitest';
import { setupDomStubs, setupFormatStubs, loadScriptsInOrder } from './helpers/load.js';

beforeAll(() => {
    setupDomStubs({ localStorage: false });
    setupFormatStubs();
    globalThis.renderCategoryIcon = () => '<span class="cat-icon"></span>';
    loadScriptsInOrder(['js/tx-row-html.js']);
});

describe('buildTransactionRowHtml', () => {
    const tx = {
        date: '2026-06-01',
        type: 'expense',
        amount: 120,
        mainCategory: 'Zakupy',
        subCategory: 'Biedronka'
    };

    it('buduje wiersz z data-action dla raportów', () => {
        const html = buildTransactionRowHtml(tx, { globalIndex: 3, clickMode: 'open' });
        expect(html).toContain('data-action="open-transaction"');
        expect(html).toContain('data-tx-index="3"');
        expect(html).toContain('Biedronka');
        expect(html).toContain('120.00 zł');
    });

    it('buduje wiersz rozliczenia miesiąca z data-action', () => {
        const html = buildTransactionRowHtml(tx, { globalIndex: 2, clickMode: 'monthClose' });
        expect(html).toContain('data-action="month-close-transaction"');
        expect(html).toContain('data-tx-index="2"');
        expect(html).toContain('onclick="monthCloseOpenTransactionDetails(2)"');
    });

    it('zwraca pusty string dla rozliczenia miesiąca bez indeksu', () => {
        expect(buildTransactionRowHtml(tx, { globalIndex: -1, clickMode: 'monthClose' })).toBe('');
    });
});
