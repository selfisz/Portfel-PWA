const ASSET_TYPES = ['investment', 'deposit', 'cash', 'retirement'];

const ASSET_TYPE_LABELS = {
    investment: 'Inwestycja',
    deposit: 'Lokata',
    cash: 'Gotówka',
    retirement: 'PPK / IKZE'
};

const RETIREMENT_KINDS = ['PPK', 'IKZE', 'EMERYTURA', 'KZP'];

const RETIREMENT_KIND_LABELS = {
    PPK: 'PPK',
    IKZE: 'IKZE',
    EMERYTURA: 'Emerytura',
    KZP: 'KZP'
};

const ASSET_HORIZON_LABELS = {
    short: 'Krótkoterminowe',
    long: 'Długoterminowe'
};

const ASSET_TYPE_ICONS = {
    investment: '📈',
    deposit: '🏦',
    cash: '💵',
    retirement: '🛡️'
};

let assetsTypeFilter = 'all';
let assetsArchiveExpanded = false;
let assetDetailsMode = 'view';
let activeAssetId = null;
let draftAsset = null;

function getDefaultAsset(type = 'investment') {
    return {
        id: '',
        type: ASSET_TYPES.includes(type) ? type : 'investment',
        name: '',
        currency: 'PLN',
        archived: false,
        archivedAt: '',
        ticker: '',
        quantity: 0,
        purchasePrice: 0,
        currentPrice: 0,
        amount: 0,
        interestRate: 0,
        endDate: '',
        retirementKind: 'PPK',
        institution: '',
        includeInSummary: true,
        goalTarget: 0
    };
}

function normalizeAsset(raw) {
    const type = ASSET_TYPES.includes(raw?.type) ? raw.type : 'investment';
    const asset = { ...getDefaultAsset(type), ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!asset.id) asset.id = `asset-${Date.now().toString(36)}`;
    asset.type = ASSET_TYPES.includes(asset.type) ? asset.type : 'investment';
    asset.name = (asset.name || '').trim();
    asset.currency = asset.currency === 'EUR' ? 'EUR' : 'PLN';
    asset.archived = !!asset.archived;
    asset.archivedAt = asset.archivedAt || '';
    if (asset.includeInSummary === undefined || asset.includeInSummary === null) {
        asset.includeInSummary = true;
    } else {
        asset.includeInSummary = !!asset.includeInSummary;
    }

    if (asset.type === 'investment') {
        asset.ticker = (asset.ticker || '').trim().toUpperCase();
        asset.quantity = Math.max(0, parseFloat(asset.quantity) || 0);
        asset.purchasePrice = Math.max(0, parseFloat(asset.purchasePrice) || 0);
        asset.currentPrice = Math.max(0, parseFloat(asset.currentPrice ?? asset.currentPriceManual) || 0);
        if (!asset.name && asset.ticker) asset.name = asset.ticker;
    } else {
        asset.amount = Math.max(0, parseFloat(asset.amount) || 0);
        if (asset.type === 'deposit') {
            asset.interestRate = Math.max(0, parseFloat(asset.interestRate) || 0);
            asset.endDate = asset.endDate || '';
        }
        if (asset.type === 'retirement') {
            asset.retirementKind = RETIREMENT_KINDS.includes(asset.retirementKind) ? asset.retirementKind : 'PPK';
            asset.institution = (asset.institution || '').trim();
        }
    }
    asset.goalTarget = Math.max(0, parseFloat(asset.goalTarget) || 0);

    return asset;
}

function getAssets() {
    return (appState.assets || []).map(normalizeAsset);
}

function getActiveAssets() {
    return getAssets().filter((asset) => !asset.archived);
}

function getSummaryAssets() {
    return getActiveAssets().filter((asset) => asset.includeInSummary !== false);
}

function getAssetHorizon(asset) {
    const a = normalizeAsset(asset);
    if (a.type === 'retirement') return 'long';
    return 'short';
}

function getAssetsByHorizon(horizon) {
    return getActiveAssets().filter((asset) => getAssetHorizon(asset) === horizon);
}

function migrateMbankEmeryturaAsset() {
    if (!Array.isArray(appState.assets)) return false;
    let changed = false;
    appState.assets = appState.assets.map((raw) => {
        const isLegacyIke = raw?.id === 'asset-ret-mbank-ike'
            || (raw?.retirementKind === 'IKE' && /mbank/i.test(raw?.name || ''))
            || (/mbank.*ike/i.test(raw?.name || '') && !/ikze/i.test(raw?.name || ''));
        if (!isLegacyIke) return raw;
        changed = true;
        return {
            ...raw,
            id: 'asset-ret-mbank-emerytura',
            name: 'mBank — Emerytura',
            retirementKind: 'EMERYTURA',
            institution: raw.institution || 'mBank'
        };
    });
    return changed;
}

function getArchivedAssets() {
    return getAssets().filter((asset) => asset.archived);
}

function getAssetById(id) {
    if (!id) return null;
    return getAssets().find((asset) => asset.id === id) || null;
}

function updateAssetInState(asset) {
    const normalized = normalizeAsset(asset);
    if (!Array.isArray(appState.assets)) appState.assets = [];
    const idx = appState.assets.findIndex((a) => a.id === normalized.id);
    if (idx >= 0) appState.assets[idx] = normalized;
    else appState.assets.push(normalized);
    return normalized;
}

const LEGACY_CASH_ASSET_IDS = ['asset-cash-portfel', 'asset-cash-mbank-1', 'asset-cash-mbank-2'];

const CASH_TOTAL_AMOUNT = 710 + 5066.93 + 2738.33;

function isLegacyVwceAsset(raw) {
    const asset = normalizeAsset(raw);
    if (asset.type !== 'investment') return false;
    const ticker = (asset.ticker || '').toUpperCase();
    const name = (asset.name || '').toUpperCase();
    return ticker.includes('VWCE') || name.includes('VWCE') || name.includes('VANGUARD FTSE');
}

function migrateInvestmentsToAssets() {
    let changed = false;
    if (!Array.isArray(appState.assets)) appState.assets = [];

    if (!appState.assets.length && Array.isArray(appState.investments) && appState.investments.length) {
        appState.assets = appState.investments
            .filter((inv) => !isLegacyVwceAsset(inv))
            .map((inv, index) => normalizeAsset({
            id: inv.id || `asset-${String(inv.ticker || 'inv').toLowerCase().replace(/[^a-z0-9]+/g, '')}-${index}`,
            type: 'investment',
            name: inv.name,
            ticker: inv.ticker,
            quantity: inv.quantity,
            purchasePrice: inv.purchasePrice,
            currentPrice: inv.currentPriceManual ?? inv.currentPrice,
            currency: inv.currency
        }));
        changed = true;
    }

    if (appState.investments) {
        delete appState.investments;
        changed = true;
    }

    const before = JSON.stringify(appState.assets);
    appState.assets = (appState.assets || []).map(normalizeAsset);
    if (JSON.stringify(appState.assets) !== before) changed = true;
    return changed;
}

function consolidateUserAssets() {
    if (!Array.isArray(appState.assets)) appState.assets = [];
    let changed = false;

    const beforeLen = appState.assets.length;
    appState.assets = appState.assets.filter((asset) => !isLegacyVwceAsset(asset));
    if (appState.assets.length !== beforeLen) changed = true;

    LEGACY_CASH_ASSET_IDS.forEach((id) => {
        const idx = appState.assets.findIndex((a) => a.id === id);
        if (idx >= 0) {
            appState.assets.splice(idx, 1);
            changed = true;
        }
    });

    return changed;
}

function getUserAssetsSeedSnapshots() {
    return [
        { id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: CASH_TOTAL_AMOUNT },
        {
            id: 'asset-inv-xtb',
            type: 'investment',
            name: 'XTB — akcje',
            quantity: 1,
            purchasePrice: 1105.08,
            currentPrice: 1105.08,
            currency: 'PLN'
        },
        {
            id: 'asset-inv-mbank',
            type: 'investment',
            name: 'mBank — akcje',
            quantity: 1,
            purchasePrice: 4556.61,
            currentPrice: 4556.61,
            currency: 'PLN'
        },
        { id: 'asset-cash-mbank-cele', type: 'cash', name: 'mBank — Cele', amount: 2172.36 },
        {
            id: 'asset-ret-mbank-emerytura',
            type: 'retirement',
            name: 'mBank — Emerytura',
            retirementKind: 'EMERYTURA',
            institution: 'mBank',
            amount: 1687.98
        },
        {
            id: 'asset-ret-ikze-mbank',
            type: 'retirement',
            name: 'mBank — IKZE',
            retirementKind: 'IKZE',
            institution: 'mBank',
            amount: 20703.66
        },
        {
            id: 'asset-ret-ppk',
            type: 'retirement',
            name: 'PPK',
            retirementKind: 'PPK',
            amount: 9927.44
        },
        {
            id: 'asset-ret-kzp',
            type: 'retirement',
            name: 'KZP',
            retirementKind: 'KZP',
            amount: 4200
        }
    ];
}

function ensureUserAssetsSeed() {
    if (!Array.isArray(appState.assets)) appState.assets = [];
    let changed = false;

    getUserAssetsSeedSnapshots().forEach((snapshot) => {
        const normalized = normalizeAsset(snapshot);
        const idx = appState.assets.findIndex((a) => a.id === normalized.id);
        if (idx < 0) {
            appState.assets.push(normalized);
            changed = true;
            return;
        }
        const merged = normalizeAsset({ ...appState.assets[idx], ...snapshot });
        const prev = JSON.stringify(normalizeAsset(appState.assets[idx]));
        const next = JSON.stringify(merged);
        if (prev !== next) {
            appState.assets[idx] = merged;
            changed = true;
        }
    });

    return changed;
}

function runAssetMigrations() {
    const migrated = migrateInvestmentsToAssets();
    const consolidated = consolidateUserAssets();
    const emeryturaFix = migrateMbankEmeryturaAsset();
    const seeded = ensureUserAssetsSeed();
    return migrated || consolidated || emeryturaFix || seeded;
}

function getAssetDisplayName(asset) {
    if (!asset) return 'Aktywo';
    if (asset.name?.trim()) return asset.name.trim();
    if (asset.type === 'investment' && asset.ticker) return asset.ticker;
    return ASSET_TYPE_LABELS[asset.type] || 'Aktywo';
}

function getAssetValueInPln(asset) {
    return getAssetValuePln(normalizeAsset(asset));
}

function getAssetCostInPln(asset) {
    return getAssetCostPln(normalizeAsset(asset));
}

function getAssetGainPln(asset) {
    const a = normalizeAsset(asset);
    if (a.type !== 'investment') return 0;
    return getAssetValueInPln(a) - getAssetCostInPln(a);
}

function getAssetGainPct(asset) {
    const a = normalizeAsset(asset);
    if (a.type !== 'investment') return 0;
    const cost = getAssetCostInPln(a);
    if (!cost) return 0;
    return (getAssetGainPln(a) / cost) * 100;
}

function getActiveAssetsTotalPln(assets = null) {
    const list = assets || getSummaryAssets();
    return list.reduce((sum, asset) => sum + getAssetValueInPln(asset), 0);
}

function getActiveAssetsGainPln(assets = null) {
    const list = assets || getSummaryAssets();
    return list
        .filter((asset) => asset.type === 'investment')
        .reduce((sum, asset) => sum + getAssetGainPln(asset), 0);
}

function getActiveAssetsGainPct(assets = null) {
    const list = assets || getSummaryAssets();
    const cost = list
        .filter((asset) => asset.type === 'investment')
        .reduce((sum, asset) => sum + getAssetCostInPln(asset), 0);
    if (!cost) return 0;
    return (getActiveAssetsGainPln(list) / cost) * 100;
}

function createDraftAsset(type = 'investment') {
    return normalizeAsset({
        id: `asset-${Date.now().toString(36)}`,
        type,
        name: '',
        currency: type === 'investment' ? 'EUR' : 'PLN'
    });
}

function isDraftAssetActive() {
    return !!(draftAsset && activeAssetId === draftAsset.id);
}

function getActiveAsset() {
    if (isDraftAssetActive()) return draftAsset;
    if (activeAssetId) {
        const found = getAssetById(activeAssetId);
        if (found) return found;
    }
    return getActiveAssets()[0] || null;
}

function formatAssetNativeValue(asset) {
    const a = normalizeAsset(asset);
    if (a.type === 'investment') {
        const value = (a.quantity || 0) * (a.currentPrice || 0);
        return `${value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${a.currency}`;
    }
    return `${(a.amount || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${a.currency}`;
}

function setAssetsTypeFilter(filter) {
    assetsTypeFilter = filter;
    renderAssets();
}

function toggleAssetSummaryInclude(assetId) {
    const asset = getAssetById(assetId);
    if (!asset) return;
    updateAssetInState({ ...asset, includeInSummary: asset.includeInSummary === false });
    saveState();
    renderAssets();
    if (typeof renderReports === 'function' && document.getElementById('view-reports')?.classList.contains('active')) {
        renderReports();
    }
}

function renderAssetsSummaryChips(activeAssets) {
    const el = document.getElementById('assets-summary-chips');
    const label = document.getElementById('assets-summary-label');
    if (!el) return;
    if (activeAssets.length < 2) {
        el.innerHTML = '';
        el.classList.add('hidden');
        if (label) label.classList.add('hidden');
        return;
    }
    el.classList.remove('hidden');
    if (label) label.classList.remove('hidden');
    el.innerHTML = activeAssets.map((asset) => {
        const included = asset.includeInSummary !== false;
        return `<button type="button" class="toggle-btn loans-chip${included ? ' active' : ''}" onclick="toggleAssetSummaryInclude('${escapeHtml(asset.id)}')" aria-pressed="${included ? 'true' : 'false'}">${escapeHtml(getAssetDisplayName(asset))}</button>`;
    }).join('');
}

function renderAssetsHorizonFilter() {
    const nav = document.getElementById('assets-type-filter');
    if (!nav) return;
    const shortCount = getAssetsByHorizon('short').length;
    const longCount = getAssetsByHorizon('long').length;
    if (!getActiveAssets().length) {
        nav.innerHTML = '';
        nav.classList.add('hidden');
        return;
    }
    nav.classList.remove('hidden');
    const chips = [
        { id: 'all', label: 'Wszystkie' },
        { id: 'short', label: 'Krótkoterminowe' },
        { id: 'long', label: 'Długoterminowe' }
    ];
    nav.innerHTML = chips
        .filter((chip) => chip.id === 'all' || (chip.id === 'short' ? shortCount : longCount) > 0 || assetsTypeFilter === chip.id)
        .map((chip) => {
            const count = chip.id === 'all'
                ? getActiveAssets().length
                : chip.id === 'short' ? shortCount : longCount;
            return `<button type="button" class="toggle-btn loans-chip${assetsTypeFilter === chip.id ? ' active' : ''}" onclick="setAssetsTypeFilter('${chip.id}')">${chip.label} (${count})</button>`;
        })
        .join('');
}

function filterAssetsByHorizon(assets) {
    if (assetsTypeFilter === 'short' || assetsTypeFilter === 'long') {
        return assets.filter((asset) => getAssetHorizon(asset) === assetsTypeFilter);
    }
    return assets;
}

function renderAssetsHorizonSection(horizon, assets) {
    const sectionAssets = assets.filter((asset) => getAssetHorizon(asset) === horizon);
    if (!sectionAssets.length) return '';

    const sectionTotal = getActiveAssetsTotalPln(
        sectionAssets.filter((asset) => asset.includeInSummary !== false)
    );
    const hint = horizon === 'short'
        ? 'Gotówka, Cele, akcje, lokaty'
        : 'PPK, IKZE, emerytura, KZP';

    return `<section class="assets-horizon-section">
        <div class="assets-horizon-head">
            <h2 class="assets-horizon-title">${ASSET_HORIZON_LABELS[horizon]}</h2>
            <span class="assets-horizon-total">${formatPlnAmount(sectionTotal)}</span>
        </div>
        <p class="reports-hint assets-horizon-hint">${hint}</p>
        <div class="assets-horizon-list">${sectionAssets.map((asset) => renderAssetCardHtml(asset)).join('')}</div>
    </section>`;
}

function toggleAssetsArchive() {
    assetsArchiveExpanded = !assetsArchiveExpanded;
    const list = document.getElementById('assets-archive-list');
    const toggle = document.querySelector('.assets-archive-toggle');
    if (list) list.classList.toggle('hidden', !assetsArchiveExpanded);
    if (toggle) {
        toggle.setAttribute('aria-expanded', assetsArchiveExpanded ? 'true' : 'false');
        toggle.classList.toggle('assets-archive-toggle--open', assetsArchiveExpanded);
    }
}

function filterAssetsByChip(assets) {
    return filterAssetsByHorizon(assets);
}

function renderAssetsTypeFilter() {
    renderAssetsHorizonFilter();
}

function renderInvestmentCardHtml(asset) {
    const gainPct = getAssetGainPct(asset);
    const gainPln = getAssetGainPln(asset);
    const gainClass = gainPct >= 0 ? 'income' : 'expense';
    const meta = `${asset.quantity} szt. · śr. ${asset.purchasePrice.toFixed(2)} ${asset.currency}`;
    return `<div class="card asset-summary-card asset-clickable" role="button" tabindex="0"
        onclick="openAssetDetails('${escapeHtml(asset.id)}')"
        onkeydown="if (event.key === 'Enter') openAssetDetails('${escapeHtml(asset.id)}')">
        <div class="asset-card-head">
            <span class="asset-type-badge">${ASSET_TYPE_ICONS.investment}</span>
            <div>
                <h2 class="asset-card-title">${escapeHtml(getAssetDisplayName(asset))}</h2>
                <p class="asset-card-sub">${escapeHtml(asset.ticker || meta)}</p>
            </div>
        </div>
        <div class="asset-card-hero">
            <span class="loan-stat-label">Wartość</span>
            <strong class="asset-card-value">${formatPlnAmount(getAssetValueInPln(asset))}</strong>
        </div>
        <p class="loan-hero-meta">${escapeHtml(meta)} · <span class="${gainClass}">${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${gainPln >= 0 ? '+' : ''}${formatPlnAmount(gainPln)})</span></p>
    </div>`;
}

function renderDepositCardHtml(asset) {
    const endLine = asset.endDate ? ` · do ${formatTxDate(asset.endDate)}` : '';
    const rateLine = asset.interestRate > 0 ? `${asset.interestRate.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%` : '—';
    return `<div class="card asset-summary-card asset-clickable" role="button" tabindex="0"
        onclick="openAssetDetails('${escapeHtml(asset.id)}')"
        onkeydown="if (event.key === 'Enter') openAssetDetails('${escapeHtml(asset.id)}')">
        <div class="asset-card-head">
            <span class="asset-type-badge">${ASSET_TYPE_ICONS.deposit}</span>
            <div>
                <h2 class="asset-card-title">${escapeHtml(getAssetDisplayName(asset))}</h2>
                <p class="asset-card-sub">Lokata</p>
            </div>
        </div>
        <div class="asset-card-hero">
            <span class="loan-stat-label">Saldo</span>
            <strong class="asset-card-value">${formatPlnAmount(getAssetValueInPln(asset))}</strong>
        </div>
        <p class="loan-hero-meta">Oprocentowanie ${escapeHtml(rateLine)}${escapeHtml(endLine)}</p>
    </div>`;
}

function renderCashCardHtml(asset) {
    const isCele = /cele/i.test(asset.name || '');
    const sub = isCele ? 'Cele oszczędnościowe' : 'Gotówka / konto';
    return `<div class="card asset-summary-card asset-clickable" role="button" tabindex="0"
        onclick="openAssetDetails('${escapeHtml(asset.id)}')"
        onkeydown="if (event.key === 'Enter') openAssetDetails('${escapeHtml(asset.id)}')">
        <div class="asset-card-head">
            <span class="asset-type-badge">${ASSET_TYPE_ICONS.cash}</span>
            <div>
                <h2 class="asset-card-title">${escapeHtml(getAssetDisplayName(asset))}</h2>
                <p class="asset-card-sub">${escapeHtml(sub)}</p>
            </div>
        </div>
        <div class="asset-card-hero">
            <span class="loan-stat-label">Saldo</span>
            <strong class="asset-card-value">${formatPlnAmount(getAssetValueInPln(asset))}</strong>
        </div>
    </div>`;
}

function renderRetirementCardHtml(asset) {
    const kind = RETIREMENT_KIND_LABELS[asset.retirementKind] || asset.retirementKind || 'PPK';
    const inst = asset.institution ? ` · ${asset.institution}` : '';
    return `<div class="card asset-summary-card asset-clickable" role="button" tabindex="0"
        onclick="openAssetDetails('${escapeHtml(asset.id)}')"
        onkeydown="if (event.key === 'Enter') openAssetDetails('${escapeHtml(asset.id)}')">
        <div class="asset-card-head">
            <span class="asset-type-badge">${ASSET_TYPE_ICONS.retirement}</span>
            <div>
                <h2 class="asset-card-title">${escapeHtml(getAssetDisplayName(asset))}</h2>
                <p class="asset-card-sub">${escapeHtml(kind)}${escapeHtml(inst)}</p>
            </div>
        </div>
        <div class="asset-card-hero">
            <span class="loan-stat-label">Saldo</span>
            <strong class="asset-card-value">${formatPlnAmount(getAssetValueInPln(asset))}</strong>
        </div>
    </div>`;
}

function renderAssetCardHtml(asset) {
    switch (asset.type) {
        case 'deposit': return renderDepositCardHtml(asset);
        case 'cash': return renderCashCardHtml(asset);
        case 'retirement': return renderRetirementCardHtml(asset);
        default: return renderInvestmentCardHtml(asset);
    }
}

function renderArchivedAssetCardHtml(asset) {
    const archivedLabel = asset.archivedAt ? formatTxDate(asset.archivedAt) : '—';
    return `<div class="asset-archive-card asset-clickable" role="button" tabindex="0"
        onclick="openAssetDetails('${escapeHtml(asset.id)}')"
        onkeydown="if (event.key === 'Enter') openAssetDetails('${escapeHtml(asset.id)}')">
        <div class="asset-archive-card-head">
            <strong>${escapeHtml(getAssetDisplayName(asset))}</strong>
            <span class="loan-archive-badge">Zarchiwizowane</span>
        </div>
        <p class="loan-archive-meta">${escapeHtml(ASSET_TYPE_LABELS[asset.type] || 'Aktywo')} · ${formatPlnAmount(getAssetValueInPln(asset))}</p>
        <p class="loan-archive-date">Zarchiwizowano: ${archivedLabel}</p>
    </div>`;
}

function renderAssets() {
    if (runAssetMigrations()) saveState();

    const allActive = getActiveAssets();
    const summaryAssets = getSummaryAssets();
    const filteredAssets = filterAssetsByHorizon(allActive);
    const archivedAssets = getArchivedAssets();
    const total = getActiveAssetsTotalPln();
    const shortTotal = getActiveAssetsTotalPln(getAssetsByHorizon('short').filter((a) => a.includeInSummary !== false));
    const longTotal = getActiveAssetsTotalPln(getAssetsByHorizon('long').filter((a) => a.includeInSummary !== false));
    const gainPln = getActiveAssetsGainPln();
    const gainPct = getActiveAssetsGainPct();
    const hasAssets = allActive.length > 0;
    const summaryCount = summaryAssets.length;

    const hero = document.getElementById('assets-total-hero');
    const totalEl = document.getElementById('assets-total-value');
    const metaEl = document.getElementById('assets-total-meta');
    const listEl = document.getElementById('assets-list');
    const archiveSection = document.getElementById('assets-archive-section');
    const archiveList = document.getElementById('assets-archive-list');
    const archiveCount = document.getElementById('assets-archive-count');

    renderAssetsSummaryChips(allActive);

    if (hero) hero.classList.toggle('hidden', !hasAssets);
    if (totalEl && hasAssets) totalEl.textContent = formatPlnAmount(total);
    if (metaEl) {
        if (!hasAssets) {
            metaEl.classList.add('hidden');
        } else {
            const parts = [];
            if (summaryCount < allActive.length) {
                parts.push(`${summaryCount} z ${allActive.length} w sumie`);
            }
            parts.push(`krótko ${formatPlnAmount(shortTotal)} · długo ${formatPlnAmount(longTotal)}`);
            const investments = summaryAssets.filter((a) => a.type === 'investment');
            if (investments.length) {
                parts.push(`P/L ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`);
            }
            metaEl.textContent = parts.join(' · ');
            metaEl.classList.remove('hidden');
        }
    }

    renderAssetsTypeFilter();

    if (listEl) {
        if (!hasAssets) {
            listEl.innerHTML = `<div class="card asset-empty-card">
                <p class="loan-empty-hint">Dodaj inwestycje, lokaty, gotówkę lub PPK/IKZE — bez nieruchomości i auta.</p>
                <button type="button" class="btn-submit" onclick="openNewAssetPicker()">Dodaj aktywo</button>
            </div>`;
        } else if (!filteredAssets.length) {
            listEl.innerHTML = '<div class="card asset-empty-card"><p class="loan-empty-hint">Brak pozycji w tym filtrze.</p></div>';
        } else if (assetsTypeFilter === 'all') {
            listEl.innerHTML = [
                renderAssetsHorizonSection('short', filteredAssets),
                renderAssetsHorizonSection('long', filteredAssets)
            ].filter(Boolean).join('');
        } else {
            listEl.innerHTML = filteredAssets.map((asset) => renderAssetCardHtml(asset)).join('');
        }
    }

    if (archiveSection) archiveSection.classList.toggle('hidden', !archivedAssets.length);
    if (archiveCount) archiveCount.textContent = String(archivedAssets.length);
    if (archiveList) {
        archiveList.innerHTML = archivedAssets.length
            ? archivedAssets.map((asset) => renderArchivedAssetCardHtml(asset)).join('')
            : '<p class="loan-empty-hint">Brak zarchiwizowanych pozycji.</p>';
        archiveList.classList.toggle('hidden', !assetsArchiveExpanded);
    }
}

function openNewAssetPicker() {
    const overlay = document.getElementById('asset-picker-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeAssetPicker() {
    const overlay = document.getElementById('asset-picker-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
}

function startNewAsset(type) {
    closeAssetPicker();
    draftAsset = createDraftAsset(type);
    activeAssetId = draftAsset.id;
    openAssetDetails(draftAsset.id, true);
    setAssetDetailsMode('edit');
}

function openAssetDetails(assetId, isNew = false) {
    if (!isNew) {
        draftAsset = null;
        activeAssetId = assetId;
    }
    const overlay = document.getElementById('asset-details-overlay');
    if (!overlay) return;
    setAssetDetailsMode('view');
    renderAssetDetails();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeAssetDetails() {
    const overlay = document.getElementById('asset-details-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (isDraftAssetActive()) {
        draftAsset = null;
        activeAssetId = null;
    }
}

function setAssetDetailsMode(mode) {
    assetDetailsMode = mode;
    const viewEl = document.getElementById('asset-details-content');
    const editEl = document.getElementById('asset-details-edit');
    const btnEdit = document.getElementById('btn-asset-details-edit');
    const btnView = document.getElementById('btn-asset-details-view');
    if (viewEl) viewEl.classList.toggle('hidden', mode === 'edit');
    if (editEl) editEl.classList.toggle('hidden', mode !== 'edit');
    if (btnEdit) btnEdit.classList.toggle('hidden', mode === 'edit');
    if (btnView) btnView.classList.toggle('hidden', mode !== 'edit');
    if (mode === 'edit') populateAssetEditForm();
    else renderAssetDetails();
}

function assetDetailRow(label, value) {
    return `<div class="loan-detail-row"><span class="label">${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function renderAssetDetails() {
    const asset = getActiveAsset();
    const titleEl = document.getElementById('asset-details-title');
    const contentEl = document.getElementById('asset-details-content');
    const actionsEl = document.getElementById('asset-details-actions');
    if (!asset || !contentEl) return;

    if (titleEl) titleEl.textContent = getAssetDisplayName(asset);

    let rows = [
        assetDetailRow('Typ', ASSET_TYPE_LABELS[asset.type] || '—'),
        assetDetailRow('Wartość (PLN)', formatPlnAmount(getAssetValueInPln(asset)))
    ];

    if (asset.type === 'investment') {
        rows.push(
            assetDetailRow('Ticker', asset.ticker || '—'),
            assetDetailRow('Ilość', String(asset.quantity)),
            assetDetailRow('Średnia cena', `${asset.purchasePrice.toFixed(2)} ${asset.currency}`),
            assetDetailRow('Bieżący kurs', `${asset.currentPrice.toFixed(2)} ${asset.currency}`),
            assetDetailRow('Wartość (waluta)', formatAssetNativeValue(asset)),
            assetDetailRow('Zysk / strata', `${getAssetGainPct(asset) >= 0 ? '+' : ''}${getAssetGainPct(asset).toFixed(2)}% (${formatPlnAmount(getAssetGainPln(asset))})`)
        );
    } else if (asset.type === 'deposit') {
        rows.push(
            assetDetailRow('Saldo', `${(asset.amount || 0).toFixed(2)} ${asset.currency}`),
            assetDetailRow('Oprocentowanie', asset.interestRate ? `${asset.interestRate}%` : '—'),
            assetDetailRow('Koniec lokaty', asset.endDate ? formatTxDate(asset.endDate) : '—')
        );
    } else if (asset.type === 'cash') {
        rows.push(assetDetailRow('Saldo', `${(asset.amount || 0).toFixed(2)} ${asset.currency}`));
        if (asset.goalTarget > 0) {
            const pct = Math.min(100, Math.round((getAssetValueInPln(asset) / asset.goalTarget) * 100));
            rows.push(assetDetailRow('Cel', `${formatPlnAmount(asset.goalTarget)} (${pct}%)`));
        }
    } else if (asset.type === 'retirement') {
        rows.push(
            assetDetailRow('Rodzaj', RETIREMENT_KIND_LABELS[asset.retirementKind] || asset.retirementKind || '—'),
            assetDetailRow('Instytucja', asset.institution || '—'),
            assetDetailRow('Saldo', `${(asset.amount || 0).toFixed(2)} ${asset.currency}`)
        );
    }

    contentEl.innerHTML = `<div class="loan-details-grid">${rows.join('')}</div>`;

    if (actionsEl) {
        const archiveLabel = asset.archived ? 'Przywróć' : 'Archiwizuj';
        const archiveFn = asset.archived ? 'unarchiveAsset()' : 'archiveAsset()';
        actionsEl.innerHTML = isDraftAssetActive()
            ? ''
            : `<div class="asset-details-actions">
                <button type="button" class="btn-outline loan-details-btn" onclick="${archiveFn}">${archiveLabel}</button>
                <button type="button" class="btn-outline loan-details-btn asset-delete-btn" onclick="deleteAsset()">Usuń</button>
            </div>`;
    }
}

function toggleAssetEditFields(type) {
    document.querySelectorAll('[data-asset-fields]').forEach((el) => {
        const types = (el.dataset.assetFields || '').split(/\s+/).filter(Boolean);
        el.classList.toggle('hidden', !types.includes(type));
    });
}

function populateAssetEditForm() {
    const asset = getActiveAsset();
    if (!asset) return;

    const typeSelect = document.getElementById('asset-type-input');
    if (typeSelect) {
        typeSelect.innerHTML = ASSET_TYPES.map((type) =>
            `<option value="${type}"${asset.type === type ? ' selected' : ''}>${ASSET_TYPE_LABELS[type]}</option>`
        ).join('');
        typeSelect.disabled = !isDraftAssetActive();
        typeSelect.value = asset.type;
    }

    document.getElementById('asset-name-input').value = asset.name || '';
    document.getElementById('asset-currency-input').value = asset.currency || 'PLN';

    document.getElementById('asset-ticker-input').value = asset.ticker || '';
    document.getElementById('asset-quantity-input').value = asset.quantity || '';
    document.getElementById('asset-purchase-input').value = asset.purchasePrice || '';
    document.getElementById('asset-price-input').value = asset.currentPrice || '';

    document.getElementById('asset-amount-input').value = asset.amount || '';
    document.getElementById('asset-rate-input').value = asset.interestRate || '';
    document.getElementById('asset-end-input').value = asset.endDate || '';

    const retirementKind = document.getElementById('asset-retirement-kind-input');
    if (retirementKind) retirementKind.value = asset.retirementKind || 'PPK';
    document.getElementById('asset-institution-input').value = asset.institution || '';
    const goalInput = document.getElementById('asset-goal-input');
    if (goalInput) goalInput.value = asset.goalTarget || '';

    toggleAssetEditFields(asset.type);
}

function onAssetTypeInputChange() {
    const type = document.getElementById('asset-type-input')?.value || 'investment';
    toggleAssetEditFields(type);
    if (type === 'investment') {
        const currency = document.getElementById('asset-currency-input');
        if (currency && currency.value === 'PLN') currency.value = 'EUR';
    }
}

function saveAssetDetails() {
    const current = getActiveAsset();
    if (!current) return;

    const type = document.getElementById('asset-type-input')?.value || current.type;
    const payload = {
        ...current,
        type,
        name: document.getElementById('asset-name-input')?.value?.trim() || '',
        currency: document.getElementById('asset-currency-input')?.value === 'EUR' ? 'EUR' : 'PLN'
    };

    if (type === 'investment') {
        payload.ticker = document.getElementById('asset-ticker-input')?.value?.trim() || '';
        payload.quantity = parseFloat(document.getElementById('asset-quantity-input')?.value) || 0;
        payload.purchasePrice = parseFloat(document.getElementById('asset-purchase-input')?.value) || 0;
        payload.currentPrice = parseFloat(document.getElementById('asset-price-input')?.value) || 0;
        if (!payload.name && payload.ticker) payload.name = payload.ticker;
    } else {
        payload.amount = parseFloat(document.getElementById('asset-amount-input')?.value) || 0;
        const goalVal = parseFloat(document.getElementById('asset-goal-input')?.value);
        if (!Number.isNaN(goalVal)) payload.goalTarget = Math.max(0, goalVal);
        if (type === 'deposit') {
            payload.interestRate = parseFloat(document.getElementById('asset-rate-input')?.value) || 0;
            payload.endDate = document.getElementById('asset-end-input')?.value || '';
        }
        if (type === 'retirement') {
            payload.retirementKind = document.getElementById('asset-retirement-kind-input')?.value || 'PPK';
            if (!RETIREMENT_KINDS.includes(payload.retirementKind)) payload.retirementKind = 'PPK';
            payload.institution = document.getElementById('asset-institution-input')?.value?.trim() || '';
        }
    }

    const wasNew = isDraftAssetActive();
    const saved = updateAssetInState(payload);
    if (typeof recordAssetValueHistory === 'function') {
        recordAssetValueHistory(saved, wasNew ? 'create' : 'manual');
    }
    draftAsset = null;
    activeAssetId = saved.id;
    saveState();
    setAssetDetailsMode('view');
    renderAssets();
    if (typeof renderReports === 'function' && document.getElementById('view-reports')?.classList.contains('active')) {
        renderReports();
    }
    showSettingsToast(wasNew ? 'Aktywo zapisane' : 'Zapisano zmiany');
}

function cancelAssetEdit() {
    if (isDraftAssetActive()) {
        closeAssetDetails();
        renderAssets();
        return;
    }
    setAssetDetailsMode('view');
}

function archiveAsset() {
    const asset = getActiveAsset();
    if (!asset || isDraftAssetActive()) return;
    updateAssetInState({
        ...asset,
        archived: true,
        archivedAt: localIsoDate(new Date())
    });
    saveState();
    closeAssetDetails();
    renderAssets();
    showSettingsToast('Pozycja zarchiwizowana');
}

function unarchiveAsset() {
    const asset = getActiveAsset();
    if (!asset) return;
    updateAssetInState({
        ...asset,
        archived: false,
        archivedAt: ''
    });
    saveState();
    renderAssetDetails();
    renderAssets();
    showSettingsToast('Pozycja przywrócona');
}

function deleteAsset() {
    const asset = getActiveAsset();
    if (!asset || isDraftAssetActive()) return;
    if (!confirm(`Usunąć „${getAssetDisplayName(asset)}”?`)) return;
    appState.assets = (appState.assets || []).filter((a) => a.id !== asset.id);
    saveState();
    closeAssetDetails();
    renderAssets();
    showSettingsToast('Pozycja usunięta');
}
