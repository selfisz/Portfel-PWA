/**
 * Test integracyjny — prawdziwe zapytania do NBP i Yahoo Finance.
 * Uruchom: npm run test:market-live
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

const PORTFOLIO_TICKERS = [
  'ARTGAMES',
  'AIGAMES',
  'CDPROJEKT',
  'ETFBNDXPL',
  'ETFBTBSP',
  'VWCE',
  'EUNA',
  'L8I3'
];

beforeAll(() => {
  globalThis.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = String(v); },
    removeItem(k) { delete this._store[k]; }
  };
  globalThis.EUR_PLN_RATE = 4.32;
  loadScript('js/market-prices.js');
});

describe('market-prices live API', () => {
  it('pobiera kurs EUR/PLN z NBP', async () => {
    const rate = await fetchNbpEurPln();
    expect(rate).toBeTypeOf('number');
    expect(rate).toBeGreaterThan(4);
    expect(rate).toBeLessThan(6);
  }, 15000);

  it.each(PORTFOLIO_TICKERS)('pobiera notowanie Yahoo dla %s', async (ticker) => {
    const symbol = resolveYahooSymbol(ticker);
    expect(symbol).toBeTruthy();

    const quote = await fetchYahooQuote(symbol);
    expect(quote).not.toBeNull();
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.currency).toMatch(/PLN|EUR/);
  }, 15000);

  it('ARTGAMES-NC nie ma mapowania Yahoo (kurs ręczny)', () => {
    expect(resolveYahooSymbol('ARTGAMES-NC')).toBeNull();
  });

  it('przelicza VWCE z EUR na PLN', async () => {
    const eurPln = await fetchNbpEurPln();
    const quote = await fetchYahooQuote('VWCE.DE');
    expect(quote).not.toBeNull();

    const plnPrice = convertQuoteToAssetCurrency(quote, 'PLN', eurPln);
    expect(plnPrice).toBeGreaterThan(100);
    expect(plnPrice).toBeLessThan(2000);
  }, 15000);
});
