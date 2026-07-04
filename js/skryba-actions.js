function tryParseLocalSetBudget(text) {
    const t = String(text || '').trim();
    if (!t) return null;

    const patterns = [
        /(?:ustaw|ustawiaj|zmie[nń])\s+(?:budżet|budzet|limit)\s+(?:na\s+)?(.+?)\s+(?:na\s+)?(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i,
        /(?:limit|budżet|budzet)\s+(.+?)\s+(?:na\s+)?(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i
    ];
    let match = null;
    patterns.forEach((pattern) => {
        if (!match) match = t.match(pattern);
    });
    if (!match) return null;

    const amount = typeof parseSkrybaAmountFromText === 'function'
        ? parseSkrybaAmountFromText(match[2])
        : parseFloat(String(match[2]).replace(',', '.'));
    if (!amount || amount <= 0) return null;

    const phrase = String(match[1] || '').trim();
    const resolved = typeof resolveCategoryFromUserPhrase === 'function'
        ? resolveCategoryFromUserPhrase(phrase, 'expense')
        : { mainCategory: phrase, subCategory: '[Bez podkategorii]' };
    if (!resolved?.mainCategory) return null;

    const label = resolved.subCategory && resolved.subCategory !== '[Bez podkategorii]'
        ? `${resolved.mainCategory} › ${resolved.subCategory}`
        : resolved.mainCategory;

    return {
        tool: 'set_budget',
        params: {
            mainCategory: resolved.mainCategory,
            subCategory: resolved.subCategory || '[Bez podkategorii]',
            limitPln: amount
        },
        reply: `Ustawię limit ${label} na ${amount.toFixed(2)} zł/mies.`
    };
}

function tryParseLocalSkrybaAction(text) {
    const t = String(text || '').trim();
    if (!t) return null;

    const budgetAction = tryParseLocalSetBudget(t);
    if (budgetAction) return budgetAction;

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

function validateSkrybaBudgetParams(params = {}) {
    const limitPln = Number(params.limitPln);
    if (!Number.isFinite(limitPln) || limitPln <= 0) {
        return { ok: false, error: 'Podaj dodatnią kwotę limitu budżetu.' };
    }

    let mainCategory = String(params.mainCategory || '').trim();
    let subCategory = String(params.subCategory || '').trim() || '[Bez podkategorii]';
    if (!mainCategory && params.categoryQuery) {
        const resolved = typeof resolveCategoryFromUserPhrase === 'function'
            ? resolveCategoryFromUserPhrase(params.categoryQuery, 'expense')
            : null;
        if (resolved?.mainCategory) {
            mainCategory = resolved.mainCategory;
            subCategory = resolved.subCategory || '[Bez podkategorii]';
        }
    }

    if (!mainCategory) {
        return { ok: false, error: 'Podaj kategorię budżetu z listy aplikacji.' };
    }

    const valid = typeof isAssistantCategoryPairValid === 'function'
        ? isAssistantCategoryPairValid('expense', mainCategory, subCategory)
        : true;
    if (!valid) {
        return { ok: false, error: `Nieprawidłowa kategoria: ${mainCategory}.` };
    }

    const label = subCategory && subCategory !== '[Bez podkategorii]'
        ? `${mainCategory} › ${subCategory}`
        : mainCategory;

    return {
        ok: true,
        mainCategory,
        subCategory,
        limitPln: Math.round(limitPln * 100) / 100,
        label
    };
}

function buildSkrybaActionPreview(tool, params = {}) {
    const fmt = typeof formatPlnAmount === 'function' ? formatPlnAmount : (n) => `${Number(n).toFixed(2)} zł`;
    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);

    if (tool === 'pay_installment') {
        const loan = params.loanId && typeof getLoanById === 'function'
            ? getLoanById(params.loanId)
            : null;
        const resolved = loan
            ? { loan, ambiguous: false }
            : resolveSkrybaLoan(params.loanQuery);
        if (resolved.ambiguous) {
            return {
                ok: false,
                clarify: resolved.matches.map((m) => m.label),
                clarifyMatches: resolved.matches.map((m) => ({
                    label: m.label,
                    loanId: m.loan?.id || null,
                    cardId: m.card?.id || null
                }))
            };
        }
        if (!resolved.loan) return { ok: false, error: resolved.error };
        const resolvedLoan = resolved.loan;
        if (!(resolvedLoan.nextInstallmentAmount > 0)) {
            return { ok: false, error: `Brak zaplanowanej raty dla ${getLoanDisplayName(resolvedLoan)}.` };
        }
        const name = typeof getLoanDisplayName === 'function' ? getLoanDisplayName(resolvedLoan) : resolvedLoan.name;
        return {
            ok: true,
            summary: `Rata ${name}: ${fmt(resolvedLoan.nextInstallmentAmount)} · gotówka −${fmt(resolvedLoan.nextInstallmentAmount)}`,
            resolvedParams: { loanId: resolvedLoan.id }
        };
    }

    if (tool === 'repay_card') {
        const card = params.cardId && typeof getCreditCardById === 'function'
            ? getCreditCardById(params.cardId)
            : null;
        const resolved = card
            ? { card, ambiguous: false }
            : resolveSkrybaCard(params.cardQuery);
        if (resolved.ambiguous) {
            return {
                ok: false,
                clarify: resolved.matches.map((m) => m.label),
                clarifyMatches: resolved.matches.map((m) => ({
                    label: m.label,
                    loanId: null,
                    cardId: m.card?.id || null
                }))
            };
        }
        if (!resolved.card) return { ok: false, error: resolved.error };
        const amount = Number(params.amount) || 0;
        if (amount <= 0) return { ok: false, error: 'Podaj kwotę spłaty karty.' };
        const resolvedCard = resolved.card;
        const nextBalance = Math.max(0, (resolvedCard.currentBalance || 0) - amount);
        return {
            ok: true,
            summary: `Spłata ${resolvedCard.name}: ${fmt(amount)} · saldo ${fmt(resolvedCard.currentBalance)} → ${fmt(nextBalance)} · gotówka −${fmt(amount)}`,
            resolvedParams: { cardId: resolvedCard.id, amount, date: params.date || today }
        };
    }

    if (tool === 'repay_loan') {
        const loan = params.loanId && typeof getLoanById === 'function'
            ? getLoanById(params.loanId)
            : null;
        const resolved = loan
            ? { loan, ambiguous: false }
            : resolveSkrybaLoan(params.loanQuery);
        if (resolved.ambiguous) {
            return {
                ok: false,
                clarify: resolved.matches.map((m) => m.label),
                clarifyMatches: resolved.matches.map((m) => ({
                    label: m.label,
                    loanId: m.loan?.id || null,
                    cardId: null
                }))
            };
        }
        if (!resolved.loan) return { ok: false, error: resolved.error };
        const amount = Number(params.amount) || 0;
        if (amount <= 0) return { ok: false, error: 'Podaj kwotę spłaty.' };
        const resolvedLoan = resolved.loan;
        const name = typeof getLoanDisplayName === 'function' ? getLoanDisplayName(resolvedLoan) : resolvedLoan.name;
        const nextCapital = Math.max(0, (resolvedLoan.currentCapitalLeft || 0) - amount);
        return {
            ok: true,
            summary: `Spłata ${name}: ${fmt(amount)} · kapitał ${fmt(resolvedLoan.currentCapitalLeft)} → ${fmt(nextCapital)} · gotówka −${fmt(amount)}`,
            resolvedParams: { loanId: resolvedLoan.id, amount, date: params.date || today }
        };
    }

    if (tool === 'set_budget') {
        const validated = validateSkrybaBudgetParams(params);
        if (!validated.ok) return validated;
        return {
            ok: true,
            summary: `Limit ${validated.label}: ${fmt(validated.limitPln)}/mies.`,
            resolvedParams: {
                mainCategory: validated.mainCategory,
                subCategory: validated.subCategory,
                limitPln: validated.limitPln
            }
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

    if (tool === 'set_budget') {
        const validated = validateSkrybaBudgetParams(preview.resolvedParams || params);
        if (!validated.ok) return { ok: false, error: validated.error };
        if (!appState.categoryBudgets) appState.categoryBudgets = {};
        if (!appState.subCategoryBudgets) appState.subCategoryBudgets = {};
        if (validated.subCategory && validated.subCategory !== '[Bez podkategorii]') {
            const key = typeof makeSubCategoryBudgetKey === 'function'
                ? makeSubCategoryBudgetKey(validated.mainCategory, validated.subCategory)
                : `${validated.mainCategory}\u0001${validated.subCategory}`;
            appState.subCategoryBudgets[key] = validated.limitPln;
        } else {
            appState.categoryBudgets[validated.mainCategory] = validated.limitPln;
        }
        if (typeof saveState === 'function') saveState();
        refreshAfterSkrybaAction();
        if (typeof renderBudgetEditor === 'function') renderBudgetEditor();
        return { ok: true, message: `Ustawiono limit ${validated.label}: ${fmt(validated.limitPln)}/mies.` };
    }

    return { ok: false, error: 'Nieobsługiwana akcja.' };
}
