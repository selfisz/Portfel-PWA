function roundAssetWithdrawMoney(value) {
    return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
}

function getAssetWithdrawablePln(asset) {
    if (!asset) return 0;
    return typeof getAssetValueInPln === 'function'
        ? getAssetValueInPln(asset)
        : roundAssetWithdrawMoney(asset.amount);
}

function normalizeAssetWithdrawal(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const assetAmount = roundAssetWithdrawMoney(raw.assetAmount);
    const cashAmount = roundAssetWithdrawMoney(raw.cashAmount);
    if (!assetAmount) return null;
    return {
        id: raw.id || `awd-${Date.now().toString(36)}`,
        date: raw.date || (typeof localIsoDate === 'function' ? localIsoDate(new Date()) : ''),
        assetAmount,
        cashAmount: Math.min(cashAmount, assetAmount),
        note: (raw.note || '').trim()
    };
}

function getAssetWithdrawalHistory(asset) {
    return (asset?.withdrawals || [])
        .map(normalizeAssetWithdrawal)
        .filter(Boolean)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function getCashTargetForAssetWithdrawal(sourceAsset) {
    if (!sourceAsset) return null;
    const primaryId = typeof PRIMARY_CASH_ASSET_ID !== 'undefined' ? PRIMARY_CASH_ASSET_ID : 'asset-cash-total';
    if (sourceAsset.type === 'cash' && sourceAsset.id === primaryId) return null;
    if (typeof getPrimaryCashAsset === 'function') {
        const primary = getPrimaryCashAsset();
        if (primary && primary.id !== sourceAsset.id) return primary;
    }
    if (typeof getAssetById === 'function') {
        const primary = getAssetById(primaryId);
        if (primary && primary.id !== sourceAsset.id) return primary;
    }
    return null;
}

function zeroAssetAfterWithdrawal(asset) {
    const updated = { ...asset };
    if (updated.type === 'investment') {
        updated.quantity = 0;
    } else if (updated.type === 'cash') {
        const movementsTotal = typeof getCashMovementsTotal === 'function'
            ? getCashMovementsTotal(updated.id)
            : 0;
        updated.cashBaseline = roundAssetWithdrawMoney(-movementsTotal);
        updated.amount = 0;
    } else {
        updated.amount = 0;
        if (typeof isPpkAsset === 'function' && isPpkAsset(updated)) {
            updated.ppkBreakdown = { own: 0, employer: 0, state: 0 };
            updated.ppkContributions = [];
        }
    }
    updated.archived = false;
    return typeof normalizeAsset === 'function' ? normalizeAsset(updated) : updated;
}

function buildAssetWithdrawalRecord(asset, assetAmount, cashAmount, note = '') {
    const deductions = roundAssetWithdrawMoney(assetAmount - cashAmount);
    const assetName = typeof getAssetDisplayName === 'function'
        ? getAssetDisplayName(asset)
        : (asset?.name || 'Aktywo');
    const defaultNote = deductions > 0
        ? `Wypłata z ${assetName} (potrącenia ${formatPlnAmount(deductions)})`
        : `Wypłata z ${assetName}`;
    return normalizeAssetWithdrawal({
        date: localIsoDate(new Date()),
        assetAmount,
        cashAmount,
        note: note || defaultNote
    });
}

function applyAssetWithdrawal(asset, assetAmount, cashAmount, options = {}) {
    if (!asset || typeof updateAssetInState !== 'function') return { ok: false, error: 'Brak aktywa' };

    const fullBalance = getAssetWithdrawablePln(asset);
    const normalizedAssetAmount = roundAssetWithdrawMoney(assetAmount);
    const normalizedCashAmount = roundAssetWithdrawMoney(cashAmount);

    if (fullBalance <= 0) return { ok: false, error: 'Aktywo ma zerowe saldo' };
    if (normalizedAssetAmount <= 0) return { ok: false, error: 'Podaj kwotę wypłaty z aktywa' };
    if (Math.abs(normalizedAssetAmount - fullBalance) > 0.02) {
        return { ok: false, error: `Wypłata musi obejmować całe saldo (${formatPlnAmount(fullBalance)})` };
    }
    if (normalizedCashAmount < 0 || normalizedCashAmount > normalizedAssetAmount + 0.02) {
        return { ok: false, error: 'Kwota na gotówkę nie może przekroczyć salda aktywa' };
    }

    const record = buildAssetWithdrawalRecord(asset, normalizedAssetAmount, normalizedCashAmount, options.note);
    const withdrawals = [record, ...getAssetWithdrawalHistory(asset)].slice(0, 100);
    let updated = zeroAssetAfterWithdrawal({ ...asset, withdrawals });

    if (typeof recordAssetValueHistory === 'function') {
        recordAssetValueHistory(updated, 'withdraw', {
            assetAmount: record.assetAmount,
            cashAmount: record.cashAmount
        });
    }

    updated = updateAssetInState(updated);

    const cashTarget = getCashTargetForAssetWithdrawal(asset);
    if (record.cashAmount > 0 && cashTarget && typeof registerCashMovement === 'function') {
        registerCashMovement({
            assetId: cashTarget.id,
            delta: record.cashAmount,
            date: record.date,
            note: record.note,
            source: 'asset_withdrawal',
            sourceRef: `${asset.id}|${record.id}`
        });
    }

    return { ok: true, record, asset: updated, cashTarget };
}

function openAssetWithdrawForm() {
    const asset = typeof getActiveAsset === 'function' ? getActiveAsset() : null;
    if (!asset || (typeof isDraftAssetActive === 'function' && isDraftAssetActive())) return;

    const balance = getAssetWithdrawablePln(asset);
    if (balance <= 0) {
        if (typeof showSettingsToast === 'function') showSettingsToast('Brak środków do wypłaty');
        return;
    }

    const section = document.getElementById('asset-withdraw-section');
    if (!section) return;

    if (typeof closeSellAssetForm === 'function') closeSellAssetForm();

    const assetInput = document.getElementById('asset-withdraw-asset-amount');
    const cashInput = document.getElementById('asset-withdraw-cash-amount');
    const noteInput = document.getElementById('asset-withdraw-note');
    const hintEl = document.getElementById('asset-withdraw-hint');
    const cashHintEl = document.getElementById('asset-withdraw-cash-hint');

    if (assetInput) assetInput.value = balance.toFixed(2);
    if (cashInput) cashInput.value = '';
    if (noteInput) noteInput.value = '';

    const cashTarget = getCashTargetForAssetWithdrawal(asset);
    if (cashHintEl) {
        cashHintEl.textContent = cashTarget
            ? `Dodane do: ${typeof getAssetDisplayName === 'function' ? getAssetDisplayName(cashTarget) : 'gotówka'}`
            : 'Wypłata z głównej gotówki — kwota nie trafi na inne konto (np. wypłata z bankomatu).';
    }
    if (hintEl) {
        hintEl.textContent = `Saldo aktywa: ${formatPlnAmount(balance)}. Wypłata zeruje pozycję — różnica między saldem a kwotą na gotówkę to potrącenia (np. ZUS).`;
    }

    section.classList.remove('hidden');
    cashInput?.focus();
}

function closeAssetWithdrawForm() {
    document.getElementById('asset-withdraw-section')?.classList.add('hidden');
}

function fillAssetWithdrawFullAmounts() {
    const asset = typeof getActiveAsset === 'function' ? getActiveAsset() : null;
    if (!asset) return;
    const balance = getAssetWithdrawablePln(asset);
    const assetInput = document.getElementById('asset-withdraw-asset-amount');
    const cashInput = document.getElementById('asset-withdraw-cash-amount');
    if (assetInput) assetInput.value = balance > 0 ? balance.toFixed(2) : '';
    if (cashInput) cashInput.value = balance > 0 ? balance.toFixed(2) : '';
}

function confirmAssetWithdrawal() {
    const asset = typeof getActiveAsset === 'function' ? getActiveAsset() : null;
    if (!asset) return;

    const assetAmount = parseFloat(document.getElementById('asset-withdraw-asset-amount')?.value) || 0;
    const cashAmount = parseFloat(document.getElementById('asset-withdraw-cash-amount')?.value) || 0;
    const note = document.getElementById('asset-withdraw-note')?.value?.trim() || '';

    const result = applyAssetWithdrawal(asset, assetAmount, cashAmount, { note });
    if (!result.ok) {
        if (typeof showSettingsToast === 'function') showSettingsToast(result.error || 'Nie udało się wykonać wypłaty');
        return;
    }

    if (typeof saveState === 'function') saveState();
    closeAssetWithdrawForm();
    if (typeof renderAssetDetails === 'function') renderAssetDetails();
    if (typeof renderAssets === 'function') renderAssets();

    const deductions = roundAssetWithdrawMoney(result.record.assetAmount - result.record.cashAmount);
    const toastParts = [`Wypłacono ${formatPlnAmount(result.record.assetAmount)}`];
    if (result.record.cashAmount > 0) toastParts.push(`na gotówkę ${formatPlnAmount(result.record.cashAmount)}`);
    if (deductions > 0) toastParts.push(`potrącenia ${formatPlnAmount(deductions)}`);
    if (typeof showSettingsToast === 'function') showSettingsToast(toastParts.join(' · '));
}

function buildAssetWithdrawalHistoryHtml(asset) {
    const history = getAssetWithdrawalHistory(asset);
    if (!history.length) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s ?? '');
    const rows = history.map((entry) => {
        const deductions = roundAssetWithdrawMoney(entry.assetAmount - entry.cashAmount);
        const meta = deductions > 0
            ? `Na gotówkę ${formatPlnAmount(entry.cashAmount)} · potrącenia ${formatPlnAmount(deductions)}`
            : (entry.cashAmount > 0 ? `Na gotówkę ${formatPlnAmount(entry.cashAmount)}` : 'Bez wpływu na gotówkę');
        return `<div class="asset-cash-tx-row">
            <span class="asset-cash-tx-row-text">
                <span class="asset-cash-tx-row-title">${esc(entry.note || 'Wypłata')}</span>
                <span class="asset-cash-tx-row-meta">${esc(formatTxDate(entry.date))} · ${esc(meta)}</span>
            </span>
            <span class="asset-cash-tx-row-amount expense">−${formatPlnAmount(entry.assetAmount)}</span>
        </div>`;
    }).join('');
    return `<section class="asset-withdraw-history-section">
        <div class="asset-cash-tx-head">
            <span class="section-label">Historia wypłat</span>
        </div>
        <div class="asset-cash-tx-list">${rows}</div>
    </section>`;
}
