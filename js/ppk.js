const PPK_EMPLOYER_KEEP_RATIO = 0.7;
const PPK_CAPITAL_GAINS_TAX = 0.19;

function isPpkAsset(asset) {
    return asset?.type === 'retirement' && asset?.retirementKind === 'PPK';
}

function normalizePpkContribution(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const own = Math.max(0, parseFloat(raw.own) || 0);
    const employer = Math.max(0, parseFloat(raw.employer) || 0);
    const state = Math.max(0, parseFloat(raw.state) || 0);
    if (!raw.date && own === 0 && employer === 0 && state === 0) return null;
    return {
        id: raw.id || `ppk-c-${Date.now().toString(36)}`,
        date: raw.date || (typeof localIsoDate === 'function' ? localIsoDate(new Date()) : ''),
        own,
        employer,
        state
    };
}

function normalizePpkBreakdown(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        own: Math.max(0, parseFloat(source.own) || 0),
        employer: Math.max(0, parseFloat(source.employer) || 0),
        state: Math.max(0, parseFloat(source.state) || 0)
    };
}

function normalizePpkAssetFields(asset) {
    if (!isPpkAsset(asset)) {
        delete asset.ppkBreakdown;
        delete asset.ppkContributions;
        return asset;
    }
    asset.ppkBreakdown = normalizePpkBreakdown(asset.ppkBreakdown || {});
    asset.ppkContributions = Array.isArray(asset.ppkContributions)
        ? asset.ppkContributions.map(normalizePpkContribution).filter(Boolean)
        : [];
    return asset;
}

function getPpkContributions(asset) {
    if (!isPpkAsset(asset)) return [];
    return (asset.ppkContributions || [])
        .map(normalizePpkContribution)
        .filter(Boolean)
        .sort((a, b) => b.date.localeCompare(a.date));
}

function sumPpkContributions(contributions) {
    return contributions.reduce((acc, entry) => ({
        own: acc.own + entry.own,
        employer: acc.employer + entry.employer,
        state: acc.state + entry.state
    }), { own: 0, employer: 0, state: 0 });
}

function getPpkBreakdown(asset) {
    if (!isPpkAsset(asset)) return { own: 0, employer: 0, state: 0 };
    const history = getPpkContributions(asset);
    if (history.length) return sumPpkContributions(history);
    return normalizePpkBreakdown(asset.ppkBreakdown || {});
}

function getPpkGainAmount(asset, breakdown = null) {
    const parts = breakdown || getPpkBreakdown(asset);
    const total = typeof getAssetValueInPln === 'function' ? getAssetValueInPln(asset) : (parseFloat(asset?.amount) || 0);
    const gain = total - parts.own - parts.employer - parts.state;
    return Math.max(0, Math.round(gain * 100) / 100);
}

function calculatePpkEarlyWithdrawal(asset) {
    const total = typeof getAssetValueInPln === 'function' ? getAssetValueInPln(asset) : (parseFloat(asset?.amount) || 0);
    const breakdown = getPpkBreakdown(asset);
    const gainGross = getPpkGainAmount(asset, breakdown);
    const ownKept = breakdown.own;
    const employerKept = Math.round(breakdown.employer * PPK_EMPLOYER_KEEP_RATIO * 100) / 100;
    const employerToZus = Math.round(breakdown.employer * (1 - PPK_EMPLOYER_KEEP_RATIO) * 100) / 100;
    const stateLost = breakdown.state;
    const gainTax = Math.round(gainGross * PPK_CAPITAL_GAINS_TAX * 100) / 100;
    const gainNet = Math.round(gainGross * (1 - PPK_CAPITAL_GAINS_TAX) * 100) / 100;
    const payout = Math.round((ownKept + employerKept + gainNet) * 100) / 100;

    return {
        total,
        breakdown,
        gainGross,
        ownKept,
        employerKept,
        employerToZus,
        stateLost,
        gainTax,
        gainNet,
        payout,
        lossTotal: Math.round((total - payout) * 100) / 100
    };
}

function formatPpkContributionLine(entry) {
    const parts = [];
    if (entry.own > 0) parts.push(`Ty ${formatPlnAmount(entry.own)}`);
    if (entry.employer > 0) parts.push(`Pracodawca ${formatPlnAmount(entry.employer)}`);
    if (entry.state > 0) parts.push(`Państwo ${formatPlnAmount(entry.state)}`);
    return parts.join(' · ') || '—';
}

function buildPpkBreakdownSectionHtml(asset) {
    const breakdown = getPpkBreakdown(asset);
    const gain = getPpkGainAmount(asset, breakdown);
    const fmt = typeof formatPlnAmountHtml === 'function' ? formatPlnAmountHtml : formatPlnAmount;
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s ?? '');

    return `<section class="ppk-section">
        <h3 class="ppk-section-title">Składniki salda</h3>
        <div class="loan-details-grid">
            ${assetDetailRow('Wpłaty własne', fmt(breakdown.own))}
            ${assetDetailRow('Wpłaty pracodawcy', fmt(breakdown.employer))}
            ${assetDetailRow('Dopłaty państwa', fmt(breakdown.state))}
            ${assetDetailRow('Zysk kapitałowy', fmt(gain))}
        </div>
        ${getPpkContributions(asset).length ? '' : `<p class="ppk-hint">${esc('Uzupełnij składniki w edycji lub dodaj historię wpłat.')}</p>`}
    </section>`;
}

function buildPpkEarlyWithdrawalSectionHtml(asset) {
    const calc = calculatePpkEarlyWithdrawal(asset);
    const fmt = typeof formatPlnAmountHtml === 'function' ? formatPlnAmountHtml : formatPlnAmount;

    return `<section class="ppk-section ppk-early-withdrawal">
        <h3 class="ppk-section-title">Wcześniejsza wypłata (przed 60. r.ż.)</h3>
        <p class="ppk-hint">Szacunek wg zasad PPK: tracisz dopłaty państwa, 30% wpłat pracodawcy trafia do ZUS, od zysku kapitałowego pobierany jest podatek 19%.</p>
        <div class="ppk-payout-card">
            <span class="ppk-payout-label">Otrzymasz na rękę</span>
            <strong class="ppk-payout-value">${fmt(calc.payout)}</strong>
            <span class="ppk-payout-meta">z ${fmt(calc.total)} na koncie</span>
        </div>
        <div class="loan-details-grid ppk-deductions-grid">
            ${assetDetailRow('Wpłaty własne (100%)', fmt(calc.ownKept))}
            ${assetDetailRow('Wpłaty pracodawcy (70%)', fmt(calc.employerKept))}
            ${calc.gainGross > 0 ? assetDetailRow('Zysk po podatku Belki', fmt(calc.gainNet)) : ''}
            ${assetDetailRow('Utrata dopłat państwa', `−${formatPlnAmount(calc.stateLost)}`)}
            ${assetDetailRow('Do ZUS (30% pracodawcy)', `−${formatPlnAmount(calc.employerToZus)}`)}
            ${calc.gainTax > 0 ? assetDetailRow('Podatek Belki (19%)', `−${formatPlnAmount(calc.gainTax)}`) : ''}
            ${assetDetailRow('Łączna utrata', `−${formatPlnAmount(calc.lossTotal)}`)}
        </div>
    </section>`;
}

function buildPpkContributionRowHtml(entry) {
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s ?? '');
    const fmtDate = typeof formatTxDate === 'function' ? formatTxDate : (d) => d;
    const total = entry.own + entry.employer + entry.state;
    return `<div class="asset-cash-tx-row ppk-contrib-row">
        <span class="asset-cash-tx-row-text">
            <span class="asset-cash-tx-row-title">${esc(formatPpkContributionLine(entry))}</span>
            <span class="asset-cash-tx-row-meta">${esc(fmtDate(entry.date))}</span>
        </span>
        <span class="asset-cash-tx-row-amount income">+${formatPlnAmount(total)}</span>
    </div>`;
}

function renderPpkContributionsList(asset) {
    const section = document.getElementById('asset-ppk-section');
    const list = document.getElementById('asset-ppk-contrib-list');
    if (!section || !list) return;

    if (!isPpkAsset(asset)) {
        section.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    section.classList.remove('hidden');
    const contributions = getPpkContributions(asset);
    if (!contributions.length) {
        list.innerHTML = '<p class="asset-cash-tx-empty">Brak zapisanej historii wpłat — dodaj wpłaty w trybie edycji.</p>';
        return;
    }

    list.innerHTML = contributions.map(buildPpkContributionRowHtml).join('');
}

function renderPpkContributionsEditList(asset) {
    const list = document.getElementById('asset-ppk-contrib-edit-list');
    if (!list) return;
    if (!isPpkAsset(asset)) {
        list.innerHTML = '';
        return;
    }

    const contributions = getPpkContributions(asset);
    if (!contributions.length) {
        list.innerHTML = '<p class="ppk-hint">Brak wpisów — dodaj miesięczne wpłaty poniżej.</p>';
        return;
    }

    list.innerHTML = contributions.map((entry) => {
        const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s ?? '');
        const fmtDate = typeof formatTxDate === 'function' ? formatTxDate : (d) => d;
        return `<div class="ppk-contrib-edit-row">
            <span>${esc(fmtDate(entry.date))} — ${esc(formatPpkContributionLine(entry))}</span>
            <button type="button" class="btn-icon ppk-contrib-remove" aria-label="Usuń wpłatę" onclick="removePpkContributionEntry('${esc(entry.id)}')">×</button>
        </div>`;
    }).join('');
}

function togglePpkEditFields() {
    const kind = document.getElementById('asset-retirement-kind-input')?.value || '';
    const wrap = document.getElementById('asset-ppk-edit-wrap');
    if (wrap) wrap.classList.toggle('hidden', kind !== 'PPK');
}

function populatePpkEditForm(asset) {
    togglePpkEditFields();
    if (!isPpkAsset(asset)) return;

    const breakdown = getPpkBreakdown(asset);
    const ownEl = document.getElementById('asset-ppk-own-input');
    const employerEl = document.getElementById('asset-ppk-employer-input');
    const stateEl = document.getElementById('asset-ppk-state-input');
    const dateEl = document.getElementById('asset-ppk-contrib-date');
    const contribOwnEl = document.getElementById('asset-ppk-contrib-own');
    const contribEmployerEl = document.getElementById('asset-ppk-contrib-employer');
    const contribStateEl = document.getElementById('asset-ppk-contrib-state');

    if (ownEl) ownEl.value = breakdown.own || '';
    if (employerEl) employerEl.value = breakdown.employer || '';
    if (stateEl) stateEl.value = breakdown.state || '';
    if (dateEl && !dateEl.value) dateEl.value = typeof localIsoDate === 'function' ? localIsoDate(new Date()) : '';
    if (contribOwnEl) contribOwnEl.value = '';
    if (contribEmployerEl) contribEmployerEl.value = '';
    if (contribStateEl) contribStateEl.value = '';

    renderPpkContributionsEditList(asset);
}

function onAssetRetirementKindInputChange() {
    togglePpkEditFields();
    const asset = typeof getActiveAsset === 'function' ? getActiveAsset() : null;
    if (asset) populatePpkEditForm(asset);
}

function getPpkContributionTotal(entry) {
    if (!entry) return 0;
    return Math.round((entry.own + entry.employer + entry.state) * 100) / 100;
}

function applyPpkContributionDelta(asset, delta) {
    if (!isPpkAsset(asset) || !delta) return;
    const next = Math.round(((parseFloat(asset.amount) || 0) + delta) * 100) / 100;
    asset.amount = Math.max(0, next);
    const amountEl = document.getElementById('asset-amount-input');
    if (amountEl) amountEl.value = asset.amount || '';
}

function addPpkContributionEntry() {
    const asset = typeof getActiveAsset === 'function' ? getActiveAsset() : null;
    if (!isPpkAsset(asset)) return;

    const entry = normalizePpkContribution({
        date: document.getElementById('asset-ppk-contrib-date')?.value,
        own: document.getElementById('asset-ppk-contrib-own')?.value,
        employer: document.getElementById('asset-ppk-contrib-employer')?.value,
        state: document.getElementById('asset-ppk-contrib-state')?.value
    });
    if (!entry) return;

    asset.ppkContributions = asset.ppkContributions || [];
    asset.ppkContributions.push(entry);
    applyPpkContributionDelta(asset, getPpkContributionTotal(entry));

    document.getElementById('asset-ppk-contrib-own').value = '';
    document.getElementById('asset-ppk-contrib-employer').value = '';
    document.getElementById('asset-ppk-contrib-state').value = '';

    renderPpkContributionsEditList(asset);
    syncPpkBreakdownInputsFromHistory(asset);
}

function removePpkContributionEntry(entryId) {
    const asset = typeof getActiveAsset === 'function' ? getActiveAsset() : null;
    if (!isPpkAsset(asset) || !entryId) return;
    const removed = (asset.ppkContributions || []).find((entry) => entry.id === entryId);
    asset.ppkContributions = (asset.ppkContributions || []).filter((entry) => entry.id !== entryId);
    if (removed) applyPpkContributionDelta(asset, -getPpkContributionTotal(removed));
    renderPpkContributionsEditList(asset);
    syncPpkBreakdownInputsFromHistory(asset);
}

function syncPpkBreakdownInputsFromHistory(asset) {
    if (!isPpkAsset(asset)) return;
    if (getPpkContributions(asset).length) {
        const breakdown = getPpkBreakdown(asset);
        const ownEl = document.getElementById('asset-ppk-own-input');
        const employerEl = document.getElementById('asset-ppk-employer-input');
        const stateEl = document.getElementById('asset-ppk-state-input');
        if (ownEl) ownEl.value = breakdown.own || '';
        if (employerEl) employerEl.value = breakdown.employer || '';
        if (stateEl) stateEl.value = breakdown.state || '';
    }
}

function readPpkFieldsFromForm(payload) {
    if (!isPpkAsset(payload)) return payload;

    payload.ppkContributions = Array.isArray(payload.ppkContributions)
        ? payload.ppkContributions.map(normalizePpkContribution).filter(Boolean)
        : [];

    if (payload.ppkContributions.length) {
        payload.ppkBreakdown = getPpkBreakdown(payload);
    } else {
        payload.ppkBreakdown = normalizePpkBreakdown({
            own: document.getElementById('asset-ppk-own-input')?.value,
            employer: document.getElementById('asset-ppk-employer-input')?.value,
            state: document.getElementById('asset-ppk-state-input')?.value
        });
    }

    return normalizePpkAssetFields(payload);
}
