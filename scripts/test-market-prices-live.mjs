#!/usr/bin/env node
/**
 * Test na żywo: NBP + Yahoo Finance dla tickerów z portfela.
 * Uruchom: npm run test:market-live
 */
const TICKERS = [
  'ARTGAMES',
  'ARTGAMES-NC',
  'AIGAMES',
  'CDPROJEKT',
  'ETFBNDXPL',
  'ETFBTBSP',
  'VWCE',
  'EUNA',
  'L8I3'
];

const YAHOO_SYMBOL_BY_TICKER = {
  ARTGAMES: 'ARG.WA',
  'ARTGAMES-NC': null,
  AIGAMES: 'ALG.WA',
  CDPROJEKT: 'CDR.WA',
  ETFBNDXPL: 'ETFBNDXPL.WA',
  ETFBTBSP: 'ETFBTBSP.WA',
  VWCE: 'VWCE.DE',
  EUNA: 'EUNA.DE',
  L8I3: 'L8I3.DE'
};

function resolveYahooSymbol(ticker) {
  const upper = ticker.trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(YAHOO_SYMBOL_BY_TICKER, upper)) {
    return YAHOO_SYMBOL_BY_TICKER[upper];
  }
  const cleaned = upper.replace(/[^A-Z0-9]/g, '');
  return cleaned ? `${cleaned}.WA` : null;
}

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) return { error: 'brak ceny' };
  return { price: meta.regularMarketPrice, currency: meta.currency || 'PLN' };
}

async function fetchNbpEurPln() {
  const res = await fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json');
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const data = await res.json();
  const mid = data?.rates?.[0]?.mid;
  const date = data?.rates?.[0]?.effectiveDate;
  if (typeof mid !== 'number') return { error: 'brak kursu' };
  return { price: mid, date };
}

console.log('=== TEST POBIERANIA KURSÓW (live) ===\n');

const nbp = await fetchNbpEurPln();
if (nbp.error) {
  console.error('NBP EUR/PLN: FAIL', nbp.error);
  process.exit(1);
}
console.log(`NBP EUR/PLN: ${nbp.price} (${nbp.date})`);

console.log('\nYahoo Finance:');
let ok = 0;
let fail = 0;
let skip = 0;

for (const ticker of TICKERS) {
  const symbol = resolveYahooSymbol(ticker);
  if (!symbol) {
    console.log(`  ${ticker.padEnd(14)} SKIP (brak mapowania Yahoo)`);
    skip += 1;
    continue;
  }

  const quote = await fetchYahooQuote(symbol);
  if (quote.error) {
    console.log(`  ${ticker.padEnd(14)} FAIL ${symbol} -> ${quote.error}`);
    fail += 1;
  } else {
    const plnHint = quote.currency === 'EUR'
      ? ` (~${(quote.price * nbp.price).toFixed(2)} PLN)`
      : '';
    console.log(`  ${ticker.padEnd(14)} OK   ${symbol} -> ${quote.price} ${quote.currency}${plnHint}`);
    ok += 1;
  }

  await new Promise((r) => setTimeout(r, 150));
}

console.log(`\nPodsumowanie: ${ok} OK, ${fail} FAIL, ${skip} SKIP`);

if (fail > 0 || ok === 0) {
  process.exit(1);
}
