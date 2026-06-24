const EUR_PLN_RATE = 4.32;

function convertToPln(amount, currency = 'PLN') {
    return currency === 'EUR' ? amount * EUR_PLN_RATE : amount;
}

function getAssetValuePln(asset) {
    return convertToPln(asset.quantity * asset.currentPriceManual, asset.currency);
}

function getPortfolioValuePln() {
    return (appState.investments || []).reduce((sum, asset) => sum + getAssetValuePln(asset), 0);
}

function getLoanCapitalLeft() {
    return appState.loan?.currentCapitalLeft || 0;
}

function getLoanTotalAmount() {
    return appState.loan?.totalAmount || 0;
}

function getLoanPaidPercent() {
    const total = getLoanTotalAmount();
    if (!total) return 0;
    return ((total - getLoanCapitalLeft()) / total) * 100;
}

function calcNetWorthPln() {
    return getPortfolioValuePln() - getLoanCapitalLeft();
}
