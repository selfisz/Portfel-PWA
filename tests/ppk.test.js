/**
 * Testy jednostkowe dla js/ppk.js
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.getAssetValueInPln = (asset) => parseFloat(asset?.amount) || 0;
    loadScript('js/ppk.js');
});

function makePpkAsset(overrides = {}) {
    return {
        id: 'ppk-1',
        type: 'retirement',
        retirementKind: 'PPK',
        amount: 0,
        currency: 'PLN',
        ...overrides
    };
}

describe('isPpkAsset', () => {
    it('rozpoznaje aktywo PPK', () => {
        expect(isPpkAsset(makePpkAsset())).toBe(true);
    });

    it('odrzuca IKZE', () => {
        expect(isPpkAsset(makePpkAsset({ retirementKind: 'IKZE' }))).toBe(false);
    });
});

describe('getPpkBreakdown', () => {
    it('używa ppkBreakdown gdy brak historii', () => {
        const asset = makePpkAsset({
            ppkBreakdown: { own: 100, employer: 50, state: 10 }
        });
        expect(getPpkBreakdown(asset)).toEqual({ own: 100, employer: 50, state: 10 });
    });

    it('sumuje historię wpłat', () => {
        const asset = makePpkAsset({
            ppkContributions: [
                { id: 'a', date: '2025-01-01', own: 100, employer: 50, state: 10 },
                { id: 'b', date: '2025-02-01', own: 200, employer: 75, state: 5 }
            ]
        });
        expect(getPpkBreakdown(asset)).toEqual({ own: 300, employer: 125, state: 15 });
    });
});

describe('calculatePpkEarlyWithdrawal', () => {
    it('liczy wypłatę wg przykładu Marty (5 lat PPK)', () => {
        const asset = makePpkAsset({
            amount: 17395,
            ppkBreakdown: { own: 8249, employer: 6187, state: 1450 }
        });
        const calc = calculatePpkEarlyWithdrawal(asset);

        expect(calc.gainGross).toBe(1509);
        expect(calc.ownKept).toBe(8249);
        expect(calc.employerKept).toBe(4330.9);
        expect(calc.employerToZus).toBe(1856.1);
        expect(calc.stateLost).toBe(1450);
        expect(calc.gainTax).toBe(286.71);
        expect(calc.gainNet).toBe(1222.29);
        expect(calc.payout).toBe(13802.19);
        expect(calc.lossTotal).toBe(3592.81);
    });

    it('liczy wypłatę bez zysku kapitałowego (składniki = saldo)', () => {
        const asset = makePpkAsset({
            amount: 10564.79,
            ppkBreakdown: { own: 5882.96, employer: 4412.27, state: 269.56 }
        });
        const calc = calculatePpkEarlyWithdrawal(asset);

        expect(calc.gainGross).toBe(0);
        expect(calc.gainTax).toBe(0);
        expect(calc.gainNet).toBe(0);
        expect(calc.employerKept).toBe(3088.59);
        expect(calc.employerToZus).toBe(1323.68);
        expect(calc.payout).toBe(8971.55);
        expect(calc.lossTotal).toBe(1593.24);
    });
});

describe('normalizePpkAssetFields', () => {
    it('czyści pola PPK dla IKZE', () => {
        const asset = makePpkAsset({
            retirementKind: 'IKZE',
            ppkBreakdown: { own: 1, employer: 2, state: 3 },
            ppkContributions: [{ id: 'x', date: '2025-01-01', own: 1, employer: 0, state: 0 }]
        });
        normalizePpkAssetFields(asset);
        expect(asset.ppkBreakdown).toBeUndefined();
        expect(asset.ppkContributions).toBeUndefined();
    });
});

describe('PPK wpłaty do historii', () => {
    it('powiększa saldo o sumę dodanej wpłaty', () => {
        const asset = makePpkAsset({ amount: 1000, ppkContributions: [] });
        const values = {
            'asset-ppk-contrib-date': '2025-06-01',
            'asset-ppk-contrib-own': '100',
            'asset-ppk-contrib-employer': '50',
            'asset-ppk-contrib-state': '10',
            'asset-ppk-own-input': '',
            'asset-ppk-employer-input': '',
            'asset-ppk-state-input': '',
            'asset-amount-input': '1000'
        };
        globalThis.getActiveAsset = () => asset;
        globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
        globalThis.formatTxDate = (d) => d;
        globalThis.escapeHtml = (s) => String(s ?? '');
        globalThis.document = {
            getElementById: (id) => {
                if (id === 'asset-ppk-contrib-edit-list') return { innerHTML: '' };
                return { value: values[id] ?? '', innerHTML: '' };
            }
        };

        addPpkContributionEntry();
        expect(asset.amount).toBe(1160);
        expect(asset.ppkContributions).toHaveLength(1);
    });
});
