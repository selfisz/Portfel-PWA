function renderLoans() {
    const loan = appState.loan;
    document.getElementById('loan-left').innerText = `${loan.currentCapitalLeft.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł`;
    document.getElementById('loan-rate').innerText = `${loan.interestRate}%`;
    document.getElementById('loan-progress-fill').style.width = `${getLoanPaidPercent()}%`;
}

function addLoanOverpayment() {
    const amount = parseFloat(document.getElementById('loan-overpayment-amount').value);
    if (!amount || amount <= 0) return;
    appState.loan.currentCapitalLeft -= amount;
    appState.transactions.unshift({
        amount,
        type: 'expense',
        mainCategory: 'Długi',
        subCategory: 'Kredyt Pekao SA',
        date: new Date().toISOString().split('T')[0],
        note: 'Dodatkowa nadpłata kapitału'
    });
    saveState();
    document.getElementById('loan-overpayment-amount').value = '';
    renderLoans();
}
