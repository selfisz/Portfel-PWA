const MARKET_PRICE_REFRESH_MS = 60 * 60 * 1000;
const MARKET_PRICE_STORAGE_KEY = 'marketPricesLastRefresh';

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

let marketPriceRefreshTimer = null;

function resolveYahooSymbol(ticker) {
    const upper = (ticker || '').trim().toUpperCase();
    if (!upper) return null;

    if (Object.prototype.hasOwnProperty.call(YAHOO_SYMBOL_BY_TICKER, upper)) {
        return YAHOO_SYMBOL_BY_TICKER[upper];
    }

    const cleaned = upper.replace(/[^A-Z0-9]/g, '');
    return cleaned ? `${cleaned}.WA` : null;
}

function convertQuoteToAssetCurrency(quote, assetCurrency, eurPln) {
    if (!quote || typeof quote.price !== 'number' || quote.price <= 0) return null;

    const target = assetCurrency === 'EUR' ? 'EUR' : 'PLN';
    const quoteCurrency = quote.currency || 'PLN';

    if (quoteCurrency === target) return quote.price;
    if (quoteCurrency === 'EUR' && target === 'PLN') return quote.price * eurPln;
    if (quoteCurrency === 'PLN' && target === 'EUR' && eurPln > 0) return quote.price / eurPln;
    return null;
}

async function fetchNbpEurPln() {
    const res = await fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json');
    if (!res.ok) return null;
    const data = await res.json();
    const mid = data?.rates?.[0]?.mid;
    return typeof mid === 'number' && mid > 0 ? mid : null;
}

async function fetchYahooQuote(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) {
        return null;
    }

    return {
        price: meta.regularMarketPrice,
        currency: meta.currency || 'PLN'
    };
}

function shouldRefreshMarketPrices(force) {
    if (force) return true;
    const lastRefresh = parseInt(localStorage.getItem(MARKET_PRICE_STORAGE_KEY) || '0', 10);
    return !lastRefresh || (Date.now() - lastRefresh) >= MARKET_PRICE_REFRESH_MS;
}

function markMarketPricesRefreshed() {
    try {
        localStorage.setItem(MARKET_PRICE_STORAGE_KEY, String(Date.now()));
    } catch (err) {
        console.warn('marketPricesLastRefresh', err);
    }
}

function applyInvestmentPriceUpdates(priceByTicker, eurPln) {
    if (typeof getActiveAssets !== 'function' || typeof updateAssetInState !== 'function') {
        return 0;
    }

    let updated = 0;
    getActiveAssets()
        .filter((asset) => asset.type === 'investment' && asset.ticker && !asset.archived)
        .forEach((asset) => {
            const ticker = asset.ticker.toUpperCase();
            const quote = priceByTicker[ticker];
            if (!quote) return;

            const nextPrice = convertQuoteToAssetCurrency(quote, asset.currency, eurPln);
            if (nextPrice == null || nextPrice <= 0) return;

            const rounded = typeof roundAssetPrice === 'function'
                ? roundAssetPrice(nextPrice)
                : Math.round(nextPrice * 1000000) / 1000000;

            if (Math.abs(rounded - asset.currentPrice) < 0.000001) return;
            updateAssetInState({ ...asset, currentPrice: rounded });
            updated += 1;
        });

    return updated;
}

async function refreshInvestmentPrices(options = {}) {
    const force = options.force === true;
    if (!shouldRefreshMarketPrices(force)) {
        return { skipped: true, updated: 0 };
    }

    if (typeof getActiveAssets !== 'function') {
        return { skipped: true, updated: 0 };
    }

    const investments = getActiveAssets()
        .filter((asset) => asset.type === 'investment' && asset.ticker && !asset.archived);

    if (!investments.length) {
        markMarketPricesRefreshed();
        return { skipped: false, updated: 0 };
    }

    const uniqueTickers = [...new Set(investments.map((asset) => asset.ticker.toUpperCase()))];
    let eurPln = typeof EUR_PLN_RATE === 'number' && EUR_PLN_RATE > 0 ? EUR_PLN_RATE : 4.32;

    try {
        const nbpRate = await fetchNbpEurPln();
        if (nbpRate) {
            EUR_PLN_RATE = nbpRate;
            eurPln = nbpRate;
        }
    } catch (err) {
        console.warn('NBP EUR/PLN', err);
    }

    const priceByTicker = {};
    await Promise.all(uniqueTickers.map(async (ticker) => {
        const symbol = resolveYahooSymbol(ticker);
        if (!symbol) return;
        try {
            const quote = await fetchYahooQuote(symbol);
            if (quote) priceByTicker[ticker] = quote;
        } catch (err) {
            console.warn(`Yahoo quote ${ticker}`, err);
        }
    }));

    const updated = applyInvestmentPriceUpdates(priceByTicker, eurPln);
    markMarketPricesRefreshed();

    if (updated > 0) {
        if (typeof saveState === 'function') saveState();
        if (typeof renderAssets === 'function') renderAssets();
        if (typeof renderReports === 'function'
            && document.getElementById('view-reports')?.classList.contains('active')) {
            renderReports();
        }
    }

    return {
        skipped: false,
        updated,
        quoted: Object.keys(priceByTicker).length
    };
}

function scheduleMarketPriceRefresh() {
    refreshInvestmentPrices().catch((err) => console.warn('market prices init', err));

    if (marketPriceRefreshTimer) {
        clearInterval(marketPriceRefreshTimer);
    }

    marketPriceRefreshTimer = setInterval(() => {
        refreshInvestmentPrices().catch((err) => console.warn('market prices interval', err));
    }, MARKET_PRICE_REFRESH_MS);
}
