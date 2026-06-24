/* Raporty — sekcja aktywów */
function getPeriodDayCount(ctx) {
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const s = new Date(`${start}T12:00:00`);
    const e = new Date(`${end}T12:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 30;
    return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function getAnalysisSummaryAssets() {
    if (typeof getSummaryAssets === 'function') return getSummaryAssets();
    if (typeof getActiveAssets === 'function') return getActiveAssets();
    return (appState.assets || []).filter((a) => !a.archived);
}

function getLiquidCashPln() {
    if (typeof getOperationalCashPln === 'function') return getOperationalCashPln();
    return getAnalysisSummaryAssets()
        .filter((a) => a.type === 'cash')
        .reduce((sum, a) => sum + getAssetValuePln(a), 0);
}

function getAssetsHorizonTotals() {
    if (typeof getAssetsByHorizon !== 'function' || typeof getActiveAssetsTotalPln !== 'function') {
        const total = getPortfolioValuePln();
        return { short: total, long: 0 };
    }
    const shortAssets = getAssetsByHorizon('short').filter((a) => a.includeInSummary !== false);
    const longAssets = getAssetsByHorizon('long').filter((a) => a.includeInSummary !== false);
    return {
        short: getActiveAssetsTotalPln(shortAssets),
        long: getActiveAssetsTotalPln(longAssets)
    };
}

function buildAssetAllocationSlices() {
    const byType = {};
    getAnalysisSummaryAssets().forEach((asset) => {
        const type = asset.type || 'investment';
        const label = typeof ASSET_TYPE_LABELS !== 'undefined'
            ? (ASSET_TYPE_LABELS[type] || type)
            : type;
        byType[label] = (byType[label] || 0) + getAssetValuePln(asset);
    });
    return Object.entries(byType)
        .map(([label, amount]) => ({ label, amount }))
        .filter((slice) => slice.amount > 0)
        .sort((a, b) => b.amount - a.amount);
}

function buildAssetHorizonSlices() {
    if (typeof getAssetHorizon !== 'function' || typeof ASSET_HORIZON_LABELS === 'undefined') {
        return buildAssetAllocationSlices();
    }
    const buckets = { short: 0, long: 0 };
    getAnalysisSummaryAssets().forEach((asset) => {
        const horizon = getAssetHorizon(asset);
        buckets[horizon] = (buckets[horizon] || 0) + getAssetValuePln(asset);
    });
    return ['short', 'long']
        .map((horizon) => ({
            label: ASSET_HORIZON_LABELS[horizon],
            amount: buckets[horizon] || 0,
            horizon
        }))
        .filter((slice) => slice.amount > 0);
}

function buildCashBalanceTrendData(ctx, assetId = PRIMARY_CASH_ASSET_ID) {
    const asset = typeof getAssetById === 'function' ? getAssetById(assetId) : null;
    const { chartPeriod, chartRangeStart, chartRangeEnd } = getChartParamsFromCtx(ctx);
    const { monthLabels, monthKeys } = buildReportsMonthChartData(
        chartPeriod,
        ctx.periodTx,
        chartRangeStart,
        chartRangeEnd
    );
    if (!asset || asset.type !== 'cash' || !monthKeys.length) {
        return { monthLabels: [], balanceData: [] };
    }

    const balanceData = new Array(monthKeys.length);
    balanceData[balanceData.length - 1] = asset.amount || 0;

    for (let i = monthKeys.length - 2; i >= 0; i -= 1) {
        const { start, end } = monthKeyToDateRange(monthKeys[i + 1]);
        const delta = getCashMovementsInRange(start, end, assetId)
            .reduce((s, m) => s + m.delta, 0);
        balanceData[i] = balanceData[i + 1] - delta;
    }

    return { monthLabels, balanceData };
}

function renderReportsAssetAllocationChart(ctx, canvasId = 'reportsAssetAllocationChart', legendId = 'reports-asset-allocation-legend') {
    const canvas = document.getElementById(canvasId);
    const legendEl = document.getElementById(legendId);
    if (!canvas) return;

    const slices = buildAssetAllocationSlices();
    const isTabChart = canvasId === 'reportsAssetsAllocationChart';
    if (isTabChart) {
        if (reportsAssetsTabAllocationInstance) reportsAssetsTabAllocationInstance.destroy();
    } else if (reportsAssetAllocationChartInstance) {
        reportsAssetAllocationChartInstance.destroy();
    }

    if (!slices.length) {
        if (legendEl) legendEl.innerHTML = '<p class="reports-hint">Brak aktywów w sumie.</p>';
        return;
    }

    const labels = slices.map((s) => s.label);
    const values = slices.map((s) => s.amount);
    const colors = getChartSliceColors(labels, 'income');
    const borderColor = getChartBorderColor();

    const chart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor,
                borderWidth: 3,
                borderRadius: 5,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.35,
            cutout: '58%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: getReportsChartTheme().tooltipBg,
                    callbacks: {
                        label: (context) => `${context.label}: ${formatPlnAmount(context.parsed)}`
                    }
                }
            }
        }
    });

    if (isTabChart) reportsAssetsTabAllocationInstance = chart;
    else reportsAssetAllocationChartInstance = chart;

    if (legendEl) {
        const total = values.reduce((s, v) => s + v, 0);
        legendEl.innerHTML = slices.map((slice, i) => {
            const pct = total > 0 ? Math.round((slice.amount / total) * 100) : 0;
            return `<div class="reports-debt-split-item">
                <span class="reports-debt-split-dot" style="background:${colors[i]}"></span>
                <span class="reports-debt-split-label">${escapeHtml(slice.label)}</span>
                <strong>${formatPlnAmount(slice.amount)}</strong>
                <em>${pct}%</em>
            </div>`;
        }).join('');
    }
}

function renderReportsCashTrendChart(ctx, canvasId = 'reportsCashTrendChart') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const { monthLabels, balanceData } = buildCashBalanceTrendData(ctx);
    const isTabChart = canvasId === 'reportsAssetsCashTrendChart';
    if (isTabChart) {
        if (reportsAssetsTabCashTrendInstance) reportsAssetsTabCashTrendInstance.destroy();
    } else if (reportsCashTrendChartInstance) {
        reportsCashTrendChartInstance.destroy();
    }

    if (!monthLabels.length) return;

    const theme = getReportsChartTheme();
    const lineColor = isLightTheme() ? 'rgba(13, 148, 136, 0.9)' : 'rgba(45, 212, 191, 0.9)';

    const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Gotówka',
                data: balanceData,
                borderColor: lineColor,
                backgroundColor: isLightTheme() ? 'rgba(13, 148, 136, 0.12)' : 'rgba(45, 212, 191, 0.12)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                borderWidth: 2
            }]
        },
        options: getReportsChartOptions(theme)
    });

    if (isTabChart) reportsAssetsTabCashTrendInstance = chart;
    else reportsCashTrendChartInstance = chart;
}

function renderReportsNetWorth() {
    const el = document.getElementById('reports-net-worth');
    if (!el) return;

    const ctx = getReportsPeriodContext();
    const assets = getPortfolioValuePln();
    const horizons = getAssetsHorizonTotals();
    const loanDebt = getLoanCapitalLeft();
    const cardDebt = getCreditCardDebtTotal();
    const totalDebt = loanDebt + cardDebt;
    const net = assets - totalDebt;
    const dta = assets > 0 ? Math.round((totalDebt / assets) * 100) : null;
    const liquidCash = getLiquidCashPln();
    const cardCoverage = cardDebt > 0 ? Math.round((liquidCash / cardDebt) * 100) : null;
    const { expense } = summarizePeriod(ctx.periodTx);
    const periodDays = getPeriodDayCount(ctx);
    const avgMonthlyExpense = (expense / periodDays) * 30.44;
    const runwayMonths = avgMonthlyExpense > 0 ? liquidCash / avgMonthlyExpense : null;
    const monthChange = typeof getSnapshotMonthChange === 'function' ? getSnapshotMonthChange() : null;
    const changeEl = document.getElementById('reports-net-worth-change');

    el.innerHTML = `
        <div class="networth-grid">
            <div><span class="label">Aktywa razem</span><strong class="income">${formatPlnAmount(assets)}</strong></div>
            <div><span class="label">Krótkoterminowe</span><strong>${formatPlnAmount(horizons.short)}</strong></div>
            <div><span class="label">Długoterminowe</span><strong>${formatPlnAmount(horizons.long)}</strong></div>
            <div><span class="label">Zadłużenie / majątek</span><strong class="${dta !== null && dta > 50 ? 'expense' : ''}">${dta !== null ? `${dta}%` : '—'}</strong></div>
            <div><span class="label">Kredyty (kapitał)</span><strong class="expense">−${formatPlnAmount(loanDebt)}</strong></div>
            <div><span class="label">Karty kredytowe</span><strong class="expense">−${formatPlnAmount(cardDebt)}</strong></div>
            <div><span class="label">Gotówka (płynna)</span><strong>${formatPlnAmount(liquidCash)}</strong></div>
            <div><span class="label">Pokrycie kart gotówką</span><strong class="${cardCoverage !== null && cardCoverage < 100 ? 'expense' : 'income'}">${cardCoverage !== null ? `${cardCoverage}%` : '—'}</strong></div>
            <div><span class="label">Rezerwa (mies.)</span><strong>${runwayMonths !== null ? runwayMonths.toFixed(1) : '—'}</strong></div>
            <div class="networth-total"><span class="label">Wartość netto</span><strong style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatPlnAmount(net)}</strong></div>
        </div>
        <p class="reports-hint reports-networth-hint">Rezerwa = gotówka operacyjna ÷ średnie miesięczne wydatki w wybranym okresie.</p>`;

    if (changeEl) {
        if (monthChange) {
            const sign = monthChange.netWorth >= 0 ? '+' : '';
            changeEl.textContent = `Zmiana net worth vs poprzedni miesiąc: ${sign}${formatPlnAmount(monthChange.netWorth)}`;
            changeEl.classList.remove('hidden');
        } else {
            changeEl.classList.add('hidden');
        }
    }
}

function renderReportsAssetsHero(aCtx) {
    const totalEl = document.getElementById('reports-assets-hero-total');
    const metaEl = document.getElementById('reports-assets-hero-meta');
    if (!totalEl) return;

    const assets = aCtx?.assets ?? getAnalysisSummaryAssets();
    const total = aCtx?.totalAssets ?? getPortfolioValuePln();
    const horizons = aCtx?.horizons ?? getAssetsHorizonTotals();
    const gainPct = typeof getActiveAssetsGainPct === 'function' ? getActiveAssetsGainPct() : 0;
    const gainPln = typeof getActiveAssetsGainPln === 'function' ? getActiveAssetsGainPln() : 0;
    const investments = assets.filter((a) => a.type === 'investment');

    totalEl.textContent = formatPlnAmount(total);
    if (metaEl) {
        const parts = [
            `${assets.length} pozycji w sumie`,
            `krótko ${formatPlnAmount(horizons.short)}`,
            `długo ${formatPlnAmount(horizons.long)}`
        ];
        if (investments.length) {
            parts.push(`P/L ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${gainPln >= 0 ? '+' : ''}${formatPlnAmount(gainPln)})`);
        }
        metaEl.textContent = parts.join(' · ');
    }
}

function renderReportsAssetsHorizon() {
    const el = document.getElementById('reports-assets-horizon');
    if (!el) return;

    const slices = buildAssetHorizonSlices();
    const total = slices.reduce((s, slice) => s + slice.amount, 0);
    if (!total) {
        el.innerHTML = '<p class="reports-hint">Brak aktywów w sumie.</p>';
        return;
    }

    el.innerHTML = slices.map((slice) => {
        const pct = Math.round((slice.amount / total) * 100);
        const hint = slice.horizon === 'short'
            ? 'Gotówka, Cele, akcje, lokaty'
            : 'PPK, IKZE, emerytura, KZP';
        return `<div class="assets-analysis-horizon-row">
            <div class="assets-analysis-horizon-head">
                <strong>${escapeHtml(slice.label)}</strong>
                <span>${formatPlnAmount(slice.amount)} · ${pct}%</span>
            </div>
            <p class="reports-hint">${hint}</p>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
        </div>`;
    }).join('');
}

function renderReportsAssetsInvestments(aCtx) {
    const el = document.getElementById('reports-assets-investments');
    if (!el) return;

    const investments = (aCtx?.assets ?? getAnalysisSummaryAssets()).filter((a) => a.type === 'investment');
    if (!investments.length) {
        el.innerHTML = '<p class="reports-hint">Brak inwestycji w sumie.</p>';
        return;
    }

    const totalValue = investments.reduce((s, a) => s + getAssetValuePln(a), 0);
    const totalCost = investments.reduce((s, a) => s + getAssetCostPln(a), 0);
    const totalGain = totalValue - totalCost;
    const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const gainClass = totalGain >= 0 ? 'income' : 'expense';

    const rows = investments.map((asset) => {
        const value = getAssetValuePln(asset);
        const gain = typeof getAssetGainPln === 'function' ? getAssetGainPln(asset) : 0;
        const gainPct = typeof getAssetGainPct === 'function' ? getAssetGainPct(asset) : 0;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const assetId = escapeHtml(asset.id);
        const rowGainClass = gain >= 0 ? 'income' : 'expense';
        return `<div class="assets-analysis-row asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${assetId}')" onkeydown="if (event.key === 'Enter') openAssetDetails('${assetId}')">
            <div class="assets-analysis-info">
                <strong>${escapeHtml(name)}</strong>
                <span class="reports-hint">${formatPlnAmount(value)}</span>
            </div>
            <div class="assets-analysis-amounts">
                <span class="${rowGainClass}">${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%</span>
                <strong class="${rowGainClass}">${gain >= 0 ? '+' : ''}${formatPlnAmount(gain)}</strong>
            </div>
        </div>`;
    }).join('');

    el.innerHTML = `
        <div class="assets-analysis-total">
            <div><span class="label">Wartość</span><strong>${formatPlnAmount(totalValue)}</strong></div>
            <div><span class="label">Koszt</span><strong>${formatPlnAmount(totalCost)}</strong></div>
            <div><span class="label">P/L</span><strong class="${gainClass}">${totalGainPct >= 0 ? '+' : ''}${totalGainPct.toFixed(1)}% (${totalGain >= 0 ? '+' : ''}${formatPlnAmount(totalGain)})</strong></div>
        </div>
        ${rows}`;
}

function renderReportsAssetsRetirement(aCtx) {
    const el = document.getElementById('reports-assets-retirement');
    if (!el) return;

    const retirement = (aCtx?.assets ?? getAnalysisSummaryAssets()).filter((a) => a.type === 'retirement');
    if (!retirement.length) {
        el.innerHTML = '<p class="reports-hint">Brak produktów emerytalnych w sumie.</p>';
        return;
    }

    const total = retirement.reduce((s, a) => s + getAssetValuePln(a), 0);
    el.innerHTML = retirement.map((asset) => {
        const kind = typeof RETIREMENT_KIND_LABELS !== 'undefined'
            ? (RETIREMENT_KIND_LABELS[asset.retirementKind] || asset.retirementKind)
            : asset.retirementKind;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const value = getAssetValuePln(asset);
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        const assetId = escapeHtml(asset.id);
        return `<div class="assets-analysis-row asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${assetId}')" onkeydown="if (event.key === 'Enter') openAssetDetails('${assetId}')">
            <div class="assets-analysis-info">
                <strong>${escapeHtml(name)}</strong>
                <span class="reports-hint">${escapeHtml(kind || 'Emerytura')} · ${pct}%</span>
            </div>
            <strong>${formatPlnAmount(value)}</strong>
        </div>`;
    }).join('');
}

function renderReportsAssetsList(aCtx) {
    const el = document.getElementById('reports-assets-list');
    if (!el) return;

    const assets = aCtx?.assets ?? getAnalysisSummaryAssets();
    if (!assets.length) {
        el.innerHTML = '<p class="reports-hint">Brak aktywów — dodaj je w zakładce Aktywa.</p>';
        return;
    }

    const total = aCtx?.totalAssets ?? getPortfolioValuePln();
    const sorted = [...assets].sort((a, b) => getAssetValuePln(b) - getAssetValuePln(a));

    el.innerHTML = sorted.map((asset) => {
        const value = getAssetValuePln(asset);
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        const typeLabel = typeof ASSET_TYPE_LABELS !== 'undefined'
            ? (ASSET_TYPE_LABELS[asset.type] || 'Aktywo')
            : 'Aktywo';
        const horizon = typeof getAssetHorizon === 'function' && typeof ASSET_HORIZON_LABELS !== 'undefined'
            ? ASSET_HORIZON_LABELS[getAssetHorizon(asset)]
            : '';
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const assetId = escapeHtml(asset.id);
        return `<div class="analysis-loan-click asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${assetId}')" onkeydown="if (event.key === 'Enter') openAssetDetails('${assetId}')">
            <div class="analysis-subsection-label">${escapeHtml(name)}</div>
            <div class="loan-report-grid">
                <div><span class="label">Wartość</span><strong>${formatPlnAmount(value)}</strong></div>
                <div><span class="label">Udział</span><strong>${pct}%</strong></div>
                <div><span class="label">Typ</span><strong>${escapeHtml(typeLabel)}</strong></div>
                <div><span class="label">Horyzont</span><strong>${escapeHtml(horizon)}</strong></div>
            </div>
        </div>`;
    }).join('');
}

function renderReportsAssetsDebtLink(aCtx) {
    const el = document.getElementById('reports-assets-debt-link');
    if (!el) return;

    const assets = aCtx?.totalAssets ?? getPortfolioValuePln();
    const loanDebt = aCtx?.loanDebt ?? getLoanCapitalLeft();
    const cardDebt = aCtx?.cardDebt ?? getCreditCardDebtTotal();
    const totalDebt = loanDebt + cardDebt;
    const net = assets - totalDebt;
    const dta = assets > 0 ? Math.round((totalDebt / assets) * 100) : null;
    const liquidCash = aCtx?.liquidCash ?? getLiquidCashPln();
    const cardCoverage = cardDebt > 0 ? Math.round((liquidCash / cardDebt) * 100) : null;
    const longTotal = (aCtx?.horizons ?? getAssetsHorizonTotals()).long;

    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Wartość netto</span><strong style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatPlnAmount(net)}</strong></div>
            <div><span class="label">Zadłużenie / majątek</span><strong class="${dta !== null && dta > 50 ? 'expense' : ''}">${dta !== null ? `${dta}%` : '—'}</strong></div>
            <div><span class="label">Gotówka vs karty</span><strong class="${cardCoverage !== null && cardCoverage < 100 ? 'expense' : 'income'}">${cardCoverage !== null ? `${cardCoverage}%` : '—'}</strong></div>
            <div><span class="label">Długoterminowe</span><strong>${formatPlnAmount(longTotal)}</strong></div>
        </div>
        <p class="reports-hint">Porównanie aktywów z kredytami i kartami — te same wskaźniki co w Przeglądzie.</p>`;
}

function renderReportsAssetsCashFlow(ctx) {
    const el = document.getElementById('reports-assets-cash-flow');
    if (!el) return;

    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const income = ctx.periodTx
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + t.amount, 0);
    const expenseFromCash = ctx.periodTx
        .filter((t) => t.type === 'expense' && shouldTransactionAffectCash(t))
        .reduce((s, t) => s + t.amount, 0);
    const txBalance = income - expenseFromCash;
    const cashDelta = getCashMovementsInRange(start, end, PRIMARY_CASH_ASSET_ID)
        .reduce((s, m) => s + m.delta, 0);
    const celeDelta = typeof CELE_ASSET_ID !== 'undefined'
        ? getCashMovementsInRange(start, end, CELE_ASSET_ID).reduce((s, m) => s + m.delta, 0)
        : 0;
    const diff = cashDelta - txBalance;
    const diffHint = Math.abs(diff) < 1
        ? 'Saldo gotówki zgadza się z transakcjami w okresie.'
        : `Różnica ${formatPlnAmount(diff)} — starsze ruchy, spłaty długów lub ręczne korekty.`;

    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Wpływy</span><strong class="income">${formatPlnAmount(income)}</strong></div>
            <div><span class="label">Wydatki z salda</span><strong class="expense">${formatPlnAmount(expenseFromCash)}</strong></div>
            <div><span class="label">Bilans transakcji</span><strong>${formatPlnAmount(txBalance)}</strong></div>
            <div><span class="label">Zmiana gotówki</span><strong class="${cashDelta >= 0 ? 'income' : 'expense'}">${cashDelta >= 0 ? '+' : ''}${formatPlnAmount(cashDelta)}</strong></div>
            ${celeDelta ? `<div><span class="label">Zmiana Cele</span><strong class="${celeDelta >= 0 ? 'income' : 'expense'}">${celeDelta >= 0 ? '+' : ''}${formatPlnAmount(celeDelta)}</strong></div>` : ''}
        </div>
        <p class="reports-hint">${diffHint}</p>`;
}

function renderReportsAssetsSnapshotsList() {
    const el = document.getElementById('reports-assets-snapshots-list');
    if (!el) return;
    const snapshots = typeof getAssetSnapshots === 'function' ? getAssetSnapshots() : [];
    if (!snapshots.length) {
        el.innerHTML = '<p class="reports-hint">Brak snapshotów — zapiszą się automatycznie lub użyj przycisku powyżej.</p>';
        return;
    }
    el.innerHTML = [...snapshots].reverse().slice(0, 12).map((snap) => {
        const [y, m] = snap.monthKey.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return `<div class="assets-snapshot-row">
            <strong>${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</strong>
            <span class="reports-hint">${snap.source === 'manual' ? 'ręcznie' : 'auto'}</span>
            <div class="loan-report-grid">
                <div><span class="label">Majątek</span><strong>${formatPlnAmount(snap.totalAssets)}</strong></div>
                <div><span class="label">Net worth</span><strong>${formatPlnAmount(snap.netWorth)}</strong></div>
                <div><span class="label">Krótko</span><strong>${formatPlnAmount(snap.shortAssets)}</strong></div>
                <div><span class="label">Długo</span><strong>${formatPlnAmount(snap.longAssets)}</strong></div>
            </div>
        </div>`;
    }).join('');
}

function renderReportsNetWorthTrendChart() {
    const canvas = document.getElementById('reportsNetWorthTrendChart');
    if (!canvas || typeof buildNetWorthTrendData !== 'function') return;
    const { monthLabels, assetsData, debtData, netData } = buildNetWorthTrendData();
    if (reportsNetWorthTrendChartInstance) reportsNetWorthTrendChartInstance.destroy();
    if (!monthLabels.length) return;
    const theme = getReportsChartTheme();
    reportsNetWorthTrendChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [
                { label: 'Net worth', data: netData, borderColor: 'var(--success)', tension: 0.3, pointRadius: 3 },
                { label: 'Aktywa', data: assetsData, borderColor: 'var(--accent)', tension: 0.3, pointRadius: 2, borderDash: [4, 4] },
                { label: 'Długi', data: debtData, borderColor: 'var(--danger)', tension: 0.3, pointRadius: 2, borderDash: [4, 4] }
            ]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsAllocationTrendChart() {
    const canvas = document.getElementById('reportsAllocationTrendChart');
    if (!canvas || typeof buildAllocationTrendData !== 'function') return;
    const data = buildAllocationTrendData();
    if (reportsAllocationTrendChartInstance) reportsAllocationTrendChartInstance.destroy();
    if (!data.monthLabels.length) return;
    const theme = getReportsChartTheme();
    reportsAllocationTrendChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: data.monthLabels,
            datasets: [
                { label: 'Inwestycje', data: data.investmentData, tension: 0.3, pointRadius: 2 },
                { label: 'Gotówka', data: data.cashData, tension: 0.3, pointRadius: 2 },
                { label: 'Lokaty', data: data.depositData, tension: 0.3, pointRadius: 2 },
                { label: 'Emerytura', data: data.retirementData, tension: 0.3, pointRadius: 2 }
            ]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsWealthFlows(ctx) {
    const el = document.getElementById('reports-wealth-flows');
    if (!el || typeof buildWealthFlowSummary !== 'function') return;
    const flow = buildWealthFlowSummary(ctx);
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Na aktywa (powiązane tx)</span><strong class="income">${formatPlnAmount(flow.toAssets)}</strong></div>
            <div><span class="label">Spłaty długów</span><strong class="expense">${formatPlnAmount(flow.debtPayments)}</strong></div>
            <div><span class="label">Zmiana gotówki</span><strong class="${flow.cashNet >= 0 ? 'income' : 'expense'}">${flow.cashNet >= 0 ? '+' : ''}${formatPlnAmount(flow.cashNet)}</strong></div>
        </div>`;
}

function renderReportsAssetsGoals() {
    const el = document.getElementById('reports-assets-goals');
    if (!el) return;
    const operational = typeof getOperationalCashPln === 'function' ? getOperationalCashPln() : 0;
    const cele = typeof getCeleCashPln === 'function' ? getCeleCashPln() : 0;
    const goals = typeof getGoalAssets === 'function' ? getGoalAssets() : [];
    const goalRows = goals.map((asset) => {
        const value = getAssetValuePln(asset);
        const target = asset.goalTarget || 0;
        const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        return `<div class="assets-analysis-horizon-row">
            <div class="assets-analysis-horizon-head"><strong>${escapeHtml(name)}</strong><span>${formatPlnAmount(value)}${target ? ` / ${formatPlnAmount(target)}` : ''}</span></div>
            ${pct !== null ? `<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:var(--success)"></div></div>` : ''}
        </div>`;
    }).join('');
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Gotówka operacyjna</span><strong>${formatPlnAmount(operational)}</strong></div>
            <div><span class="label">Cele (oszczędnościowe)</span><strong>${formatPlnAmount(cele)}</strong></div>
        </div>
        ${goalRows || '<p class="reports-hint">Ustaw cel w edycji aktywa gotówkowego (np. Cele).</p>'}`;
}

function renderReportsDiversificationChart() {
    const canvas = document.getElementById('reportsDiversificationChart');
    const legendEl = document.getElementById('reports-diversification-legend');
    if (!canvas || typeof buildDiversificationSlices !== 'function') return;
    const slices = buildDiversificationSlices();
    if (reportsDiversificationChartInstance) reportsDiversificationChartInstance.destroy();
    if (!slices.length) {
        if (legendEl) legendEl.innerHTML = '<p class="reports-hint">Brak danych.</p>';
        return;
    }
    const labels = slices.map((s) => s.label);
    const values = slices.map((s) => s.amount);
    const colors = getChartSliceColors(labels, 'income');
    reportsDiversificationChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2 }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
    });
    if (legendEl) {
        const total = values.reduce((s, v) => s + v, 0);
        legendEl.innerHTML = slices.slice(0, 10).map((slice, i) => {
            const pct = total > 0 ? Math.round((slice.amount / total) * 100) : 0;
            return `<div class="reports-debt-split-item"><span class="reports-debt-split-dot" style="background:${colors[i]}"></span><span>${escapeHtml(slice.label)}</span><strong>${formatPlnAmount(slice.amount)}</strong><em>${pct}%</em></div>`;
        }).join('');
    }
}

function renderReportsIkzeLimit() {
    const el = document.getElementById('reports-ikze-limit');
    if (!el) return;
    const year = new Date().getFullYear();
    const used = typeof getIkzeContributionsInYear === 'function' ? getIkzeContributionsInYear(year) : 0;
    const limit = typeof IKZE_ANNUAL_LIMIT_PLN !== 'undefined' ? IKZE_ANNUAL_LIMIT_PLN : 8000;
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const left = Math.max(0, limit - used);
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Wpłaty ${year}</span><strong>${formatPlnAmount(used)}</strong></div>
            <div><span class="label">Limit</span><strong>${formatPlnAmount(limit)}</strong></div>
            <div><span class="label">Pozostało</span><strong class="income">${formatPlnAmount(left)}</strong></div>
        </div>
        <div class="progress-bar-bg" style="margin-top:12px"><div class="progress-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
        <p class="reports-hint">Liczone z transakcji powiązanych z IKZE. Limit orientacyjny — ${formatPlnAmount(limit)} / rok.</p>`;
}

function renderReportsMortgageVsRetirement() {
    const el = document.getElementById('reports-mortgage-retirement');
    if (!el) return;
    const mortgageCapital = getActiveLoans()
        .filter((l) => typeof isMortgageLoan === 'function' && isMortgageLoan(l))
        .reduce((s, l) => s + (l.currentCapitalLeft || 0), 0);
    const retirementTotal = getAnalysisSummaryAssets()
        .filter((a) => a.type === 'retirement')
        .reduce((s, a) => s + getAssetValuePln(a), 0);
    const payoff = typeof estimateNetWorthPayoffMonths === 'function' ? estimateNetWorthPayoffMonths() : null;
    let message = 'Budujesz majątek długoterminowy szybciej niż spłacasz hipotekę.';
    if (retirementTotal < mortgageCapital) {
        message = 'Kapitał hipoteki przewyższa majątek emerytalny — warto zwiększyć wpłaty długoterminowe.';
    } else if (mortgageCapital === 0) {
        message = 'Brak aktywnej hipoteki w kredytach.';
    }
    el.innerHTML = `
        <div class="loan-report-grid">
            <div><span class="label">Kapitał hipoteki</span><strong class="expense">${formatPlnAmount(mortgageCapital)}</strong></div>
            <div><span class="label">Majątek emerytalny</span><strong class="income">${formatPlnAmount(retirementTotal)}</strong></div>
            <div><span class="label">Net worth zero</span><strong>${payoff?.label || '—'}</strong></div>
        </div>
        <p class="reports-hint">${message}</p>`;
}

function renderDepositsCalendarList() {
    const card = document.getElementById('reports-deposits-calendar-card');
    const el = document.getElementById('reports-deposits-calendar-list');
    if (!el) return;
    const deposits = typeof getActiveDeposits === 'function' ? getActiveDeposits() : [];
    if (!deposits.length) {
        card?.classList.add('hidden');
        return;
    }
    card?.classList.remove('hidden');
    const today = new Date().toISOString().split('T')[0];
    const sorted = [...deposits].sort((a, b) => a.endDate.localeCompare(b.endDate));
    el.innerHTML = sorted.map((asset) => {
        const days = typeof daysUntilDate === 'function' ? daysUntilDate(asset.endDate) : null;
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        const overdue = days !== null && days < 0;
        return `<div class="assets-analysis-row asset-clickable" role="button" tabindex="0"
            onclick="openAssetDetails('${escapeHtml(asset.id)}')">
            <div class="assets-analysis-info">
                <strong>${escapeHtml(name)}</strong>
                <span class="reports-hint${overdue ? ' expense' : ''}">${formatTxDate(asset.endDate)}${days !== null ? ` · ${days < 0 ? `${Math.abs(days)} dni temu` : `za ${days} dni`}` : ''}</span>
            </div>
            <strong>${formatPlnAmount(getAssetValuePln(asset))}</strong>
        </div>`;
    }).join('');
}

function buildAssetsCtx() {
    const assets = getAnalysisSummaryAssets();
    const totalAssets = getPortfolioValuePln();
    const horizons = getAssetsHorizonTotals();
    const loanDebt = getLoanCapitalLeft();
    const cardDebt = getCreditCardDebtTotal();
    const liquidCash = getLiquidCashPln();
    return { assets, totalAssets, horizons, loanDebt, cardDebt, liquidCash };
}

function renderReportsAssetsSection(ctx) {
    const aCtx = buildAssetsCtx();
    renderReportsAssetsHero(aCtx);
    renderReportsAssetsHorizon();
    renderReportsAssetsInvestments(aCtx);
    renderReportsAssetsRetirement(aCtx);
    renderReportsAssetsList(aCtx);
    renderReportsAssetsDebtLink(aCtx);
    renderReportsAssetsCashFlow(ctx);
    renderReportsAssetAllocationChart(ctx, 'reportsAssetsAllocationChart', 'reports-assets-allocation-legend');
    renderReportsCashTrendChart(ctx, 'reportsAssetsCashTrendChart');
    renderReportsAssetsSnapshotsList();
    renderReportsNetWorthTrendChart();
    renderReportsAllocationTrendChart();
    renderReportsWealthFlows(ctx);
    renderReportsAssetsGoals();
    renderReportsDiversificationChart();
    renderReportsIkzeLimit();
    renderReportsMortgageVsRetirement();
}
