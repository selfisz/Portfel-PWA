import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.categoryTree = {
        expense: {
            Zakupy: ['Biedronka', 'Lidl'],
            Różne: ['[Bez podkategorii]'],
            Kosmetyki: ['Higiena']
        },
        income: { Wynagrodzenie: ['[Bez podkategorii]'] }
    };
    globalThis.DEFAULT_CATEGORY_TREE = globalThis.categoryTree;
    globalThis.getAssistantCategoryCatalog = () => ({
        expense: globalThis.categoryTree.expense,
        income: globalThis.categoryTree.income
    });
    loadScript('js/skryba-prompts.js');
});

describe('buildSkrybaCategorySchemaBlock', () => {
    it('zawiera kategorie z drzewa użytkownika', () => {
        const block = buildSkrybaCategorySchemaBlock();
        expect(block).toContain('DOZWOLONE_KATEGORIE');
        expect(block).toContain('Kosmetyki');
        expect(block).toContain('Zakupy');
    });

    it('jest wstrzykiwany do promptu planera i akcji', () => {
        expect(buildSkrybaPlannerPrompt()).toContain('DOZWOLONE_KATEGORIE');
        expect(buildSkrybaActionSystemPrompt()).toContain('DOZWOLONE_KATEGORIE');
        expect(buildSkrybaAdvisorSystemPrompt('{}')).toContain('DOZWOLONE_KATEGORIE');
    });
});

describe('buildSkrybaPendingCorrectionPrompt', () => {
    it('zawiera oczekującą transakcję i schemat kategorii', () => {
        const prompt = buildSkrybaPendingCorrectionPrompt('{"amount":20}');
        expect(prompt).toContain('OCZEKUJĄCA_TRANSAKCJA');
        expect(prompt).toContain('correct_pending');
        expect(prompt).toContain('DOZWOLONE_KATEGORIE');
    });
});
