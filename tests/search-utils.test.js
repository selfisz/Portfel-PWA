import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    loadScript('js/search-utils.js');
});

describe('transactionMatchesFuzzyQuery', () => {
    const tx = {
        date: '2026-01-15',
        type: 'expense',
        amount: 89.99,
        mainCategory: 'Samochód',
        subCategory: 'Ubezpieczenie',
        note: 'Polisa OC'
    };

    it('dopasowuje po literówce w podkategorii', () => {
        expect(transactionMatchesFuzzyQuery(tx, 'ubezpiecznie')).toBe(true);
    });

    it('dopasowuje po kwocie', () => {
        expect(transactionMatchesFuzzyQuery(tx, '89.99')).toBe(true);
    });
});

describe('filterItemsByFuzzyCategoryField', () => {
    it('zwraca wszystkie elementy gdy filtr kategorii nie pasuje', () => {
        const items = [{ mainCategory: 'Zakupy' }, { mainCategory: 'Dom' }];
        const result = filterItemsByFuzzyCategoryField(items, 'mainCategory', 'Nieistniejąca');
        expect(result).toHaveLength(2);
    });
});
