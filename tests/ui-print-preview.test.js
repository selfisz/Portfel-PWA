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
    let createdFrame;

    function getById(id) {
        return elMap[id] ?? null;
    }

    function createFrameElement() {
        const frameDoc = {
            open: vi.fn(),
            write: vi.fn(),
            close: vi.fn(),
            readyState: 'complete'
        };
        const frameWin = { focus: vi.fn(), print: printSpy, document: frameDoc };
        return createMockElement({
            id: 'reports-pdf-print-frame',
            contentWindow: frameWin,
            contentDocument: frameDoc,
            style: {},
            onload: null,
            setAttribute: vi.fn(),
            addEventListener: vi.fn(),
            appendChild: vi.fn()
        });
    }

    function withUserAgent(userAgent, fn) {
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: { userAgent, share: undefined, canShare: undefined }
        });
        fn();
    }

    beforeEach(() => {
        printSpy = vi.fn();
        createdFrame = null;
        elMap = {};
        setupDomStubs({
            elMap,
            window: {
                open: vi.fn(() => null),
                matchMedia: () => ({ matches: false, addEventListener: () => {} })
            }
        });
        withUserAgent('Mozilla/5.0 Windows NT 10.0', () => {});
        globalThis.document.getElementById = getById;
        globalThis.document.createElement = (tag) => {
            if (String(tag).toLowerCase() === 'iframe') {
                createdFrame = createFrameElement();
                return createdFrame;
            }
            return createMockElement({ tagName: String(tag).toUpperCase() });
        };
        globalThis.document.body = createMockElement({
            appendChild: (node) => { elMap[node.id] = node; }
        });
        globalThis.showAppToast = vi.fn();
        globalThis.setTimeout = (cb) => {
            cb();
            return 1;
        };
        elMap['reports-pdf-title'] = createMockElement({ id: 'reports-pdf-title', textContent: 'Raport testowy' });
    });

    it('pokazuje błąd gdy brak treści', () => {
        elMap['reports-pdf-content'] = createMockElement({ id: 'reports-pdf-content', innerHTML: '   ' });
        printPrintPreview();
        expect(showAppToast).toHaveBeenCalledWith('Brak treści do druku', 'error');
        expect(printSpy).not.toHaveBeenCalled();
    });

    it('drukuje przez ukryty iframe z własnym HTML', () => {
        elMap['reports-pdf-content'] = createMockElement({
            id: 'reports-pdf-content',
            innerHTML: '<h1 class="reports-pdf-title">Test</h1>',
            querySelectorAll: () => []
        });
        printPrintPreview();
        expect(createdFrame).toBeTruthy();
        expect(createdFrame.contentDocument.write).toHaveBeenCalled();
        expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('na iPhone otwiera nowe okno zamiast window.print na stronie', () => {
        withUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', () => {
            const popupDoc = {
                open: vi.fn(),
                write: vi.fn(),
                close: vi.fn(),
                readyState: 'complete'
            };
            const popupWin = {
                document: popupDoc,
                focus: vi.fn(),
                print: printSpy,
                addEventListener: vi.fn()
            };
            globalThis.window.open = vi.fn(() => popupWin);
            elMap['reports-pdf-content'] = createMockElement({
                id: 'reports-pdf-content',
                innerHTML: '<p>Raport</p>',
                querySelectorAll: () => []
            });
            printPrintPreview();
            expect(globalThis.window.open).toHaveBeenCalled();
            expect(popupDoc.write).toHaveBeenCalled();
            expect(printSpy).toHaveBeenCalled();
            expect(showAppToast).toHaveBeenCalledWith('Wybierz Drukuj lub Zapisz jako PDF', 'default');
        });
    });
});

describe('buildPrintDocumentHtml', () => {
    it('wbudowuje treść i style druku', () => {
        const html = buildPrintDocumentHtml('Test', '<p class="reports-pdf-summary">Suma</p>');
        expect(html).toContain('<p class="reports-pdf-summary">Suma</p>');
        expect(html).toContain('.reports-pdf-table');
        expect(html).toContain('<title>Test</title>');
    });
});
