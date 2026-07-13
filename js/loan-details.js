function getDefaultLoanDetails() {
    return {
        asOfDate: '',
        bank: '',
        contractNumber: '',
        contractDate: '',
        purpose: '',
        collateral: '',
        propertyValue: 0,
        ltvPercent: 0,
        totalDebt: 0,
        capitalPaid: 0,
        interestPaid: 0,
        endDate: '',
        remainingInstallments: 0,
        rateModel: '',
        rateFixedUntil: '',
        rateFutureModel: '',
        margin: 0,
        promotionTerms: '',
        mortgageLimit: 0,
        lifeInsurance: '',
        propertyInsurance: '',
        earlyRepaymentFee: null,
        overpaymentNotes: ''
    };
}

function normalizeLoanDetails(raw) {
    const details = { ...getDefaultLoanDetails(), ...(raw && typeof raw === 'object' ? raw : {}) };
    details.propertyValue = Math.max(0, parseFloat(details.propertyValue) || 0);
    details.ltvPercent = Math.max(0, parseFloat(details.ltvPercent) || 0);
    details.totalDebt = Math.max(0, parseFloat(details.totalDebt) || 0);
    details.capitalPaid = Math.max(0, parseFloat(details.capitalPaid) || 0);
    details.interestPaid = Math.max(0, parseFloat(details.interestPaid) || 0);
    details.remainingInstallments = Math.max(0, parseInt(details.remainingInstallments, 10) || 0);
    details.margin = Math.max(0, parseFloat(details.margin) || 0);
    details.mortgageLimit = Math.max(0, parseFloat(details.mortgageLimit) || 0);
    if (details.earlyRepaymentFee !== null && details.earlyRepaymentFee !== '') {
        details.earlyRepaymentFee = Math.max(0, parseFloat(details.earlyRepaymentFee) || 0);
    } else {
        details.earlyRepaymentFee = null;
    }
    return details;
}

function roundLoanMoney(value) {
    return Math.round(Math.max(0, Number(value) || 0) * 100) / 100;
}

function splitInstallmentInterestPrincipal(loan, amount) {
    const capital = Math.max(0, parseFloat(loan?.currentCapitalLeft) || 0);
    const rate = Math.max(0, parseFloat(loan?.interestRate) || 0);
    const amt = Math.max(0, parseFloat(amount) || 0);
    if (!amt) return { principal: 0, interest: 0 };
    if (!rate) {
        return { principal: roundLoanMoney(Math.min(amt, capital)), interest: 0 };
    }
    const monthlyInterest = capital * (rate / 100 / 12);
    const interest = roundLoanMoney(Math.min(amt, monthlyInterest));
    const principal = roundLoanMoney(Math.max(0, Math.min(amt - interest, capital)));
    return { principal, interest };
}

function splitLoanPaymentAllocation(loan, amount, note = '', options = {}) {
    const capital = Math.max(0, parseFloat(loan?.currentCapitalLeft) || 0);
    const rate = Math.max(0, parseFloat(loan?.interestRate) || 0);
    const amt = Math.max(0, parseFloat(amount) || 0);
    if (!amt) return { principal: 0, interest: 0 };

    const treatAsOverpayment = !!(options.treatAsOverpayment || /nadpłat|nadplat/i.test(note || ''));
    if (rate === 0 || treatAsOverpayment) {
        return { principal: roundLoanMoney(Math.min(amt, capital)), interest: 0 };
    }

    const installment = Math.max(0, parseFloat(loan?.nextInstallmentAmount) || 0);
    if (installment > 0 && amt > roundLoanMoney(installment * 1.05)) {
        const regular = splitInstallmentInterestPrincipal(loan, installment);
        const overAmount = roundLoanMoney(amt - installment);
        const remainingCapital = Math.max(0, capital - regular.principal);
        const overPrincipal = roundLoanMoney(Math.min(overAmount, remainingCapital));
        return {
            principal: roundLoanMoney(regular.principal + overPrincipal),
            interest: regular.interest
        };
    }

    return splitInstallmentInterestPrincipal(loan, amt);
}

const PEKAO_CONTRACT_NUMBER = '00621649687/2/KH/25082025';
const GHOST_MORTGAGE_CAPITAL_CEILING = 550000;
const LEGACY_TEST_CAPITAL = 412500;
const LEGACY_TEST_TOTAL = 500000;
const LEGACY_TEST_RATE = 6.75;

function isLegacyTestLoan(loan) {
    const l = normalizeLoan(loan);
    if (l.details?.contractNumber === PEKAO_CONTRACT_NUMBER) return false;
    if (l.id === 'loan-pekao' && (l.currentCapitalLeft || 0) >= 600000) return false;
    if (l.id === 'loan-primary') return true;
    const cap = l.currentCapitalLeft || 0;
    const total = l.totalAmount || 0;
    const rate = l.interestRate || 0;
    if (Math.abs(cap - LEGACY_TEST_CAPITAL) < 0.01) return true;
    if (Math.abs(total - LEGACY_TEST_TOTAL) < 0.01 && Math.abs(rate - LEGACY_TEST_RATE) < 0.01) return true;
    return false;
}

function purgeLegacyTestLoans() {
    migrateLoansArray();
    let changed = false;
    if (appState.loan && isLegacyTestLoan(appState.loan)) {
        delete appState.loan;
        changed = true;
    }
    const before = appState.loans.length;
    appState.loans = appState.loans.filter((l) => !isLegacyTestLoan(l));
    return changed || appState.loans.length !== before;
}

function isGhostMortgageLoan(loan) {
    const l = normalizeLoan(loan);
    if (!isMortgageLoan(l)) return false;
    if (l.details?.contractNumber === PEKAO_CONTRACT_NUMBER) return false;
    if (l.id === 'loan-pekao' && l.currentCapitalLeft >= 600000) return false;
    if (l.id === 'loan-primary') return true;
    const cap = l.currentCapitalLeft || 0;
    if (!l.details?.contractNumber && cap > 0 && cap < GHOST_MORTGAGE_CAPITAL_CEILING) return true;
    // Kredyt hipoteczny bez numeru umowy i bez kapitału — ghost
    if (!l.details?.contractNumber && cap === 0 && (l.totalAmount || 0) > 0) return true;
    return false;
}

function purgeGhostMortgageLoans() {
    migrateLoansArray();
    const before = appState.loans.length;
    appState.loans = appState.loans.filter((l) => !isGhostMortgageLoan(l));
    return appState.loans.length !== before;
}

function dedupeMortgageLoans() {
    migrateLoansArray();
    const mortgages = appState.loans.filter((l) => isMortgageLoan(l));
    if (mortgages.length <= 1) return false;

    const normalized = mortgages.map(normalizeLoan);
    const pekao = normalized.find(
        (l) => l.details?.contractNumber === PEKAO_CONTRACT_NUMBER || l.id === 'loan-pekao'
    );
    const keeper = pekao || normalized.reduce((best, l) =>
        ((l.currentCapitalLeft || 0) > (best.currentCapitalLeft || 0)) ? l : best
    );
    const before = appState.loans.length;
    appState.loans = appState.loans.filter((l) => !isMortgageLoan(l) || normalizeLoan(l).id === keeper.id);
    return appState.loans.length !== before;
}

function migrateLoanToPekaoIfNeeded() {
    migrateLoansArray();
    const snapshot = getPekaoLoanSnapshot();
    const pekaoIdx = appState.loans.findIndex((l) =>
        l.id === 'loan-pekao' || l.details?.contractNumber === PEKAO_CONTRACT_NUMBER
    );

    if (pekaoIdx < 0) return false;

    const loan = normalizeLoan(appState.loans[pekaoIdx]);
    let changed = false;
    if (loan.id !== 'loan-pekao') {
        appState.loans[pekaoIdx] = normalizeLoan({ ...loan, id: 'loan-pekao' });
        changed = true;
    }
    const current = normalizeLoan(appState.loans[pekaoIdx]);
    if (current.subCategory !== snapshot.subCategory || current.name !== snapshot.name) {
        appState.loans[pekaoIdx] = normalizeLoan({
            ...current,
            id: 'loan-pekao',
            name: snapshot.name,
            subCategory: snapshot.subCategory
        });
        changed = true;
    }
    return changed;
}

const ALIOR_RTV_LOAN_ID = 'loan-alior-rtv';

function getAliorRtvLoanSnapshot() {
    return {
        id: ALIOR_RTV_LOAN_ID,
        name: 'Kredyt 0% Alior Bank (RTV)',
        subCategory: 'Meble',
        totalAmount: 11422.30,
        currentCapitalLeft: 9158,
        interestRate: 0,
        nextInstallmentAmount: 382,
        nextInstallmentDue: '2026-07-09'
    };
}

function findAliorRtvLoanIndex() {
    return appState.loans.findIndex((l) =>
        l.id === ALIOR_RTV_LOAN_ID
        || /alior.*\(rtv\)/i.test(l.name || '')
        || (l.subCategory === 'Meble' && /alior/i.test(l.name || ''))
    );
}

function ensureAliorRtvLoan() {
    migrateLoansArray();
    if (findAliorRtvLoanIndex() >= 0) return false;
    appState.loans.push(normalizeLoan(getAliorRtvLoanSnapshot()));
    return true;
}

function syncAliorRtvLoanFields() {
    migrateLoansArray();
    const idx = findAliorRtvLoanIndex();
    if (idx < 0) return false;

    const snapshot = getAliorRtvLoanSnapshot();
    const loan = normalizeLoan(appState.loans[idx]);
    let changed = false;

    if (Math.abs(loan.totalAmount - snapshot.totalAmount) > 0.01) {
        loan.totalAmount = snapshot.totalAmount;
        changed = true;
    }
    if (loan.currentCapitalLeft > loan.totalAmount && loan.totalAmount > 0) {
        loan.currentCapitalLeft = snapshot.currentCapitalLeft;
        changed = true;
    }

    if (changed) appState.loans[idx] = normalizeLoan(loan);
    return changed;
}

function seedAliorRtvPayments() {
    const payments = [
        { amount: 381, date: '2026-05-09', note: 'Alior' },
        { amount: 382, date: '2026-06-09', note: 'Alior' }
    ];
    let changed = false;

    payments.forEach((payment) => {
        const exists = appState.transactions.some((t) =>
            t.type === 'expense'
            && t.mainCategory === 'Długi'
            && t.subCategory === 'Meble'
            && Math.abs(t.amount - payment.amount) < 0.01
            && /alior/i.test(t.note || '')
        );
        if (exists) return;

        appState.transactions.push({
            amount: payment.amount,
            type: 'expense',
            mainCategory: 'Długi',
            subCategory: 'Meble',
            date: payment.date,
            note: payment.note
        });
        changed = true;
    });

    if (changed) {
        appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    return changed;
}

const VELOBANK_LOAN_ID = 'loan-velobank';

function getVelobankLoanSnapshot() {
    return {
        id: VELOBANK_LOAN_ID,
        name: 'Kredyt 0% VeloBank',
        subCategory: 'Remont',
        totalAmount: 8000,
        currentCapitalLeft: 8000,
        interestRate: 0,
        nextInstallmentAmount: 389.95,
        nextInstallmentDue: '2026-08-17'
    };
}

function findVelobankLoanIndex() {
    return appState.loans.findIndex((l) =>
        l.id === VELOBANK_LOAN_ID
        || /velobank/i.test(l.name || '')
        || (l.subCategory === 'Remont' && /velo/i.test(l.name || ''))
    );
}

function ensureVelobankLoan() {
    migrateLoansArray();
    if (findVelobankLoanIndex() >= 0) return false;
    appState.loans.push(normalizeLoan(getVelobankLoanSnapshot()));
    return true;
}

const MBANK_CONSOLIDATION_LOAN_ID = 'loan-mbank-consolidation';

function getMbankConsolidationLoanSnapshot() {
    return {
        id: MBANK_CONSOLIDATION_LOAN_ID,
        name: 'Kredyt mBank (konsolidacja)',
        subCategory: 'Remont',
        totalAmount: 31800,
        currentCapitalLeft: 21261.39,
        interestRate: 7.9,
        nextInstallmentAmount: 682.13,
        nextInstallmentDue: '2026-07-27',
        details: {
            bank: 'mBank',
            contractNumber: '57887190/2026',
            remainingInstallments: 35,
            rateModel: 'Zmienne',
            overpaymentNotes: 'Dzień spłaty: 27. dzień każdego miesiąca.'
        }
    };
}

function findMbankConsolidationLoanIndex() {
    return appState.loans.findIndex((l) =>
        l.id === MBANK_CONSOLIDATION_LOAN_ID
        || /mbank.*konsolidac/i.test(l.name || '')
        || (l.details?.contractNumber === '57887190/2026')
    );
}

function ensureMbankConsolidationLoan() {
    migrateLoansArray();
    if (findMbankConsolidationLoanIndex() >= 0) return false;
    appState.loans.push(normalizeLoan(getMbankConsolidationLoanSnapshot()));
    return true;
}

function syncMbankConsolidationLoanFields() {
    migrateLoansArray();
    const idx = findMbankConsolidationLoanIndex();
    if (idx < 0) return false;

    const snapshot = getMbankConsolidationLoanSnapshot();
    const loan = normalizeLoan(appState.loans[idx]);
    let changed = false;

    ['name', 'subCategory', 'totalAmount', 'currentCapitalLeft', 'interestRate', 'nextInstallmentAmount', 'nextInstallmentDue'].forEach((key) => {
        const current = loan[key];
        const target = snapshot[key];
        if (typeof target === 'number') {
            if (Math.abs((current || 0) - target) > 0.01) {
                loan[key] = target;
                changed = true;
            }
        } else if (current !== target) {
            loan[key] = target;
            changed = true;
        }
    });

    const details = { ...(loan.details || {}), ...snapshot.details };
    const currentKeys = Object.keys(details).sort();
    const prevKeys = Object.keys(loan.details || {}).sort();
    const detailsChanged = currentKeys.length !== prevKeys.length
        || currentKeys.some((k) => details[k] !== (loan.details || {})[k]);
    if (detailsChanged) {
        loan.details = details;
        changed = true;
    }

    if (changed) appState.loans[idx] = normalizeLoan(loan);
    return changed;
}

function normalizeSeedLoanIds() {
    migrateLoansArray();
    let changed = false;

    const renames = [
        { findFn: findAliorRtvLoanIndex, targetId: ALIOR_RTV_LOAN_ID },
        { findFn: findVelobankLoanIndex, targetId: VELOBANK_LOAN_ID },
        { findFn: findMbankConsolidationLoanIndex, targetId: MBANK_CONSOLIDATION_LOAN_ID }
    ];

    renames.forEach(({ findFn, targetId }) => {
        const idx = findFn();
        if (idx < 0) return;
        if (appState.loans[idx].id !== targetId) {
            appState.loans[idx] = normalizeLoan({ ...appState.loans[idx], id: targetId });
            changed = true;
        }
    });

    const idCounts = {};
    appState.loans.forEach((l) => { idCounts[l.id] = (idCounts[l.id] || 0) + 1; });
    Object.entries(idCounts).forEach(([id, count]) => {
        if (count <= 1) return;
        let kept = false;
        appState.loans = appState.loans.filter((l) => {
            if (l.id !== id) return true;
            if (!kept) { kept = true; return true; }
            changed = true;
            return false;
        });
    });

    return changed;
}

function ensureMissingSeedLoans() {
    migrateLoansArray();
    let changed = false;

    if (!appState.loans.some((l) => l.id === 'loan-pekao' || isMortgageLoan(l))) {
        appState.loans.push(normalizeLoan(getPekaoLoanSnapshot()));
        changed = true;
    }
    if (findAliorRtvLoanIndex() < 0) {
        appState.loans.push(normalizeLoan(getAliorRtvLoanSnapshot()));
        changed = true;
    }
    if (findVelobankLoanIndex() < 0) {
        appState.loans.push(normalizeLoan(getVelobankLoanSnapshot()));
        changed = true;
    }
    if (findMbankConsolidationLoanIndex() < 0) {
        appState.loans.push(normalizeLoan(getMbankConsolidationLoanSnapshot()));
        changed = true;
    }

    return changed;
}

function runLoanMigrations() {
    migrateLoansArray();
    const a = purgeLegacyTestLoans();
    const b = purgeGhostMortgageLoans();
    const c = normalizeSeedLoanIds();
    const d = dedupeMortgageLoans();
    const e = migrateLoanToPekaoIfNeeded();
    const f = ensureMissingSeedLoans();
    const g = syncAliorRtvLoanFields();
    const h = seedAliorRtvPayments();
    const i = syncMbankConsolidationLoanFields();
    return a || b || c || d || e || f || g || h || i;
}

function getPekaoLoanSnapshot() {
    return {
        id: 'loan-pekao',
        name: 'Kredyt hipoteczny',
        subCategory: 'Kredyt hipoteczny',
        totalAmount: 669913.99,
        currentCapitalLeft: 661159.25,
        interestRate: 6.19,
        nextInstallmentAmount: 4128.37,
        nextInstallmentDue: '2026-07-13',
        details: {
            asOfDate: '2026-06-24',
            bank: 'Bank Polska Kasa Opieki Spółka Akcyjna (Bank Pekao S.A.)',
            contractNumber: '00621649687/2/KH/25082025',
            contractDate: '2025-08-25',
            purpose: 'Refinansowanie zadłużenia (657 000 PLN) oraz sfinansowanie składki ubezpieczeniowej CPI.',
            collateral: 'Lokal mieszkalny, Kraków, ul. Sosnowiecka 36 lok. 39',
            propertyValue: 853000,
            ltvPercent: 78.54,
            totalDebt: 662637.19,
            capitalPaid: 8754.74,
            interestPaid: 26110.49,
            endDate: '2054-10-12',
            remainingInstallments: 340,
            rateModel: 'Okresowo stała stopa przez pierwsze 5 lat (do 10.08.2030)',
            rateFixedUntil: '2030-08-10',
            rateFutureModel: 'Zmienna stopa — WIBOR 1M + marża banku',
            margin: 1.94,
            promotionTerms: 'Marża 1,94% wymaga comiesięcznych wpływów min. 3 000 PLN na rachunek (wynagrodzenie/dochody) oraz aktywnej karty debetowej. Brak wpływu przez 2 miesiące = utrata promocji (+1,5 p.p. marży).',
            mortgageLimit: 1339827.98,
            lifeInsurance: 'CPI sfinansowane z góry na 4 lata (12 913,99 PLN). Rezygnacja lub brak nowej polisy po tym okresie: +0,1 p.p. marży. Przy wcześniejszej spłacie — zwrot niewykorzystanej składki.',
            propertyInsurance: 'Ubezpieczenie nieruchomości obowiązkowe przez cały okres. Brak polisy z cesją na bank: +2 p.p. marży do czasu uzupełnienia.',
            earlyRepaymentFee: 0,
            overpaymentNotes: 'Prowizja za wcześniejszą spłatę: 0% w okresie stałej stopy. Nadpłata standardowo obniża kolejne raty. Skrócenie okresu przy tej samej racie wymaga aneksu.'
        }
    };
}

function hasLoanExtendedDetails(loan) {
    const d = loan?.details;
    if (!d) return false;
    return !!(d.collateral || d.promotionTerms || d.propertyValue || d.mortgageLimit);
}
