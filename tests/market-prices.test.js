/**
 * Testy jednostkowe dla js/market-prices.js
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
  };
  globalThis.document = {
    getElementById: () => ({ classList: { contains: () => false } })
  };
  globalThis.EUR_PLN_RATE = 4.32;
  globalThis.getActiveAssets = () => [];
  globalThis.updateAssetInState = () => {};
  globalThis.saveState = () => {};
  globalThis.renderAssets = () => {};
  globalThis.renderReports = () => {};
  globalThis.roundAssetPrice = (v) => Math.round(v * 1000000) / 1000000;

  loadScript('js/market-prices.js');
});

beforeEach(() => {
  localStorage.clear();
});

describe('resolveYahooSymbol', () => {
  it('mapuje znane tickery GPW i XETRA', () => {
    expect(resolveYahooSymbol('ARTGAMES')).toBe('ARG.WA');
    expect(resolveYahooSymbol('AIGAMES')).toBe('ALG.WA');
    expect(resolveYahooSymbol('CDPROJEKT')).toBe('CDR.WA');
    expect(resolveYahooSymbol('VWCE')).toBe('VWCE.DE');
  });

  it('pomija ARTGAMES-NC bez notowań Yahoo', () => {
    expect(resolveYahooSymbol('ARTGAMES-NC')).toBeNull();
  });

  it('domyślnie dodaje .WA dla nieznanych tickerów GPW', () => {
    expect(resolveYahooSymbol('FOO')).toBe('FOO.WA');
  });
});

describe('convertQuoteToAssetCurrency', () => {
  it('zwraca PLN bez konwersji', () => {
    expect(convertQuoteToAssetCurrency({ price: 217.4, currency: 'PLN' }, 'PLN', 4.3)).toBe(217.4);
  });

  it('przelicza EUR na PLN', () => {
    expect(convertQuoteToAssetCurrency({ price: 100, currency: 'EUR' }, 'PLN', 4.3)).toBe(430);
  });

  it('przelicza EUR na PLN dla aktywa w PLN', () => {
    expect(convertQuoteToAssetCurrency({ price: 163.7, currency: 'EUR' }, 'PLN', 4.2869))
      .toBeCloseTo(701.76, 1);
  });
});

describe('applyInvestmentPriceUpdates', () => {
  it('aktualizuje currentPrice dla pasujących tickerów', () => {
    const assets = [{
      id: 'a1',
      type: 'investment',
      ticker: 'CDPROJEKT',
      quantity: 10,
      purchasePrice: 200,
      currentPrice: 210,
      currency: 'PLN',
      archived: false
    }];
    globalThis.getActiveAssets = () => assets;
    globalThis.updateAssetInState = (asset) => {
      Object.assign(assets[0], asset);
    };

    const updated = applyInvestmentPriceUpdates({
      CDPROJEKT: { price: 217.4, currency: 'PLN' }
    }, 4.3);

    expect(updated).toBe(1);
    expect(assets[0].currentPrice).toBe(217.4);
  });
});

describe('shouldRefreshMarketPrices', () => {
  it('pomija odświeżanie przed upływem godziny', () => {
    localStorage.setItem('marketPricesLastRefresh', String(Date.now()));
    expect(shouldRefreshMarketPrices(false)).toBe(false);
  });

  it('wymusza odświeżanie po force=true', () => {
    localStorage.setItem('marketPricesLastRefresh', String(Date.now()));
    expect(shouldRefreshMarketPrices(true)).toBe(true);
  });
});
