/**
 * Helper do ładowania vanilla JS plików z globalami w środowisku testowym.
 * Używa vm.runInThisContext() żeby deklaracje funkcji trafiły do global scope,
 * bez modyfikowania plików źródłowych.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SCRIPT_LOAD_ORDER = {
    'js/state.js': ['js/chart-instances.js'],
    'js/dashboard.js': ['js/dashboard-forecast.js'],
    'js/reports-analysis.js': ['js/reports-analysis-cache.js'],
    'js/reports-debt.js': ['js/reports-debt-calculations.js'],
    'js/settings.js': ['js/settings-backup.js'],
    'js/month-close.js': ['js/month-close-duplicates-ui.js'],
    'js/assets-migrations.js': ['js/assets.js'],
    'js/sync-lifecycle.js': ['js/offline.js', 'js/sync-queue.js']
};

const SCRIPT_FOLLOWUP_LOADS = {
    'js/assets.js': ['js/assets-migrations.js']
};

const loadedScripts = new Set();

export function loadScript(relPath) {
    if (loadedScripts.has(relPath)) return;
    const prereqs = SCRIPT_LOAD_ORDER[relPath];
    if (prereqs) prereqs.forEach((dep) => loadScript(dep));
    if (loadedScripts.has(relPath)) return;
    loadedScripts.add(relPath);
    const src = readFileSync(join(ROOT, relPath), 'utf8');
    vm.runInThisContext(src, { filename: relPath });
    const followups = SCRIPT_FOLLOWUP_LOADS[relPath];
    if (followups) followups.forEach((dep) => loadScript(dep));
}

/**
 * Ładuje listę skryptów w podanej kolejności (z automatycznymi zależnościami z SCRIPT_LOAD_ORDER).
 */
export function loadScriptsInOrder(relPaths) {
    relPaths.forEach((relPath) => loadScript(relPath));
}

/**
 * Uruchamia dowolny kod inline w tym samym V8 context.
 * Używane do wstrzykiwania helper functions, które mają dostęp
 * do zmiennych let/const zdefiniowanych przez loadScript.
 */
export function runInContext(code) {
    vm.runInThisContext(code);
}

/**
 * Mock localStorage z izolowanym store (per wywołanie).
 */
export function setupLocalStorageStub() {
    const store = {};
    const ls = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        _store: store
    };
    globalThis.localStorage = ls;
    return ls;
}

/**
 * Pojedynczy element DOM do testów (getElementById / createElement).
 */
export function createMockElement(extra = {}) {
    return {
        value: '',
        innerHTML: '',
        textContent: '',
        innerText: '',
        style: {},
        checked: false,
        disabled: false,
        dataset: {},
        className: '',
        id: '',
        type: '',
        tagName: 'DIV',
        classList: {
            _s: new Set(),
            add(c) { this._s.add(c); },
            remove(c) { this._s.delete(c); },
            toggle(c, f) {
                if (f === undefined) {
                    if (this._s.has(c)) this._s.delete(c);
                    else this._s.add(c);
                } else if (f) {
                    this._s.add(c);
                } else {
                    this._s.delete(c);
                }
            },
            contains(c) { return this._s.has(c); }
        },
        getAttribute: () => null,
        setAttribute: () => {},
        focus: () => {},
        appendChild: () => {},
        addEventListener: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
        parentElement: null,
        previousElementSibling: null,
        insertAdjacentElement: () => {},
        ...extra
    };
}

/**
 * Wspólny stub document / window / confirm / alert.
 * Zwraca { elMap } — mapę elementów utworzonych przez getElementById.
 */
export function setupDomStubs(options = {}) {
    const {
        localStorage: withLocalStorage = true,
        window: withWindow = true,
        confirm = true
    } = options;

    if (withLocalStorage) setupLocalStorageStub();

    const elMap = options.elMap || {};
    globalThis.document = {
        getElementById: (id) => {
            if (!elMap[id]) elMap[id] = createMockElement({ id });
            return elMap[id];
        },
        querySelector: () => null,
        querySelectorAll: () => ({ forEach: () => {}, length: 0 }),
        createElement: (tag) => createMockElement({ tagName: String(tag).toUpperCase() }),
        body: createMockElement(),
        addEventListener: () => {},
        ...(options.document || {})
    };

    if (withWindow) {
        globalThis.window = {
            matchMedia: () => ({ matches: false, addEventListener: () => {} }),
            ...(options.window || {})
        };
    }

    globalThis.confirm = () => confirm;
    globalThis.alert = () => {};

    return { elMap };
}

/**
 * Najczęstsze stuby formatowania używane przez generatory HTML.
 */
export function setupFormatStubs() {
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d || '';
    globalThis.escapeHtml = (t) => String(t ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
