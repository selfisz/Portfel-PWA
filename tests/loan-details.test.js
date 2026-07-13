/**
 * Testy jednostkowe dla js/loan-details.js
 *
 * Kolejność ładowania: najpierw stubujemy zależności (normalizeLoan, isMortgageLoan,
 * migrateLoansArray), potem ładujemy loan-details.js, a następnie portfolio.js
 * (który zastąpi nasze stuby prawdziwymi implementacjami).
 * Dzięki temu normalizeLoan → normalizeLoanDetails jest w pełni funkcjonalne.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
  // Minimalne stuby potrzebne żeby loan-details.js mógł się załadować
  globalThis.migrateLoansArray = () => {};
  globalThis.isMortgageLoan = (loan) => {
    const sub = loan?.subCategory?.trim() || '';
    const name = loan?.name?.trim() || '';
    return ['Kredyt hipoteczny', 'Kredyt Pekao SA', 'Kredyt na mieszkanie'].includes(sub)
      || /hipoteczn/i.test(sub) || /hipoteczn/i.test(name);
  };

  // normalizeLoan — uproszczona wersja (portfolio.js jeszcze nie załadowany)
  globalThis.normalizeLoan = (raw) => {
    const loan = raw && typeof raw === 'object' ? { ...raw } : {};
    if (!loan.id) loan.id = `loan-${Date.now().toString(36)}`;
    loan.totalAmount = Math.max(0, parseFloat(loan.totalAmount) || 0);
    loan.currentCapitalLeft = Math.max(0, parseFloat(loan.currentCapitalLeft) || 0);
    loan.interestRate = Math.max(0, parseFloat(loan.interestRate) || 0);
    loan.nextInstallmentAmount = Math.max(0, parseFloat(loan.nextInstallmentAmount) || 0);
    loan.archived = !!loan.archived;
    loan.includeInSummary = loan.includeInSummary !== false;
    // Wywołujemy normalizeLoanDetails z tego pliku gdy już będzie załadowany
    loan.details = typeof normalizeLoanDetails === 'function'
      ? normalizeLoanDetails(loan.details)
      : (loan.details || {});
    delete loan.lender;
    return loan;
  };

  globalThis.appState = { loans: [], transactions: [] };
  globalThis.categoryTree = { expense: { Długi: [] } };

  loadScript('js/loan-details.js');

  // Zastępujemy stub prawdziwą implementacją z portfolio.js
  globalThis.normalizeLoanDetails = normalizeLoanDetails;
  loadScript('js/portfolio.js');
});

beforeEach(() => {
  globalThis.appState = { loans: [], transactions: [] };
});

// ---------------------------------------------------------------------------
// getDefaultLoanDetails
// ---------------------------------------------------------------------------
describe('getDefaultLoanDetails', () => {
  it('zwraca obiekt ze wszystkimi wymaganymi polami', () => {
    const d = getDefaultLoanDetails();
    expect(d).toHaveProperty('asOfDate', '');
    expect(d).toHaveProperty('bank', '');
    expect(d).toHaveProperty('contractNumber', '');
    expect(d).toHaveProperty('propertyValue', 0);
    expect(d).toHaveProperty('ltvPercent', 0);
    expect(d).toHaveProperty('totalDebt', 0);
    expect(d).toHaveProperty('capitalPaid', 0);
    expect(d).toHaveProperty('interestPaid', 0);
    expect(d).toHaveProperty('remainingInstallments', 0);
    expect(d).toHaveProperty('margin', 0);
    expect(d).toHaveProperty('mortgageLimit', 0);
    expect(d).toHaveProperty('earlyRepaymentFee', null);
  });

  it('zwraca nową instancję za każdym razem (brak shared state)', () => {
    const a = getDefaultLoanDetails();
    const b = getDefaultLoanDetails();
    a.bank = 'Zmieniony';
    expect(b.bank).toBe('');
  });
});

// ---------------------------------------------------------------------------
// normalizeLoanDetails
// ---------------------------------------------------------------------------
describe('normalizeLoanDetails', () => {
  it('zwraca domyślny obiekt dla null', () => {
    const d = normalizeLoanDetails(null);
    expect(d.propertyValue).toBe(0);
    expect(d.earlyRepaymentFee).toBeNull();
  });

  it('zwraca domyślny obiekt dla undefined', () => {
    const d = normalizeLoanDetails(undefined);
    expect(d.totalDebt).toBe(0);
  });

  it('wymusza nieujemne wartości liczbowe', () => {
    const d = normalizeLoanDetails({ propertyValue: -100, ltvPercent: -5, margin: -1 });
    expect(d.propertyValue).toBe(0);
    expect(d.ltvPercent).toBe(0);
    expect(d.margin).toBe(0);
  });

  it('parsuje stringi liczbowe', () => {
    const d = normalizeLoanDetails({ propertyValue: '853000', remainingInstallments: '340' });
    expect(d.propertyValue).toBe(853000);
    expect(d.remainingInstallments).toBe(340);
  });

  it('parsuje remainingInstallments jako int (obcina część dziesiętną)', () => {
    const d = normalizeLoanDetails({ remainingInstallments: '340.9' });
    expect(d.remainingInstallments).toBe(340);
  });

  it('zachowuje earlyRepaymentFee = 0 (nie null)', () => {
    const d = normalizeLoanDetails({ earlyRepaymentFee: 0 });
    expect(d.earlyRepaymentFee).toBe(0);
  });

  it('zachowuje earlyRepaymentFee = null gdy nie podano', () => {
    const d = normalizeLoanDetails({});
    expect(d.earlyRepaymentFee).toBeNull();
  });

  it('ustawia earlyRepaymentFee = null dla pustego stringa', () => {
    const d = normalizeLoanDetails({ earlyRepaymentFee: '' });
    expect(d.earlyRepaymentFee).toBeNull();
  });

  it('zachowuje pola tekstowe bez zmian', () => {
    const d = normalizeLoanDetails({ bank: 'mBank', contractNumber: '57887190/2026', rateModel: 'Zmienne' });
    expect(d.bank).toBe('mBank');
    expect(d.contractNumber).toBe('57887190/2026');
    expect(d.rateModel).toBe('Zmienne');
  });

  it('uzupełnia brakujące pola wartościami domyślnymi', () => {
    const d = normalizeLoanDetails({ bank: 'PKO BP' });
    expect(d.asOfDate).toBe('');
    expect(d.propertyValue).toBe(0);
    expect(d.bank).toBe('PKO BP');
  });
});

// ---------------------------------------------------------------------------
// isLegacyTestLoan
// ---------------------------------------------------------------------------
describe('isLegacyTestLoan', () => {
  it('rozpoznaje loan-primary jako legacy', () => {
    expect(isLegacyTestLoan({ id: 'loan-primary', totalAmount: 1, currentCapitalLeft: 1 })).toBe(true);
  });

  it('rozpoznaje kredyt z LEGACY_TEST_CAPITAL', () => {
    expect(isLegacyTestLoan({ id: 'xx', totalAmount: 600000, currentCapitalLeft: 412500 })).toBe(true);
  });

  it('rozpoznaje kredyt z LEGACY_TEST_TOTAL i LEGACY_TEST_RATE', () => {
    expect(isLegacyTestLoan({ id: 'xx', totalAmount: 500000, currentCapitalLeft: 100000, interestRate: 6.75 })).toBe(true);
  });

  it('nie uznaje prawdziwego kredytu Pekao za legacy', () => {
    const pekao = getPekaoLoanSnapshot();
    expect(isLegacyTestLoan(pekao)).toBe(false);
  });

  it('nie uznaje kredytu mBank za legacy', () => {
    const mbank = getMbankConsolidationLoanSnapshot();
    expect(isLegacyTestLoan(mbank)).toBe(false);
  });

  it('nie uznaje zupełnie nowego kredytu za legacy', () => {
    expect(isLegacyTestLoan({ id: 'loan-nowy', totalAmount: 50000, currentCapitalLeft: 40000, interestRate: 5.0 })).toBe(false);
  });

  it('loan-pekao z dużym kapitałem NIE jest legacy', () => {
    expect(isLegacyTestLoan({ id: 'loan-pekao', totalAmount: 700000, currentCapitalLeft: 650000 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isGhostMortgageLoan (po naprawie buga)
// ---------------------------------------------------------------------------
describe('isGhostMortgageLoan', () => {
  it('zwraca false dla kredytu niehipotecznego', () => {
    expect(isGhostMortgageLoan({ id: 'l1', subCategory: 'Meble', totalAmount: 10000, currentCapitalLeft: 5000 })).toBe(false);
  });

  it('zwraca false dla kredytu Pekao z prawidłowym contractNumber', () => {
    const pekao = getPekaoLoanSnapshot();
    expect(isGhostMortgageLoan(pekao)).toBe(false);
  });

  it('zwraca true dla loan-primary (legacy)', () => {
    expect(isGhostMortgageLoan({ id: 'loan-primary', subCategory: 'Kredyt hipoteczny', totalAmount: 500000, currentCapitalLeft: 100000 })).toBe(true);
  });

  it('zwraca true dla kredytu hipotecznego bez contractNumber i z kapitałem < 550k (ghost)', () => {
    expect(isGhostMortgageLoan({
      id: 'loan-unk',
      subCategory: 'Kredyt hipoteczny',
      totalAmount: 400000,
      currentCapitalLeft: 300000
    })).toBe(true);
  });

  it('nie uznaje nowego kredytu bez kapitału za ghost (po naprawie buga)', () => {
    // Przed naprawą: każdy kredyt hipoteczny bez contractNumber był ghost
    // Po naprawie: bez contractNumber I bez kapitału (już spłacony) jest ghost — ale nowy z kapitałem = ghost też (cap < 550k)
    // Ten test dokumentuje zachowanie PRZED i PO
    const newLoan = {
      id: 'loan-nowy-hipotek',
      subCategory: 'Kredyt hipoteczny',
      totalAmount: 600000,
      currentCapitalLeft: 580000 // > GHOST_MORTGAGE_CAPITAL_CEILING (550000)
    };
    // Kapitał > 550k → NIE jest ghost nawet bez contractNumber
    expect(isGhostMortgageLoan(newLoan)).toBe(false);
  });

  it('zwraca false dla loan-pekao z dużym kapitałem bez contractNumber', () => {
    expect(isGhostMortgageLoan({
      id: 'loan-pekao',
      subCategory: 'Kredyt hipoteczny',
      totalAmount: 700000,
      currentCapitalLeft: 650000
    })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasLoanExtendedDetails
// ---------------------------------------------------------------------------
describe('hasLoanExtendedDetails', () => {
  it('zwraca false dla null', () => {
    expect(hasLoanExtendedDetails(null)).toBe(false);
  });

  it('zwraca false gdy brak details', () => {
    expect(hasLoanExtendedDetails({ name: 'Kredyt' })).toBe(false);
  });

  it('zwraca false gdy details są puste', () => {
    expect(hasLoanExtendedDetails({ details: {} })).toBe(false);
  });

  it('zwraca true gdy details mają collateral', () => {
    expect(hasLoanExtendedDetails({ details: { collateral: 'Nieruchomość' } })).toBe(true);
  });

  it('zwraca true gdy details mają promotionTerms', () => {
    expect(hasLoanExtendedDetails({ details: { promotionTerms: 'Marża 1.94%' } })).toBe(true);
  });

  it('zwraca true gdy details mają propertyValue > 0', () => {
    expect(hasLoanExtendedDetails({ details: { propertyValue: 853000 } })).toBe(true);
  });

  it('zwraca true dla kredytu Pekao (pełne dane)', () => {
    const pekao = getPekaoLoanSnapshot();
    expect(hasLoanExtendedDetails(pekao)).toBe(true);
  });

  it('zwraca false dla kredytu Alior (brak extended details)', () => {
    const alior = getAliorRtvLoanSnapshot();
    expect(hasLoanExtendedDetails(alior)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Snapshoty kredytów — integralność danych
// ---------------------------------------------------------------------------
describe('getPekaoLoanSnapshot', () => {
  it('ma poprawne pola obowiązkowe', () => {
    const s = getPekaoLoanSnapshot();
    expect(s.id).toBe('loan-pekao');
    expect(s.totalAmount).toBeGreaterThan(0);
    expect(s.currentCapitalLeft).toBeGreaterThan(0);
    expect(s.currentCapitalLeft).toBeLessThanOrEqual(s.totalAmount);
    expect(s.details?.contractNumber).toBeTruthy();
    expect(s.details?.endDate).toBeTruthy();
  });

  it('currentCapitalLeft nie przekracza totalAmount', () => {
    const s = getPekaoLoanSnapshot();
    expect(s.currentCapitalLeft).toBeLessThanOrEqual(s.totalAmount);
  });

  it('ltvPercent mieści się w rozsądnym zakresie (0-100)', () => {
    const { ltvPercent } = getPekaoLoanSnapshot().details;
    expect(ltvPercent).toBeGreaterThan(0);
    expect(ltvPercent).toBeLessThanOrEqual(100);
  });
});

describe('getAliorRtvLoanSnapshot', () => {
  it('ma poprawne pola', () => {
    const s = getAliorRtvLoanSnapshot();
    expect(s.id).toBe('loan-alior-rtv');
    expect(s.totalAmount).toBeGreaterThan(0);
    expect(s.interestRate).toBe(0);
    expect(s.nextInstallmentAmount).toBeGreaterThan(0);
  });
});

describe('getVelobankLoanSnapshot', () => {
  it('ma poprawne pola', () => {
    const s = getVelobankLoanSnapshot();
    expect(s.id).toBe('loan-velobank');
    expect(s.totalAmount).toBeGreaterThan(0);
    expect(s.interestRate).toBe(0);
  });
});

describe('getMbankConsolidationLoanSnapshot', () => {
  it('ma poprawne pola', () => {
    const s = getMbankConsolidationLoanSnapshot();
    expect(s.id).toBe('loan-mbank-consolidation');
    expect(s.interestRate).toBeGreaterThan(0);
    expect(s.details?.contractNumber).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// findAliorRtvLoanIndex / findVelobankLoanIndex / findMbankConsolidationLoanIndex
// ---------------------------------------------------------------------------
describe('findAliorRtvLoanIndex', () => {
  it('zwraca -1 gdy brak kredytów', () => {
    globalThis.appState = { loans: [], transactions: [] };
    expect(findAliorRtvLoanIndex()).toBe(-1);
  });

  it('znajduje kredyt po id', () => {
    globalThis.appState = { loans: [{ id: 'loan-alior-rtv', name: 'X', totalAmount: 1000, currentCapitalLeft: 500 }], transactions: [] };
    expect(findAliorRtvLoanIndex()).toBe(0);
  });

  it('znajduje kredyt po nazwie (regex)', () => {
    globalThis.appState = { loans: [{ id: 'x', name: 'Kredyt Alior (RTV)', totalAmount: 1000, currentCapitalLeft: 500 }], transactions: [] };
    expect(findAliorRtvLoanIndex()).toBe(0);
  });

  it('zwraca -1 gdy nie pasuje', () => {
    globalThis.appState = { loans: [{ id: 'loan-pekao', name: 'Hipoteka', totalAmount: 600000, currentCapitalLeft: 550000 }], transactions: [] };
    expect(findAliorRtvLoanIndex()).toBe(-1);
  });
});

describe('findVelobankLoanIndex', () => {
  it('zwraca -1 gdy brak kredytów', () => {
    globalThis.appState = { loans: [], transactions: [] };
    expect(findVelobankLoanIndex()).toBe(-1);
  });

  it('znajduje kredyt po id', () => {
    globalThis.appState = { loans: [{ id: 'loan-velobank', name: 'X', totalAmount: 8000, currentCapitalLeft: 8000 }], transactions: [] };
    expect(findVelobankLoanIndex()).toBe(0);
  });

  it('znajduje kredyt po nazwie (regex)', () => {
    globalThis.appState = { loans: [{ id: 'x', name: 'Kredyt 0% VeloBank', totalAmount: 8000, currentCapitalLeft: 8000 }], transactions: [] };
    expect(findVelobankLoanIndex()).toBe(0);
  });
});

describe('findMbankConsolidationLoanIndex', () => {
  it('zwraca -1 gdy brak', () => {
    globalThis.appState = { loans: [], transactions: [] };
    expect(findMbankConsolidationLoanIndex()).toBe(-1);
  });

  it('znajduje po numerze umowy', () => {
    globalThis.appState = {
      loans: [{ id: 'x', name: 'Y', details: { contractNumber: '57887190/2026' }, totalAmount: 31800, currentCapitalLeft: 21000 }],
      transactions: []
    };
    expect(findMbankConsolidationLoanIndex()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ensureAliorRtvLoan / ensureVelobankLoan (integracja z appState)
// ---------------------------------------------------------------------------
describe('ensureAliorRtvLoan', () => {
  it('dodaje kredyt Alior gdy go nie ma', () => {
    globalThis.appState = { loans: [], transactions: [] };
    const changed = ensureAliorRtvLoan();
    expect(changed).toBe(true);
    expect(globalThis.appState.loans).toHaveLength(1);
    expect(globalThis.appState.loans[0].id).toBe('loan-alior-rtv');
  });

  it('nie dodaje duplikatu gdy kredyt już istnieje', () => {
    globalThis.appState = { loans: [{ id: 'loan-alior-rtv', name: 'X', totalAmount: 1000, currentCapitalLeft: 500 }], transactions: [] };
    const changed = ensureAliorRtvLoan();
    expect(changed).toBe(false);
    expect(globalThis.appState.loans).toHaveLength(1);
  });
});

describe('ensureVelobankLoan', () => {
  it('dodaje kredyt VeloBank gdy go nie ma', () => {
    globalThis.appState = { loans: [], transactions: [] };
    const changed = ensureVelobankLoan();
    expect(changed).toBe(true);
    expect(globalThis.appState.loans[0].id).toBe('loan-velobank');
  });

  it('nie dodaje duplikatu', () => {
    globalThis.appState = { loans: [{ id: 'loan-velobank', name: 'X', totalAmount: 8000, currentCapitalLeft: 8000 }], transactions: [] };
    expect(ensureVelobankLoan()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// seedAliorRtvPayments (idempotentność)
// ---------------------------------------------------------------------------
describe('seedAliorRtvPayments', () => {
  it('dodaje brakujące transakcje płatności', () => {
    globalThis.appState = { loans: [], transactions: [] };
    const changed = seedAliorRtvPayments();
    expect(changed).toBe(true);
    expect(globalThis.appState.transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('jest idempotentny — ponowne wywołanie nic nie zmienia', () => {
    globalThis.appState = { loans: [], transactions: [] };
    seedAliorRtvPayments();
    const countAfterFirst = globalThis.appState.transactions.length;
    const changed = seedAliorRtvPayments();
    expect(changed).toBe(false);
    expect(globalThis.appState.transactions.length).toBe(countAfterFirst);
  });

  it('dodane transakcje mają poprawną strukturę', () => {
    globalThis.appState = { loans: [], transactions: [] };
    seedAliorRtvPayments();
    const tx = globalThis.appState.transactions[0];
    expect(tx.type).toBe('expense');
    expect(tx.mainCategory).toBe('Długi');
    expect(tx.subCategory).toBe('Meble');
    expect(tx.amount).toBeGreaterThan(0);
    expect(/alior/i.test(tx.note)).toBe(true);
  });

  it('sortuje transakcje malejąco po dacie po dodaniu', () => {
    globalThis.appState = { loans: [], transactions: [] };
    seedAliorRtvPayments();
    const dates = globalThis.appState.transactions.map((t) => t.date);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// syncMbankConsolidationLoanFields (po naprawie JSON.stringify)
// ---------------------------------------------------------------------------
describe('syncMbankConsolidationLoanFields', () => {
  it('zwraca false gdy kredytu nie ma', () => {
    globalThis.appState = { loans: [], transactions: [] };
    expect(syncMbankConsolidationLoanFields()).toBe(false);
  });

  it('nie modyfikuje kredytu gdy dane są zgodne ze snapshotem', () => {
    const snapshot = getMbankConsolidationLoanSnapshot();
    globalThis.appState = { loans: [{ ...snapshot }], transactions: [] };
    const changed = syncMbankConsolidationLoanFields();
    expect(changed).toBe(false);
  });

  it('aktualizuje pole gdy różni się od snapshota', () => {
    const snapshot = getMbankConsolidationLoanSnapshot();
    globalThis.appState = {
      loans: [{ ...snapshot, totalAmount: 99999 }],
      transactions: []
    };
    const changed = syncMbankConsolidationLoanFields();
    expect(changed).toBe(true);
    expect(globalThis.appState.loans[0].totalAmount).toBe(snapshot.totalAmount);
  });
});

// ---------------------------------------------------------------------------
// splitLoanPaymentAllocation
// ---------------------------------------------------------------------------
describe('splitLoanPaymentAllocation', () => {
  const pekaoLike = {
    currentCapitalLeft: 661159.25,
    interestRate: 6.19,
    nextInstallmentAmount: 4128.37
  };

  it('dzieli ratę hipoteczną na kapitał i odsetki', () => {
    const split = splitLoanPaymentAllocation(pekaoLike, 4128.37, 'Rata');
    expect(split.interest).toBeCloseTo(3410.48, 1);
    expect(split.principal).toBeCloseTo(717.89, 1);
    expect(split.principal + split.interest).toBeCloseTo(4128.37, 2);
  });

  it('nadpłata w notatce idzie w całości na kapitał', () => {
    const split = splitLoanPaymentAllocation(pekaoLike, 10000, 'Nadpłata');
    expect(split.principal).toBe(10000);
    expect(split.interest).toBe(0);
  });

  it('kwota > 105% raty: rata z odsetkami + reszta jako kapitał', () => {
    const split = splitLoanPaymentAllocation(pekaoLike, 6000, 'Spłata');
    const regular = splitLoanPaymentAllocation(pekaoLike, 4128.37, 'Rata');
    expect(split.interest).toBeCloseTo(regular.interest, 2);
    expect(split.principal).toBeCloseTo(regular.principal + (6000 - 4128.37), 2);
  });

  it('przy oprocentowaniu 0% cała kwota to kapitał', () => {
    const split = splitLoanPaymentAllocation(
      { currentCapitalLeft: 8000, interestRate: 0, nextInstallmentAmount: 500 },
      500,
      'Rata'
    );
    expect(split).toEqual({ principal: 500, interest: 0 });
  });

  it('kredyt mBank konsolidacja — rata z odsetkami', () => {
    const mbank = { currentCapitalLeft: 21261.39, interestRate: 7.9, nextInstallmentAmount: 682.13 };
    const split = splitLoanPaymentAllocation(mbank, 682.13, 'Rata');
    expect(split.interest).toBeCloseTo(139.97, 1);
    expect(split.principal).toBeCloseTo(542.16, 1);
  });
});
