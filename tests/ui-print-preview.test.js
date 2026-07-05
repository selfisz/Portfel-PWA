import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadScript } from './helpers/load.js';
import { createMockElement, setupDomStubs } from './helpers/load.js';

beforeAll(() => {
    globalThis.showAppToast = vi.fn();
    loadScript('js/ui.js');
});

describe('printPrintPreview', () => {
    let elMap;
    let printSpy;

    function getById(id) {
        return elMap[id] ?? null;
    }

    beforeEach(() => {
        printSpy = vi.fn();
        elMap = {};
        setupDomStubs({
            elMap,
            window: {
                print: printSpy,
                matchMedia: () => ({ matches: false, addEventListener: () => {} })
            }
        });
        globalThis.document.getElementById = getById;
        globalThis.showAppToast = vi.fn();
        globalThis.requestAnimationFrame = (cb) => {
            cb();
            return 1;
        };
        globalThis.setTimeout = (cb) => {
            cb();
            return 1;
        };
    });

    it('pokazuje błąd gdy brak treści', () => {
        elMap['reports-pdf-content'] = createMockElement({ id: 'reports-pdf-content', innerHTML: '   ' });
        printPrintPreview();
        expect(showAppToast).toHaveBeenCalledWith('Brak treści do druku', 'error');
        expect(printSpy).not.toHaveBeenCalled();
    });

    it('drukuje widoczny podgląd bez tworzenia iframe', () => {
        elMap['reports-pdf-content'] = createMockElement({
            id: 'reports-pdf-content',
            innerHTML: '<h1 class="reports-pdf-title">Test</h1>',
            querySelectorAll: () => []
        });
        printPrintPreview();
        expect(printSpy).toHaveBeenCalledTimes(1);
        expect(document.getElementById('reports-pdf-print-frame')).toBeNull();
    });

    it('usuwa stary iframe przed drukiem', () => {
        const staleFrame = createMockElement({ id: 'reports-pdf-print-frame' });
        staleFrame.remove = () => { delete elMap['reports-pdf-print-frame']; };
        elMap['reports-pdf-print-frame'] = staleFrame;
        elMap['reports-pdf-content'] = createMockElement({
            id: 'reports-pdf-content',
            innerHTML: '<p>Raport</p>',
            querySelectorAll: () => []
        });
        printPrintPreview();
        expect(document.getElementById('reports-pdf-print-frame')).toBeNull();
        expect(printSpy).toHaveBeenCalledTimes(1);
    });
});
