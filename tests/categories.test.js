/**
 * Testy jednostkowe dla js/categories.js
 *
 * Testujemy czyste funkcje i funkcje z localStorage.
 * Pomijamy czysto DOM-owe: createMainCategoryItem, createSubCategoryItem,
 * renderRecentCategories, focusAmountField.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript, runInContext } from './helpers/load.js';

beforeAll(() => {
  // localStorage mock
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };

  // Stub DOM + theme
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => ({ forEach: () => {} }),
    createElement: () => ({
      className: '', innerHTML: '', type: '',
      classList: { add: () => {}, remove: () => {} },
      appendChild: () => {},
      onclick: null
    })
  };
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.isLightTheme = () => true; // domyślnie jasny motyw

  // Stuby stanu
  globalThis.formState = { formMode: 'expense', currentType: 'expense', selectedMainCategory: '', selectedSubCategory: '' };
  globalThis.appState = { categoryIcons: { expense: { mains: {}, subs: {} }, income: { mains: {}, subs: {} } } };
  globalThis.selectMainCategoryForm = () => {};
  globalThis.renderMainCategoriesForm = () => {};
  globalThis.selectAddFormCategoryPair = () => {};
  globalThis.normalizeFormSubCategoryForMain = (type, mainCategory, subCategory) => {
    const subs = (categoryTree?.[type] || {})[mainCategory] || [];
    if (!subs.length) return '[Bez podkategorii]';
    return subCategory || '';
  };
  globalThis.activeChartCategory = null;
  globalThis.chartViewType = 'expense';

  loadScript('js/constants.js');
  loadScript('js/categories.js');

  // Bridge
  runInContext(`
    function _setCategoryTree(t) { categoryTree = t; }
    function _getCategoryTree()  { return categoryTree; }
    function _setActiveChartCategory(v) { activeChartCategory = v; }
  `);
});

beforeEach(() => {
  localStorage.clear();
  globalThis.isLightTheme = () => true;
  globalThis.activeChartCategory = null;
  globalThis.chartViewType = 'expense';
  globalThis.appState = { categoryIcons: { expense: { mains: {}, subs: {} }, income: { mains: {}, subs: {} } } };
  _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
});

// ---------------------------------------------------------------------------
// categoryColorAlpha
// ---------------------------------------------------------------------------
describe('categoryColorAlpha', () => {
  it('konwertuje 6-znakowy hex na rgba', () => {
    expect(categoryColorAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('konwertuje 3-znakowy hex na rgba (rozszerza)', () => {
    // #abc → #aabbcc → rgb(170, 187, 204)
    expect(categoryColorAlpha('#abc', 1)).toBe('rgba(170, 187, 204, 1)');
  });

  it('obsługuje hex bez # (bez prefix)', () => {
    expect(categoryColorAlpha('00ff00', 0.8)).toBe('rgba(0, 255, 0, 0.8)');
  });

  it('obsługuje alpha = 0', () => {
    expect(categoryColorAlpha('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('obsługuje alpha = 1', () => {
    expect(categoryColorAlpha('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('poprawnie parsuje niebieski komponent', () => {
    expect(categoryColorAlpha('#0000ff', 0.16)).toBe('rgba(0, 0, 255, 0.16)');
  });

  it('obsługuje wartości pośrednie', () => {
    const result = categoryColorAlpha('#6d28d9', 0.16);
    expect(result).toMatch(/^rgba\(\d+, \d+, \d+, 0\.16\)$/);
  });
});

// ---------------------------------------------------------------------------
// hashString
// ---------------------------------------------------------------------------
describe('hashString', () => {
  it('zwraca 0 dla pustego stringa', () => {
    expect(hashString('')).toBe(0);
  });

  it('zwraca nieujemną liczbę całkowitą', () => {
    const h = hashString('testowy string');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });

  it('daje różne wartości dla różnych stringów', () => {
    expect(hashString('Dom')).not.toBe(hashString('Zakupy'));
  });

  it('jest deterministyczny (te same wejście → ten sam wynik)', () => {
    expect(hashString('kategoriaA')).toBe(hashString('kategoriaA'));
  });

  it('nie rzuca błędu dla długiego stringa', () => {
    expect(() => hashString('a'.repeat(1000))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// generateDistinctHslColors
// ---------------------------------------------------------------------------
describe('generateDistinctHslColors', () => {
  it('zwraca pustą tablicę dla count = 0', () => {
    expect(generateDistinctHslColors(0, 'test')).toEqual([]);
  });

  it('zwraca tablicę o długości count', () => {
    expect(generateDistinctHslColors(5, 'seed')).toHaveLength(5);
    expect(generateDistinctHslColors(1, 'seed')).toHaveLength(1);
  });

  it('zwraca stringi hsl', () => {
    const colors = generateDistinctHslColors(3, 'test');
    colors.forEach((c) => expect(c).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/));
  });

  it('hue wartości są w zakresie 0-359', () => {
    const colors = generateDistinctHslColors(10, 'test');
    colors.forEach((c) => {
      const hue = parseInt(c.match(/hsl\((\d+)/)[1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    });
  });

  it('jest deterministyczny dla tego samego seed', () => {
    const a = generateDistinctHslColors(5, 'mySeed');
    const b = generateDistinctHslColors(5, 'mySeed');
    expect(a).toEqual(b);
  });

  it('daje różne zestawy dla różnych seedów', () => {
    const a = generateDistinctHslColors(3, 'seed-A');
    const b = generateDistinctHslColors(3, 'seed-B');
    expect(a).not.toEqual(b);
  });

  it('w trybie ciemnym używa niższej saturacji/lightness', () => {
    globalThis.isLightTheme = () => false;
    const dark = generateDistinctHslColors(1, 'x')[0];
    globalThis.isLightTheme = () => true;
    const light = generateDistinctHslColors(1, 'x')[0];
    // Dark: 72%, Light: 78% saturacja — powinny być różne
    expect(dark).not.toBe(light);
  });
});

// ---------------------------------------------------------------------------
// getCategoryIconPath
// ---------------------------------------------------------------------------
describe('getCategoryIconPath', () => {
  it('zwraca ścieżkę dla głównej kategorii', () => {
    const path = getCategoryIconPath('Dom');
    expect(path).toBeTruthy();
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(10);
  });

  it('preferuje ścieżkę podkategorii nad główną', () => {
    const mainPath = getCategoryIconPath('Dom');
    const subPath = getCategoryIconPath('Dom', 'Remont');
    expect(subPath).not.toBe(mainPath);
  });

  it('zwraca ścieżkę "Inne" dla nieznanej kategorii', () => {
    const fallback = getCategoryIconPath('NieznanaKategoria');
    const inneIcon = categoryIconPaths['Inne'];
    expect(fallback).toBe(inneIcon);
  });

  it('rozpoznaje kredyt hipoteczny po regex (bez subCategoryIconPaths)', () => {
    const path = getCategoryIconPath('Długi', 'Kredyt na nieruchomość');
    expect(path).toBe(MORTGAGE_ICON_PATH);
  });

  it('zwraca poprawną ścieżkę dla "Zakupy"', () => {
    expect(getCategoryIconPath('Zakupy')).toBe(categoryIconPaths['Zakupy']);
  });

  it('zwraca ścieżkę podkategorii "Czynsz"', () => {
    expect(getCategoryIconPath('Dom', 'Czynsz')).toBe(subCategoryIconPaths['Czynsz']);
  });

  it('obsługuje null jako subCategory', () => {
    expect(() => getCategoryIconPath('Transport', null)).not.toThrow();
  });

  it('używa nadpisanej ikony z appState.categoryIcons', () => {
    const customPath = categoryIconPaths['Samochód'];
    appState.categoryIcons.expense.mains['MojaKategoria'] = customPath;
    expect(getCategoryIconPath('MojaKategoria', null, 'expense')).toBe(customPath);
  });

  it('używa nadpisanej ikony podkategorii', () => {
    const customPath = subCategoryIconPaths['Paliwo'];
    appState.categoryIcons.expense.subs['Dom|MojaSub'] = customPath;
    expect(getCategoryIconPath('Dom', 'MojaSub', 'expense')).toBe(customPath);
  });
});

// ---------------------------------------------------------------------------
// getCategoryColor (po naprawie buga)
// ---------------------------------------------------------------------------
describe('getCategoryColor', () => {
  it('zwraca kolor dla kategorii wydatku (jasny motyw)', () => {
    globalThis.isLightTheme = () => true;
    const color = getCategoryColor('Dom', 'expense');
    expect(color).toBeTruthy();
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('zwraca kolor dla kategorii dochodu', () => {
    globalThis.isLightTheme = () => true;
    const color = getCategoryColor('Wynagrodzenie', 'income');
    expect(color).toBe(incomeCategoryColorsLight['Wynagrodzenie']);
  });

  it('zwraca fallback kolor dla nieznanej kategorii (jasny)', () => {
    globalThis.isLightTheme = () => true;
    const color = getCategoryColor('NieznanaKategoria', 'expense');
    expect(color).toBe('#5b4fe8');
  });

  it('zwraca fallback kolor dla nieznanej kategorii (ciemny)', () => {
    globalThis.isLightTheme = () => false;
    const color = getCategoryColor('NieznanaKategoria', 'expense');
    expect(color).toBe('#93c5fd');
  });

  it('NIE rzuca błędu gdy categoryTree jest null (po naprawie buga)', () => {
    _setCategoryTree(null);
    expect(() => getCategoryColor('Dom', 'expense')).not.toThrow();
    _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
  });

  it('NIE rzuca błędu gdy categoryTree.income jest undefined', () => {
    _setCategoryTree({ expense: DEFAULT_CATEGORY_TREE.expense });
    expect(() => getCategoryColor('Dom', 'expense')).not.toThrow();
    _setCategoryTree(JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)));
  });
});

// ---------------------------------------------------------------------------
// resolveIconColor
// ---------------------------------------------------------------------------
describe('resolveIconColor', () => {
  it('dla income używa subCategory jako klucza (jeśli nie jest [Bez podkategorii])', () => {
    globalThis.isLightTheme = () => true;
    const color = resolveIconColor('Wynagrodzenie', 'Podstawa', 'income');
    expect(color).toBe(incomeCategoryColorsLight['Podstawa']);
  });

  it('dla income bez podkategorii używa mainCategory', () => {
    globalThis.isLightTheme = () => true;
    const color = resolveIconColor('Wynagrodzenie', '[Bez podkategorii]', 'income');
    expect(color).toBe(incomeCategoryColorsLight['Wynagrodzenie']);
  });

  it('dla expense używa mainCategory', () => {
    globalThis.isLightTheme = () => true;
    const color = resolveIconColor('Dom', 'Czynsz', 'expense');
    expect(color).toBe(categoryColorsLight['Dom']);
  });
});

// ---------------------------------------------------------------------------
// renderCategoryIcon
// ---------------------------------------------------------------------------
describe('renderCategoryIcon', () => {
  it('zwraca string HTML z elementem span', () => {
    const html = renderCategoryIcon('Dom', 'grid', null, 'expense');
    expect(html).toContain('<span');
    expect(html).toContain('</span>');
  });

  it('zawiera SVG', () => {
    const html = renderCategoryIcon('Dom', 'grid', null, 'expense');
    expect(html).toContain('<svg');
    expect(html).toContain('</svg>');
  });

  it('wariant "list" dodaje klasę --list', () => {
    const html = renderCategoryIcon('Dom', 'list', null, 'expense');
    expect(html).toContain('cat-icon-wrap--list');
  });

  it('wariant "chip" dodaje klasę --chip', () => {
    const html = renderCategoryIcon('Dom', 'chip', null, 'expense');
    expect(html).toContain('cat-icon-wrap--chip');
  });

  it('wariant "grid" nie dodaje --list ani --chip', () => {
    const html = renderCategoryIcon('Dom', 'grid', null, 'expense');
    expect(html).not.toContain('--list');
    expect(html).not.toContain('--chip');
  });

  it('zawiera ścieżkę SVG kategorii', () => {
    const html = renderCategoryIcon('Zakupy', 'grid', null, 'expense');
    expect(html).toContain(categoryIconPaths['Zakupy'].substring(0, 10));
  });
});

// ---------------------------------------------------------------------------
// getRecentCategories
// ---------------------------------------------------------------------------
describe('getRecentCategories', () => {
  it('zwraca pustą tablicę gdy localStorage jest pusty', () => {
    expect(getRecentCategories('expense')).toEqual([]);
  });

  it('zwraca tylko wpisy pasującego type', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify([
      { type: 'expense', mainCategory: 'Dom', subCategory: 'Czynsz' },
      { type: 'income', mainCategory: 'Wynagrodzenie', subCategory: 'Podstawa' }
    ]));
    expect(getRecentCategories('expense')).toHaveLength(1);
    expect(getRecentCategories('income')).toHaveLength(1);
  });

  it('zwraca maksymalnie MAX_RECENT_CATEGORIES (5) wyników', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      type: 'expense', mainCategory: 'Dom', subCategory: `Sub${i}`
    }));
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(many));
    expect(getRecentCategories('expense')).toHaveLength(MAX_RECENT_CATEGORIES);
  });

  it('zwraca pustą tablicę dla zepsutego JSON', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, '{nie-json}');
    expect(getRecentCategories('expense')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addRecentCategory
// ---------------------------------------------------------------------------
describe('addRecentCategory', () => {
  it('dodaje nowy wpis', () => {
    addRecentCategory('expense', 'Dom', 'Czynsz');
    const recents = getRecentCategories('expense');
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ type: 'expense', mainCategory: 'Dom', subCategory: 'Czynsz' });
  });

  it('normalizuje podkategorię przy zapisie ostatniej kategorii', () => {
    addRecentCategory('expense', 'Zakupy', 'Zakupy');
    const recents = getRecentCategories('expense');
    expect(recents[0].subCategory).toBe('Zakupy');
  });

  it('dodaje na początku (unshift)', () => {
    addRecentCategory('expense', 'Dom', 'Czynsz');
    addRecentCategory('expense', 'Zakupy', 'Zakupy');
    const recents = getRecentCategories('expense');
    expect(recents[0].mainCategory).toBe('Zakupy');
  });

  it('de-duplikuje istniejący wpis (przesuwa na górę)', () => {
    addRecentCategory('expense', 'Dom', 'Czynsz');
    addRecentCategory('expense', 'Zakupy', 'Zakupy');
    addRecentCategory('expense', 'Dom', 'Czynsz'); // powtórzone
    const recents = getRecentCategories('expense');
    const domCount = recents.filter((r) => r.mainCategory === 'Dom').length;
    expect(domCount).toBe(1);
    expect(recents[0].mainCategory).toBe('Dom');
  });

  it('przechowuje wpisy różnych typów razem', () => {
    addRecentCategory('expense', 'Dom', 'Czynsz');
    addRecentCategory('income', 'Wynagrodzenie', 'Podstawa');
    expect(getRecentCategories('expense')).toHaveLength(1);
    expect(getRecentCategories('income')).toHaveLength(1);
  });

  it('oddziela ostatnie wpisy dla każdej zakładki formularza', () => {
    addRecentCategory('expense', 'Dom', 'Czynsz');
    addRecentCategory('income', 'Wynagrodzenie', 'Podstawa');
    addRecentLoan('loan-a');
    addRecentCard('card-a', 'repayment');
    addRecentCard('card-a', 'transfer_out');
    expect(getRecentCategories('expense')).toHaveLength(1);
    expect(getRecentCategories('income')).toHaveLength(1);
    expect(getRecentLoans()).toHaveLength(1);
    expect(getRecentCards()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// migrateRecentCategories
// ---------------------------------------------------------------------------
describe('migrateRecentCategories', () => {
  it('zmienia mainCategory według mainMap', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify([
      { type: 'expense', mainCategory: 'Komunikacja', subCategory: 'MPK' }
    ]));
    migrateRecentCategories({ Komunikacja: 'Transport' }, [], 'expense');
    const recents = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY));
    expect(recents[0].mainCategory).toBe('Transport');
  });

  it('zmienia subCategory według subRenames', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify([
      { type: 'expense', mainCategory: 'Dom', subCategory: 'StaryNazwa' }
    ]));
    migrateRecentCategories({}, [{ oldMain: 'Dom', oldSub: 'StaryNazwa', newSub: 'Czynsz' }], 'expense');
    const recents = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY));
    expect(recents[0].subCategory).toBe('Czynsz');
  });

  it('nie dotyka wpisów innego type', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify([
      { type: 'income', mainCategory: 'Komunikacja', subCategory: 'X' }
    ]));
    migrateRecentCategories({ Komunikacja: 'Transport' }, [], 'expense');
    const recents = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY));
    expect(recents[0].mainCategory).toBe('Komunikacja'); // nie zmienione
  });

  it('nie zapisuje localStorage gdy brak zmian', () => {
    const original = JSON.stringify([
      { type: 'expense', mainCategory: 'Dom', subCategory: 'Czynsz' }
    ]);
    localStorage.setItem(RECENT_CATEGORIES_KEY, original);
    migrateRecentCategories({}, [], 'expense');
    expect(localStorage.getItem(RECENT_CATEGORIES_KEY)).toBe(original);
  });

  it('obsługuje zepsute dane w localStorage bez rzucania błędu', () => {
    localStorage.setItem(RECENT_CATEGORIES_KEY, 'nie-json{{');
    expect(() => migrateRecentCategories({ A: 'B' }, [], 'expense')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getChartSliceColors
// ---------------------------------------------------------------------------
describe('getChartSliceColors', () => {
  it('zwraca tablicę o długości labels', () => {
    const colors = getChartSliceColors(['Dom', 'Zakupy', 'Transport'], 'expense');
    expect(colors).toHaveLength(3);
  });

  it('zwraca znane kolory dla znanych kategorii', () => {
    globalThis.isLightTheme = () => true;
    const colors = getChartSliceColors(['Dom'], 'expense');
    expect(colors[0]).toBe(chartCategoryColorsLight['Dom']);
  });

  it('zwraca kolor fallback (hsl) dla nieznanej kategorii', () => {
    const colors = getChartSliceColors(['NieznanaKategoria'], 'expense');
    expect(colors[0]).toMatch(/^hsl\(/);
  });

  it('używa kolorów income dla type=income', () => {
    globalThis.isLightTheme = () => true;
    const incomeColors = getChartSliceColors(['Wynagrodzenie'], 'income');
    expect(incomeColors[0]).toBe(incomeChartCategoryColorsLight['Wynagrodzenie']);
  });

  it('działa gdy activeChartCategory jest ustawione', () => {
    _setActiveChartCategory('Dom');
    const colors = getChartSliceColors(['Czynsz', 'Meble'], 'expense');
    expect(colors).toHaveLength(2);
    _setActiveChartCategory(null);
  });

  it('zwraca pustą tablicę dla pustych labels', () => {
    expect(getChartSliceColors([], 'expense')).toEqual([]);
  });
});

describe('resolveRecentCategoryPair', () => {
  it('uzupełnia brakującą podkategorię dla kategorii bez podkategorii', () => {
    const resolved = resolveRecentCategoryPair({ type: 'income', mainCategory: 'Inne' });
    expect(resolved).toMatchObject({
      mainCategory: 'Inne',
      subCategory: '[Bez podkategorii]'
    });
  });

  it('zachowuje poprawną podkategorię Zakupy', () => {
    const resolved = resolveRecentCategoryPair({ type: 'expense', mainCategory: 'Zakupy', subCategory: 'Zakupy' });
    expect(resolved?.subCategory).toBe('Zakupy');
  });
});
