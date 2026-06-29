const MARKET_PRICE_STORAGE_KEY = 'marketPricesLastRefresh';

const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

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

let marketPriceRefreshInFlight = false;

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

function parseMarketQuoteResponse(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.price === 'number' && data.price > 0) {
        return { price: data.price, currency: data.currency || 'PLN' };
    }
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) {
        return null;
    }
    return {
        price: meta.regularMarketPrice,
        currency: meta.currency || 'PLN'
    };
}

function buildYahooChartUrl(symbol) {
    return `${YAHOO_CHART_BASE}${encodeURIComponent(symbol)}?interval=1d&range=1d`;
}

function wrapUrlWithCorsProxies(targetUrl) {
    const encoded = encodeURIComponent(targetUrl);
    return [
        `https://corsproxy.io/?${encoded}`,
        `https://api.allorigins.win/raw?url=${encoded}`
    ];
}

function shouldFetchQuotesViaBrowserProxy() {
    return typeof window !== 'undefined';
}

async function fetchNbpEurPln() {
    const res = await fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json');
    if (!res.ok) return null;
    const data = await res.json();
    const mid = data?.rates?.[0]?.mid;
    return typeof mid === 'number' && mid > 0 ? mid : null;
}

async function fetchYahooQuoteDirect(symbol) {
    const res = await fetch(buildYahooChartUrl(symbol), { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return parseMarketQuoteResponse(data);
}

async function fetchYahooQuoteViaCorsProxy(symbol) {
    const targetUrl = buildYahooChartUrl(symbol);
    for (const proxyUrl of wrapUrlWithCorsProxies(targetUrl)) {
        try {
            const res = await fetch(proxyUrl, { headers: { Accept: 'application/json' } });
            if (!res.ok) continue;
            const data = await res.json();
            const quote = parseMarketQuoteResponse(data);
            if (quote) return quote;
        } catch (err) {
            console.warn('cors proxy quote', proxyUrl, err);
        }
    }
    return null;
}

async function fetchYahooQuote(symbol) {
    if (shouldFetchQuotesViaBrowserProxy()) {
        return fetchYahooQuoteViaCorsProxy(symbol);
    }
    return fetchYahooQuoteDirect(symbol);
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
    if (typeof getActiveAssets !== 'function') {
        return { skipped: true, updated: 0, quoted: 0 };
    }

    const investments = getActiveAssets()
        .filter((asset) => asset.type === 'investment' && asset.ticker && !asset.archived);

    if (!investments.length) {
        return { skipped: false, updated: 0, quoted: 0 };
    }

    const uniqueTickers = [...new Set(investments.map((asset) => asset.ticker.toUpperCase()))];
    const mappableTickers = uniqueTickers.filter((ticker) => resolveYahooSymbol(ticker));
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
    await Promise.all(mappableTickers.map(async (ticker) => {
        const symbol = resolveYahooSymbol(ticker);
        if (!symbol) return;
        try {
            const quote = await fetchYahooQuote(symbol);
            if (quote) priceByTicker[ticker] = quote;
        } catch (err) {
            console.warn(`quote ${ticker}`, err);
        }
    }));

    const quoted = Object.keys(priceByTicker).length;
    if (quoted > 0) {
        markMarketPricesRefreshed();
    }

    const updated = applyInvestmentPriceUpdates(priceByTicker, eurPln);

    if (updated > 0) {
        if (typeof saveState === 'function') saveState();
        if (typeof renderAssets === 'function') renderAssets();
        if (typeof renderReports === 'function'
            && document.getElementById('view-reports')?.classList.contains('active')) {
            renderReports();
        }
    } else if (quoted > 0 && typeof renderAssets === 'function') {
        renderAssets();
    }

    return {
        skipped: false,
        updated,
        quoted,
        failed: mappableTickers.length > 0 && quoted === 0
    };
}

async function refreshInvestmentPricesManual() {
    if (marketPriceRefreshInFlight) return;
    marketPriceRefreshInFlight = true;

    const btn = document.getElementById('btn-refresh-market-prices');
    const prevLabel = btn?.textContent;
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Pobieranie…';
    }

    try {
        const result = await refreshInvestmentPrices();
        if (typeof showSettingsToast !== 'function') return;

        if (result.failed) {
            showSettingsToast('Nie udało się pobrać kursów — spróbuj za chwilę', 'error');
        } else if (result.updated > 0) {
            showSettingsToast(`Zaktualizowano kursy (${result.updated} poz.)`);
        } else if (result.quoted > 0) {
            showSettingsToast('Kursy bez zmian');
        } else {
            showSettingsToast('Brak notowań do pobrania');
        }
    } catch (err) {
        console.warn('refreshInvestmentPricesManual', err);
        if (typeof showSettingsToast === 'function') {
            showSettingsToast('Błąd pobierania kursów', 'error');
        }
    } finally {
        marketPriceRefreshInFlight = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = prevLabel || 'Pobierz kursy';
        }
        updateMarketPricesRefreshHint();
    }
}

function formatMarketPricesLastRefresh() {
    const ts = parseInt(localStorage.getItem(MARKET_PRICE_STORAGE_KEY) || '0', 10);
    if (!ts) return '';
    try {
        return new Date(ts).toLocaleString('pl-PL', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return '';
    }
}

function updateMarketPricesRefreshHint() {
    const hint = document.getElementById('assets-market-refresh-hint');
    if (!hint) return;
    const last = formatMarketPricesLastRefresh();
    hint.textContent = last
        ? `Ostatnio: ${last} · Yahoo (opóźnione)`
        : 'Pobierz kursy z Yahoo · ARTGAMES-NC tylko ręcznie';
}

function scheduleMarketPriceRefresh() {
    updateMarketPricesRefreshHint();
}
