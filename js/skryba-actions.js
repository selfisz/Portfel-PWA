function tryParseLocalSkrybaAction(text) {
    const t = String(text || '').trim();
    if (!t) return null;

    const cardRepay = t.match(/sp[lł]a[cć]\s+kart[ęe]\s+(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?(?:\s+(.+))?$/i);
    if (cardRepay) {
        const amount = parseSkrybaAmountFromText(cardRepay[1]);
        if (!amount || amount <= 0) return null;
        const cardQuery = (cardRepay[2] || '').trim() || 'karta';
        return {
            tool: 'repay_card',
            params: { cardQuery, amount },
            reply: `Spłacę kartę (${cardQuery}) kwotą ${amount.toFixed(2)} zł z gotówki.`
        };
    }

    const loanAmount = t.match(/sp[lł]a[cć]\s+(?:kredyt\s+)?(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i);
    if (loanAmount && !/rata?\b/i.test(loanAmount[1])) {
        const amount = parseSkrybaAmountFromText(loanAmount[2]);
        if (amount > 0) {
            return {
                tool: 'repay_loan',
                params: { loanQuery: loanAmount[1].trim(), amount },
                reply: `Spłacę kredyt ${loanAmount[1].trim()} kwotą ${amount.toFixed(2)} zł.`
            };
        }
    }

    const installment = t.match(/sp[lł]a[cć]\s+(?:rat[ęea]\s+)?(.+)$/i);
    if (installment && /rat|rata|rate/i.test(t)) {
        const loanQuery = installment[1].trim();
        if (loanQuery) {
            return {
                tool: 'pay_installment',
                params: { loanQuery },
                reply: `Zaksięguję ratę kredytu ${loanQuery}.`
            };
        }
    }

    return null;
}

function buildSkrybaActionPreview(tool, params = {}) {
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);

    if (tool === 'pay_installment') {
        const resolved = resolveSkrybaLoan(params.loanQuery);
        if (resolved.ambiguous) {
            return {
                ok: false,
                clarify: resolved.matches.map((m) => m.label)
            };
        }
        if (!resolved.loan) return { ok: false, error: resolved.error };
        const loan = resolved.loan;
        if (!(loan.nextInstallmentAmount > 0)) {
            return { ok: false, error: `Brak zaplanowanej raty dla ${getLoanDisplayName(loan)}.` };
        }
        const name = typeof getLoanDisplayName === 'function' ? getLoanDisplayName(loan) : loan.name;
        return {
            ok: true,
            summary: `Rata ${name}: ${fmt(loan.nextInstallmentAmount)} · gotówka −${fmt(loan.nextInstallmentAmount)}`,
            resolvedParams: { loanId: loan.id }
        };
    }

    if (tool === 'repay_card') {
        const resolved = resolveSkrybaCard(params.cardQuery);
        if (resolved.ambiguous) {
            return { ok: false, clarify: resolved.matches.map((m) => m.label) };
        }
        if (!resolved.card) return { ok: false, error: resolved.error };
        const amount = Number(params.amount) || 0;
        if (amount <= 0) return { ok: false, error: 'Podaj kwotę spłaty karty.' };
        const card = resolved.card;
        const nextBalance = Math.max(0, (card.currentBalance || 0) - amount);
        return {
            ok: true,
            summary: `Spłata ${card.name}: ${fmt(amount)} · saldo ${fmt(card.currentBalance)} → ${fmt(nextBalance)} · gotówka −${fmt(amount)}`,
            resolvedParams: { cardId: card.id, amount, date: params.date || today }
        };
    }

    if (tool === 'repay_loan') {
        const resolved = resolveSkrybaLoan(params.loanQuery);
        if (resolved.ambiguous) {
            return { ok: false, clarify: resolved.matches.map((m) => m.label) };
        }
        if (!resolved.loan) return { ok: false, error: resolved.error };
        const amount = Number(params.amount) || 0;
        if (amount <= 0) return { ok: false, error: 'Podaj kwotę spłaty.' };
        const loan = resolved.loan;
        const name = typeof getLoanDisplayName === 'function' ? getLoanDisplayName(loan) : loan.name;
        const nextCapital = Math.max(0, (loan.currentCapitalLeft || 0) - amount);
        return {
            ok: true,
            summary: `Spłata ${name}: ${fmt(amount)} · kapitał ${fmt(loan.currentCapitalLeft)} → ${fmt(nextCapital)} · gotówka −${fmt(amount)}`,
            resolvedParams: { loanId: loan.id, amount, date: params.date || today }
        };
    }

    return { ok: false, error: 'Nieobsługiwana akcja.' };
}

function refreshAfterSkrybaAction() {
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof refreshCurrentView === 'function') refreshCurrentView();
}

function executeSkrybaAction(tool, params = {}) {
    const preview = buildSkrybaActionPreview(tool, params);
    if (!preview.ok) {
        return { ok: false, error: preview.error, clarify: preview.clarify };
    }

    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;

    if (tool === 'pay_installment') {
        const loanId = preview.resolvedParams.loanId;
        const loan = typeof getLoanById === 'function' ? getLoanById(loanId) : null;
        const amount = loan?.nextInstallmentAmount || 0;
        const updated = typeof payLoanInstallment === 'function' ? payLoanInstallment(loanId) : null;
        if (!updated) return { ok: false, error: 'Nie udało się zarejestrować raty (sprawdź gotówkę).' };
        refreshAfterSkrybaAction();
        const name = typeof getLoanDisplayName === 'function' ? getLoanDisplayName(updated) : 'kredyt';
        return { ok: true, message: `Zapisano ratę ${name}: ${fmt(amount)}.` };
    }

    if (tool === 'repay_card') {
        const { cardId, amount, date } = preview.resolvedParams;
        const card = typeof getCreditCardById === 'function' ? getCreditCardById(cardId) : null;
        if (!card) return { ok: false, error: 'Nie znaleziono karty.' };
        const note = `Spłata ${card.name}`;
        const updated = typeof registerCreditCardMovement === 'function'
            ? registerCreditCardMovement(cardId, 'repayment', amount, date || today, note)
            : null;
        if (!updated) return { ok: false, error: 'Nie udało się spłacić karty (sprawdź gotówkę).' };
        refreshAfterSkrybaAction();
        return { ok: true, message: `Spłacono kartę ${card.name}: ${fmt(amount)}.` };
    }

    if (tool === 'repay_loan') {
        const { loanId, amount, date } = preview.resolvedParams;
        const loan = typeof getLoanById === 'function' ? getLoanById(loanId) : null;
        if (!loan) return { ok: false, error: 'Nie znaleziono kredytu.' };
        const name = typeof getLoanDisplayName === 'function' ? getLoanDisplayName(loan) : loan.name;
        const updated = typeof registerLoanPayment === 'function'
            ? registerLoanPayment(loanId, amount, date || today, `Spłata ${name}`)
            : null;
        if (!updated) return { ok: false, error: 'Nie udało się zarejestrować spłaty (sprawdź gotówkę).' };
        refreshAfterSkrybaAction();
        return { ok: true, message: `Spłacono ${name}: ${fmt(amount)}.` };
    }

    return { ok: false, error: 'Nieobsługiwana akcja.' };
}
