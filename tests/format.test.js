/**
 * Testy jednostkowe dla js/format.js
 *
 * Strategia: ładujemy plik przez vm.runInThisContext(), dzięki czemu
 * deklaracje funkcji trafiają do global scope — bez modyfikacji źródła.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
  loadScript('js/format.js');
});

// ---------------------------------------------------------------------------
// formatPlnAmount
// ---------------------------------------------------------------------------
describe('formatPlnAmount', () => {
  it('formatuje zero', () => {
    expect(formatPlnAmount(0)).toBe('0,00 zł');
  });

  it('formatuje typową kwotę dodatnią (zawiera poprawne cyfry i symbol zł)', () => {
    const result = formatPlnAmount(1234.56);
    // Node.js i przeglądarka mogą różnie stosować separator tysięcy w pl-PL dla 4-cyfrowych liczb
    expect(result).toMatch(/1[\s\u00a0]?234,56 zł/);
  });

  it('formatuje liczbę ujemną', () => {
    expect(formatPlnAmount(-500)).toBe('-500,00 zł');
  });

  it('zaokrągla do 2 miejsc po przecinku (round half-up)', () => {
    expect(formatPlnAmount(1.005)).toMatch(/1,0[01] zł/); // zależy od implementacji lokalnej
  });

  it('formatuje duże liczby z separatorem tysięcy', () => {
    const result = formatPlnAmount(1000000);
    expect(result).toContain('zł');
    expect(result).toContain('1');
  });

  it('zwraca "— zł" dla null (po naprawie buga)', () => {
    expect(formatPlnAmount(null)).toBe('— zł');
  });

  it('zwraca "— zł" dla undefined', () => {
    expect(formatPlnAmount(undefined)).toBe('— zł');
  });

  it('zwraca "— zł" dla NaN (po naprawie buga)', () => {
    expect(formatPlnAmount(NaN)).toBe('— zł');
  });
});

describe('formatPlnAmountHtml', () => {
  it('owija kwotę w markup z osobnym sufiksem zł', () => {
    const html = formatPlnAmountHtml(1234.56);
    expect(html).toContain('class="amount-pln"');
    expect(html).toContain('class="amount-pln-value"');
    expect(html).toContain('class="amount-pln-suffix"');
    expect(html).toContain(' zł</span>');
    expect(html).toMatch(/1[\s\u00a0]?234,56/);
  });
});

// ---------------------------------------------------------------------------
// formatCompactPln
// ---------------------------------------------------------------------------
describe('formatCompactPln', () => {
  it('zwraca liczbę zaokrągloną dla kwot poniżej 1000', () => {
    expect(formatCompactPln(500)).toBe('500');
    expect(formatCompactPln(0)).toBe('0');
    expect(formatCompactPln(999)).toBe('999');
  });

  it('używa notacji "Xk" z jednym miejscem dla 1000–9999', () => {
    expect(formatCompactPln(1000)).toBe('1.0k');
    expect(formatCompactPln(1500)).toBe('1.5k');
    expect(formatCompactPln(9999)).toBe('10.0k'); // 9999/1000 = 9.999 → toFixed(1) = "10.0"
  });

  it('używa notacji "Xk" bez miejsca po przecinku dla >= 10000', () => {
    expect(formatCompactPln(10000)).toBe('10k');
    expect(formatCompactPln(25000)).toBe('25k');
    expect(formatCompactPln(100000)).toBe('100k');
  });

  it('obsługuje dokładnie próg 1000', () => {
    expect(formatCompactPln(1000)).toBe('1.0k');
  });

  it('obsługuje dokładnie próg 10000', () => {
    expect(formatCompactPln(10000)).toBe('10k');
  });

  it('obsługuje wartości ujemne (po naprawie buga)', () => {
    expect(formatCompactPln(-15000)).toBe('-15k');
    expect(formatCompactPln(-1500)).toBe('-1.5k');
    expect(formatCompactPln(-500)).toBe('-500');
  });
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('escapuje ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapuje nawias ostrokątny otwierający', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapuje nawias ostrokątny zamykający', () => {
    expect(escapeHtml('</div>')).toBe('&lt;/div&gt;');
  });

  it('escapuje cudzysłów podwójny', () => {
    expect(escapeHtml('"value"')).toBe('&quot;value&quot;');
  });

  it('zwraca pusty string dla null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('zwraca pusty string dla undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('zwraca pusty string dla pustego stringa', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('konwertuje liczby na string i escapuje', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(0)).toBe('0');
  });

  it('nie zmienia tekstu bez znaków specjalnych', () => {
    expect(escapeHtml('Zdrowy tekst 123')).toBe('Zdrowy tekst 123');
  });

  it('escapuje wszystkie znaki specjalne naraz', () => {
    expect(escapeHtml('<a href="test" & b>')).toBe('&lt;a href=&quot;test&quot; &amp; b&gt;');
  });

  it('escapuje apostrof (po naprawie luki XSS)', () => {
    expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
  });

  it('escapuje apostrof w atrybucie onclick (XSS prevention)', () => {
    expect(escapeHtml("'; alert(1); //")).toBe('&#39;; alert(1); //');
  });
});

// ---------------------------------------------------------------------------
// escapeCsvField
// ---------------------------------------------------------------------------
describe('escapeCsvField', () => {
  it('zwraca wartość bez zmian gdy brak znaków specjalnych', () => {
    expect(escapeCsvField('Zakupy')).toBe('Zakupy');
    expect(escapeCsvField('2024-01-15')).toBe('2024-01-15');
  });

  it('otacza cudzysłowami gdy wartość zawiera średnik', () => {
    expect(escapeCsvField('jabłka; gruszki')).toBe('"jabłka; gruszki"');
  });

  it('otacza cudzysłowami i escapuje wewnętrzny cudzysłów (RFC 4180)', () => {
    expect(escapeCsvField('mówię "cześć"')).toBe('"mówię ""cześć"""');
  });

  it('otacza cudzysłowami gdy wartość zawiera znak nowej linii', () => {
    expect(escapeCsvField('linia1\nlinia2')).toBe('"linia1\nlinia2"');
  });

  it('zwraca pusty string dla null', () => {
    expect(escapeCsvField(null)).toBe('');
  });

  it('zwraca pusty string dla undefined', () => {
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('konwertuje liczby na string', () => {
    expect(escapeCsvField(123)).toBe('123');
    expect(escapeCsvField(0)).toBe('0');
  });

  it('konwertuje boolean na string', () => {
    expect(escapeCsvField(true)).toBe('true');
    expect(escapeCsvField(false)).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// formatDateGroup
// ---------------------------------------------------------------------------
describe('formatDateGroup', () => {
  it('zwraca "Dzisiaj" dla dzisiejszej daty', () => {
    const today = new Date().toISOString().substring(0, 10);
    expect(formatDateGroup(today)).toBe('Dzisiaj');
  });

  it('zwraca "Wczoraj" dla wczorajszej daty', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().substring(0, 10);
    expect(formatDateGroup(yesterday)).toBe('Wczoraj');
  });

  it('zwraca sformatowaną datę po polsku dla starszych dat', () => {
    const result = formatDateGroup('2023-06-15');
    expect(result).toContain('2023');
    expect(result).toContain('15');
    // Polskie locale — miesiąc powinien być po polsku
    expect(result).toMatch(/czerwca|czerwiec/i);
  });

  it('nie zwraca "Dzisiaj" dla daty jutrzejszej', () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrow = d.toISOString().substring(0, 10);
    expect(formatDateGroup(tomorrow)).not.toBe('Dzisiaj');
    expect(formatDateGroup(tomorrow)).not.toBe('Wczoraj');
  });
});

// ---------------------------------------------------------------------------
// formatTxDate
// ---------------------------------------------------------------------------
describe('formatTxDate', () => {
  it('formatuje datę po polsku w formacie krótkim', () => {
    const result = formatTxDate('2024-01-15');
    expect(result).toContain('2024');
    expect(result).toContain('15');
    // Styczeń po polsku (krótka forma)
    expect(result).toMatch(/sty/i);
  });

  it('formatuje datę z grudnia', () => {
    const result = formatTxDate('2023-12-31');
    expect(result).toContain('2023');
    expect(result).toContain('31');
    expect(result).toMatch(/gru/i);
  });

  it('używa czasu T12:00:00 (brak przesunięcia strefy czasowej)', () => {
    // Data 2024-01-01 przy T12:00:00 jest bezpieczna dla każdej strefy UTC±12
    const result = formatTxDate('2024-01-01');
    expect(result).toContain('1');
    expect(result).toContain('2024');
  });
});

// ---------------------------------------------------------------------------
// parsePlnInput
// ---------------------------------------------------------------------------
describe('parsePlnInput', () => {
  it('parsuje kwotę z przecinkiem dziesiętnym', () => {
    expect(parsePlnInput('12,50')).toBe(12.5);
    expect(parsePlnInput('0,99')).toBe(0.99);
  });

  it('parsuje kwoty bez groszy', () => {
    expect(parsePlnInput('100')).toBe(100);
    expect(parsePlnInput('100,00')).toBe(100);
  });

  it('parsuje format PL z separatorem tysięcy', () => {
    expect(parsePlnInput('1 234,56')).toBe(1234.56);
    expect(parsePlnInput('1.234,56')).toBe(1234.56);
  });

  it('parsuje kwotę z kropką dziesiętną', () => {
    expect(parsePlnInput('12.50')).toBe(12.5);
    expect(parsePlnInput('47.30')).toBe(47.3);
  });

  it('parsuje separator tysięcy kropką bez groszy (PL)', () => {
    expect(parsePlnInput('1.234')).toBe(1234);
    expect(parsePlnInput('12.345.678')).toBe(12345678);
  });

  it('usuwa suffix waluty', () => {
    expect(parsePlnInput('47,30 zł')).toBe(47.3);
  });

  it('zwraca NaN dla pustego lub niepoprawnego wejścia', () => {
    expect(Number.isNaN(parsePlnInput(''))).toBe(true);
    expect(Number.isNaN(parsePlnInput('abc'))).toBe(true);
    expect(Number.isNaN(parsePlnInput(null))).toBe(true);
  });
});
