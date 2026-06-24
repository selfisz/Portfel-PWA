const EUR_PLN_RATE = 4.32;

function getDefaultLoan() {
    return {
        id: '',
        name: '',
        subCategory: '',
        totalAmount: 0,
        currentCapitalLeft: 0,
        interestRate: 0,
        nextInstallmentAmount: 0,
        nextInstallmentDue: '',
        archived: false,
        archivedAt: '',
        includeInSummary: true
    };
}

function normalizeLoan(raw) {
    const loan = { ...getDefaultLoan(), ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!loan.id) loan.id = `loan-${Date.now().toString(36)}`;
    if (!loan.name && loan.subCategory) loan.name = loan.subCategory;
    if (!loan.name && loan.lender) loan.name = `Kredyt ${loan.lender}`;
    loan.totalAmount = Math.max(0, parseFloat(loan.totalAmount) || 0);
    loan.currentCapitalLeft = Math.max(0, parseFloat(loan.currentCapitalLeft) || 0);
    loan.interestRate = Math.max(0, parseFloat(loan.interestRate) || 0);
    loan.nextInstallmentAmount = Math.max(0, parseFloat(loan.nextInstallmentAmount) || 0);
    loan.nextInstallmentDue = loan.nextInstallmentDue || '';
    loan.archived = !!loan.archived;
    loan.archivedAt = loan.archivedAt || '';
    if (loan.includeInSummary === undefined || loan.includeInSummary === null) {
        loan.includeInSummary = true;
    } else {
        loan.includeInSummary = !!loan.includeInSummary;
    }
    if (loan.totalAmount > 0 && loan.currentCapitalLeft > loan.totalAmount) {
        loan.currentCapitalLeft = loan.totalAmount;
    }
    const paidOff = loan.totalAmount > 0 && loan.currentCapitalLeft <= 0;
    if (paidOff) {
        loan.archived = true;
        if (!loan.archivedAt) loan.archivedAt = new Date().toISOString().split('T')[0];
        loan.nextInstallmentAmount = 0;
        loan.nextInstallmentDue = '';
    } else if (loan.currentCapitalLeft > 0) {
        loan.archived = false;
        loan.archivedAt = '';
    }
    loan.details = normalizeLoanDetails(loan.details);
    delete loan.lender;
    return loan;
}

function normalizeLoansArray(loans, legacyLoan) {
    const dropLegacy = (list) => list.filter((loan) => !isLegacyTestLoan(loan));

    if (Array.isArray(loans) && loans.length) {
        return dropLegacy(loans.map(normalizeLoan));
    }
    if (legacyLoan && typeof legacyLoan === 'object') {
        const one = normalizeLoan(legacyLoan);
        if (isLegacyTestLoan(one)) return [];
        if (!one.id) one.id = 'loan-primary';
        return [one];
    }
    return [];
}

function mergeLoansById(...loanLists) {
    const map = new Map();
    loanLists.flat().forEach((raw) => {
        if (!raw || typeof raw !== 'object') return;
        if (isLegacyTestLoan(raw)) return;
        const loan = normalizeLoan(raw);
        if (!loan.id || isLegacyTestLoan(loan)) return;
        const prev = map.get(loan.id);
        if (!prev) {
            map.set(loan.id, loan);
            return;
        }
        const prevScore = (prev.totalAmount || 0) + (prev.currentCapitalLeft || 0);
        const nextScore = (loan.totalAmount || 0) + (loan.currentCapitalLeft || 0);
        map.set(loan.id, nextScore >= prevScore ? loan : prev);
    });
    return [...map.values()];
}

function getLoansFromPersistedRaw(raw) {
    if (!raw || typeof raw !== 'object') return [];
    return normalizeLoansArray(raw.loans, raw.loan);
}

function getLoans() {
    return (appState.loans || []).map(normalizeLoan);
}

function getLoanById(id) {
    if (!id) return null;
    return getLoans().find((loan) => loan.id === id) || null;
}

function updateLoanInState(loan) {
    const normalized = normalizeLoan(loan);
    if (!Array.isArray(appState.loans)) appState.loans = [];
    const idx = appState.loans.findIndex((l) => l.id === normalized.id);
    if (idx >= 0) appState.loans[idx] = normalized;
    else appState.loans.push(normalized);
    return normalized;
}

function isLoanConfigured(loan) {
    if (!loan) return false;
    return (loan.totalAmount || 0) > 0 || (loan.currentCapitalLeft || 0) > 0;
}

function isLoanArchived(loan) {
    return isLoanConfigured(loan) && !!loan.archived;
}

function isLoanActive(loan) {
    return isLoanConfigured(loan) && !loan.archived;
}

function getActiveLoans() {
    return getLoans().filter(isLoanActive);
}

function getArchivedLoans() {
    return getLoans().filter(isLoanArchived);
}

function getLoanDisplayName(loan) {
    if (!loan) return 'Kredyt';
    if (loan.name?.trim()) return loan.name.trim();
    if (loan.subCategory?.trim()) return loan.subCategory.trim();
    return 'Kredyt';
}

function convertToPln(amount, currency = 'PLN') {
    return currency === 'EUR' ? amount * EUR_PLN_RATE : amount;
}

function getAssetValuePln(asset) {
    if (!asset) return 0;
    const type = asset.type || (asset.ticker || asset.quantity ? 'investment' : 'cash');
    if (type === 'investment') {
        const price = asset.currentPrice ?? asset.currentPriceManual ?? 0;
        return convertToPln((asset.quantity || 0) * price, asset.currency || 'EUR');
    }
    return convertToPln(asset.amount || 0, asset.currency || 'PLN');
}

function getAssetCostPln(asset) {
    if (!asset) return 0;
    const type = asset.type || (asset.ticker ? 'investment' : 'cash');
    if (type !== 'investment') return getAssetValuePln(asset);
    return convertToPln((asset.quantity || 0) * (asset.purchasePrice || 0), asset.currency || 'EUR');
}

function getPortfolioValuePln() {
    const assets = typeof getActiveAssets === 'function'
        ? getActiveAssets()
        : (appState.assets || appState.investments || []);
    return assets.reduce((sum, asset) => sum + getAssetValuePln(asset), 0);
}

function getLoanCapitalLeft() {
    return getActiveLoans().reduce((sum, loan) => sum + (loan.currentCapitalLeft || 0), 0);
}

function getCreditCardDebtTotal() {
    if (typeof getActiveCreditCards !== 'function') return 0;
    return getActiveCreditCards().reduce((sum, card) => sum + (card.currentBalance || 0), 0);
}

function getLoanSummaryTotal() {
    const loanTotal = getActiveLoans()
        .filter((loan) => loan.includeInSummary !== false)
        .reduce((sum, loan) => sum + (loan.currentCapitalLeft || 0), 0);
    return loanTotal + getCreditCardDebtTotal();
}

function getLoanSummaryCount() {
    return getActiveLoans().filter((loan) => loan.includeInSummary !== false).length;
}

function advanceLoanDueDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return isoDate;
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
}

function getMonthDateBounds(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0]
    };
}

function getUpcomingLoanInstallments() {
    const { startDate, endDate } = getMonthDateBounds();
    return getActiveLoans()
        .filter((loan) => {
            if (!(loan.nextInstallmentAmount > 0 && loan.nextInstallmentDue)) return false;
            return loan.nextInstallmentDue >= startDate && loan.nextInstallmentDue <= endDate;
        })
        .sort((a, b) => a.nextInstallmentDue.localeCompare(b.nextInstallmentDue));
}

function hasScheduledLoanInstallments() {
    return getActiveLoans().some((loan) => loan.nextInstallmentAmount > 0 && loan.nextInstallmentDue);
}

function daysUntilDate(isoDate) {
    if (!isoDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.round((target - today) / 86400000);
}

function getLoanTotalAmount(loan) {
    return loan?.totalAmount || 0;
}

function getLoanPaidAmount(loan) {
    return Math.max(0, getLoanTotalAmount(loan) - (loan?.currentCapitalLeft || 0));
}

function getLoanPaidPercent(loan) {
    const total = getLoanTotalAmount(loan);
    if (!total) return 0;
    return ((total - (loan.currentCapitalLeft || 0)) / total) * 100;
}

function calcNetWorthPln() {
    return getPortfolioValuePln() - getLoanCapitalLeft();
}

function getLoanDebtSubcategories() {
    return categoryTree?.expense?.Długi || [];
}

const MORTGAGE_DEBT_SUBCATEGORIES = [
    'Kredyt hipoteczny',
    'Kredyt Pekao SA',
    'Kredyt na mieszkanie'
];

function isMortgageLoan(loan) {
    const primary = loan?.subCategory?.trim() || '';
    const name = loan?.name?.trim() || '';
    return MORTGAGE_DEBT_SUBCATEGORIES.includes(primary)
        || /hipoteczn/i.test(primary)
        || /hipoteczn/i.test(name);
}

function getLoanPaymentSubcategories(loan) {
    const primary = loan?.subCategory?.trim();
    if (!primary) return null;

    if (isMortgageLoan(loan)) {
        const subs = new Set(MORTGAGE_DEBT_SUBCATEGORIES);
        appState.transactions.forEach((t) => {
            if (t.type !== 'expense' || t.mainCategory !== 'Długi' || !t.subCategory) return;
            if (MORTGAGE_DEBT_SUBCATEGORIES.includes(t.subCategory)
                || /hipotec|mieszkan|pekao/i.test(t.subCategory)) {
                subs.add(t.subCategory);
            }
        });
        return [...subs];
    }
    return [primary];
}

function transactionMatchesLoan(t, loan) {
    if (t.type !== 'expense' || t.mainCategory !== 'Długi') return false;
    const subs = getLoanPaymentSubcategories(loan);
    if (!subs) return true;
    return subs.includes(t.subCategory);
}
