function getAverageMonthlyExpenses(monthsBack = 3) {
    const now = new Date();
    let total = 0;
    let count = 0;
    for (let i = 1; i <= monthsBack; i += 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = localIsoDate(d);
        const end = localIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        const sum = (appState.transactions || [])
            .filter((t) => t.type === 'expense' && t.date >= start && t.date <= end)
            .reduce((s, t) => s + t.amount, 0);
        if (sum > 0) {
            total += sum;
            count += 1;
        }
    }
    return count ? total / count : 0;
}

function estimatePeriodMonthlySurplus(ctx) {
    if (!ctx?.periodTx?.length) return { surplus: 0, income: 0, expense: 0, label: 'brak danych' };
    const { income, expense } = typeof summarizePeriod === 'function'
        ? summarizePeriod(ctx.periodTx)
        : { income: 0, expense: 0 };
    let surplus = income - expense;
    let label = 'bilans wybranego okresu';
    if (ctx.mode === 'year' || (ctx.period && ctx.period !== 'all' && String(ctx.period).length === 4)) {
        surplus = surplus / 12;
        label = 'średnio na miesiąc (rok)';
    } else if (ctx.mode === 'month') {
        label = 'ten miesiąc';
    } else if (ctx.period === 'all') {
        const months = new Set(ctx.periodTx.map((t) => t.date.slice(0, 7))).size || 1;
        surplus = surplus / months;
        label = `średnio na miesiąc (${months} mies.)`;
    }
    return {
        surplus: Math.max(0, Math.round(surplus * 100) / 100),
        income,
        expense,
        label
    };
}

function getOperationalCashBalance() {
    if (typeof getPrimaryCashAsset === 'function') {
        const cash = getPrimaryCashAsset();
        if (cash) return Number(cash.amount) || 0;
    }
    if (typeof getActiveAssets === 'function') {
        return getActiveAssets()
            .filter((a) => a.type === 'cash')
            .reduce((s, a) => s + (Number(a.amount) || 0), 0);
    }
    return 0;
}

function pickMortgageLoan() {
    if (typeof getActiveLoans !== 'function' || typeof isMortgageLoan !== 'function') return null;
    return getActiveLoans()
        .filter((l) => !l.archived && (l.currentCapitalLeft || 0) > 0 && isMortgageLoan(l))
        .sort((a, b) => (b.currentCapitalLeft || 0) - (a.currentCapitalLeft || 0))[0] || null;
}

function estimateIkzeTaxRefundPln(amount, rate = IKZE_SECOND_BRACKET_RATE) {
    const value = Math.max(0, Number(amount) || 0);
    return Math.round(value * rate * 100) / 100;
}

function buildIkzeScenarioDetail(used, limit, room, alloc, year) {
    const ratePct = Math.round(IKZE_SECOND_BRACKET_RATE * 100);
    const lines = [`Wpłaty ${year}: ${formatPlnAmount(used)} z ${formatPlnAmount(limit)} · wolne ${formatPlnAmount(room)}.`];
    if (room <= 0) {
        lines.push('Roczny limit IKZE został wykorzystany.');
        return lines.join(' ');
    }
    const refundForAlloc = estimateIkzeTaxRefundPln(alloc);
    const refundForRoom = estimateIkzeTaxRefundPln(room);
    if (alloc > 0) {
        lines.push(`Szac. zwrot w PIT (${ratePct}%): przy ${formatPlnAmount(alloc)} → ${formatPlnAmount(refundForAlloc)}.`);
    }
    if (room > alloc) {
        lines.push(`Przy pełnym wolnym limicie (${formatPlnAmount(room)}): ~${formatPlnAmount(refundForRoom)} zwrotu.`);
    }
    if (alloc <= 0) {
        lines.push('Ustaw kwotę powyżej, aby zobaczyć zwrot dla planowanej wpłaty.');
    }
    return lines.join(' ');
}

function getInterestBearingLoans() {
    if (typeof getActiveLoans !== 'function') return [];
    return getActiveLoans()
        .filter((loan) => !loan.archived && (loan.currentCapitalLeft || 0) > 0 && (loan.interestRate || 0) > 0)
        .sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));
}

function buildLoanOverpaymentScenario(amount, loan) {
    if (!loan || typeof calculateOverpaymentScenarios !== 'function') return null;

    const safeAmount = Math.max(0, Number(amount) || 0);
    const alloc = Math.min(safeAmount, loan.currentCapitalLeft || 0);
    const sim = calculateOverpaymentScenarios(loan, { lumpSum: alloc });
    if (!sim) return null;

    const loanName = typeof getLoanDisplayName === 'function'
        ? getLoanDisplayName(loan)
        : (loan.name || loan.subCategory || 'Kredyt');
    const payoffLabel = (dateStr) => (dateStr ? formatTxDate(dateStr) : '—');
    const shortenDelta = sim.savedMonthsShorten > 0 && typeof formatMonthsDuration === 'function'
        ? ` (−${formatMonthsDuration(sim.savedMonthsShorten)})`
        : '';
    const shortenInterestDelta = sim.savedInterestShorten > 0
        ? ` (−${formatPlnAmount(sim.savedInterestShorten)})`
        : '';
    const lowerPaymentDelta = sim.lower.savedPerMonth > 0
        ? ` (−${formatPlnAmount(sim.lower.savedPerMonth)})`
        : '';
    const lowerInterestDelta = sim.savedInterestLower > 0
        ? ` (−${formatPlnAmount(sim.savedInterestLower)})`
        : '';
    const rateLabel = loan.interestRate
        ? `${loan.interestRate.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%`
        : '—';

    return {
        id: `loan-${loan.id}`,
        title: `Nadpłata: ${loanName} (${rateLabel})`,
        amount: alloc,
        headline: alloc > 0 ? formatPlnAmount(alloc) : '—',
        detail: alloc > 0
            ? `Jednorazowa nadpłata na kapitał ${formatPlnAmount(alloc)}.`
            : 'Ustaw kwotę powyżej, aby zobaczyć symulację nadpłaty.',
        overpayHtml: alloc > 0 ? `<div class="surplus-overpay-grid overpay-scenarios">
            <div class="overpay-scenario">
                <div class="overpay-scenario-title">Skróć okres</div>
                <p class="surplus-overpay-line">Koniec spłaty: <strong>${payoffLabel(sim.shorten.payoffDate)}</strong>${shortenDelta}</p>
                <p class="surplus-overpay-line">Odsetki łącznie: <strong>${formatPlnAmount(sim.shorten.totalInterest)}</strong>${shortenInterestDelta}</p>
            </div>
            <div class="overpay-scenario">
                <div class="overpay-scenario-title">Obniż ratę</div>
                <p class="surplus-overpay-line">Rata: <strong>${formatPlnAmount(sim.lower.monthlyPayment)}/mies.</strong>${lowerPaymentDelta}</p>
                <p class="surplus-overpay-line">Odsetki łącznie: <strong>${formatPlnAmount(sim.lower.totalInterest)}</strong>${lowerInterestDelta}</p>
            </div>
        </div>
        <p class="reports-hint surplus-overpay-meta">Kapitał ${formatPlnAmount(sim.params.balance)} · rata ${formatPlnAmount(sim.params.payment)} · stopa ${sim.params.annualRate ? `${sim.params.annualRate}%` : '—'}</p>` : ''
    };
}

function buildMortgageOverpaymentScenario(amount) {
    const loan = typeof pickMortgageLoan === 'function' ? pickMortgageLoan() : null;
    if (!loan) return null;
    return buildLoanOverpaymentScenario(amount, loan);
}

function buildSurplusScenarios(amount, ctx) {
    const scenarios = [];
    const safeAmount = Math.max(0, Number(amount) || 0);
    const year = new Date().getFullYear();

    if (typeof getIkzeAnnualLimitPln === 'function' && typeof getIkzeContributionsInYear === 'function') {
        const limit = getIkzeAnnualLimitPln();
        const used = getIkzeContributionsInYear(year);
        const room = Math.max(0, limit - used);
        const alloc = Math.min(safeAmount, room);
        scenarios.push({
            id: 'ikze',
            title: 'Dopłata do IKZE',
            amount: alloc,
            headline: room > 0 ? formatPlnAmount(alloc) : 'Limit wykorzystany',
            detail: buildIkzeScenarioDetail(used, limit, room, alloc, year),
            taxRefund: alloc > 0 ? estimateIkzeTaxRefundPln(alloc) : 0,
            taxRefundMax: room > 0 ? estimateIkzeTaxRefundPln(room) : 0
        });
    }

    getInterestBearingLoans().forEach((loan) => {
        const scenario = buildLoanOverpaymentScenario(safeAmount, loan);
        if (scenario) scenarios.push(scenario);
    });

    const avgExpense = getAverageMonthlyExpenses();
    const cash = getOperationalCashBalance();
    const alloc = safeAmount;
    const monthsNow = avgExpense > 0 ? cash / avgExpense : 0;
    const monthsAfter = avgExpense > 0 ? (cash + alloc) / avgExpense : 0;
    scenarios.push({
        id: 'cushion',
        title: 'Poduszka gotówkowa',
        amount: alloc,
        headline: alloc > 0 ? formatPlnAmount(alloc) : '—',
        detail: avgExpense > 0
            ? `Pokrycie wydatków: ${monthsNow.toFixed(1)} → ${monthsAfter.toFixed(1)} mies. (śr. ${formatPlnAmount(avgExpense)}/mies.).`
            : 'Brak historii wydatków do wyliczenia pokrycia.'
    });

    return scenarios;
}

function renderSurplusAllocator(ctx) {
    const root = document.getElementById('reports-surplus-allocator');
    const hintEl = document.getElementById('reports-surplus-hint');
    const inputEl = document.getElementById('reports-surplus-input');
    if (!root) return;

    const base = estimatePeriodMonthlySurplus(ctx);
    const periodKey = ctx?.period ? `${ctx.mode || ''}|${ctx.period}|${ctx.rangeStart || ''}|${ctx.rangeEnd || ''}` : 'default';
    if (hintEl) {
        hintEl.textContent = `${base.label}: wpływy ${formatPlnAmount(base.income)}, wydatki ${formatPlnAmount(base.expense)}, nadwyżka ${formatPlnAmount(base.surplus)}.`;
    }
    if (inputEl) {
        if (inputEl.dataset.periodKey !== periodKey) {
            inputEl.dataset.periodKey = periodKey;
            delete inputEl.dataset.touched;
        }
        if (!inputEl.dataset.touched) {
            inputEl.value = String(Math.max(0, Math.round(base.surplus)));
            inputEl.max = String(Math.max(1000, Math.round(base.surplus * 3) || 1000));
        }
    }

    const amount = inputEl ? parseFloat(inputEl.value) : base.surplus;
    const scenarios = buildSurplusScenarios(amount, ctx);
    if (!scenarios.length) {
        root.innerHTML = '<div class="empty-state"><p>Brak danych do symulacji alokacji.</p></div>';
        return;
    }

    root.innerHTML = scenarios.map((s) => {
        const taxBlock = s.id === 'ikze' && (s.taxRefund > 0 || s.taxRefundMax > 0)
            ? `<div class="surplus-tax-grid">
                <div><span class="label">Zwrot PIT (${Math.round(IKZE_SECOND_BRACKET_RATE * 100)}%)</span><strong>${s.taxRefund > 0 ? formatPlnAmount(s.taxRefund) : '—'}</strong></div>
                <div><span class="label">Przy pełnym limicie</span><strong>${s.taxRefundMax > 0 ? formatPlnAmount(s.taxRefundMax) : '—'}</strong></div>
            </div>`
            : '';
        const overpayBlock = s.overpayHtml || '';
        return `<div class="surplus-scenario surplus-scenario--${String(s.id).startsWith('loan') ? 'loan' : s.id}">
            <div class="surplus-scenario-head">
                <span class="surplus-scenario-title">${escapeHtml(s.title)}</span>
                <strong class="surplus-scenario-amount">${escapeHtml(s.headline)}</strong>
            </div>
            <p class="surplus-scenario-detail">${escapeHtml(s.detail)}</p>
            ${overpayBlock}
            ${taxBlock}
        </div>`;
    }).join('');
}

function onSurplusAllocatorInput() {
    const inputEl = document.getElementById('reports-surplus-input');
    if (inputEl) inputEl.dataset.touched = '1';
    if (typeof reportsLastCtx !== 'undefined' && reportsLastCtx) {
        renderSurplusAllocator(reportsLastCtx);
    }
}
