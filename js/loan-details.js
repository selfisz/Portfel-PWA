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

const PEKAO_CONTRACT_NUMBER = '00621649687/2/KH/25082025';

function isLegacyTestLoan(loan) {
    const l = normalizeLoan(loan);
    if (l.details?.contractNumber === PEKAO_CONTRACT_NUMBER) return false;
    const legacyCapital = Math.abs(l.currentCapitalLeft - 412500) < 0.01;
    const legacyPackage = Math.abs(l.totalAmount - 500000) < 0.01 && Math.abs(l.interestRate - 6.75) < 0.01;
    return legacyCapital || legacyPackage;
}

function migrateLoanToPekaoIfNeeded() {
    migrateLoansArray();
    const snapshot = getPekaoLoanSnapshot();
    const pekaoIdx = appState.loans.findIndex((l) => l.details?.contractNumber === PEKAO_CONTRACT_NUMBER);

    if (pekaoIdx >= 0) {
        const loan = normalizeLoan(appState.loans[pekaoIdx]);
        if (loan.subCategory !== snapshot.subCategory || loan.name !== snapshot.name) {
            appState.loans[pekaoIdx] = normalizeLoan({ ...loan, name: snapshot.name, subCategory: snapshot.subCategory });
            return true;
        }
        return false;
    }

    const legacyIdx = appState.loans.findIndex((l) => isLegacyTestLoan(l));
    if (legacyIdx >= 0) {
        appState.loans[legacyIdx] = normalizeLoan({ ...snapshot, id: appState.loans[legacyIdx].id || 'loan-pekao' });
        return true;
    }

    if (!appState.loans.length || appState.loans.every((l) => !isLoanConfigured(l))) {
        appState.loans = [normalizeLoan({ ...snapshot, id: 'loan-pekao' })];
        return true;
    }

    if (!appState.loans.some((l) => isMortgageLoan(l))) {
        appState.loans.unshift(normalizeLoan({ ...snapshot, id: 'loan-pekao' }));
        return true;
    }

    return false;
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
    if (JSON.stringify(loan.details || {}) !== JSON.stringify(details)) {
        loan.details = details;
        changed = true;
    }

    if (changed) appState.loans[idx] = normalizeLoan(loan);
    return changed;
}

function ensureMissingSeedLoans() {
    migrateLoansArray();
    const snapshots = [
        getPekaoLoanSnapshot,
        getAliorRtvLoanSnapshot,
        getVelobankLoanSnapshot,
        getMbankConsolidationLoanSnapshot
    ];
    let changed = false;
    snapshots.forEach((getSnapshot) => {
        const snapshot = getSnapshot();
        if (!appState.loans.some((l) => l.id === snapshot.id)) {
            appState.loans.push(normalizeLoan(snapshot));
            changed = true;
        }
    });
    return changed;
}

function runLoanMigrations() {
    migrateLoansArray();
    return migrateLoanToPekaoIfNeeded()
        || ensureMissingSeedLoans()
        || syncAliorRtvLoanFields()
        || seedAliorRtvPayments()
        || syncMbankConsolidationLoanFields();
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
