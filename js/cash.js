const PRIMARY_CASH_ASSET_ID = 'asset-cash-total';

function normalizeCashMovement(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const delta = Number(raw.delta);
    if (!Number.isFinite(delta) || delta === 0) return null;
    return {
        id: raw.id || `cashm-${Date.now().toString(36)}`,
        assetId: raw.assetId || PRIMARY_CASH_ASSET_ID,
        delta,
        amount: Math.abs(delta),
        date: raw.date || localIsoDate(new Date()),
        note: raw.note || '',
        source: raw.source || 'manual',
        sourceRef: raw.sourceRef || ''
    };
}

function getCashMovementsForAsset(assetId = PRIMARY_CASH_ASSET_ID) {
    const id = assetId || PRIMARY_CASH_ASSET_ID;
    return (appState.cashMovements || [])
        .map(normalizeCashMovement)
        .filter(Boolean)
        .filter((m) => (m.assetId || PRIMARY_CASH_ASSET_ID) === id);
}

function getCashMovementsTotal(assetId = PRIMARY_CASH_ASSET_ID) {
    return getCashMovementsForAsset(assetId).reduce((sum, m) => sum + m.delta, 0);
}

function getCashBaseline(asset) {
    if (!asset || asset.type !== 'cash') return 0;
    const stored = Number(asset.cashBaseline);
    if (Number.isFinite(stored)) return stored;
    const movementsTotal = getCashMovementsTotal(asset.id);
    return (Number(asset.amount) || 0) - movementsTotal;
}

function roundCashAmount(value) {
    return Math.round(value * 100) / 100;
}

function setCashBaseline(assetId, baseline, options = {}) {
    if (typeof getAssetById !== 'function' || typeof updateAssetInState !== 'function') return null;
    const asset = getAssetById(assetId);
    if (!asset || asset.type !== 'cash') return null;
    const base = Number(baseline);
    if (!Number.isFinite(base)) return null;
    const movementsTotal = getCashMovementsTotal(assetId);
    const next = roundCashAmount(base + movementsTotal);
    if (next < 0 && !options.skipConfirm) {
        const ok = confirm(`Saldo gotówki spadnie do ${formatPlnAmount(next)}. Kontynuować?`);
        if (!ok) return null;
    }
    return updateAssetInState({ ...asset, cashBaseline: base, amount: next });
}

function recomputeCashAmount(assetId, options = {}) {
    if (typeof getAssetById !== 'function' || typeof updateAssetInState !== 'function') return null;
    const asset = getAssetById(assetId);
    if (!asset || asset.type !== 'cash') return null;
    const baseline = getCashBaseline(asset);
    const movementsTotal = getCashMovementsTotal(assetId);
    const next = roundCashAmount(baseline + movementsTotal);
    if (next < 0 && !options.skipConfirm) {
        const ok = confirm(`Saldo gotówki spadnie do ${formatPlnAmount(next)}. Kontynuować?`);
        if (!ok) return null;
    }
    const payload = { ...asset, amount: next };
    if (!Number.isFinite(Number(asset.cashBaseline))) {
        payload.cashBaseline = baseline;
    }
    return updateAssetInState(payload);
}

function reconcileCashAsset(assetId = PRIMARY_CASH_ASSET_ID) {
    if (typeof getAssetById !== 'function' || typeof updateAssetInState !== 'function') return false;
    const asset = getAssetById(assetId);
    if (!asset || asset.type !== 'cash') return false;

    const baseline = getCashBaseline(asset);
    const expected = roundCashAmount(baseline + getCashMovementsTotal(assetId));
    const current = roundCashAmount(Number(asset.amount) || 0);
    const hasStoredBaseline = Number.isFinite(Number(asset.cashBaseline));

    if (hasStoredBaseline && Math.abs(expected - current) < 0.01) return false;

    updateAssetInState({
        ...asset,
        cashBaseline: baseline,
        amount: expected
    });
    return true;
}

function reconcileAllCashAssets() {
    let changed = false;
    (appState.assets || []).forEach((raw) => {
        const asset = typeof normalizeAsset === 'function' ? normalizeAsset(raw) : raw;
        if (asset.type === 'cash' && !asset.archived) {
            if (reconcileCashAsset(asset.id)) changed = true;
        }
    });
    return changed;
}

function getPrimaryCashAsset() {
    if (typeof getAssetById !== 'function') return null;
    return getAssetById(PRIMARY_CASH_ASSET_ID);
}

function ensurePrimaryCashAsset() {
    if (getPrimaryCashAsset()) return true;
    if (!Array.isArray(appState.assets)) appState.assets = [];
    const draft = {
        id: PRIMARY_CASH_ASSET_ID,
        type: 'cash',
        name: 'Gotówka',
        amount: 0,
        cashBaseline: 0
    };
    const normalized = typeof normalizeAsset === 'function' ? normalizeAsset(draft) : draft;
    if (typeof updateAssetInState === 'function') {
        updateAssetInState(normalized);
    } else {
        appState.assets.push(normalized);
    }
    return !!getPrimaryCashAsset();
}

function ensureCashBaseline(assetId) {
    if (typeof getAssetById !== 'function' || typeof updateAssetInState !== 'function') return;
    const asset = getAssetById(assetId);
    if (!asset || asset.type !== 'cash') return;
    if (Number.isFinite(Number(asset.cashBaseline))) return;
    const movementsTotal = getCashMovementsTotal(assetId);
    const baseline = roundCashAmount((Number(asset.amount) || 0) - movementsTotal);
    updateAssetInState({ ...asset, cashBaseline: baseline });
}

function registerCashMovement({ assetId = PRIMARY_CASH_ASSET_ID, delta, date, note, source, sourceRef }) {
    const deltaNum = Number(delta);
    if (!Number.isFinite(deltaNum) || deltaNum === 0) return null;
    if (assetId === PRIMARY_CASH_ASSET_ID && !ensurePrimaryCashAsset()) return null;
    ensureCashBaseline(assetId);

    const movement = normalizeCashMovement({
        assetId,
        delta: deltaNum,
        date,
        note,
        source,
        sourceRef
    });
    if (!movement) return null;

    if (!Array.isArray(appState.cashMovements)) appState.cashMovements = [];
    appState.cashMovements.unshift(movement);

    const updated = recomputeCashAmount(assetId);
    if (!updated) {
        appState.cashMovements.shift();
        return null;
    }
    return movement;
}

function removeCashMovement(movementId) {
    if (!movementId || !Array.isArray(appState.cashMovements)) return false;
    const idx = appState.cashMovements.findIndex((m) => m.id === movementId);
    if (idx < 0) return false;

    const movement = appState.cashMovements[idx];
    appState.cashMovements.splice(idx, 1);
    recomputeCashAmount(movement.assetId || PRIMARY_CASH_ASSET_ID, { skipConfirm: true });
    return true;
}

function syncCashForCreditCardMovement(movement) {
    if (!movement) return null;
    if (movement.type === 'repayment') {
        return registerCashMovement({
            delta: -movement.amount,
            date: movement.date,
            note: movement.note || 'Spłata karty',
            source: 'card_repayment',
            sourceRef: movement.id
        });
    }
    if (movement.type === 'transfer_out') {
        return registerCashMovement({
            delta: movement.amount,
            date: movement.date,
            note: movement.note || 'Przelew z karty',
            source: 'card_transfer',
            sourceRef: movement.id
        });
    }
    return null;
}

function syncCashForLoanPayment(loanId, amount, date, note) {
    return registerCashMovement({
        delta: -amount,
        date,
        note: note || 'Spłata kredytu',
        source: 'loan_payment',
        sourceRef: loanId
    });
}

function shouldTransactionAffectCash(tx) {
    if (!tx) return false;
    if (tx.type === 'income') {
        if (tx.linkedAssetId && tx.affectsCash === false) return false;
        return true;
    }
    if (tx.type !== 'expense') return false;
    if (tx.creditCardId) return false;
    if (tx.affectsCash === false) return false;
    if (tx.cashMovementId) return true;
    return tx.affectsCash !== false;
}

function resolveTransactionAffectsCash(type, paidWithCard, checkboxChecked) {
    if (type === 'income') return true;
    if (paidWithCard) return false;
    return checkboxChecked !== false;
}

function syncCashOnTransactionSave(tx, previousTx = null) {
    if (previousTx?.cashMovementId) {
        removeCashMovement(previousTx.cashMovementId);
    }
    delete tx.cashMovementId;

    if (!shouldTransactionAffectCash(tx)) return true;

    const amount = Number(tx.amount);
    if (!Number.isFinite(amount) || amount === 0) return true;
    const delta = tx.type === 'income' ? amount : -amount;
    const movement = registerCashMovement({
        delta,
        date: tx.date,
        note: tx.note || (tx.type === 'income' ? 'Wpływ' : 'Wydatek'),
        source: 'transaction',
        sourceRef: `${tx.date}|${tx.type}|${tx.mainCategory}|${tx.amount}`
    });
    if (!movement) return false;
    tx.cashMovementId = movement.id;
    return true;
}

function syncCashOnTransactionDelete(tx) {
    if (tx?.cashMovementId) {
        removeCashMovement(tx.cashMovementId);
    }
}

function getCashMovementsInRange(start, end, assetId = null) {
    const list = assetId
        ? getCashMovementsForAsset(assetId)
        : (appState.cashMovements || []).map(normalizeCashMovement).filter(Boolean);
    return list.filter((m) => {
        if (start && m.date < start) return false;
        if (end && m.date > end) return false;
        return true;
    });
}

function getCashMovementForTransaction(tx) {
    if (!tx?.cashMovementId || !Array.isArray(appState.cashMovements)) return null;
    return appState.cashMovements.find((m) => m.id === tx.cashMovementId) || null;
}

function transactionAffectsCashAsset(tx, assetId) {
    const movement = getCashMovementForTransaction(tx);
    if (movement) {
        const movementAssetId = movement.assetId || PRIMARY_CASH_ASSET_ID;
        return movementAssetId === assetId;
    }
    if (tx?.linkedAssetId === assetId && typeof getAssetById === 'function') {
        const linked = getAssetById(tx.linkedAssetId);
        if (linked?.type === 'cash') return true;
    }
    if (!shouldTransactionAffectCash(tx)) return false;
    return assetId === PRIMARY_CASH_ASSET_ID;
}

function getCashAffectingTransactions(assetId = PRIMARY_CASH_ASSET_ID, filterType = 'all') {
    const id = assetId || PRIMARY_CASH_ASSET_ID;
    return (appState.transactions || [])
        .filter((tx) => {
            if (!transactionAffectsCashAsset(tx, id)) return false;
            if (filterType === 'expense') return tx.type === 'expense';
            if (filterType === 'income') return tx.type === 'income';
            return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date) || (Number(b.amount) - Number(a.amount)));
}

function applyManualCashAmount(assetId, newAmount) {
    const amount = Number(newAmount);
    if (!Number.isFinite(amount) || amount < 0) return null;
    if (!getAssetById(assetId) && assetId === PRIMARY_CASH_ASSET_ID) {
        ensurePrimaryCashAsset();
    }
    const movementsTotal = getCashMovementsTotal(assetId);
    return setCashBaseline(assetId, roundCashAmount(amount - movementsTotal), { skipConfirm: true });
}

function repairMissingCashMovementsFromTransactions() {
    if (!Array.isArray(appState.transactions)) return false;
    let changed = false;
    appState.transactions.forEach((tx) => {
        if (getCashMovementForTransaction(tx)) return;
        if (tx.linkedAssetId && typeof getAssetById === 'function') {
            const linked = getAssetById(tx.linkedAssetId);
            if (linked?.type === 'cash' && typeof syncAssetOnTransactionSave === 'function') {
                delete tx.cashMovementId;
                if (syncAssetOnTransactionSave(tx, null)) changed = true;
                return;
            }
        }
        if (!shouldTransactionAffectCash(tx)) return;
        delete tx.cashMovementId;
        if (syncCashOnTransactionSave(tx, null)) changed = true;
    });
    if (changed) reconcileAllCashAssets();
    return changed;
}

function runCashMigrations() {
    let changed = false;
    if (!Array.isArray(appState.cashMovements)) {
        appState.cashMovements = [];
        changed = true;
    }
    const before = appState.cashMovements.length;
    appState.cashMovements = appState.cashMovements.map(normalizeCashMovement).filter(Boolean);
    if (appState.cashMovements.length !== before) changed = true;
    if (reconcileAllCashAssets()) changed = true;
    if (repairMissingCashMovementsFromTransactions()) changed = true;
    return changed;
}
