const CELE_ASSET_ID = 'asset-cash-mbank-cele';
const IKZE_ANNUAL_LIMIT_PLN = 8000;

function normalizeAssetSnapshot(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const monthKey = raw.monthKey || (raw.date ? raw.date.slice(0, 7) : '');
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return null;
    const byType = raw.byType && typeof raw.byType === 'object' ? raw.byType : {};
    return {
        id: raw.id || `snap-${monthKey}`,
        monthKey,
        date: raw.date || `${monthKey}-28`,
        totalAssets: Math.max(0, parseFloat(raw.totalAssets) || 0),
        shortAssets: Math.max(0, parseFloat(raw.shortAssets) || 0),
        longAssets: Math.max(0, parseFloat(raw.longAssets) || 0),
        totalDebt: Math.max(0, parseFloat(raw.totalDebt) || 0),
        loanDebt: Math.max(0, parseFloat(raw.loanDebt) || 0),
        cardDebt: Math.max(0, parseFloat(raw.cardDebt) || 0),
        netWorth: parseFloat(raw.netWorth) || 0,
        byType: {
            investment: Math.max(0, parseFloat(byType.investment) || 0),
            cash: Math.max(0, parseFloat(byType.cash) || 0),
            deposit: Math.max(0, parseFloat(byType.deposit) || 0),
            retirement: Math.max(0, parseFloat(byType.retirement) || 0)
        },
        source: raw.source || 'auto'
    };
}

function normalizeAssetValueHistoryEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const valuePln = parseFloat(raw.valuePln);
    if (Number.isNaN(valuePln)) return null;
    return {
        id: raw.id || `avh-${Date.now().toString(36)}`,
        assetId: raw.assetId || '',
        date: raw.date || new Date().toISOString().split('T')[0],
        valuePln,
        note: raw.note || '',
        source: raw.source || 'manual'
    };
}

function getAssetSnapshots() {
    return (appState.assetSnapshots || []).map(normalizeAssetSnapshot).filter(Boolean)
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function getAssetValueHistory() {
    return (appState.assetValueHistory || []).map(normalizeAssetValueHistoryEntry).filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

function buildCurrentSnapshotPayload(monthKey, source = 'manual') {
    const assets = typeof getSummaryAssets === 'function' ? getSummaryAssets() : [];
    const horizons = typeof getAssetsHorizonTotals === 'function'
        ? getAssetsHorizonTotals()
        : { short: getPortfolioValuePln(), long: 0 };
    const loanDebt = getLoanCapitalLeft();
    const cardDebt = getCreditCardDebtTotal();
    const totalDebt = loanDebt + cardDebt;
    const totalAssets = getPortfolioValuePln();
    const byType = { investment: 0, cash: 0, deposit: 0, retirement: 0 };
    assets.forEach((asset) => {
        const type = asset.type || 'investment';
        if (byType[type] !== undefined) byType[type] += getAssetValuePln(asset);
    });
    return normalizeAssetSnapshot({
        id: `snap-${monthKey}`,
        monthKey,
        date: new Date().toISOString().split('T')[0],
        totalAssets,
        shortAssets: horizons.short,
        longAssets: horizons.long,
        totalDebt,
        loanDebt,
        cardDebt,
        netWorth: totalAssets - totalDebt,
        byType,
        source
    });
}

function captureAssetSnapshot(monthKey = null, source = 'manual') {
    const key = monthKey || new Date().toISOString().slice(0, 7);
    const snapshot = buildCurrentSnapshotPayload(key, source);
    if (!snapshot) return null;
    if (!Array.isArray(appState.assetSnapshots)) appState.assetSnapshots = [];
    const idx = appState.assetSnapshots.findIndex((s) => normalizeAssetSnapshot(s)?.monthKey === key);
    if (idx >= 0) appState.assetSnapshots[idx] = snapshot;
    else appState.assetSnapshots.push(snapshot);
    appState.assetSnapshots = getAssetSnapshots();
    return snapshot;
}

function autoCaptureAssetSnapshotsIfNeeded() {
    if (!Array.isArray(appState.assetSnapshots)) appState.assetSnapshots = [];
    const now = new Date();
    const currentKey = now.toISOString().slice(0, 7);
    const snapshots = getAssetSnapshots();
    const last = snapshots[snapshots.length - 1];
    let changed = false;

    if (!last) {
        captureAssetSnapshot(currentKey, 'auto');
        return true;
    }

    if (last.monthKey < currentKey) {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        if (!snapshots.some((s) => s.monthKey === prevKey)) {
            captureAssetSnapshot(prevKey, 'auto');
            changed = true;
        }
        if (!snapshots.some((s) => s.monthKey === currentKey)) {
            captureAssetSnapshot(currentKey, 'auto');
            changed = true;
        }
    } else if (last.monthKey === currentKey && last.source === 'auto') {
        const idx = appState.assetSnapshots.findIndex((s) => normalizeAssetSnapshot(s)?.monthKey === currentKey);
        if (idx >= 0) {
            appState.assetSnapshots[idx] = buildCurrentSnapshotPayload(currentKey, 'auto');
            changed = true;
        }
    }

    return changed;
}

function getSnapshotMonthChange() {
    const snapshots = getAssetSnapshots();
    if (snapshots.length < 2) return null;
    const current = snapshots[snapshots.length - 1];
    const prev = snapshots[snapshots.length - 2];
    return {
        netWorth: current.netWorth - prev.netWorth,
        totalAssets: current.totalAssets - prev.totalAssets,
        prevMonthKey: prev.monthKey,
        currentMonthKey: current.monthKey
    };
}

function recordAssetValueHistory(asset, source = 'manual', note = '') {
    if (!asset?.id) return null;
    const entry = normalizeAssetValueHistoryEntry({
        assetId: asset.id,
        date: new Date().toISOString().split('T')[0],
        valuePln: getAssetValuePln(asset),
        note,
        source
    });
    if (!entry) return null;
    if (!Array.isArray(appState.assetValueHistory)) appState.assetValueHistory = [];
    const last = getAssetValueHistory().filter((e) => e.assetId === asset.id).pop();
    if (last && Math.abs(last.valuePln - entry.valuePln) < 0.01 && last.date === entry.date) return last;
    appState.assetValueHistory.push(entry);
    return entry;
}

function getOperationalCashPln() {
    return getAnalysisSummaryAssets()
        .filter((a) => a.type === 'cash' && a.id !== CELE_ASSET_ID)
        .reduce((sum, a) => sum + getAssetValuePln(a), 0);
}

function getCeleCashPln() {
    const cele = typeof getAssetById === 'function' ? getAssetById(CELE_ASSET_ID) : null;
    return cele ? getAssetValuePln(cele) : 0;
}

function getGoalAssets() {
    return getAnalysisSummaryAssets().filter((a) => (a.goalTarget || 0) > 0 || a.id === CELE_ASSET_ID);
}

function getActiveDeposits() {
    return getAnalysisSummaryAssets().filter((a) => a.type === 'deposit' && a.endDate);
}

function getSelectableTransferAssets() {
    return getActiveAssets().filter((a) => !a.archived);
}

function populateTransactionAssetSelect() {
    const select = document.getElementById('tx-linked-asset-select');
    if (!select) return;
    const assets = getSelectableTransferAssets();
    select.innerHTML = '<option value="">— wybierz aktywo —</option>' + assets.map((asset) => {
        const name = typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name;
        return `<option value="${escapeHtml(asset.id)}">${escapeHtml(name)}</option>`;
    }).join('');
}

function updateTransactionAssetHints() {
    const wrapper = document.getElementById('tx-linked-asset-wrapper');
    const selectWrap = document.getElementById('tx-linked-asset-select-wrapper');
    const checkbox = document.getElementById('tx-linked-asset');
    const paidWithCard = document.getElementById('tx-credit-card')?.checked;
    if (wrapper) wrapper.classList.toggle('hidden', !!paidWithCard);
    if (checkbox && paidWithCard) checkbox.checked = false;
    if (selectWrap) selectWrap.classList.toggle('hidden', !checkbox?.checked);
    populateTransactionAssetSelect();
}

function saveAssetSnapshotNow() {
    const snap = captureAssetSnapshot(null, 'manual');
    if (!snap) return;
    saveState();
    if (typeof renderReports === 'function' && document.getElementById('view-reports')?.classList.contains('active')) {
        renderReports();
    }
    if (typeof showSettingsToast === 'function') showSettingsToast('Zapisano snapshot majątku');
}

function adjustAssetValuePln(asset, deltaPln, options = {}) {
    if (!deltaPln || !asset) return null;
    const a = normalizeAsset(asset);
    if (a.type === 'investment') {
        const qty = a.quantity || 0;
        const currentValue = getAssetValuePln(a);
        const nextValue = currentValue + deltaPln;
        if (nextValue < 0 && !options.skipConfirm) {
            const ok = confirm(`Wartość ${getAssetDisplayName(a)} spadnie do ${formatPlnAmount(nextValue)}. Kontynuować?`);
            if (!ok) return null;
        }
        if (qty > 0) {
            const nextPrice = nextValue / qty / (a.currency === 'EUR' ? (EUR_PLN_RATE || 1) : 1);
            return updateAssetInState({ ...a, currentPrice: Math.max(0, nextPrice) });
        }
        return updateAssetInState({ ...a, quantity: 1, purchasePrice: Math.max(0, nextValue), currentPrice: Math.max(0, nextValue), currency: 'PLN' });
    }
    const nextAmount = (a.amount || 0) + deltaPln;
    if (nextAmount < 0 && !options.skipConfirm) {
        const ok = confirm(`Saldo ${getAssetDisplayName(a)} spadnie do ${formatPlnAmount(nextAmount)}. Kontynuować?`);
        if (!ok) return null;
    }
    return updateAssetInState({ ...a, amount: nextAmount });
}

function applyAssetTransferFromTransaction(tx, deltaSign) {
    if (!tx?.linkedAssetId) return true;
    const asset = getAssetById(tx.linkedAssetId);
    if (!asset) return true;
    const amount = parseFloat(tx.amount) || 0;
    if (!amount) return true;
    const updated = adjustAssetValuePln(asset, amount * deltaSign);
    return !!updated;
}

function revertAssetTransfer(tx) {
    if (!tx?.linkedAssetId) return;
    applyAssetTransferFromTransaction(tx, -1);
}

function syncAssetOnTransactionSave(tx, previousTx = null) {
    if (previousTx?.linkedAssetId) {
        revertAssetTransfer(previousTx);
    }

    if (!tx.linkedAssetId) return true;

    if (tx.type === 'income' || tx.type === 'expense') {
        return applyAssetTransferFromTransaction(tx, 1);
    }
    return true;
}

function syncAssetOnTransactionDelete(tx) {
    revertAssetTransfer(tx);
}

function buildWealthFlowSummary(ctx) {
    const { start, end } = getPeriodBoundsFromCtx(ctx);
    const txs = ctx.periodTx || [];
    let toAssets = 0;
    txs.forEach((tx) => {
        if (tx.linkedAssetId) toAssets += tx.amount;
    });
    const { total: debtPayments } = getDebtPaymentsInPeriod(ctx);
    const cashNet = getCashMovementsInRange(start, end, PRIMARY_CASH_ASSET_ID)
        .reduce((s, m) => s + m.delta, 0);
    return { toAssets, debtPayments, cashNet };
}

function buildNetWorthTrendData() {
    const snapshots = getAssetSnapshots();
    if (snapshots.length < 2) return { monthLabels: [], assetsData: [], debtData: [], netData: [] };
    return {
        monthLabels: snapshots.map((s) => {
            const [y, m] = s.monthKey.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' });
        }),
        assetsData: snapshots.map((s) => s.totalAssets),
        debtData: snapshots.map((s) => s.totalDebt),
        netData: snapshots.map((s) => s.netWorth),
        shortData: snapshots.map((s) => s.shortAssets),
        longData: snapshots.map((s) => s.longAssets)
    };
}

function buildAllocationTrendData() {
    const snapshots = getAssetSnapshots();
    if (!snapshots.length) return { monthLabels: [], datasets: [] };
    const types = ['investment', 'cash', 'deposit', 'retirement'];
    return {
        monthLabels: snapshots.map((s) => {
            const [y, m] = s.monthKey.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'short' });
        }),
        investmentData: snapshots.map((s) => s.byType.investment),
        cashData: snapshots.map((s) => s.byType.cash),
        depositData: snapshots.map((s) => s.byType.deposit),
        retirementData: snapshots.map((s) => s.byType.retirement)
    };
}

function buildDiversificationSlices() {
    return getAnalysisSummaryAssets()
        .map((asset) => ({
            label: typeof getAssetDisplayName === 'function' ? getAssetDisplayName(asset) : asset.name,
            amount: getAssetValuePln(asset)
        }))
        .filter((s) => s.amount > 0)
        .sort((a, b) => b.amount - a.amount);
}

function getIkzeContributionsInYear(year) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return appState.transactions
        .filter((tx) => tx.date >= start && tx.date <= end && tx.linkedAssetId)
        .filter((tx) => {
            const asset = getAssetById(tx.linkedAssetId);
            return asset?.type === 'retirement' && asset.retirementKind === 'IKZE'
                && (tx.type === 'expense' || tx.type === 'income');
        })
        .reduce((sum, tx) => sum + tx.amount, 0);
}

function estimateNetWorthPayoffMonths() {
    const net = getPortfolioValuePln() - getLoanSummaryTotal();
    if (net >= 0) return { months: 0, label: 'Już na plusie' };
    const avgPayment = getActiveLoans().reduce((s, l) => s + (l.nextInstallmentAmount || 0), 0)
        + getActiveCreditCards().reduce((s, c) => s + getRecentCardRepaymentAverage(c.id, 3), 0);
    if (avgPayment <= 0) return { months: null, label: 'Brak danych o spłatach' };
    const assetGrowth = getSnapshotMonthChange()?.totalAssets || 0;
    const monthlyDelta = avgPayment + Math.max(0, assetGrowth);
    if (monthlyDelta <= 0) return { months: null, label: 'Brak postępu' };
    return {
        months: Math.ceil(Math.abs(net) / monthlyDelta),
        label: `~${Math.ceil(Math.abs(net) / monthlyDelta)} mies. przy obecnym tempie`
    };
}

function getLiquidityAfterOverpayment(extraMonthly) {
    const liquid = getOperationalCashPln();
    const extra = parseFloat(extraMonthly) || 0;
    const { start, end } = getPeriodBoundsFromCtx(getReportsPeriodContext());
    const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
    const expense = getReportsPeriodContext().periodTx
        .filter((t) => t.type === 'expense' && shouldTransactionAffectCash(t))
        .reduce((s, t) => s + t.amount, 0);
    const monthlyExpense = (expense / days) * 30.44;
    const after = liquid - extra;
    const runway = monthlyExpense > 0 ? after / monthlyExpense : null;
    return { liquid, after, runway, monthlyExpense };
}

function runAssetAnalyticsMigrations() {
    let changed = false;
    if (!Array.isArray(appState.assetSnapshots)) {
        appState.assetSnapshots = [];
        changed = true;
    }
    if (!Array.isArray(appState.assetValueHistory)) {
        appState.assetValueHistory = [];
        changed = true;
    }
    const beforeSnap = JSON.stringify(appState.assetSnapshots);
    appState.assetSnapshots = getAssetSnapshots();
    if (JSON.stringify(appState.assetSnapshots) !== beforeSnap) changed = true;

    const cele = getAssetById?.(CELE_ASSET_ID);
    if (cele && !cele.goalTarget) {
        updateAssetInState({ ...cele, goalTarget: 5000 });
        changed = true;
    }

    if (autoCaptureAssetSnapshotsIfNeeded()) changed = true;
    return changed;
}
