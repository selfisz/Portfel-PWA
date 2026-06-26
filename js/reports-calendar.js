/* Raporty — kalendarz i drill-down */
function setReportsCalendarView(view) {
    reportsCalendarView = view;
    document.getElementById('btn-cal-month')?.classList.toggle('active', view === 'month');
    document.getElementById('btn-cal-year')?.classList.toggle('active', view === 'year');
    document.getElementById('reports-calendar-grid')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-year-heatmap')?.classList.toggle('hidden', view === 'month');
    document.getElementById('reports-calendar-nav')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-calendar-legend')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-debt-calendar-card')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-debt-peak-panel')?.classList.toggle('hidden', view === 'year');
    document.getElementById('reports-debt-freedom-card')?.classList.toggle('hidden', view === 'year');
    renderReportsCalendarView();
}

function ensureReportsDebtCalendarMonth() {
    if (reportsDebtCalendarYear !== null && reportsDebtCalendarMonth !== null) return;
    if (reportsCalendarYear !== null && reportsCalendarMonth !== null) {
        reportsDebtCalendarYear = reportsCalendarYear;
        reportsDebtCalendarMonth = reportsCalendarMonth;
        return;
    }
    const now = new Date();
    reportsDebtCalendarYear = now.getFullYear();
    reportsDebtCalendarMonth = now.getMonth();
}

function shiftReportsDebtCalendarMonth(delta) {
    ensureReportsDebtCalendarMonth();
    reportsDebtCalendarMonth += delta;
    if (reportsDebtCalendarMonth > 11) {
        reportsDebtCalendarMonth = 0;
        reportsDebtCalendarYear++;
    }
    if (reportsDebtCalendarMonth < 0) {
        reportsDebtCalendarMonth = 11;
        reportsDebtCalendarYear--;
    }
    renderDebtCalendarGrid();
}

function renderReportsCalendarView() {
    if (reportsCalendarView === 'year') {
        renderReportsYearHeatmap();
    } else {
        renderReportsCalendar();
        renderDebtCalendarSection();
    }
}

function addMonthsToDate(isoDate, months) {
    const d = new Date(`${isoDate}T12:00:00`);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

function getLoanInstallmentDay(loan) {
    if (!loan?.nextInstallmentDue) return null;
    const day = parseInt(loan.nextInstallmentDue.split('-')[2], 10);
    return Number.isNaN(day) ? null : day;
}

function getLoanPayoffEndDate(loan) {
    const capital = loan.currentCapitalLeft || 0;
    if (!capital) return null;
    if (loan.details?.endDate) return loan.details.endDate;
    const today = localIsoDate(new Date());
    if (loan.details?.remainingInstallments > 0) {
        return addMonthsToDate(today, loan.details.remainingInstallments);
    }
    if (loan.nextInstallmentAmount > 0) {
        const months = Math.ceil(capital / loan.nextInstallmentAmount);
        return addMonthsToDate(today, months);
    }
    return null;
}

function getCardRepaymentHint(card) {
    if (!(card.currentBalance > 0)) return null;
    const movements = (appState.creditCardMovements || [])
        .filter((m) => m.cardId === card.id && m.type === 'repayment')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-8);
    if (!movements.length) return null;
    const days = movements.map((m) => parseInt(m.date.split('-')[2], 10)).filter((d) => !Number.isNaN(d));
    if (!days.length) return null;
    const avgDay = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
    const avgAmt = getRecentCardRepaymentAverage(card.id);
    if (avgAmt < 1) return null;
    return { day: avgDay, amount: avgAmt, estimated: true };
}

function getEffectiveDueDay(dueDay, year, monthIndex) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return Math.min(dueDay, daysInMonth);
}

function getScheduledDebtPaymentsOnDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const monthIndex = month - 1;
    const items = [];

    getActiveLoans().forEach((loan) => {
        if (!(loan.nextInstallmentAmount > 0 && loan.nextInstallmentDue && loan.currentCapitalLeft > 0)) return;
        const dueDay = getLoanInstallmentDay(loan);
        if (!dueDay) return;
        if (getEffectiveDueDay(dueDay, year, monthIndex) !== day) return;
        const firstYm = loan.nextInstallmentDue.slice(0, 7);
        const curYm = dateStr.slice(0, 7);
        if (curYm < firstYm) return;
        if (curYm === firstYm && day < getEffectiveDueDay(dueDay, year, monthIndex)) return;
        const payoffEnd = getLoanPayoffEndDate(loan);
        if (payoffEnd && dateStr > payoffEnd) return;
        items.push({
            type: 'loan',
            id: loan.id,
            name: getLoanDisplayName(loan),
            amount: loan.nextInstallmentAmount,
            estimated: false
        });
    });

    getActiveCreditCards().forEach((card) => {
        const hint = getCardRepaymentHint(card);
        if (!hint) return;
        if (getEffectiveDueDay(hint.day, year, monthIndex) !== day) return;
        items.push({
            type: 'card',
            id: card.id,
            name: card.name,
            amount: hint.amount,
            estimated: true
        });
    });

    return items;
}

function buildDebtPeakSeries(monthsAhead = 24) {
    const labels = [];
    const totals = [];
    const now = new Date();

    for (let i = 0; i < monthsAhead; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const year = d.getFullYear();
        const monthIndex = d.getMonth();
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        labels.push(d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));

        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            getScheduledDebtPaymentsOnDate(dateStr).forEach((p) => { total += p.amount; });
        }
        totals.push(total);
    }

    const peakValue = Math.max(0, ...totals);
    const peakIdx = totals.indexOf(peakValue);
    return { labels, totals, peakIdx, peakValue, peakLabel: labels[peakIdx] || '' };
}

function buildDebtFreedomTimeline() {
    const today = localIsoDate(new Date());
    const items = [];

    getActiveLoans().forEach((loan) => {
        if (!(loan.currentCapitalLeft > 0)) return;
        const est = estimateLoanPayoff(loan);
        const endDate = getLoanPayoffEndDate(loan);
        items.push({
            kind: 'loan',
            id: loan.id,
            name: getLoanDisplayName(loan),
            endDate,
            label: est.label,
            detail: est.detail,
            amount: loan.currentCapitalLeft || 0
        });
    });

    getActiveCreditCards().forEach((card) => {
        if (!(card.currentBalance > 0)) return;
        const est = estimateCardPayoff(card);
        let endDate = null;
        const monthMatch = /^~(\d+)\s*mies/.exec(est.label || '');
        if (monthMatch) endDate = addMonthsToDate(today, parseInt(monthMatch[1], 10));
        items.push({
            kind: 'card',
            id: card.id,
            name: card.name,
            endDate,
            label: est.label,
            detail: est.detail,
            amount: card.currentBalance
        });
    });

    return items.sort((a, b) => {
        if (!a.endDate && !b.endDate) return a.name.localeCompare(b.name, 'pl');
        if (!a.endDate) return 1;
        if (!b.endDate) return -1;
        return a.endDate.localeCompare(b.endDate);
    });
}

function renderDebtCalendarSection() {
    renderDebtCalendarGrid();
    renderDebtPeakChart();
    if (document.getElementById('reports-debt-freedom-timeline')) {
        renderDebtFreedomTimeline();
    }
    renderDepositsCalendarList();
}

function renderDebtCalendarGrid() {
    const grid = document.getElementById('reports-debt-calendar-grid');
    const totalEl = document.getElementById('reports-debt-calendar-month-total');
    const cardEl = document.getElementById('reports-debt-calendar-card');
    const labelEl = document.getElementById('reports-debt-calendar-label');
    if (!grid) return;

    ensureReportsDebtCalendarMonth();
    if (reportsDebtCalendarYear === null) return;

    const loans = getActiveLoans().filter((l) => l.nextInstallmentAmount > 0 && l.nextInstallmentDue);
    const cards = getActiveCreditCards().filter((c) => c.currentBalance > 0);
    const hasHints = cards.some((c) => getCardRepaymentHint(c));

    if (!loans.length && !hasHints) {
        if (cardEl) cardEl.classList.add('hidden');
        return;
    }
    cardEl?.classList.remove('hidden');

    const year = reportsDebtCalendarYear;
    const month = reportsDebtCalendarMonth;
    if (labelEl) {
        const monthLabel = new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        labelEl.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
    }
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = localIsoDate(new Date());

    const byDay = {};
    let monthTotal = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const payments = getScheduledDebtPaymentsOnDate(dateStr);
        if (payments.length) {
            byDay[dateStr] = payments;
            monthTotal += payments.reduce((s, p) => s + p.amount, 0);
        }
    }

    const maxDay = Math.max(0, ...Object.values(byDay).map((list) => list.reduce((s, p) => s + p.amount, 0)));
    const parts = ['<div class="cal-weekday">Pn</div>', '<div class="cal-weekday">Wt</div>', '<div class="cal-weekday">Śr</div>', '<div class="cal-weekday">Cz</div>', '<div class="cal-weekday">Pt</div>', '<div class="cal-weekday">Sb</div>', '<div class="cal-weekday">Nd</div>'];

    for (let i = 0; i < firstDow; i++) parts.push('<div class="cal-cell cal-cell--empty"></div>');

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const payments = byDay[dateStr];
        const todayClass = dateStr === today ? ' cal-cell--today' : '';
        if (payments) {
            const total = payments.reduce((s, p) => s + p.amount, 0);
            const ratio = maxDay > 0 ? total / maxDay : 1;
            const heat = isLightTheme()
                ? `rgba(124, 58, 237, ${0.15 + ratio * 0.45})`
                : `rgba(167, 139, 250, ${0.18 + ratio * 0.5})`;
            const hasEstimate = payments.some((p) => p.estimated);
            parts.push(`<button type="button" class="cal-cell cal-cell--clickable cal-cell--debt${hasEstimate ? ' cal-cell--debt-est' : ''}${todayClass}" style="background:${heat}" onclick="openCalendarDay('${dateStr}')">
                <span class="cal-day-num">${day}</span>
                <span class="cal-day-amount debt">${formatCompactPln(total)}</span>
                <span class="cal-day-debt-count">${payments.length}×</span>
            </button>`);
        } else {
            parts.push(`<button type="button" class="cal-cell cal-cell--clickable${todayClass}" onclick="openCalendarDay('${dateStr}')">
                <span class="cal-day-num">${day}</span>
            </button>`);
        }
    }

    grid.innerHTML = parts.join('');

    if (totalEl) {
        totalEl.innerHTML = monthTotal > 0
            ? `<strong>Planowane spłaty w tym miesiącu: ${formatPlnAmount(monthTotal)}</strong>
               <span class="reports-hint">Raty z umów${hasHints ? ' + szac. spłaty kart (wg ostatnich mies.)' : ''}.</span>`
            : '<p class="reports-hint">Brak zaplanowanych rat w tym miesiącu.</p>';
    }
}

function renderDebtPeakChart() {
    const canvas = document.getElementById('reportsDebtPeakChart');
    const summaryEl = document.getElementById('reports-debt-peak-summary');
    const panelEl = document.getElementById('reports-debt-peak-panel');
    if (!canvas) return;

    const series = buildDebtPeakSeries(24);
    if (!series.totals.some((v) => v > 0)) {
        panelEl?.classList.add('hidden');
        if (reportsDebtPeakChartInstance) {
            reportsDebtPeakChartInstance.destroy();
            reportsDebtPeakChartInstance = null;
        }
        return;
    }
    panelEl?.classList.remove('hidden');

    if (reportsDebtPeakChartInstance) reportsDebtPeakChartInstance.destroy();

    const theme = getReportsChartTheme();
    const peakColors = series.totals.map((_, i) => (
        i === series.peakIdx ? 'rgba(124, 58, 237, 0.95)' : 'rgba(124, 58, 237, 0.42)'
    ));

    reportsDebtPeakChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: series.labels,
            datasets: [{
                label: 'Raty i spłaty',
                data: series.totals,
                backgroundColor: peakColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.2,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: theme.tooltipBg,
                    callbacks: {
                        label: (ctx) => formatPlnAmount(ctx.parsed.y)
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: theme.legendColor, maxRotation: 45, minRotation: 0, font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: theme.legendColor, callback: (v) => `${Math.round(v / 1000)}k` },
                    grid: { color: theme.gridColor }
                }
            }
        }
    });

    if (summaryEl && series.peakValue > 0) {
        summaryEl.innerHTML = `<div class="debt-peak-highlight">
            <span class="label">Szczyt obciążenia</span>
            <strong>${formatPlnAmount(series.peakValue)}</strong>
            <span class="reports-hint">w ${escapeHtml(series.peakLabel)} — najwyższa suma planowanych rat w kolejnych 24 mies.</span>
        </div>`;
    }
}

function renderDebtFreedomTimeline() {
    const el = document.getElementById('reports-debt-freedom-timeline');
    const cardEl = document.getElementById('reports-debt-freedom-card');
    if (!el) return;

    const items = buildDebtFreedomTimeline();
    if (!items.length) {
        cardEl?.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    cardEl?.classList.remove('hidden');

    const today = localIsoDate(new Date());
    const dated = items.filter((i) => i.endDate);
    const maxMonths = dated.length
        ? Math.max(...dated.map((i) => {
            const d = new Date(`${i.endDate}T12:00:00`);
            const n = new Date(`${today}T12:00:00`);
            return Math.max(1, (d.getFullYear() - n.getFullYear()) * 12 + (d.getMonth() - n.getMonth()));
        }))
        : 1;

    el.innerHTML = items.map((item) => {
        const monthsLeft = item.endDate
            ? Math.max(0, (() => {
                const d = new Date(`${item.endDate}T12:00:00`);
                const n = new Date(`${today}T12:00:00`);
                return (d.getFullYear() - n.getFullYear()) * 12 + (d.getMonth() - n.getMonth());
            })())
            : null;
        const pct = monthsLeft !== null ? Math.min(100, Math.round((monthsLeft / maxMonths) * 100)) : 8;
        const dateLabel = item.endDate ? formatTxDate(item.endDate) : item.label;
        const openFn = item.kind === 'loan'
            ? `openLoanDetails('${escapeHtml(item.id)}')`
            : `openCreditCardDetails('${escapeHtml(item.id)}')`;
        return `<div class="debt-freedom-row ${item.kind}-clickable" role="button" tabindex="0" onclick="${openFn}" onkeydown="if (event.key==='Enter') ${openFn}">
            <div class="debt-freedom-head">
                <strong>${escapeHtml(item.name)}</strong>
                <span class="debt-freedom-date">${escapeHtml(dateLabel)}</span>
            </div>
            <div class="debt-freedom-bar"><span style="width:${pct}%"></span></div>
            <div class="debt-freedom-meta">
                <span>${formatPlnAmount(item.amount)} pozostało</span>
                <span>${escapeHtml(item.detail || item.label)}</span>
            </div>
        </div>`;
    }).join('');
}

function renderReportsYearHeatmap() {
    const wrap = document.getElementById('reports-year-heatmap');
    const labelEl = document.getElementById('reports-calendar-label');
    if (!wrap || reportsCalendarYear === null) return;

    const year = reportsCalendarYear;
    if (labelEl) labelEl.textContent = `Rok ${year}`;

    const yearExpenses = appState.transactions.filter(
        (t) => t.type === 'expense' && t.date.startsWith(String(year))
    );
    const yearIncome = appState.transactions.filter(
        (t) => t.type === 'income' && t.date.startsWith(String(year))
    );
    const byDayExpense = {};
    const byDayIncome = {};
    yearExpenses.forEach((t) => {
        byDayExpense[t.date] = (byDayExpense[t.date] || 0) + t.amount;
    });
    yearIncome.forEach((t) => {
        byDayIncome[t.date] = (byDayIncome[t.date] || 0) + t.amount;
    });
    const maxDay = Math.max(0, ...Object.values(byDayExpense));

    const months = [];
    for (let m = 0; m < 12; m++) {
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        const cells = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const expenseAmt = byDayExpense[dateStr] || 0;
            const incomeAmt = byDayIncome[dateStr] || 0;
            const heat = getExpenseHeatColor(expenseAmt, maxDay);
            const incomeClass = incomeAmt ? ' heat-dot--income' : '';
            const title = [
                expenseAmt ? `Wydatki: ${formatPlnAmount(expenseAmt)}` : null,
                incomeAmt ? `Wpływy: ${formatPlnAmount(incomeAmt)}` : null
            ].filter(Boolean).join(' · ') || '0 zł';
            cells.push(`<button type="button" class="heat-dot${expenseAmt ? ' heat-dot--active' : ''}${incomeClass}" style="background:${heat}"
                title="${d}: ${title}" onclick="openCalendarDay('${dateStr}')"></button>`);
        }
        const monthName = new Date(year, m, 1).toLocaleDateString('pl-PL', { month: 'short' });
        months.push(`<div class="heat-month">
            <div class="heat-month-label">${monthName}</div>
            <div class="heat-month-grid">${cells.join('')}</div>
        </div>`);
    }
    wrap.innerHTML = months.join('');
}

function openCalendarDayPanel(dateStr) {
    calendarDayDate = dateStr;
    calendarDayFilter = 'all';

    const overlay = document.getElementById('calendar-day-overlay');
    const filterEl = document.getElementById('calendar-day-filter');
    if (!overlay) return;

    if (filterEl) {
        const dayTx = appState.transactions.filter((t) => t.date === dateStr);
        const cats = new Set();
        dayTx.forEach((t) => cats.add(t.mainCategory));
        filterEl.innerHTML = `<option value="all">Wszystkie</option>
            <option value="expense">Tylko wydatki</option>
            <option value="income">Tylko wpływy</option>
            ${[...cats].map((c) => `<option value="cat:${c.replace(/"/g, '&quot;')}">${escapeHtml(c)}</option>`).join('')}`;
        filterEl.value = 'all';
    }

    renderCalendarDayPanel();
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function onCalendarDayFilterChange() {
    const filterEl = document.getElementById('calendar-day-filter');
    calendarDayFilter = filterEl?.value || 'all';
    renderCalendarDayPanel();
}

function renderCalendarDayPanel() {
    const titleEl = document.getElementById('calendar-day-title');
    const summaryEl = document.getElementById('calendar-day-summary');
    const listEl = document.getElementById('calendar-day-list');
    if (!calendarDayDate || !titleEl || !summaryEl || !listEl) return;

    let dayTx = appState.transactions.filter((t) => t.date === calendarDayDate);
    if (calendarDayFilter === 'expense') dayTx = dayTx.filter((t) => t.type === 'expense');
    else if (calendarDayFilter === 'income') dayTx = dayTx.filter((t) => t.type === 'income');
    else if (calendarDayFilter.startsWith('cat:')) {
        const cat = calendarDayFilter.slice(4);
        dayTx = dayTx.filter((t) => t.mainCategory === cat);
    }

    dayTx.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
        return b.amount - a.amount;
    });

    const weekday = new Date(`${calendarDayDate}T12:00:00`).toLocaleDateString('pl-PL', { weekday: 'long' });
    titleEl.textContent = formatTxDate(calendarDayDate);

    const expenseTotal = dayTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const incomeTotal = dayTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const scheduled = getScheduledDebtPaymentsOnDate(calendarDayDate);
    const scheduledTotal = scheduled.reduce((s, p) => s + p.amount, 0);

    summaryEl.innerHTML = `<div class="calendar-day-summary-row">
        <span class="calendar-day-weekday">${weekday.charAt(0).toUpperCase() + weekday.slice(1)}</span>
        <div class="calendar-day-totals">
            ${expenseTotal > 0 ? `<span class="calendar-day-total expense">−${formatPlnAmount(expenseTotal)}</span>` : ''}
            ${incomeTotal > 0 ? `<span class="calendar-day-total income">+${formatPlnAmount(incomeTotal)}</span>` : ''}
            ${scheduledTotal > 0 ? `<span class="calendar-day-total debt">◎ ${formatPlnAmount(scheduledTotal)}</span>` : ''}
        </div>
    </div>`;

    const scheduledHtml = scheduled.length
        ? `<div class="calendar-day-scheduled">
            <div class="calendar-day-scheduled-title">Planowane spłaty</div>
            ${scheduled.map((p) => `<div class="calendar-day-scheduled-row">
                <span>${escapeHtml(p.name)}${p.estimated ? ' <em>(szac.)</em>' : ''}</span>
                <strong>${formatPlnAmount(p.amount)}</strong>
            </div>`).join('')}
        </div>`
        : '';

    if (!dayTx.length && !scheduled.length) {
        listEl.innerHTML = '<div class="empty-state"><p>Brak transakcji</p></div>';
        return;
    }

    if (!dayTx.length) {
        listEl.innerHTML = scheduledHtml + '<div class="empty-state"><p>Brak transakcji tego dnia</p></div>';
        return;
    }

    listEl.innerHTML = scheduledHtml + dayTx.map((t) => {
        const globalIndex = appState.transactions.indexOf(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const meta = t.subCategory === '[Bez podkategorii]' ? '' : t.mainCategory;
        const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
        return `<div class="calendar-day-tx${globalIndex >= 0 ? ' calendar-day-tx--clickable' : ''}"${globalIndex >= 0 ? ` role="button" tabindex="0" onclick="openTransactionFromCalendarDay(${globalIndex})" onkeydown="if (event.key === 'Enter') openTransactionFromCalendarDay(${globalIndex})"` : ''}>
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)}
            <div class="tx-info">
                <div class="tx-title">${escapeHtml(title)}${isRec}</div>
                ${meta ? `<div class="tx-meta">${escapeHtml(meta)}</div>` : ''}
                ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ''}
            </div>
            <div class="calendar-day-tx-actions">
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>
        </div>`;
    }).join('');
}

function openTransactionFromCalendarDay(index) {
    closeCalendarDay();
    openTransactionDetails(index);
}

function storeReportsMonthChartMeta(period, labels, ctx, monthKeys) {
    reportsMonthChartMeta = { period, labels, ctx, monthKeys: monthKeys || [] };
}

function resolveMonthFromChartIndex(index) {
    const { monthKeys } = reportsMonthChartMeta;
    if (monthKeys?.[index]) return monthKeys[index];
    const { period, ctx } = reportsMonthChartMeta;
    const now = new Date();
    if (period === 'all') {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
        return { year: monthDate.getFullYear(), month: monthDate.getMonth() };
    }
    if (ctx?.mode === 'range') return null;
    const year = parseInt(period, 10);
    if (Number.isNaN(year)) return null;
    return { year, month: index };
}

function attachReportsMonthChartClick(options) {
    options.onClick = (_evt, elements) => {
        if (!elements.length) return;
        const idx = elements[0].index;
        const { period, monthKeys } = reportsMonthChartMeta;
        if (period === 'month' && monthKeys?.[idx]?.day) {
            const { year, month, day } = monthKeys[idx];
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            openCalendarDay(dateStr);
            return;
        }
        const resolved = resolveMonthFromChartIndex(idx);
        if (resolved) openMonthDrillDown(resolved.year, resolved.month);
    };
}

function openMonthDrillDown(year, month) {
    const overlay = document.getElementById('month-drill-overlay');
    const titleEl = document.getElementById('month-drill-title');
    const listEl = document.getElementById('month-drill-list');
    const summaryEl = document.getElementById('month-drill-summary');
    if (!overlay || !listEl) return;

    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const end = localIsoDate(new Date(year, month + 1, 0));
    const monthTx = appState.transactions.filter((t) => t.date >= start && t.date <= end);
    const label = new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });

    if (titleEl) titleEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const s = summarizePeriod(monthTx);
    if (summaryEl) {
        summaryEl.innerHTML = `<div class="month-drill-stats">
            <span class="income">+${formatPlnAmount(s.income)}</span>
            <span class="expense">−${formatPlnAmount(s.expense)}</span>
            <span class="${s.balance >= 0 ? 'income' : 'expense'}">${s.balance >= 0 ? '+' : ''}${formatPlnAmount(s.balance)}</span>
        </div>`;
    }

    const expenses = monthTx.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount);
    listEl.innerHTML = expenses.length
        ? expenses.map((t) => {
            const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
            return `<div class="calendar-day-tx">
                ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, 'expense')}
                <div class="tx-info">
                    <div class="tx-title">${escapeHtml(title)}</div>
                    <div class="tx-meta">${formatTxDate(t.date)}</div>
                </div>
                <div class="tx-amount expense">−${t.amount.toFixed(2)} zł</div>
            </div>`;
        }).join('')
        : '<div class="empty-state"><p>Brak transakcji</p></div>';

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeMonthDrill() {
    document.getElementById('month-drill-overlay')?.classList.add('hidden');
    if (!document.getElementById('calendar-day-overlay')?.classList.contains('hidden')) return;
    document.body.style.overflow = '';
}
