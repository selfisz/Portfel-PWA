/* Aktywa — migracje i seed danych */

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

const LEGACY_PORTFOLIO_BUCKET_IDS = ['asset-inv-xtb', 'asset-inv-mbank'];

function isLegacyPortfolioBucket(raw) {
    return LEGACY_PORTFOLIO_BUCKET_IDS.includes(raw?.id);
}

function roundAssetPrice(value) {
    return Math.round(value * 1000000) / 1000000;
}

function buildInvestmentPositionFromBroker({
    id,
    name,
    ticker,
    quantity,
    valuePln,
    gainPln,
    currency = 'PLN',
    brokerAccount = '',
    includeInSummary = true
}) {
    const qty = Math.max(0, parseFloat(quantity) || 0);
    const value = parseFloat(valuePln) || 0;
    const gain = parseFloat(gainPln) || 0;
    const cost = value - gain;
    const currentPrice = qty > 0 ? roundAssetPrice(value / qty) : 0;
    const purchasePrice = qty > 0 ? roundAssetPrice(cost / qty) : 0;
    return normalizeAsset({
        id,
        type: 'investment',
        name,
        ticker,
        quantity: qty,
        currentPrice,
        purchasePrice,
        currency,
        brokerAccount,
        includeInSummary
    });
}

function getPortfolioInvestmentSnapshots() {
    return [
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-xtb-artgames',
            name: 'XTB · Art Games',
            ticker: 'ARTGAMES',
            quantity: 1700,
            valuePln: 1011.50,
            gainPln: -2456.50,
            brokerAccount: 'xtb'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-mbank-aigames',
            name: 'mBank · AIGAMES',
            ticker: 'AIGAMES',
            quantity: 65,
            valuePln: 49.66,
            gainPln: -949.84,
            brokerAccount: 'mbank'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-mbank-artgames-nc',
            name: 'mBank · ARTGAMES-NC',
            ticker: 'ARTGAMES-NC',
            quantity: 566,
            valuePln: 339.60,
            gainPln: -1377.98,
            brokerAccount: 'mbank'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-mbank-cdprojekt',
            name: 'mBank · CDPROJEKT',
            ticker: 'CDPROJEKT',
            quantity: 10,
            valuePln: 2174.00,
            gainPln: -1150.41,
            brokerAccount: 'mbank'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-mbank-etfbndxpl',
            name: 'mBank · ETFBNDXPL',
            ticker: 'ETFBNDXPL',
            quantity: 4,
            valuePln: 1109.40,
            gainPln: -25.00,
            brokerAccount: 'mbank'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-mbank-vwce',
            name: 'mBank · VWCE GR ETF',
            ticker: 'VWCE',
            quantity: 1,
            valuePln: 703.91,
            gainPln: 21.57,
            brokerAccount: 'mbank'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-ikze-etfbndxpl',
            name: 'IKZE · ETFBNDXPL',
            ticker: 'ETFBNDXPL',
            quantity: 9,
            valuePln: 2496.15,
            gainPln: 7.65,
            brokerAccount: 'ikze'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-ikze-etfbtbsp',
            name: 'IKZE · ETFBTBSP',
            ticker: 'ETFBTBSP',
            quantity: 15,
            valuePln: 3460.50,
            gainPln: 69.00,
            brokerAccount: 'ikze'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-ikze-euna',
            name: 'IKZE · EUNA GR ETF',
            ticker: 'EUNA',
            quantity: 151,
            valuePln: 3206.64,
            gainPln: 58.00,
            brokerAccount: 'ikze'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-ikze-l8i3',
            name: 'IKZE · L8I3 GR ETF',
            ticker: 'L8I3',
            quantity: 3,
            valuePln: 1465.23,
            gainPln: 17.40,
            brokerAccount: 'ikze'
        }),
        buildInvestmentPositionFromBroker({
            id: 'asset-inv-ikze-vwce',
            name: 'IKZE · VWCE GR ETF',
            ticker: 'VWCE',
            quantity: 14,
            valuePln: 9854.73,
            gainPln: 435.81,
            brokerAccount: 'ikze'
        }),
        normalizeAsset({
            id: 'asset-cash-xtb-free',
            type: 'cash',
            name: 'XTB · wolne środki',
            amount: 0.08,
            currency: 'PLN'
        })
    ];
}

function archiveLegacyPortfolioBuckets() {
    if (!Array.isArray(appState.assets)) return false;
    let changed = false;
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);

    LEGACY_PORTFOLIO_BUCKET_IDS.forEach((id) => {
        const idx = appState.assets.findIndex((a) => a.id === id);
        if (idx < 0) return;
        const asset = appState.assets[idx];
        if (asset.archived) return;
        appState.assets[idx] = normalizeAsset({
            ...asset,
            archived: true,
            archivedAt: today
        });
        changed = true;
    });

    return changed;
}

function getAssetSeedBlockGroupId(snapshot) {
    if (!snapshot?.id) return null;
    if (snapshot.id === 'asset-ret-ikze-mbank') return 'ikze';
    if (snapshot.id === 'asset-ret-mbank-emerytura') return 'emerytura';
    if (snapshot.brokerAccount) return snapshot.brokerAccount;
    return null;
}

function isAssetSeedBlocked(snapshot) {
    const normalized = typeof snapshot === 'object' ? snapshot : { id: snapshot };
    const id = normalized.id;
    if (!id) return true;
    if (getDeletedAssetIds().includes(id)) return true;
    const groupId = getAssetSeedBlockGroupId(normalized);
    if (groupId && getExcludedPortfolioGroups().includes(groupId)) return true;
    return false;
}

function hasLegacyPortfolioBucketsInState() {
    return LEGACY_PORTFOLIO_BUCKET_IDS.some((id) =>
        (appState.assets || []).some((a) => a.id === id && !a.archived)
    );
}

function hasPortfolioSnapshotPositions() {
    return getPortfolioInvestmentSnapshots().some((snapshot) =>
        (appState.assets || []).some((a) => a.id === snapshot.id && !a.archived)
    );
}

function shouldRunFullPortfolioMigration() {
    if (hasLegacyPortfolioBucketsInState()) return true;
    return !hasPortfolioSnapshotPositions();
}

function migratePortfolioPositionsJune2026() {
    if (!Array.isArray(appState.assets)) appState.assets = [];
    if (!appState.reportPrefs || typeof appState.reportPrefs !== 'object') {
        appState.reportPrefs = {};
    }
    if (appState.reportPrefs.portfolioPositions2026 === 'v1') return false;

    if (!shouldRunFullPortfolioMigration()) {
        appState.reportPrefs.portfolioPositions2026 = 'v1';
        return true;
    }

    const hadLegacyBuckets = hasLegacyPortfolioBucketsInState();
    let changed = archiveLegacyPortfolioBuckets();
    const fromLegacyBuckets = hadLegacyBuckets || changed;

    getPortfolioInvestmentSnapshots().forEach((snapshot) => {
        if (isAssetSeedBlocked(snapshot)) return;
        const idx = appState.assets.findIndex((a) => a.id === snapshot.id);
        if (idx >= 0) {
            if (fromLegacyBuckets) {
                appState.assets[idx] = snapshot;
                changed = true;
            }
        } else {
            appState.assets.push(snapshot);
            changed = true;
        }
    });

    const ikzeShell = normalizeAsset({
        id: 'asset-ret-ikze-mbank',
        type: 'retirement',
        name: 'mBank — IKZE',
        retirementKind: 'IKZE',
        institution: 'mBank',
        amount: 0,
        includeInSummary: false
    });
    if (!isAssetSeedBlocked(ikzeShell)) {
        const ikzeIdx = appState.assets.findIndex((a) => a.id === ikzeShell.id);
        if (ikzeIdx >= 0) {
            if (fromLegacyBuckets) {
                appState.assets[ikzeIdx] = { ...appState.assets[ikzeIdx], ...ikzeShell };
                changed = true;
            }
        } else {
            appState.assets.push(ikzeShell);
            changed = true;
        }
    }

    const emerytura = normalizeAsset({
        id: 'asset-ret-mbank-emerytura',
        type: 'retirement',
        name: 'Emerytura 2035',
        retirementKind: 'EMERYTURA',
        institution: 'mBank',
        amount: 1679.19
    });
    if (!isAssetSeedBlocked(emerytura)) {
        const emIdx = appState.assets.findIndex((a) => a.id === emerytura.id);
        if (emIdx >= 0) {
            if (fromLegacyBuckets) {
                appState.assets[emIdx] = { ...appState.assets[emIdx], ...emerytura };
                changed = true;
            }
        } else {
            appState.assets.push(emerytura);
            changed = true;
        }
    }

    appState.reportPrefs.portfolioPositions2026 = 'v1';
    return changed;
}

function consolidateUserAssets() {
    if (!Array.isArray(appState.assets)) appState.assets = [];
    let changed = false;

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
        { id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: CASH_TOTAL_AMOUNT, cashBaseline: CASH_TOTAL_AMOUNT },
        ...getPortfolioInvestmentSnapshots(),
        {
            id: 'asset-ret-mbank-emerytura',
            type: 'retirement',
            name: 'Emerytura 2035',
            retirementKind: 'EMERYTURA',
            institution: 'mBank',
            amount: 1679.19
        },
        {
            id: 'asset-ret-ikze-mbank',
            type: 'retirement',
            name: 'mBank — IKZE',
            retirementKind: 'IKZE',
            institution: 'mBank',
            amount: 0,
            includeInSummary: false
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
        },
        { id: 'asset-cash-mbank-cele', type: 'cash', name: 'mBank — Cele', amount: 2172.36, cashBaseline: 2172.36 }
    ];
}

function ensureUserAssetsSeed() {
    if (!Array.isArray(appState.assets)) appState.assets = [];
    let changed = false;

    getUserAssetsSeedSnapshots().forEach((snapshot) => {
        const normalized = normalizeAsset(snapshot);
        if (isAssetSeedBlocked(normalized)) return;
        const idx = appState.assets.findIndex((a) => a.id === normalized.id);
        if (idx < 0) {
            appState.assets.push(normalized);
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
    const portfolio = migratePortfolioPositionsJune2026();
    const ppkBalance = typeof migratePpkBalanceConsistency === 'function'
        ? migratePpkBalanceConsistency()
        : false;
    return migrated || consolidated || emeryturaFix || seeded || portfolio || ppkBalance;
}
