const ASSET_TYPES = ['investment', 'deposit', 'cash', 'retirement', 'other'];

const ASSET_TYPE_LABELS = {
    investment: 'Inwestycja',
    deposit: 'Lokata',
    cash: 'Gotówka',
    retirement: 'PPK / IKZE',
    other: 'Inne'
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
    retirement: '🛡️',
    other: '📦'
};

let assetsTypeFilter = 'all';
let assetsArchiveExpanded = false;
let assetsSummaryExpanded = false;
let assetsAddExpanded = false;
let assetDetailsMode = 'view';
let activeAssetId = null;
let draftAsset = null;
let cashTxFilter = 'all';
let cashTxPeriod = 'month';
let cashTxVisibleCount = LIST_PAGE_SIZE;
let cashTxListSignature = '';

function getCashTxPeriodBounds() {
    const now = new Date();
    const start = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { start, end };
}

function filterCashTxByPeriod(transactions) {
    if (cashTxPeriod !== 'month') return transactions;
    const { start, end } = getCashTxPeriodBounds();
    return transactions.filter((tx) => tx.date >= start && tx.date <= end);
}

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
        asset.brokerAccount = (asset.brokerAccount || '').trim();
    } else {
        asset.amount = Math.max(0, parseFloat(asset.amount) || 0);
        if (asset.type === 'cash' && asset.cashBaseline !== undefined && asset.cashBaseline !== null) {
            const baseline = parseFloat(asset.cashBaseline);
            asset.cashBaseline = Number.isFinite(baseline) ? baseline : undefined;
        }
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

function getExcludedPortfolioGroups() {
    const excl = appState.reportPrefs?.excludedPortfolioGroups;
    return Array.isArray(excl) ? excl : [];
}

function getEffectiveSummaryAssets() {
    const excluded = new Set(getExcludedPortfolioGroups());
    return getActiveAssets().filter((asset) => {
        if (asset.includeInSummary === false) return false;
        const groupId = getAssetPortfolioGroupId(asset);
        if (groupId && excluded.has(groupId)) return false;
        return true;
    });
}

function togglePortfolioGroupSummary(groupId) {
    if (!appState.reportPrefs || typeof appState.reportPrefs !== 'object') appState.reportPrefs = {};
    const excl = Array.isArray(appState.reportPrefs.excludedPortfolioGroups)
        ? appState.reportPrefs.excludedPortfolioGroups
        : [];
    if (excl.includes(groupId)) {
        appState.reportPrefs.excludedPortfolioGroups = excl.filter((g) => g !== groupId);
    } else {
        appState.reportPrefs.excludedPortfolioGroups = [...excl, groupId];
    }
    saveState();
    renderAssets();
}

function getAssetHorizon(asset) {
    const a = normalizeAsset(asset);
    if (a.type === 'retirement') return 'long';
    if (a.type === 'investment' && a.brokerAccount === 'ikze') return 'long';
    return 'short';
}

function getAssetsByHorizon(horizon) {
    return getActiveAssets().filter((asset) => getAssetHorizon(asset) === horizon);
}

function getArchivedAssets() {
    return getAssets().filter((asset) => asset.archived);
}

function getAssetById(id) {
    if (!id) return null;
    return getAssets().find((asset) => asset.id === id) || null;
}

function getActiveAssetById(id) {
    if (!id) return null;
    return getActiveAssets().find((asset) => asset.id === id) || null;
}

function updateAssetInState(asset) {
    const normalized = normalizeAsset(asset);
    if (!Array.isArray(appState.assets)) appState.assets = [];
    const idx = appState.assets.findIndex((a) => a.id === normalized.id);
    if (idx >= 0) appState.assets[idx] = normalized;
    else appState.assets.push(normalized);
    return normalized;
}

function getDeletedAssetIds() {
    return Array.isArray(appState.deletedAssetIds) ? appState.deletedAssetIds : [];
}

function markAssetDeleted(id) {
    if (!Array.isArray(appState.deletedAssetIds)) appState.deletedAssetIds = [];
    if (!appState.deletedAssetIds.includes(id)) appState.deletedAssetIds.push(id);
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
        const active = getActiveAssetById(activeAssetId);
        if (active) return active;
        const record = getAssetById(activeAssetId);
        if (record) return record;
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

function setAllAssetsSummaryInclude(included) {
    getActiveAssets().forEach((asset) => {
        const currentlyIncluded = asset.includeInSummary !== false;
        if (currentlyIncluded === included) return;
        updateAssetInState({ ...asset, includeInSummary: included });
    });
    saveState();
    renderAssets();
    if (typeof renderReports === 'function' && document.getElementById('view-reports')?.classList.contains('active')) {
        renderReports();
    }
}

function renderAssetsSummaryChips(activeAssets) {
    const el = document.getElementById('assets-summary-chips');
    const block = document.getElementById('assets-summary-block');
    if (!el) return;
    if (activeAssets.length < 2) {
        el.innerHTML = '';
        block?.classList.add('hidden');
        return;
    }
    block?.classList.remove('hidden');

    const excludedGroups = new Set(getExcludedPortfolioGroups());
    const groups = buildPortfolioGroups(activeAssets);
    const nonPortfolio = getNonPortfolioActiveAssets(activeAssets);
    const rows = [];

    ASSET_PORTFOLIO_GROUPS.forEach((group) => {
        const items = groups[group.id];
        if (!items || !items.length) return;

        const groupExcluded = excludedGroups.has(group.id);
        const groupTotal = items.reduce((s, a) => s + getAssetValueInPln(a), 0);
        const gId = escapeHtml(group.id);

        let itemChips = '';
        if (!groupExcluded) {
            itemChips = items.map((asset) => {
                const included = asset.includeInSummary !== false;
                const aId = escapeHtml(asset.id);
                return `<button type="button"
                    class="toggle-btn loans-chip assets-summary-item-chip${included ? ' active' : ''}"
                    onclick="toggleAssetSummaryInclude('${aId}')"
                    aria-pressed="${included ? 'true' : 'false'}">${escapeHtml(getAssetDisplayName(asset))}</button>`;
            }).join('');
        }

        rows.push(`<div class="assets-summary-group">
            <button type="button"
                class="toggle-btn loans-chip assets-summary-group-toggle${groupExcluded ? '' : ' active'}"
                onclick="togglePortfolioGroupSummary('${gId}')"
                aria-pressed="${groupExcluded ? 'false' : 'true'}">
                <span class="assets-summary-group-label">${escapeHtml(group.title)}</span>
                <span class="assets-summary-group-total">${formatPlnAmount(groupTotal)}</span>
            </button>
            ${itemChips ? `<div class="assets-summary-group-items">${itemChips}</div>` : ''}
        </div>`);
    });

    if (nonPortfolio.length) {
        const chips = nonPortfolio.map((asset) => {
            const included = asset.includeInSummary !== false;
            const aId = escapeHtml(asset.id);
            return `<button type="button"
                class="toggle-btn loans-chip${included ? ' active' : ''}"
                onclick="toggleAssetSummaryInclude('${aId}')"
                aria-pressed="${included ? 'true' : 'false'}">${escapeHtml(getAssetDisplayName(asset))}</button>`;
        }).join('');
        rows.push(`<div class="assets-summary-group assets-summary-group--flat">${chips}</div>`);
    }

    el.innerHTML = rows.join('');
}

function toggleAssetsSummary() {
    assetsSummaryExpanded = !assetsSummaryExpanded;
    const panel = document.getElementById('assets-summary-panel');
    const toggle = document.querySelector('#assets-summary-block .assets-hero-summary-toggle');
    if (panel) panel.classList.toggle('hidden', !assetsSummaryExpanded);
    if (toggle) {
        toggle.setAttribute('aria-expanded', assetsSummaryExpanded ? 'true' : 'false');
    }
}

function toggleAssetsAdd() {
    assetsAddExpanded = !assetsAddExpanded;
    const panel = document.getElementById('assets-add-panel');
    const toggle = document.querySelector('#assets-add-block .assets-hero-add-toggle');
    if (panel) panel.classList.toggle('hidden', !assetsAddExpanded);
    if (toggle) {
        toggle.setAttribute('aria-expanded', assetsAddExpanded ? 'true' : 'false');
    }
}

function collapseAssetsAdd() {
    assetsAddExpanded = false;
    const panel = document.getElementById('assets-add-panel');
    const toggle = document.querySelector('#assets-add-block .assets-hero-add-toggle');
    if (panel) panel.classList.add('hidden');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function startNewAssetFromHero(type) {
    collapseAssetsAdd();
    startNewAsset(type);
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
        { id: 'short', label: 'Krótkoterm.' },
        { id: 'long', label: 'Długoterm.' }
    ];
    nav.innerHTML = chips
        .filter((chip) => chip.id === 'all' || (chip.id === 'short' ? shortCount : longCount) > 0 || assetsTypeFilter === chip.id)
        .map((chip) => {
            const count = chip.id === 'all'
                ? getActiveAssets().length
                : chip.id === 'short' ? shortCount : longCount;
            return `<button type="button" class="toggle-btn${assetsTypeFilter === chip.id ? ' active' : ''}" onclick="setAssetsTypeFilter('${chip.id}')"><span class="assets-horizon-chip-label">${chip.label}</span><span class="assets-horizon-count">${count}</span></button>`;
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
        ? 'Gotówka, lokaty, inwestycje, inne'
        : 'PPK, IKZE, emerytura, KZP';

    return `<section class="assets-horizon-section">
        <div class="assets-horizon-head">
            <h2 class="assets-horizon-title">${ASSET_HORIZON_LABELS[horizon]}</h2>
            <span class="assets-horizon-total">${formatPlnAmountHtml(sectionTotal)}</span>
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

const ASSET_PORTFOLIO_GROUPS = [
    { id: 'xtb', title: 'XTB' },
    { id: 'mbank', title: 'mBank eMakler (Zwykły)' },
    { id: 'ikze', title: 'IKZE mBank eMakler' },
    { id: 'emerytura', title: 'mBank Emerytura 2035' }
];

const ASSET_IKZE_SHELL_ID = 'asset-ret-ikze-mbank';
const ASSET_EMERYTURA_ID = 'asset-ret-mbank-emerytura';

function getAssetPortfolioGroupId(asset) {
    if (!asset || asset.archived) return null;
    if (asset.id === ASSET_EMERYTURA_ID) return 'emerytura';
    if (asset.id === ASSET_IKZE_SHELL_ID) return null;
    if (asset.brokerAccount === 'xtb' || asset.id.startsWith('asset-inv-xtb') || asset.id === 'asset-cash-xtb-free') {
        return 'xtb';
    }
    if (asset.brokerAccount === 'mbank') return 'mbank';
    if (asset.brokerAccount === 'ikze') return 'ikze';
    return null;
}

function buildPortfolioGroups(activeAssets) {
    const groups = { xtb: [], mbank: [], ikze: [], emerytura: [] };
    activeAssets.forEach((asset) => {
        const groupId = getAssetPortfolioGroupId(asset);
        if (groupId) groups[groupId].push(asset);
    });
    Object.keys(groups).forEach((key) => {
        groups[key].sort((a, b) => getAssetDisplayName(a).localeCompare(getAssetDisplayName(b), 'pl'));
    });
    return groups;
}

function getNonPortfolioActiveAssets(activeAssets) {
    return activeAssets.filter((asset) => !getAssetPortfolioGroupId(asset));
}

function hasPortfolioGroupedAssets(activeAssets) {
    return activeAssets.some((asset) => getAssetPortfolioGroupId(asset));
}

function formatAssetGainLabel(asset) {
    if (asset.type !== 'investment') return '';
    const gainPln = getAssetGainPln(asset);
    const gainPct = getAssetGainPct(asset);
    const gainClass = gainPln >= 0 ? 'income' : 'expense';
    const sign = gainPln >= 0 ? '+' : '−';
    return `<span class="assets-portfolio-row-pl ${gainClass}">${sign}${formatPlnAmount(Math.abs(gainPln))} (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)</span>`;
}

function renderAssetsPortfolioRow(asset) {
    const assetId = escapeHtml(asset.id);
    const openFn = `openAssetDetails('${assetId}')`;
    const name = escapeHtml(getAssetDisplayName(asset));

    if (asset.type === 'investment') {
        const qtyLabel = `${asset.quantity} szt.`;
        return `<div class="assets-portfolio-row asset-clickable" role="button" tabindex="0"
            onclick="${openFn}" onkeydown="if (event.key === 'Enter') ${openFn}">
            <div class="assets-portfolio-row-main">
                <strong class="assets-portfolio-row-name">${name}</strong>
                <span class="assets-portfolio-row-meta">${escapeHtml(qtyLabel)}</span>
            </div>
            <div class="assets-portfolio-row-values">
                <strong class="assets-portfolio-row-value">${formatPlnAmountHtml(getAssetValueInPln(asset))}</strong>
                ${formatAssetGainLabel(asset)}
            </div>
        </div>`;
    }

    const meta = asset.type === 'cash'
        ? 'Gotówka'
        : (RETIREMENT_KIND_LABELS[asset.retirementKind] || ASSET_TYPE_LABELS[asset.type] || 'Aktywo');
    return `<div class="assets-portfolio-row asset-clickable" role="button" tabindex="0"
        onclick="${openFn}" onkeydown="if (event.key === 'Enter') ${openFn}">
        <div class="assets-portfolio-row-main">
            <strong class="assets-portfolio-row-name">${name}</strong>
            <span class="assets-portfolio-row-meta">${escapeHtml(meta)}</span>
        </div>
        <div class="assets-portfolio-row-values">
            <strong class="assets-portfolio-row-value">${formatPlnAmountHtml(getAssetValueInPln(asset))}</strong>
        </div>
    </div>`;
}

function deletePortfolioGroup(groupId) {
    const group = ASSET_PORTFOLIO_GROUPS.find((g) => g.id === groupId);
    if (!group) return;

    const allActive = getActiveAssets();
    const groupAssets = allActive.filter((a) => getAssetPortfolioGroupId(a) === groupId);

    const extraIds = groupId === 'ikze' ? [ASSET_IKZE_SHELL_ID] : [];
    const allIds = [...groupAssets.map((a) => a.id), ...extraIds];

    if (!allIds.length) return;

    const label = allIds.length === 1 ? '1 pozycję' : `${allIds.length} pozycje/pozycji`;
    if (!confirm(`Usunąć całe konto „${group.title}" (${label})?`)) return;

    allIds.forEach((id) => markAssetDeleted(id));
    appState.assets = (appState.assets || []).filter((a) => !allIds.includes(a.id));

    if (!Array.isArray(appState.reportPrefs)) {
        if (!appState.reportPrefs || typeof appState.reportPrefs !== 'object') appState.reportPrefs = {};
    }
    const excl = Array.isArray(appState.reportPrefs.excludedPortfolioGroups)
        ? appState.reportPrefs.excludedPortfolioGroups
        : [];
    if (!excl.includes(groupId)) {
        appState.reportPrefs.excludedPortfolioGroups = [...excl, groupId];
    }

    saveState();
    renderAssets();
    showSettingsToast(`Konto „${group.title}" usunięte`);
}

function renderAssetsPortfolioPanel(group, items) {
    if (!items.length) return '';

    const panelTotal = items.reduce((sum, asset) => sum + getAssetValueInPln(asset), 0);
    const panelGain = items
        .filter((asset) => asset.type === 'investment')
        .reduce((sum, asset) => sum + getAssetGainPln(asset), 0);
    const hasGain = items.some((asset) => asset.type === 'investment');
    const gainClass = panelGain >= 0 ? 'income' : 'expense';
    const gainSign = panelGain >= 0 ? '+' : '−';
    const gainHtml = hasGain
        ? `<span class="assets-portfolio-panel-pl ${gainClass}">${gainSign}${formatPlnAmount(Math.abs(panelGain))}</span>`
        : '';

    const groupId = escapeHtml(group.id);
    const deleteFn = `deletePortfolioGroup('${groupId}')`;

    return `<section class="card assets-portfolio-panel" aria-label="${escapeHtml(group.title)}">
        <div class="assets-portfolio-panel-head">
            <h2 class="assets-portfolio-panel-title">${escapeHtml(group.title)}</h2>
            <div class="assets-portfolio-panel-totals">
                <span class="assets-portfolio-panel-total">${formatPlnAmountHtml(panelTotal)}</span>
                ${gainHtml}
            </div>
        </div>
        <div class="assets-portfolio-panel-rows">
            ${items.map((asset) => renderAssetsPortfolioRow(asset)).join('')}
        </div>
        <div class="assets-portfolio-panel-footer">
            <button type="button" class="assets-portfolio-panel-delete-btn" onclick="${deleteFn}">Usuń konto</button>
        </div>
    </section>`;
}

function renderAssetsPortfolioSections(activeAssets) {
    const groups = buildPortfolioGroups(activeAssets);
    return ASSET_PORTFOLIO_GROUPS
        .map((group) => renderAssetsPortfolioPanel(group, groups[group.id]))
        .filter(Boolean)
        .join('');
}

function renderAssetsOtherSection(assets) {
    if (!assets.length) return '';
    const sectionTotal = getActiveAssetsTotalPln(assets.filter((a) => a.includeInSummary !== false));
    return `<section class="assets-other-section">
        <div class="assets-other-head">
            <h2 class="assets-other-title">Pozostałe aktywa</h2>
            <span class="assets-other-total">${formatPlnAmountHtml(sectionTotal)}</span>
        </div>
        <div class="assets-other-list">${assets.map((asset) => renderAssetCardHtml(asset)).join('')}</div>
    </section>`;
}

function buildAssetsListHtml(allActive, hasAssets) {
    if (!hasAssets) {
        return `<div class="card asset-empty-card">
            <p class="loan-empty-hint">Dodaj inwestycje, lokaty, gotówkę, PPK/IKZE lub inne aktywa (np. nieruchomość, auto).</p>
            <button type="button" class="btn-submit" onclick="openNewAssetPicker()">Dodaj aktywo</button>
        </div>`;
    }

    if (hasPortfolioGroupedAssets(allActive)) {
        const portfolioHtml = renderAssetsPortfolioSections(allActive);
        const otherHtml = renderAssetsOtherSection(getNonPortfolioActiveAssets(allActive));
        return `<div class="assets-portfolio-grid">${otherHtml}${portfolioHtml}</div>`;
    }

    const filteredAssets = filterAssetsByHorizon(allActive);
    if (!filteredAssets.length) {
        return '<div class="card asset-empty-card"><p class="loan-empty-hint">Brak pozycji w tym filtrze.</p></div>';
    }
    if (assetsTypeFilter === 'all') {
        return [
            renderAssetsHorizonSection('short', filteredAssets),
            renderAssetsHorizonSection('long', filteredAssets)
        ].filter(Boolean).join('');
    }
    return filteredAssets.map((asset) => renderAssetCardHtml(asset)).join('');
}

function renderAssetsTypeFilter(activeAssets) {
    const nav = document.getElementById('assets-type-filter');
    if (!nav) return;
    if (hasPortfolioGroupedAssets(activeAssets)) {
        nav.innerHTML = '';
        nav.classList.add('hidden');
        return;
    }
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
            <strong class="asset-card-value">${formatPlnAmountHtml(getAssetValueInPln(asset))}</strong>
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
            <strong class="asset-card-value">${formatPlnAmountHtml(getAssetValueInPln(asset))}</strong>
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
            <strong class="asset-card-value">${formatPlnAmountHtml(getAssetValueInPln(asset))}</strong>
        </div>
    </div>`;
}

function renderOtherCardHtml(asset) {
    return `<div class="card asset-summary-card asset-clickable" role="button" tabindex="0"
        onclick="openAssetDetails('${escapeHtml(asset.id)}')"
        onkeydown="if (event.key === 'Enter') openAssetDetails('${escapeHtml(asset.id)}')">
        <div class="asset-card-head">
            <span class="asset-type-badge">${ASSET_TYPE_ICONS.other}</span>
            <div>
                <h2 class="asset-card-title">${escapeHtml(getAssetDisplayName(asset))}</h2>
                <p class="asset-card-sub">Inne</p>
            </div>
        </div>
        <div class="asset-card-hero">
            <span class="loan-stat-label">Wartość</span>
            <strong class="asset-card-value">${formatPlnAmountHtml(getAssetValueInPln(asset))}</strong>
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
            <strong class="asset-card-value">${formatPlnAmountHtml(getAssetValueInPln(asset))}</strong>
        </div>
    </div>`;
}

function renderAssetCardHtml(asset) {
    switch (asset.type) {
        case 'deposit': return renderDepositCardHtml(asset);
        case 'cash': return renderCashCardHtml(asset);
        case 'retirement': return renderRetirementCardHtml(asset);
        case 'other': return renderOtherCardHtml(asset);
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
    const summaryAssets = getEffectiveSummaryAssets();
    const archivedAssets = getArchivedAssets();
    const total = getActiveAssetsTotalPln(summaryAssets);
    const gainPln = getActiveAssetsGainPln(summaryAssets);
    const gainPct = getActiveAssetsGainPct(summaryAssets);
    const hasAssets = allActive.length > 0;

    const hero = document.getElementById('assets-total-hero');
    const totalEl = document.getElementById('assets-total-value');
    const metaEl = document.getElementById('assets-total-meta');
    const listEl = document.getElementById('assets-list');
    const archiveSection = document.getElementById('assets-archive-section');
    const archiveList = document.getElementById('assets-archive-list');
    const archiveCount = document.getElementById('assets-archive-count');

    if (listEl) {
        try {
            listEl.innerHTML = buildAssetsListHtml(allActive, hasAssets);
        } catch (err) {
            console.error('renderAssets list', err);
        }
    }

    try {
        renderAssetsSummaryChips(allActive);
    } catch (err) {
        console.error('renderAssets chips', err);
    }

    try {
        if (hero) hero.classList.toggle('hidden', !hasAssets);
        if (totalEl && hasAssets && typeof setPlnAmountElement === 'function') {
            setPlnAmountElement(totalEl, total);
        }
        if (metaEl) {
            const investments = summaryAssets.filter((a) => a.type === 'investment');
            if (hasAssets && investments.length && (gainPln !== 0 || gainPct !== 0)) {
                const sign = gainPln >= 0 ? '+' : '−';
                metaEl.textContent = `Inwestycje P/L: ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}% (${sign}${formatPlnAmount(Math.abs(gainPln))})`;
                metaEl.classList.remove('hidden');
            } else {
                metaEl.classList.add('hidden');
            }
        }
        const refreshRow = document.getElementById('assets-market-refresh-row');
        if (refreshRow) {
            const hasTickers = allActive.some((a) => a.type === 'investment' && a.ticker && !a.archived);
            refreshRow.classList.toggle('hidden', !hasTickers);
        }
        const exportActions = document.getElementById('assets-export-actions');
        if (exportActions) exportActions.classList.toggle('hidden', !hasAssets);
        if (typeof updateMarketPricesRefreshHint === 'function') {
            updateMarketPricesRefreshHint();
        }
    } catch (err) {
        console.error('renderAssets hero', err);
    }

    try {
        renderAssetsTypeFilter(allActive);
    } catch (err) {
        console.error('renderAssets filter', err);
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
    cashTxFilter = 'all';
    cashTxPeriod = 'month';
    resetCashTxListPagination();
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
    draftAsset = null;
    activeAssetId = null;
}

function setAssetDetailsMode(mode) {
    assetDetailsMode = mode;
    const viewScroll = document.getElementById('asset-details-view-scroll');
    const editEl = document.getElementById('asset-details-edit');
    const btnEdit = document.getElementById('btn-asset-details-edit');
    const btnView = document.getElementById('btn-asset-details-view');
    if (viewScroll) viewScroll.classList.toggle('hidden', mode === 'edit');
    if (editEl) editEl.classList.toggle('hidden', mode !== 'edit');
    if (btnEdit) btnEdit.classList.toggle('hidden', mode === 'edit');
    if (btnView) btnView.classList.toggle('hidden', mode !== 'edit');
    if (mode === 'edit') populateAssetEditForm();
    else renderAssetDetails();
}

function assetDetailRow(label, value) {
    return `<div class="loan-detail-row"><span class="label">${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function resetCashTxListPagination() {
    cashTxVisibleCount = LIST_PAGE_SIZE;
    cashTxListSignature = '';
}

function setCashTxFilter(filter) {
    if (cashTxFilter === filter) return;
    cashTxFilter = filter;
    resetCashTxListPagination();
    renderAssetCashTransactions();
}

function setCashTxPeriod(period) {
    if (cashTxPeriod === period) return;
    cashTxPeriod = period;
    resetCashTxListPagination();
    renderAssetCashTransactions();
}

function showMoreCashTransactions() {
    cashTxVisibleCount += LIST_PAGE_SIZE;
    renderAssetCashTransactions();
}

function openCashTxForEdit(index) {
    if (!Number.isInteger(index) || index < 0) return;
    const asset = getActiveAsset();
    postEditReturnAssetId = asset?.id || null;
    openTransactionDetails(index);
}

function returnToAssetAfterEdit(assetId) {
    if (!assetId) return;
    switchView('investments', 'Aktywa', document.querySelectorAll('.nav-item')[3]);
    openAssetDetails(assetId);
}

function renderAssetCashTransactions() {
    const section = document.getElementById('asset-cash-tx-section');
    const list = document.getElementById('asset-cash-tx-list');
    if (!section || !list) return;

    const asset = getActiveAsset();
    if (!asset || asset.type !== 'cash' || assetDetailsMode === 'edit') {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    document.getElementById('btn-cash-tx-month')?.classList.toggle('active', cashTxPeriod === 'month');
    document.getElementById('btn-cash-tx-all-period')?.classList.toggle('active', cashTxPeriod === 'all');
    document.getElementById('btn-cash-tx-all')?.classList.toggle('active', cashTxFilter === 'all');
    document.getElementById('btn-cash-tx-expense')?.classList.toggle('active', cashTxFilter === 'expense');
    document.getElementById('btn-cash-tx-income')?.classList.toggle('active', cashTxFilter === 'income');

    const baseTx = typeof getCashAffectingTransactions === 'function'
        ? getCashAffectingTransactions(asset.id, cashTxFilter)
        : [];
    const allTx = filterCashTxByPeriod(baseTx);

    const signature = `${asset.id}|${cashTxFilter}|${cashTxPeriod}|${allTx.length}|${allTx[0]?.date ?? ''}|${allTx[0]?.amount ?? ''}`;
    if (signature !== cashTxListSignature) {
        cashTxListSignature = signature;
        cashTxVisibleCount = LIST_PAGE_SIZE;
    }

    const visibleTx = allTx.slice(0, cashTxVisibleCount);

    if (!allTx.length) {
        const periodHint = cashTxPeriod === 'month' ? ' w tym miesiącu' : '';
        const emptyMsg = cashTxFilter === 'expense'
            ? `Brak wydatków z salda gotówki${periodHint}`
            : cashTxFilter === 'income'
                ? `Brak wpływów na saldo gotówki${periodHint}`
                : `Brak transakcji powiązanych z tym saldem${periodHint}`;
        list.innerHTML = `<div class="empty-state asset-cash-tx-empty"><p>${emptyMsg}</p></div>`;
        const moreBtn = document.getElementById('asset-cash-tx-show-more');
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }

    list.innerHTML = visibleTx.map((t) => {
        const globalIndex = appState.transactions.indexOf(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const sign = t.type === 'expense' ? '−' : '+';
        const amountClass = t.type === 'expense' ? 'expense' : 'income';
        const noteSuffix = t.note ? ` · ${escapeHtml(t.note)}` : '';
        return `<button type="button" class="asset-cash-tx-row" onclick="openCashTxForEdit(${globalIndex})">
            <div class="asset-cash-tx-row-text">
                <span class="asset-cash-tx-row-title">${escapeHtml(title)}</span>
                <span class="asset-cash-tx-row-meta">${formatTxDate(t.date)} · ${escapeHtml(t.mainCategory)}${noteSuffix}</span>
            </div>
            <span class="asset-cash-tx-row-amount ${amountClass}">${sign}${formatPlnAmount(t.amount)}</span>
        </button>`;
    }).join('');

    const moreBtn = getOrCreateShowMoreButton('asset-cash-tx-show-more', showMoreCashTransactions);
    updateShowMoreButton(moreBtn, allTx.length, visibleTx.length, section, list);
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
    } else if (asset.type === 'other') {
        rows.push(assetDetailRow('Wartość', `${(asset.amount || 0).toFixed(2)} ${asset.currency}`));
    }

    contentEl.innerHTML = `<div class="loan-details-grid">${rows.join('')}</div>`;

    if (actionsEl) {
        const archiveLabel = asset.archived ? 'Przywróć' : 'Archiwizuj';
        const archiveFn = asset.archived ? 'unarchiveAsset()' : 'archiveAsset()';
        const sellBtn = (!isDraftAssetActive() && !asset.archived && asset.type === 'investment')
            ? `<button type="button" class="btn-outline loan-details-btn asset-sell-btn" onclick="openSellAssetForm()">Sprzedaj</button>`
            : '';
        actionsEl.innerHTML = isDraftAssetActive()
            ? ''
            : `<div class="asset-details-actions">
                ${sellBtn}
                <button type="button" class="btn-outline loan-details-btn" onclick="${archiveFn}">${archiveLabel}</button>
                <button type="button" class="btn-outline loan-details-btn asset-delete-btn" onclick="deleteAsset()">Usuń</button>
            </div>`;
    }

    closeSellAssetForm();

    if (asset.type === 'cash') {
        renderAssetCashTransactions();
    } else {
        document.getElementById('asset-cash-tx-section')?.classList.add('hidden');
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
    const brokerSelect = document.getElementById('asset-broker-input');
    if (brokerSelect) brokerSelect.value = asset.brokerAccount || '';

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
        payload.brokerAccount = document.getElementById('asset-broker-input')?.value || null;
        if (!payload.name && payload.ticker) payload.name = payload.ticker;
    } else {
        const manualAmount = parseFloat(document.getElementById('asset-amount-input')?.value) || 0;
        if (type === 'cash' && typeof applyManualCashAmount === 'function') {
            payload.amount = manualAmount;
            const movementsTotal = typeof getCashMovementsTotal === 'function'
                ? getCashMovementsTotal(current.id)
                : 0;
            payload.cashBaseline = Math.round((manualAmount - movementsTotal) * 100) / 100;
        } else {
            payload.amount = manualAmount;
        }
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
    activeAssetId = null;
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
    markAssetDeleted(asset.id);
    appState.assets = (appState.assets || []).filter((a) => a.id !== asset.id);
    saveState();
    activeAssetId = null;
    closeAssetDetails();
    renderAssets();
    showSettingsToast('Pozycja usunięta');
}

function getCashAssetForBroker(brokerAccount) {
    if (brokerAccount === 'xtb') return getAssetById('asset-cash-xtb-free');
    return getAssetById('asset-cash-total');
}

function openSellAssetForm() {
    const asset = getActiveAsset();
    if (!asset || asset.type !== 'investment') return;

    const section = document.getElementById('asset-sell-section');
    if (!section) return;

    document.getElementById('asset-sell-qty').value = '';
    document.getElementById('asset-sell-price').value = asset.currentPrice > 0
        ? asset.currentPrice.toFixed(4)
        : '';

    const cashAsset = getCashAssetForBroker(asset.brokerAccount);
    const cashLabel = document.getElementById('asset-sell-cash-label');
    if (cashLabel) {
        cashLabel.textContent = cashAsset
            ? `Zaksiguj wpływ na „${getAssetDisplayName(cashAsset)}”`
            : 'Zaksiguj wpływ na gotówkę';
    }
    section.classList.remove('hidden');
    document.getElementById('asset-sell-qty')?.focus();
}

function closeSellAssetForm() {
    document.getElementById('asset-sell-section')?.classList.add('hidden');
}

function sellAssetPartial() {
    const asset = getActiveAsset();
    if (!asset || asset.type !== 'investment') return;

    const qtySold = parseFloat(document.getElementById('asset-sell-qty')?.value) || 0;
    const pricePerUnit = parseFloat(document.getElementById('asset-sell-price')?.value) || 0;
    const cashCheckbox = document.getElementById('asset-sell-cash');
    const updateCash = !cashCheckbox || cashCheckbox.checked;

    if (qtySold <= 0 || pricePerUnit <= 0) {
        showSettingsToast('Podaj poprawną ilość i cenę sprzedaży');
        return;
    }
    if (qtySold > asset.quantity) {
        showSettingsToast(`Masz tylko ${asset.quantity} szt. tej pozycji`);
        return;
    }

    const proceedsNative = qtySold * pricePerUnit;
    const proceedsPln = asset.currency === 'EUR' ? proceedsNative * EUR_PLN_RATE : proceedsNative;
    const costBasisPln = asset.currency === 'EUR'
        ? qtySold * asset.purchasePrice * EUR_PLN_RATE
        : qtySold * asset.purchasePrice;
    const realizedGain = proceedsPln - costBasisPln;

    const newQty = Math.max(0, asset.quantity - qtySold);
    const isFull = newQty <= 0;

    const updated = { ...asset, quantity: newQty };
    if (isFull) {
        updated.archived = true;
        updated.archivedAt = localIsoDate(new Date());
        markAssetDeleted(asset.id);
    }
    updateAssetInState(updated);

    if (typeof recordAssetValueHistory === 'function') {
        recordAssetValueHistory(updated, isFull ? 'sell-full' : 'sell', { qtySold, pricePerUnit, proceedsPln, realizedGain });
    }

    if (updateCash) {
        const cashAsset = getCashAssetForBroker(asset.brokerAccount);
        if (cashAsset && typeof registerCashMovement === 'function') {
            registerCashMovement({
                assetId: cashAsset.id,
                delta: proceedsPln,
                date: localIsoDate(new Date()),
                note: `Sprzedaż: ${getAssetDisplayName(asset)}`,
                source: 'investment_sale',
                sourceRef: asset.id
            });
        } else if (cashAsset) {
            updateAssetInState({ ...cashAsset, amount: Math.max(0, (cashAsset.amount || 0) + proceedsPln) });
        }
    }

    const gainSign = realizedGain >= 0 ? '+' : '−';
    const gainLabel = `${gainSign}${formatPlnAmount(Math.abs(realizedGain))}`;

    saveState();
    closeSellAssetForm();
    activeAssetId = isFull ? null : asset.id;
    if (isFull) closeAssetDetails();
    renderAssets();
    showSettingsToast(`Sprzedano ${qtySold} szt. · P/L: ${gainLabel}`);
}

function openAssetsPdfDatePicker() {
    const overlay = document.getElementById('assets-pdf-date-overlay');
    if (!overlay) return;
    const input = document.getElementById('assets-pdf-date-input');
    if (input) input.value = localIsoDate(new Date());
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeAssetsPdfDatePicker() {
    document.getElementById('assets-pdf-date-overlay')?.classList.add('hidden');
    if (document.getElementById('reports-pdf-overlay')?.classList.contains('hidden')
        && document.getElementById('recurring-confirm-overlay')?.classList.contains('hidden')
        && document.getElementById('debts-pdf-date-overlay')?.classList.contains('hidden')) {
        document.body.style.overflow = '';
    }
}

function setAssetsPdfDatePreset(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    exportAssetsPdfForDate(localIsoDate(d));
}

function exportAssetsPdfForSelectedDate() {
    const input = document.getElementById('assets-pdf-date-input');
    exportAssetsPdfForDate(input?.value || localIsoDate(new Date()));
}

function exportAssetsPdfForDate(dateIso) {
    if (!dateIso) return;
    const today = localIsoDate(new Date());
    if (dateIso >= today && typeof captureAllAssetValueHistory === 'function') {
        captureAllAssetValueHistory('pdf');
        if (typeof saveState === 'function') saveState();
    }
    closeAssetsPdfDatePicker();
    if (typeof buildAssetsPrintBody !== 'function' || typeof openPrintPreview !== 'function') return;
    openPrintPreview(buildAssetsPrintBody(dateIso), 'Majątek PDF');
}
