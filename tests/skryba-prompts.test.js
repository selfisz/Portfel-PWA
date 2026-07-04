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
    loadScript('js/skryba-style.js');
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

    it('advisor prompt zawiera personę i styl odpowiedzi', () => {
        const prompt = buildSkrybaAdvisorSystemPrompt('{}');
        expect(prompt).toContain('PERSONA SKRYBY');
        expect(prompt).toContain('Werdykt:');
        expect(prompt).toContain('historii rozmowy');
    });

    it('buduje unified prompt z kontekstem i personą', () => {
        const prompt = buildSkrybaUnifiedPrompt('{"month_summary":{"expensePln":100}}');
        expect(prompt).toContain('KONTEKST_BIEŻĄCY');
        expect(prompt).toContain('set_budget');
        expect(prompt).toContain('PERSONA SKRYBY');
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
