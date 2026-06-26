/**
 * Testy jednostkowe dla js/theme.js
 *
 * Mockujemy: document.documentElement (getAttribute/setAttribute/removeAttribute),
 * window.matchMedia, getComputedStyle, localStorage.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

// ---------------------------------------------------------------------------
// Helpers do budowania mocków
// ---------------------------------------------------------------------------
function makeDocumentMock(dataTheme = null, darkMediaMatches = false, cssVarValue = '') {
  return {
    documentElement: {
      _dataTheme: dataTheme,
      getAttribute(attr) { return attr === 'data-theme' ? this._dataTheme : null; },
      setAttribute(attr, val) { if (attr === 'data-theme') this._dataTheme = val; },
      removeAttribute(attr) { if (attr === 'data-theme') this._dataTheme = null; }
    },
    querySelectorAll: () => ({ forEach: () => {} }),
    querySelector: () => ({
      content: '',
      get _isDark() { return false; }
    })
  };
}

function makeMatchMedia(darkMatches = false) {
  return (query) => ({
    matches: query === '(prefers-color-scheme: dark)' ? darkMatches : false,
    addEventListener: () => {}
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeAll(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };

  globalThis.window = {
    matchMedia: makeMatchMedia(false)
  };

  globalThis.document = makeDocumentMock();
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.refreshCurrentView = () => {};
  globalThis.updateThemeColorMeta = () => {};

  loadScript('js/constants.js');
  loadScript('js/theme.js');
});

beforeEach(() => {
  localStorage.clear();
  globalThis.window.matchMedia = makeMatchMedia(false);
  globalThis.document = makeDocumentMock();
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.refreshCurrentView = () => {};
  // Przywróć prawdziwą updateThemeColorMeta (z załadowanego theme.js)
  globalThis.updateThemeColorMeta = updateThemeColorMeta;
});

// ---------------------------------------------------------------------------
// isLightTheme
// ---------------------------------------------------------------------------
describe('isLightTheme', () => {
  it('zwraca true gdy data-theme = "light"', () => {
    globalThis.document = makeDocumentMock('light');
    expect(isLightTheme()).toBe(true);
  });

  it('zwraca false gdy data-theme = "dark"', () => {
    globalThis.document = makeDocumentMock('dark');
    expect(isLightTheme()).toBe(false);
  });

  it('zwraca true gdy brak data-theme i system jest light (matchMedia nie pasuje)', () => {
    globalThis.document = makeDocumentMock(null);
    globalThis.window.matchMedia = makeMatchMedia(false);
    expect(isLightTheme()).toBe(true);
  });

  it('zwraca false gdy brak data-theme i system jest dark (matchMedia pasuje)', () => {
    globalThis.document = makeDocumentMock(null);
    globalThis.window.matchMedia = makeMatchMedia(true);
    expect(isLightTheme()).toBe(false);
  });

  it('ignoruje matchMedia gdy data-theme jest jawnie ustawiony', () => {
    globalThis.document = makeDocumentMock('light');
    globalThis.window.matchMedia = makeMatchMedia(true); // system dark, ale force light
    expect(isLightTheme()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getThemeCssVar
// ---------------------------------------------------------------------------
describe('getThemeCssVar', () => {
  it('zwraca wartość CSS variable gdy istnieje', () => {
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#aabbcc' });
    expect(getThemeCssVar('--primary-color', '#ffffff', '#000000')).toBe('#aabbcc');
  });

  it('zwraca lightFallback gdy CSS variable jest pusta i motyw jasny', () => {
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
    globalThis.document = makeDocumentMock('light');
    expect(getThemeCssVar('--missing', '#light', '#dark')).toBe('#light');
  });

  it('zwraca darkFallback gdy CSS variable jest pusta i motyw ciemny', () => {
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
    globalThis.document = makeDocumentMock('dark');
    expect(getThemeCssVar('--missing', '#light', '#dark')).toBe('#dark');
  });

  it('trim-uje wartość CSS variable', () => {
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '  #abc  ' });
    expect(getThemeCssVar('--color', '#x', '#y')).toBe('#abc');
  });
});

// ---------------------------------------------------------------------------
// setTheme
// ---------------------------------------------------------------------------
describe('setTheme', () => {
  it('zapisuje tryb w localStorage', () => {
    setTheme('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });

  it('ustawia data-theme dla "light"', () => {
    setTheme('light');
    expect(globalThis.document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('ustawia data-theme dla "dark"', () => {
    setTheme('dark');
    expect(globalThis.document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('usuwa data-theme dla "auto"', () => {
    // Najpierw ustaw jakiś motyw
    setTheme('dark');
    expect(globalThis.document.documentElement.getAttribute('data-theme')).toBe('dark');
    // Potem przełącz na auto
    setTheme('auto');
    expect(globalThis.document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('zapisuje "auto" w localStorage', () => {
    setTheme('auto');
    expect(localStorage.getItem(THEME_KEY)).toBe('auto');
  });

  it('wywołuje refreshCurrentView', () => {
    let called = false;
    globalThis.refreshCurrentView = () => { called = true; };
    setTheme('light');
    expect(called).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateThemeColorMeta
// ---------------------------------------------------------------------------
describe('updateThemeColorMeta', () => {
  it('ustawia ciemny kolor meta gdy data-theme = "dark"', () => {
    const metaEl = { content: '' };
    globalThis.document = {
      ...makeDocumentMock('dark'),
      querySelector: () => metaEl
    };
    globalThis.window.matchMedia = makeMatchMedia(false);
    updateThemeColorMeta();
    expect(metaEl.content).toBe('#0d0e11');
  });

  it('ustawia jasny kolor meta gdy data-theme = "light"', () => {
    const metaEl = { content: '' };
    globalThis.document = {
      ...makeDocumentMock('light'),
      querySelector: () => metaEl
    };
    globalThis.window.matchMedia = makeMatchMedia(false);
    updateThemeColorMeta();
    expect(metaEl.content).toBe('#e4eaf4');
  });

  it('ustawia ciemny kolor meta gdy auto + system dark', () => {
    const metaEl = { content: '' };
    globalThis.document = {
      ...makeDocumentMock(null), // brak force theme
      querySelector: () => metaEl
    };
    globalThis.window.matchMedia = makeMatchMedia(true); // system dark
    updateThemeColorMeta();
    expect(metaEl.content).toBe('#0d0e11');
  });

  it('ustawia jasny kolor meta gdy auto + system light', () => {
    const metaEl = { content: '' };
    globalThis.document = {
      ...makeDocumentMock(null),
      querySelector: () => metaEl
    };
    globalThis.window.matchMedia = makeMatchMedia(false); // system light
    updateThemeColorMeta();
    expect(metaEl.content).toBe('#e4eaf4');
  });

  it('nie rzuca błędu gdy meta element nie istnieje', () => {
    globalThis.document = {
      ...makeDocumentMock('light'),
      querySelector: () => null
    };
    expect(() => updateThemeColorMeta()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// initTheme
// ---------------------------------------------------------------------------
describe('initTheme', () => {
  it('używa zapisanego trybu z localStorage', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    initTheme();
    expect(globalThis.document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('domyślnie używa "auto" gdy brak w localStorage', () => {
    initTheme();
    // "auto" → removeAttribute → data-theme = null
    expect(globalThis.document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('nie rzuca błędu przy inicjalizacji', () => {
    expect(() => initTheme()).not.toThrow();
  });
});
