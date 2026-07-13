function tryParseLocalSkrybaNavigate(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return null;

    const nav = '(?:otw[oó]rz|poka[zż]|id[zź] do|przejd[zź] do|wejd[zź] na)';
    const targets = [
        { target: 'reports', pattern: new RegExp(`${nav}\\s+(?:zakładk[eę]\\s+)?analiz`, 'i') },
        { target: 'reports', pattern: new RegExp(`${nav}\\s+raport`, 'i') },
        { target: 'reports', pattern: /^(?:analiza|raporty)$/ },
        { target: 'dashboard', pattern: new RegExp(`${nav}\\s+pulpit`, 'i') },
        { target: 'dashboard', pattern: /^(?:pulpit|dashboard|start)$/ },
        { target: 'investments', pattern: new RegExp(`${nav}\\s+(?:aktywa|inwestycj)`, 'i') },
        { target: 'add', pattern: new RegExp(`${nav}\\s+(?:dodaj|formularz)`, 'i') },
        { target: 'budgets', pattern: /(?:otw[oó]rz|poka[zż]|id[zź] do|przejd[zź] do).*(?:budżet|budzet|limity)/ },
        { target: 'month_close', pattern: /(?:otw[oó]rz|rozpocznij|zr[oó]b)\s+rozliczenie|rozlicz miesi[aą]c/ },
        { target: 'debts', pattern: /(?:otw[oó]rz|poka[zż]|id[zź] do|przejd[zź] do).*(?:dług|dlug|kredyt|rat)/ },
        { target: 'categories', pattern: /(?:otw[oó]rz|poka[zż]).*(?:regu[lł]|kategor)/ },
        { target: 'assistant', pattern: /(?:otw[oó]rz|poka[zż]).*asystent/ }
    ];

    const hit = targets.find((entry) => entry.pattern.test(t));
    if (!hit) return null;

    const labels = {
        reports: 'analizę',
        dashboard: 'pulpit',
        investments: 'aktywa',
        add: 'dodawanie transakcji',
        budgets: 'budżety',
        month_close: 'rozliczenie miesiąca',
        debts: 'długi',
        categories: 'kategorie i reguły',
        assistant: 'asystenta'
    };

    return {
        tool: 'navigate',
        params: { target: hit.target },
        reply: `Otwieram ${labels[hit.target] || hit.target}.`
    };
}

function tryParseLocalCategoryRule(text) {
    const t = String(text || '').trim();
    if (!t) return null;

    const patterns = [
        /regu[lł]a[:\s]+(.+?)\s*(?:→|->|na|jako)\s+(.+)$/i,
        /kategoryzuj\s+(.+?)\s+jako\s+(.+)$/i,
        /automatyczn[aie].+?["“']?(.+?)["”']?\s*(?:→|->|na|jako)\s+(.+)$/i
    ];
    let match = null;
    patterns.forEach((pattern) => {
        if (!match) match = t.match(pattern);
    });
    if (!match) return null;

    const patternText = String(match[1] || '').trim();
    const categoryPhrase = String(match[2] || '').trim();
    if (!patternText || !categoryPhrase) return null;

    const resolved = typeof resolveCategoryFromUserPhrase === 'function'
        ? resolveCategoryFromUserPhrase(categoryPhrase, 'expense')
        : { mainCategory: categoryPhrase, subCategory: '[Bez podkategorii]' };
    if (!resolved?.mainCategory) return null;

    return {
        tool: 'add_category_rule',
        params: {
            pattern: patternText,
            type: 'expense',
            mainCategory: resolved.mainCategory,
            subCategory: resolved.subCategory || '[Bez podkategorii]'
        },
        reply: `Dodam regułę: „${patternText}” → ${resolved.mainCategory}.`
    };
}

function tryParseLocalSetSavingsGoal(text) {
    const t = String(text || '').trim();
    const match = t.match(/(?:cel oszcz[eę]dno[sś]ci|ustaw cel|osi[aą]gnij)\s+(\d{1,3})\s*%?$/i);
    if (!match) return null;
    const goalPct = Math.max(0, Math.min(100, parseInt(match[1], 10)));
    return {
        tool: 'set_savings_goal',
        params: { goalPct },
        reply: `Ustawię cel oszczędności na ${goalPct}% wpływów.`
    };
}

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

    const morningReview = typeof tryParseLocalMorningReview === 'function'
        ? tryParseLocalMorningReview(t)
        : null;
    if (morningReview) return morningReview;

    const boardReview = typeof tryParseLocalActionBoardReview === 'function'
        ? tryParseLocalActionBoardReview(t)
        : null;
    if (boardReview) return boardReview;

    const navigateAction = tryParseLocalSkrybaNavigate(t);
    if (navigateAction) return navigateAction;

    const ruleAction = tryParseLocalCategoryRule(t);
    if (ruleAction) return ruleAction;

    const savingsGoalAction = tryParseLocalSetSavingsGoal(t);
    if (savingsGoalAction) return savingsGoalAction;

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
        const previewNote = `Spłata ${name}`;
        const allocation = typeof splitLoanPaymentAllocation === 'function'
            ? splitLoanPaymentAllocation(resolvedLoan, amount, previewNote)
            : { principal: amount, interest: 0 };
        const nextCapital = Math.max(0, (resolvedLoan.currentCapitalLeft || 0) - allocation.principal);
        const splitHint = allocation.interest > 0
            ? ` · kapitał −${fmt(allocation.principal)}, odsetki ${fmt(allocation.interest)}`
            : '';
        return {
            ok: true,
            summary: `Spłata ${name}: ${fmt(amount)}${splitHint} · poz. kapitał ${fmt(resolvedLoan.currentCapitalLeft)} → ${fmt(nextCapital)} · gotówka −${fmt(amount)}`,
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

    if (tool === 'add_category_rule') {
        const pattern = String(params.pattern || '').trim();
        const mainCategory = String(params.mainCategory || '').trim();
        const subCategory = String(params.subCategory || '[Bez podkategorii]').trim() || '[Bez podkategorii]';
        if (!pattern || !mainCategory) {
            return { ok: false, error: 'Podaj wzorzec i kategorię reguły.' };
        }
        if (typeof isAssistantCategoryPairValid === 'function'
            && !isAssistantCategoryPairValid('expense', mainCategory, subCategory)) {
            return { ok: false, error: `Nieprawidłowa kategoria: ${mainCategory}.` };
        }
        if (typeof hasCategoryRulePattern === 'function' && hasCategoryRulePattern(pattern, 'expense')) {
            return { ok: false, error: 'Taka reguła już istnieje.' };
        }
        return {
            ok: true,
            summary: `Reguła „${pattern}” → ${mainCategory}`,
            resolvedParams: { pattern, type: 'expense', mainCategory, subCategory }
        };
    }

    if (tool === 'set_savings_goal') {
        const goalPct = Math.max(0, Math.min(100, parseInt(params.goalPct, 10)));
        if (!Number.isFinite(goalPct)) {
            return { ok: false, error: 'Podaj cel oszczędności w procentach (0–100).' };
        }
        return {
            ok: true,
            summary: `Cel oszczędności: ${goalPct}% wpływów`,
            resolvedParams: { goalPct }
        };
    }

    if (tool === 'navigate') {
        const target = String(params.target || '').trim();
        const allowed = ['dashboard', 'reports', 'investments', 'add', 'budgets', 'month_close', 'debts', 'categories', 'assistant', 'tasks'];
        if (!allowed.includes(target)) {
            return { ok: false, error: 'Nieznany cel nawigacji.' };
        }
        return {
            ok: true,
            instant: true,
            summary: `Przejście: ${target}`,
            resolvedParams: { target }
        };
    }

    return { ok: false, error: 'Nieobsługiwana akcja.' };
}

function refreshAfterSkrybaAction() {
    if (typeof notifyAfterFinanceChange === 'function') notifyAfterFinanceChange();
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof refreshCurrentView === 'function') refreshCurrentView();
}

function executeSkrybaNavigate(target) {
    const navItems = document.querySelectorAll('.nav-item');
    const loansNav = document.querySelector('.nav-item[onclick*="\'loans\'"]');
    const reportsNav = document.querySelector('.nav-item[onclick*="\'reports\'"]');

    if (target === 'dashboard' && typeof switchView === 'function') {
        switchView('dashboard', 'Pulpit', navItems[0] || null);
        return { ok: true, message: 'Otwarto pulpit.' };
    }
    if (target === 'reports' && typeof switchView === 'function') {
        switchView('reports', 'Analiza', reportsNav || navItems[2] || null);
        return { ok: true, message: 'Otwarto analizę.' };
    }
    if (target === 'investments' && typeof switchView === 'function') {
        switchView('investments', 'Aktywa', navItems[3] || null);
        return { ok: true, message: 'Otwarto aktywa.' };
    }
    if (target === 'add' && typeof switchView === 'function') {
        switchView('add', 'Dodaj', navItems[1] || null);
        return { ok: true, message: 'Otwarto formularz dodawania.' };
    }
    if (target === 'budgets' && typeof openSettings === 'function') {
        openSettings('budgets');
        return { ok: true, message: 'Otwarto budżety w ustawieniach.' };
    }
    if (target === 'month_close' && typeof openMonthCloseWizard === 'function') {
        const monthKey = typeof skrybaToolMonthCloseStatus === 'function'
            ? skrybaToolMonthCloseStatus().latestMonthKey
            : null;
        const fallback = typeof getUnclosedMonthsWithData === 'function'
            ? getUnclosedMonthsWithData().slice(-1)[0]
            : null;
        openMonthCloseWizard(monthKey || fallback || null);
        return { ok: true, message: 'Otwarto rozliczenie miesiąca.' };
    }
    if (target === 'debts' && typeof switchView === 'function') {
        switchView('loans', 'Długi', loansNav);
        return { ok: true, message: 'Otwarto długi.' };
    }
    if (target === 'categories' && typeof openSettings === 'function') {
        openSettings('categories');
        return { ok: true, message: 'Otwarto kategorie.' };
    }
    if (target === 'assistant' && typeof openSettings === 'function') {
        openSettings('assistant');
        return { ok: true, message: 'Otwarto ustawienia asystenta.' };
    }
    if (target === 'tasks' && typeof openTasksView === 'function') {
        openTasksView();
        return { ok: true, message: 'Otwarto zadania.' };
    }
    return { ok: false, error: 'Nie udało się przejść do wybranego widoku.' };
}

function executeSkrybaAction(tool, params = {}) {
    if (tool === 'navigate') {
        return executeSkrybaNavigate(params.target);
    }

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

    if (tool === 'add_category_rule') {
        const { pattern, type, mainCategory, subCategory } = preview.resolvedParams;
        const added = typeof addCategoryRule === 'function'
            ? addCategoryRule({ pattern, type, mainCategory, subCategory })
            : null;
        if (!added) return { ok: false, error: 'Nie udało się dodać reguły.' };
        return { ok: true, message: `Dodano regułę: „${pattern}” → ${mainCategory}.` };
    }

    if (tool === 'set_savings_goal') {
        const goalPct = preview.resolvedParams.goalPct;
        const key = typeof SAVINGS_GOAL_KEY !== 'undefined' ? SAVINGS_GOAL_KEY : 'reports_savings_goal_pct';
        localStorage.setItem(key, String(goalPct));
        return { ok: true, message: `Ustawiono cel oszczędności: ${goalPct}% wpływów.` };
    }

    return { ok: false, error: 'Nieobsługiwana akcja.' };
}
