import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    loadScript('js/skryba-style.js');
});

describe('buildSkrybaPersonaBlock', () => {
    it('zawiera kluczowe wytyczne tonu', () => {
        const block = buildSkrybaPersonaBlock();
        expect(block).toContain('PERSONA SKRYBY');
        expect(block).toContain('zwracasz się na „ty”');
    });
});

describe('polishSkrybaReply', () => {
    it('normalizuje podwójne puste linie', () => {
        expect(polishSkrybaReply('A\n\n\nB')).toBe('A\n\nB');
    });

    it('dopina zł do kwot bez waluty', () => {
        expect(polishSkrybaReply('Wydałeś 123,45 w maju.')).toContain('123,45 zł');
    });
});

describe('getSkrybaGreeting', () => {
    it('zwraca powitanie zależne od pory dnia', () => {
        expect(getSkrybaGreeting(new Date('2026-06-29T09:00:00'))).toBe('Dzień dobry');
        expect(getSkrybaGreeting(new Date('2026-06-29T20:00:00'))).toBe('Dobry wieczór');
    });
});

describe('formatAssistantSummarizeFriendly', () => {
    it('formatuje sumę w cieplejszym tonie', () => {
        const text = formatAssistantSummarizeFriendly([
            { amount: 10, type: 'expense' },
            { amount: 20, type: 'expense' }
        ]);
        expect(text).toContain('ostatniego wyszukiwania');
        expect(text).toContain('30.00 zł');
    });
});

describe('buildSkrybaWelcomeBody', () => {
    it('zawiera powitanie Skryby', () => {
        const body = buildSkrybaWelcomeBody();
        expect(body).toContain('Skryba');
    });
});
