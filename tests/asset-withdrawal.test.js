import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.localIsoDate = (d) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.formatTxDate = (d) => d;
    globalThis.escapeHtml = (s) => String(s ?? '');
    globalThis.PRIMARY_CASH_ASSET_ID = 'asset-cash-total';
    globalThis.EUR_PLN_RATE = 4.3;

    globalThis.getAssetValueInPln = (asset) => {
        if (asset.type === 'investment') {
            return (asset.quantity || 0) * (asset.currentPrice || 0);
        }
        return asset.amount || 0;
    };
    globalThis.getAssetDisplayName = (a) => a.name || 'Aktywo';
    globalThis.isPpkAsset = (a) => a.type === 'retirement' && a.retirementKind === 'PPK';
    globalThis.normalizeAsset = (raw) => ({ ...raw });
    globalThis.getCashMovementsTotal = () => 0;
    globalThis.registerCashMovement = jestLikeRegister;
    globalThis.getPrimaryCashAsset = () => ({ id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0 });
    globalThis.getAssetById = (id) => (id === 'asset-cash-total'
        ? { id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 0 }
        : null);
    globalThis.recordAssetValueHistory = () => {};

    let assets = [];
    globalThis.appState = { assets, cashMovements: [] };
    globalThis.updateAssetInState = (asset) => {
        const idx = assets.findIndex((a) => a.id === asset.id);
        if (idx >= 0) assets[idx] = asset;
        else assets.push(asset);
        return asset;
    };

    loadScript('js/asset-withdrawal.js');
});

const movements = [];
function jestLikeRegister(payload) {
    movements.push(payload);
    return payload;
}

beforeEach(() => {
    movements.length = 0;
    globalThis.appState.assets = [{
        id: 'ppk-1',
        type: 'retirement',
        retirementKind: 'PPK',
        name: 'PPK',
        amount: 12000,
        ppkBreakdown: { own: 8000, employer: 3000, state: 1000 }
    }, {
        id: 'asset-cash-total',
        type: 'cash',
        name: 'Gotówka',
        amount: 500
    }];
});

describe('applyAssetWithdrawal', () => {
    it('zeruje PPK i dodaje wybraną kwotę na gotówkę', () => {
        const asset = appState.assets[0];
        const result = applyAssetWithdrawal(asset, 12000, 10000);
        expect(result.ok).toBe(true);
        expect(result.asset.amount).toBe(0);
        expect(result.asset.ppkBreakdown).toEqual({ own: 0, employer: 0, state: 0 });
        expect(result.record.cashAmount).toBe(10000);
        expect(movements).toHaveLength(1);
        expect(movements[0].delta).toBe(10000);
    });

    it('wymaga pełnego salda aktywa', () => {
        const asset = appState.assets[0];
        const result = applyAssetWithdrawal(asset, 10000, 10000);
        expect(result.ok).toBe(false);
    });
});
