const PRIMARY_CASH_ASSET_ID = 'asset-cash-total';

function normalizeCashMovement(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const delta = parseFloat(raw.delta);
    if (!delta || Number.isNaN(delta)) return null;
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
        amount: 0
    };
    const normalized = typeof normalizeAsset === 'function' ? normalizeAsset(draft) : draft;
    if (typeof updateAssetInState === 'function') {
        updateAssetInState(normalized);
    } else {
        appState.assets.push(normalized);
    }
    return !!getPrimaryCashAsset();
}

function adjustCashAssetAmount(assetId, delta, options = {}) {
    if (!delta || typeof getAssetById !== 'function') return null;
    const asset = getAssetById(assetId);
    if (!asset || asset.type !== 'cash') return null;

    const current = asset.amount || 0;
    const next = current + delta;
    if (next < 0 && !options.skipConfirm) {
        const ok = confirm(`Saldo gotówki spadnie do ${formatPlnAmount(next)}. Kontynuować?`);
        if (!ok) return null;
    }

    return updateAssetInState({ ...asset, amount: next });
}

function registerCashMovement({ assetId = PRIMARY_CASH_ASSET_ID, delta, date, note, source, sourceRef }) {
    if (!delta) return null;
    if (assetId === PRIMARY_CASH_ASSET_ID && !ensurePrimaryCashAsset()) return null;
    const updated = adjustCashAssetAmount(assetId, delta);
    if (!updated) return null;

    const movement = normalizeCashMovement({
        assetId,
        delta,
        date,
        note,
        source,
        sourceRef
    });
    if (!movement) return null;

    if (!Array.isArray(appState.cashMovements)) appState.cashMovements = [];
    appState.cashMovements.unshift(movement);
    return movement;
}

function removeCashMovement(movementId) {
    if (!movementId || !Array.isArray(appState.cashMovements)) return false;
    const idx = appState.cashMovements.findIndex((m) => m.id === movementId);
    if (idx < 0) return false;

    const movement = appState.cashMovements[idx];
    adjustCashAssetAmount(movement.assetId, -movement.delta, { skipConfirm: true });
    appState.cashMovements.splice(idx, 1);
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
    return tx.affectsCash === true;
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

    const delta = tx.type === 'income' ? tx.amount : -tx.amount;
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
    return (appState.cashMovements || [])
        .map(normalizeCashMovement)
        .filter(Boolean)
        .filter((m) => {
            if (assetId && m.assetId !== assetId) return false;
            if (start && m.date < start) return false;
            if (end && m.date > end) return false;
            return true;
        });
}

function runCashMigrations() {
    if (!Array.isArray(appState.cashMovements)) {
        appState.cashMovements = [];
        return true;
    }
    const before = appState.cashMovements.length;
    appState.cashMovements = appState.cashMovements.map(normalizeCashMovement).filter(Boolean);
    return appState.cashMovements.length !== before;
}
