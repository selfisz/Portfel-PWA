function renderInvestments() {
    const list = document.getElementById('assets-list');
    const select = document.getElementById('update-asset-select');
    list.innerHTML = '';
    select.innerHTML = '';
    appState.investments.forEach((asset, idx) => {
        const currentVal = asset.quantity * asset.currentPriceManual;
        const costVal = asset.quantity * asset.purchasePrice;
        const profitPct = ((currentVal - costVal) / costVal) * 100;
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `<div class="tx-info"><div style="font-weight:700; font-size:0.95rem;">${asset.ticker}</div><div style="font-size:0.75rem; color:var(--text-muted);">${asset.name}</div><div style="font-size:0.75rem; color:var(--text-muted);">${asset.quantity} szt. • Średnia: ${asset.purchasePrice.toFixed(2)} ${asset.currency}</div></div><div style="text-align:right;"><div style="font-weight:700; font-size:0.95rem;">${currentVal.toFixed(2)} ${asset.currency}</div><div style="font-size:0.8rem; font-weight:700; color:${profitPct >= 0 ? 'var(--success)' : 'var(--danger)'}">${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%</div></div>`;
        list.appendChild(row);
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = asset.ticker;
        select.appendChild(opt);
    });
    document.getElementById('portfolio-value').innerText = `${getPortfolioValuePln().toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN`;
}

function updateAssetPriceManual() {
    const idx = document.getElementById('update-asset-select').value;
    const newPrice = parseFloat(document.getElementById('update-asset-price').value);
    if (!newPrice || newPrice <= 0) return;
    appState.investments[idx].currentPriceManual = newPrice;
    saveState();
    document.getElementById('update-asset-price').value = '';
    renderInvestments();
}
