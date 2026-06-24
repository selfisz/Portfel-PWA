function getTransactionYears() {
    const years = new Set([new Date().getFullYear()]);
    appState.transactions.forEach((t) => {
        if (t.date) years.add(parseInt(t.date.substring(0, 4), 10));
    });
    return [...years].sort((a, b) => b - a);
}

function getTransactionsForYear(year) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return appState.transactions.filter(t => t.date >= start && t.date <= end);
}

function getTransactionsForReportsPeriod(period) {
    if (period === 'all') return appState.transactions;
    return getTransactionsForYear(parseInt(period, 10));
}

function populateReportsYearSelect() {
    const select = document.getElementById('reports-year-select');
    if (!select) return;
    const preferred = select.value || String(new Date().getFullYear());
    const years = getTransactionYears();
    const options = [`<option value="all"${preferred === 'all' ? ' selected' : ''}>Całość</option>`];
    years.forEach((year) => {
        const value = String(year);
        options.push(`<option value="${value}"${value === preferred ? ' selected' : ''}>${value}</option>`);
    });
    select.innerHTML = options.join('');
    if (preferred !== 'all' && !years.map(String).includes(preferred) && years.length) {
        select.value = String(years[0]);
    }
}

function setReportsViewType(type) {
    if (reportsViewType === type) return;
    reportsViewType = type;
    renderReports();
}

function syncReportsRankToggles() {
    ['reports', 'trends', 'recurring'].forEach((prefix) => {
        document.getElementById(`btn-${prefix}-main`)?.classList.toggle('active', reportsRankLevel === 'main');
        document.getElementById(`btn-${prefix}-sub`)?.classList.toggle('active', reportsRankLevel === 'sub');
    });
}

function setReportsRankLevel(level) {
    if (reportsRankLevel === level) return;
    reportsRankLevel = level;
    renderReports();
}

function getReportsChartTheme() {
    return {
        legendColor: getThemeCssVar('--text', '#0f172a', '#f5f5f5'),
        gridColor: isLightTheme() ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)',
        expenseColor: isLightTheme() ? 'rgba(220, 38, 38, 0.8)' : 'rgba(248, 113, 113, 0.8)',
        expenseFill: isLightTheme() ? 'rgba(220, 38, 38, 0.12)' : 'rgba(248, 113, 113, 0.18)',
        incomeColor: isLightTheme() ? 'rgba(13, 148, 136, 0.85)' : 'rgba(52, 211, 153, 0.8)',
        prevYearColor: isLightTheme() ? 'rgba(100, 116, 139, 0.55)' : 'rgba(148, 163, 184, 0.5)',
        tooltipBg: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)'
    };
}

function getReportsChartOptions(theme, yAxis = true) {
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.45,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: theme.legendColor,
                    font: { family: 'DM Sans', weight: '600', size: 11 },
                    boxWidth: 12,
                    padding: 14
                }
            },
            tooltip: {
                backgroundColor: theme.tooltipBg,
                titleFont: { family: 'DM Sans', weight: '700' },
                bodyFont: { family: 'DM Sans', weight: '600' },
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: (context) => `${context.dataset.label}: ${formatPlnAmount(context.parsed.y)}`
                }
            }
        },
        scales: {
            x: {
                ticks: { color: theme.legendColor, font: { family: 'DM Sans', size: 10 } },
                grid: { display: false }
            }
        }
    };
    if (yAxis) {
        options.scales.y = {
            ticks: {
                color: theme.legendColor,
                font: { family: 'DM Sans', size: 10 },
                callback: (value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)
            },
            grid: { color: theme.gridColor }
        };
    }
    return options;
}

function getExpenseHeatColor(amount, maxAmount) {
    if (!amount || amount <= 0) return 'transparent';
    const ratio = Math.min(amount / (maxAmount || 1), 1);
    if (isLightTheme()) return `rgba(220, 38, 38, ${0.1 + ratio * 0.5})`;
    return `rgba(248, 113, 113, ${0.12 + ratio * 0.55})`;
}

function getIncomeHeatColor(amount, maxAmount) {
    if (!amount || amount <= 0) return 'transparent';
    const ratio = Math.min(amount / (maxAmount || 1), 1);
    if (isLightTheme()) return `rgba(22, 163, 74, ${0.12 + ratio * 0.45})`;
    return `rgba(74, 222, 128, ${0.14 + ratio * 0.5})`;
}

function blendCalendarHeat(expense, expenseMax, income, incomeMax) {
    const e = expense > 0 ? getExpenseHeatColor(expense, expenseMax) : null;
    const i = income > 0 ? getIncomeHeatColor(income, incomeMax) : null;
    if (e && i) return `linear-gradient(145deg, ${e} 55%, ${i} 55%)`;
    return e || i || 'var(--input-bg)';
}

function syncReportsCalendarToPeriod(period) {
    const now = new Date();
    if (reportsLastPeriod === period && reportsCalendarYear !== null) return;
    reportsLastPeriod = period;

    if (period === 'all') {
        reportsCalendarYear = now.getFullYear();
        reportsCalendarMonth = now.getMonth();
        return;
    }
    const year = parseInt(period, 10);
    reportsCalendarYear = year;
    reportsCalendarMonth = year === now.getFullYear() ? now.getMonth() : 11;
}

function shiftReportsCalendarMonth(delta) {
    if (typeof reportsPeriodMode !== 'undefined' && reportsPeriodMode === 'month') {
        if (reportsCalendarYear === null) {
            const now = new Date();
            reportsCalendarYear = now.getFullYear();
            reportsCalendarMonth = now.getMonth();
        }
        reportsCalendarMonth += delta;
        if (reportsCalendarMonth > 11) {
            reportsCalendarMonth = 0;
            reportsCalendarYear++;
        }
        if (reportsCalendarMonth < 0) {
            reportsCalendarMonth = 11;
            reportsCalendarYear--;
        }
        const monthInput = document.getElementById('reports-period-month');
        if (monthInput) {
            monthInput.value = `${reportsCalendarYear}-${String(reportsCalendarMonth + 1).padStart(2, '0')}`;
        }
        renderReports();
        return;
    }
    if (typeof reportsCalendarView !== 'undefined' && reportsCalendarView === 'year') {
        if (reportsCalendarYear === null) reportsCalendarYear = new Date().getFullYear();
        reportsCalendarYear += delta;
        if (typeof renderReportsYearHeatmap === 'function') renderReportsYearHeatmap();
        return;
    }
    const period = document.getElementById('reports-year-select')?.value || 'all';
    reportsCalendarMonth += delta;
    if (period !== 'all') {
        const year = parseInt(period, 10);
        reportsCalendarYear = year;
        if (reportsCalendarMonth > 11) reportsCalendarMonth = 0;
        if (reportsCalendarMonth < 0) reportsCalendarMonth = 11;
    } else {
        if (reportsCalendarMonth > 11) {
            reportsCalendarMonth = 0;
            reportsCalendarYear++;
        }
        if (reportsCalendarMonth < 0) {
            reportsCalendarMonth = 11;
            reportsCalendarYear--;
        }
    }
    if (typeof renderReportsCalendarView === 'function') {
        renderReportsCalendarView();
    } else {
        renderReportsCalendar();
    }
}

function renderReportsCalendar() {
    const grid = document.getElementById('reports-calendar-grid');
    const labelEl = document.getElementById('reports-calendar-label');
    if (!grid || !labelEl || reportsCalendarYear === null) return;

    const year = reportsCalendarYear;
    const month = reportsCalendarMonth;
    const monthLabel = new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    labelEl.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = localIsoDate(new Date(year, month + 1, 0));
    const monthTx = appState.transactions.filter((t) => t.date >= monthStart && t.date <= monthEnd);

    const expenseByDay = {};
    const incomeByDay = {};
    monthTx.forEach((t) => {
        if (t.type === 'expense') {
            expenseByDay[t.date] = (expenseByDay[t.date] || 0) + t.amount;
        } else if (t.type === 'income') {
            incomeByDay[t.date] = (incomeByDay[t.date] || 0) + t.amount;
        }
    });

    const maxExpense = Math.max(0, ...Object.values(expenseByDay));
    const maxIncome = Math.max(0, ...Object.values(incomeByDay));
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = localIsoDate(new Date());

    const parts = ['<div class="cal-weekday">Pn</div>', '<div class="cal-weekday">Wt</div>', '<div class="cal-weekday">Śr</div>', '<div class="cal-weekday">Cz</div>', '<div class="cal-weekday">Pt</div>', '<div class="cal-weekday">Sb</div>', '<div class="cal-weekday">Nd</div>'];

    for (let i = 0; i < firstDow; i++) parts.push('<div class="cal-cell cal-cell--empty"></div>');

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const expense = expenseByDay[dateStr] || 0;
        const income = incomeByDay[dateStr] || 0;
        const todayClass = dateStr === today ? ' cal-cell--today' : '';
        const clickable = ' cal-cell--clickable';
        const flags = `${expense ? ' cal-cell--has-expense' : ''}${income ? ' cal-cell--has-income' : ''}`;
        const heat = (expense || income)
            ? blendCalendarHeat(expense, maxExpense, income, maxIncome)
            : '';
        const bgStyle = heat ? ` style="background:${heat}"` : '';
        const expenseLine = expense
            ? `<span class="cal-day-amount expense">−${formatCompactPln(expense)}</span>`
            : '';
        const incomeLine = income
            ? `<span class="cal-day-amount income">+${formatCompactPln(income)}</span>`
            : '';
        parts.push(`<button type="button" class="cal-cell${todayClass}${clickable}${flags}" data-date="${dateStr}"${bgStyle} onclick="openCalendarDay('${dateStr}')">
                <span class="cal-day-num">${day}</span>
                ${expenseLine}${incomeLine}
            </button>`);
    }

    grid.innerHTML = parts.join('');
}

function openCalendarDay(dateStr) {
    if (typeof openCalendarDayPanel === 'function') {
        openCalendarDayPanel(dateStr);
        return;
    }
    const overlay = document.getElementById('calendar-day-overlay');
    const titleEl = document.getElementById('calendar-day-title');
    const summaryEl = document.getElementById('calendar-day-summary');
    const listEl = document.getElementById('calendar-day-list');
    if (!overlay || !titleEl || !summaryEl || !listEl) return;

    const dayTx = appState.transactions
        .filter((t) => t.date === dateStr)
        .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
            return b.amount - a.amount;
        });

    const weekday = new Date(`${dateStr}T12:00:00`).toLocaleDateString('pl-PL', { weekday: 'long' });
    titleEl.textContent = formatTxDate(dateStr);

    const expenseTotal = dayTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const incomeTotal = dayTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

    summaryEl.innerHTML = `<div class="calendar-day-summary-row">
        <span class="calendar-day-weekday">${weekday.charAt(0).toUpperCase() + weekday.slice(1)}</span>
        <div class="calendar-day-totals">
            ${expenseTotal > 0 ? `<span class="calendar-day-total expense">−${formatPlnAmount(expenseTotal)}</span>` : ''}
            ${incomeTotal > 0 ? `<span class="calendar-day-total income">+${formatPlnAmount(incomeTotal)}</span>` : ''}
        </div>
    </div>`;

    if (!dayTx.length) {
        listEl.innerHTML = '<div class="empty-state"><p>Brak transakcji tego dnia</p></div>';
    } else {
        listEl.innerHTML = dayTx.map((t) => {
            const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
            const meta = t.subCategory === '[Bez podkategorii]' ? '' : t.mainCategory;
            const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
            return `<div class="calendar-day-tx">
                ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)}
                <div class="tx-info">
                    <div class="tx-title">${escapeHtml(title)}${isRec}</div>
                    ${meta ? `<div class="tx-meta">${escapeHtml(meta)}</div>` : ''}
                    ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ''}
                </div>
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>`;
        }).join('');
    }

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeCalendarDay() {
    const overlay = document.getElementById('calendar-day-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
}

function calcReportsDailyAverage(period, periodTx) {
    const expenses = periodTx.filter((t) => t.type === 'expense');
    const now = new Date();

    if (period === 'all') {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 29);
        const cutoffStr = localIsoDate(cutoff);
        const recentTotal = expenses
            .filter((t) => t.date >= cutoffStr)
            .reduce((sum, t) => sum + t.amount, 0);
        return { avg: recentTotal / 30, hint: 'ostatnie 30 dni' };
    }

    if (period === 'range' || period === 'compare') {
        const dates = expenses.map((t) => t.date).sort();
        if (!dates.length) return { avg: 0, hint: 'brak wydatków' };
        const start = dates[0];
        const end = dates[dates.length - 1];
        const days = Math.max(1, Math.ceil((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) + 1);
        const total = expenses.reduce((sum, t) => sum + t.amount, 0);
        return { avg: total / days, hint: `zakres (${days} dni)` };
    }

    if (period === 'month' && typeof getMonthBoundsFromValue === 'function') {
        const { start, end } = getMonthBoundsFromValue(getReportsMonthValue());
        const total = expenses.reduce((sum, t) => sum + t.amount, 0);
        const now = new Date();
        const monthEnd = new Date(`${end}T12:00:00`);
        const monthStart = new Date(`${start}T12:00:00`);
        const endDate = monthEnd > now ? now : monthEnd;
        const days = Math.max(1, Math.ceil((endDate - monthStart) / 86400000) + 1);
        return { avg: total / days, hint: `w miesiącu (${days} dni)` };
    }

    const year = parseInt(period, 10);
    if (Number.isNaN(year)) {
        const total = expenses.reduce((sum, t) => sum + t.amount, 0);
        return { avg: total / 30, hint: 'średnia w okresie' };
    }
    const isCurrentYear = year === now.getFullYear();
    const start = new Date(year, 0, 1);
    const end = isCurrentYear ? now : new Date(year, 11, 31);
    const days = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
    const total = expenses.reduce((sum, t) => sum + t.amount, 0);
    return { avg: total / days, hint: isCurrentYear ? `od 1 sty do dziś (${days} dni)` : `cały rok (${days} dni)` };
}

function renderReportsDailyAvg(period, periodTx) {
    const { avg, hint } = calcReportsDailyAverage(period, periodTx);
    const avgEl = document.getElementById('reports-daily-avg');
    const hintEl = document.getElementById('reports-daily-avg-hint');
    if (avgEl) avgEl.textContent = formatPlnAmount(avg);
    if (hintEl) hintEl.textContent = hint;
}

function loadSavingsGoal() {
    const value = parseInt(localStorage.getItem(SAVINGS_GOAL_KEY), 10);
    return Number.isFinite(value) ? value : 20;
}

function saveSavingsGoal() {
    const input = document.getElementById('savings-goal-input');
    if (!input) return;
    const value = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
    input.value = value;
    localStorage.setItem(SAVINGS_GOAL_KEY, String(value));
    const ctx = typeof getReportsPeriodContext === 'function'
        ? getReportsPeriodContext()
        : null;
    if (!ctx) return;
    const periodTx = ctx.periodTx;
    const totalIncome = periodTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = periodTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
    renderReportsSavingsGoal(savingsRate);
}

function renderReportsSavingsGoal(savingsRate) {
    const goal = loadSavingsGoal();
    const input = document.getElementById('savings-goal-input');
    if (input && document.activeElement !== input) input.value = goal;
    const fill = document.getElementById('reports-goal-fill');
    const label = document.getElementById('reports-goal-label');
    if (!fill || !label) return;
    const progress = goal > 0 ? Math.min(100, Math.round((savingsRate / goal) * 100)) : 0;
    fill.style.width = `${progress}%`;
    fill.style.background = savingsRate >= goal ? 'var(--success)' : (savingsRate >= 0 ? 'var(--accent)' : 'var(--danger)');
    label.textContent = `${savingsRate}% z ${goal}%`;
}

function renderReportsTrendChart(period, periodTx, rangeStart, rangeEnd) {
    const canvas = document.getElementById('reportsTrendChart');
    if (!canvas) return;
    const { monthLabels, expenseData } = buildReportsMonthChartData(period, periodTx, rangeStart, rangeEnd);
    const theme = getReportsChartTheme();
    const ctx = canvas.getContext('2d');
    if (reportsTrendChartInstance) reportsTrendChartInstance.destroy();

    reportsTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Wydatki',
                data: expenseData,
                borderColor: theme.expenseColor,
                backgroundColor: theme.expenseFill,
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2
            }]
        },
        options: getReportsChartOptions(theme)
    });
}

function getMonthExpenseTotal(year, month, sourceTx) {
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = localIsoDate(new Date(year, month + 1, 0));
    return sourceTx
        .filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= monthEnd)
        .reduce((sum, t) => sum + t.amount, 0);
}

function renderReportsYoYChart(period, periodTx, reportsCtx) {
    const canvas = document.getElementById('reportsYoyChart');
    const titleEl = document.getElementById('reports-yoy-title');
    if (!canvas) return;

    const theme = getReportsChartTheme();
    const ctx = canvas.getContext('2d');
    if (reportsYoyChartInstance) reportsYoyChartInstance.destroy();

    const now = new Date();
    const labels = [];
    const currentData = [];
    const prevData = [];
    const allTx = appState.transactions;

    if (period === 'range' || period === 'compare') {
        const start = reportsCtx?.rangeStart || reportsCtx?.periodA?.start;
        const end = reportsCtx?.rangeEnd || reportsCtx?.periodA?.end;
        const { monthKeys } = buildReportsMonthChartData(period, periodTx, start, end);
        if (titleEl) titleEl.textContent = 'Porównanie rok do roku (zakres)';
        monthKeys.forEach(({ year, month }) => {
            labels.push(new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            currentData.push(getMonthExpenseTotal(year, month, periodTx));
            prevData.push(getMonthExpenseTotal(year - 1, month, allTx));
        });
    } else if (period === 'month' && reportsCtx?.rangeStart) {
        const [year, monthNum] = reportsCtx.rangeStart.split('-').map(Number);
        const month = monthNum - 1;
        if (titleEl) titleEl.textContent = 'Ten miesiąc vs rok wcześniej';
        labels.push(new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'long' }));
        currentData.push(getMonthExpenseTotal(year, month, periodTx));
        prevData.push(getMonthExpenseTotal(year - 1, month, allTx));
    } else if (period === 'all') {
        if (titleEl) titleEl.textContent = 'Porównanie rok do roku (ostatnie 6 mies.)';
        for (let offset = 5; offset >= 0; offset--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            labels.push(monthDate.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            currentData.push(getMonthExpenseTotal(year, month, allTx));
            prevData.push(getMonthExpenseTotal(year - 1, month, allTx));
        }
    } else {
        const year = parseInt(period, 10);
        const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : 12;
        if (titleEl) titleEl.textContent = `Porównanie ${year} vs ${year - 1}`;
        for (let month = 0; month < monthCount; month++) {
            labels.push(new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'short' }));
            currentData.push(getMonthExpenseTotal(year, month, periodTx));
            prevData.push(getMonthExpenseTotal(year - 1, month, allTx));
        }
    }

    reportsYoyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: period === 'all' ? 'Ten rok' : (period === 'month' ? reportsCtx.rangeStart.slice(0, 4) : String(parseInt(period, 10))),
                    data: currentData,
                    backgroundColor: theme.expenseColor,
                    borderRadius: 5,
                    borderSkipped: false
                },
                {
                    label: period === 'all' ? 'Rok wcześniej' : (period === 'month' ? String(parseInt(reportsCtx.rangeStart.slice(0, 4), 10) - 1) : String(parseInt(period, 10) - 1)),
                    data: prevData,
                    backgroundColor: theme.prevYearColor,
                    borderRadius: 5,
                    borderSkipped: false
                }
            ]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsDowChart(periodTx) {
    const canvas = document.getElementById('reportsDowChart');
    if (!canvas) return;

    const dowLabels = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];

    periodTx.filter((t) => t.type === 'expense').forEach((t) => {
        const dow = (new Date(t.date + 'T12:00:00').getDay() + 6) % 7;
        dowTotals[dow] += t.amount;
        dowCounts[dow]++;
    });

    const dowAvg = dowTotals.map((total, i) => (dowCounts[i] > 0 ? total / dowCounts[i] : 0));
    const theme = getReportsChartTheme();
    const ctx = canvas.getContext('2d');
    if (reportsDowChartInstance) reportsDowChartInstance.destroy();

    const maxAvg = Math.max(...dowAvg, 1);
    const barColors = dowAvg.map((avg) => {
        const ratio = avg / maxAvg;
        if (isLightTheme()) return `rgba(220, 38, 38, ${0.25 + ratio * 0.65})`;
        return `rgba(248, 113, 113, ${0.3 + ratio * 0.65})`;
    });

    reportsDowChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dowLabels,
            datasets: [{
                label: 'Śr. wydatek',
                data: dowAvg,
                backgroundColor: barColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsRecurring() {
    if (typeof renderDetectedRecurringList === 'function') {
        renderDetectedRecurringList();
    }
}

function exportReportsCsv() {
    const ctx = typeof getReportsPeriodContext === 'function'
        ? getReportsPeriodContext()
        : { periodTx: getTransactionsForReportsPeriod(document.getElementById('reports-year-select').value) };
    const periodTx = [...ctx.periodTx].sort((a, b) => a.date.localeCompare(b.date));
    const fileSuffix = ctx.label?.replace(/\s+/g, '-').toLowerCase() || 'analiza';
    const headers = ['Data', 'Typ', 'Kategoria', 'Podkategoria', 'Kwota', 'Notatka', 'Cykliczna'];
    const rows = periodTx.map((t) => [
        t.date,
        t.type === 'expense' ? 'Wydatek' : 'Wpływ',
        t.mainCategory,
        t.subCategory === '[Bez podkategorii]' ? '' : t.subCategory,
        t.amount.toFixed(2).replace('.', ','),
        t.note || '',
        t.recurringId ? 'Tak' : 'Nie'
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsvField).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `portfel-analiza-${fileSuffix}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function renderReportsTopCategories(periodTx) {
    const topEl = document.getElementById('reports-top-categories');
    document.getElementById('btn-reports-expense').classList.toggle('active', reportsViewType === 'expense');
    document.getElementById('btn-reports-income').classList.toggle('active', reportsViewType === 'income');
    syncReportsRankToggles();
    document.getElementById('reports-top-title').innerText = reportsRankLevel === 'sub' ? 'Top podkategorie' : 'Top kategorie';

    const typeTx = periodTx.filter(t => t.type === reportsViewType);
    const catSums = {};

    if (reportsRankLevel === 'sub') {
        typeTx.forEach((t) => {
            const sub = t.subCategory === '[Bez podkategorii]' ? null : t.subCategory;
            const key = sub ? `${t.mainCategory}|${sub}` : t.mainCategory;
            if (!catSums[key]) {
                catSums[key] = { amount: 0, mainCategory: t.mainCategory, subCategory: sub, label: sub || t.mainCategory };
            }
            catSums[key].amount += t.amount;
        });
    } else {
        typeTx.forEach((t) => {
            if (!catSums[t.mainCategory]) {
                catSums[t.mainCategory] = { amount: 0, mainCategory: t.mainCategory, subCategory: null, label: t.mainCategory };
            }
            catSums[t.mainCategory].amount += t.amount;
        });
    }

    const total = Object.values(catSums).reduce((sum, entry) => sum + entry.amount, 0);
    const entries = Object.values(catSums)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    if (!entries.length) {
        topEl.innerHTML = '<div class="empty-state"><p>Brak danych za wybrany okres</p></div>';
        return;
    }

    topEl.innerHTML = entries.map((entry, index) => {
        const pct = total > 0 ? Math.round((entry.amount / total) * 100) : 0;
        const meta = reportsRankLevel === 'sub' && entry.subCategory ? entry.mainCategory : '';
        return `<div class="reports-top-item">
            <span class="reports-top-rank">${index + 1}</span>
            ${renderCategoryIcon(entry.mainCategory, 'list', entry.subCategory, reportsViewType)}
            <div class="reports-top-text">
                <span class="reports-top-name">${entry.label}</span>
                ${meta ? `<span class="reports-top-meta">${meta}</span>` : ''}
                <span class="reports-top-amount">${formatPlnAmount(entry.amount)}</span>
            </div>
            <span class="reports-top-pct">${pct}%</span>
        </div>`;
    }).join('');
}

function buildReportsMonthChartData(period, periodTx, rangeStart, rangeEnd) {
    const now = new Date();
    const monthLabels = [];
    const monthKeys = [];
    const incomeData = [];
    const expenseData = [];

    if (period === 'month' && rangeStart && rangeEnd) {
        const [year, monthNum] = rangeStart.split('-').map(Number);
        const month = monthNum - 1;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayTx = periodTx.filter((t) => t.date === dateStr);
            monthLabels.push(String(day));
            monthKeys.push({ year, month, day });
            incomeData.push(dayTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
            expenseData.push(dayTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
        }
        return { monthLabels, monthKeys, incomeData, expenseData, title: 'Dni w miesiącu' };
    }

    if ((period === 'range' || period === 'compare') && rangeStart && rangeEnd) {
        const end = new Date(`${rangeEnd}T12:00:00`);
        let cursor = new Date(`${rangeStart}T12:00:00`);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        while (cursor <= end) {
            const year = cursor.getFullYear();
            const month = cursor.getMonth();
            const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const monthEnd = localIsoDate(new Date(year, month + 1, 0));
            const monthTx = periodTx.filter((t) => t.date >= monthStart && t.date <= monthEnd);
            monthLabels.push(cursor.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            monthKeys.push({ year, month });
            incomeData.push(monthTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
            expenseData.push(monthTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
            cursor = new Date(year, month + 1, 1);
        }
        return { monthLabels, monthKeys, incomeData, expenseData, title: 'Miesiące w zakresie' };
    }

    if (period === 'all') {
        for (let offset = 11; offset >= 0; offset--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const monthEnd = localIsoDate(new Date(year, month + 1, 0));
            const monthTx = periodTx.filter(t => t.date >= monthStart && t.date <= monthEnd);
            monthLabels.push(monthDate.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            monthKeys.push({ year, month });
            incomeData.push(monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
            expenseData.push(monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
        }
        return { monthLabels, monthKeys, incomeData, expenseData, title: 'Ostatnie 12 miesięcy' };
    }

    const year = parseInt(period, 10);
    const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let month = 0; month < monthCount; month++) {
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const monthEndDate = new Date(year, month + 1, 0);
        const monthEnd = localIsoDate(monthEndDate);
        const monthTx = periodTx.filter(t => t.date >= monthStart && t.date <= monthEnd);
        monthLabels.push(monthEndDate.toLocaleDateString('pl-PL', { month: 'short' }));
        monthKeys.push({ year, month });
        incomeData.push(monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
        expenseData.push(monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
    }
    return { monthLabels, monthKeys, incomeData, expenseData, title: 'Miesiące w roku' };
}

function renderReports() {
    populateReportsYearSelect();
    const ctx = typeof getReportsPeriodContext === 'function'
        ? getReportsPeriodContext()
        : (() => {
            const period = document.getElementById('reports-year-select').value;
            return {
                mode: 'year',
                period,
                label: period === 'all' ? 'Całość' : period,
                periodTx: getTransactionsForReportsPeriod(period),
                rangeStart: null,
                rangeEnd: null
            };
        })();

    const { period, periodTx, label, rangeStart, rangeEnd, periodA, mode } = ctx;
    let chartPeriod = period;
    let chartRangeStart = rangeStart;
    let chartRangeEnd = rangeEnd;
    if (mode === 'month') {
        chartPeriod = 'month';
        chartRangeStart = rangeStart;
        chartRangeEnd = rangeEnd;
    } else if (period === 'compare' && periodA) {
        chartPeriod = 'range';
        chartRangeStart = periodA.start;
        chartRangeEnd = periodA.end;
    }
    const totalIncome = periodTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = periodTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;

    document.getElementById('reports-year-label').innerText = label;
    document.getElementById('reports-total-income').innerText = formatPlnAmount(totalIncome);
    document.getElementById('reports-total-expense').innerText = formatPlnAmount(totalExpense);
    const netEl = document.getElementById('reports-net-balance');
    netEl.innerText = `${netBalance >= 0 ? '+' : ''}${netBalance.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
    netEl.style.color = netBalance >= 0 ? 'var(--success)' : 'var(--danger)';
    const savingsEl = document.getElementById('reports-savings-rate');
    savingsEl.innerText = `${savingsRate}%`;
    savingsEl.style.color = savingsRate >= 0 ? 'var(--success)' : 'var(--danger)';

    const { monthLabels, monthKeys, incomeData, expenseData, title } = buildReportsMonthChartData(chartPeriod, periodTx, chartRangeStart, chartRangeEnd);
    document.getElementById('reports-months-title').innerText = title;
    if (typeof storeReportsMonthChartMeta === 'function') {
        storeReportsMonthChartMeta(chartPeriod, monthLabels, ctx, monthKeys);
    }

    const ctx2 = document.getElementById('reportsMonthsChart').getContext('2d');
    if (reportsChartInstance) reportsChartInstance.destroy();

    const legendColor = getThemeCssVar('--text', '#0f172a', '#f5f5f5');
    const gridColor = isLightTheme() ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';

    const monthChartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.35,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: legendColor,
                        font: { family: 'DM Sans', weight: '600', size: 11 },
                        boxWidth: 12,
                        padding: 14
                    }
                },
                tooltip: {
                    backgroundColor: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)',
                    titleFont: { family: 'DM Sans', weight: '700' },
                    bodyFont: { family: 'DM Sans', weight: '600' },
                    padding: 12,
                    cornerRadius: 10,
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatPlnAmount(context.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: legendColor, font: { family: 'DM Sans', size: 10 } },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: legendColor,
                        font: { family: 'DM Sans', size: 10 },
                        callback: (value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)
                    },
                    grid: { color: gridColor }
                }
            }
        };
    if (typeof attachReportsMonthChartClick === 'function') attachReportsMonthChartClick(monthChartOptions);

    reportsChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'Wpływy',
                    data: incomeData,
                    backgroundColor: isLightTheme() ? 'rgba(13, 148, 136, 0.85)' : 'rgba(52, 211, 153, 0.8)',
                    borderRadius: 6,
                    borderSkipped: false
                },
                {
                    label: 'Wydatki',
                    data: expenseData,
                    backgroundColor: isLightTheme() ? 'rgba(220, 38, 38, 0.8)' : 'rgba(248, 113, 113, 0.8)',
                    borderRadius: 6,
                    borderSkipped: false
                }
            ]
        },
        options: monthChartOptions
    });

    if (typeof syncReportsCalendarFromContext === 'function') {
        syncReportsCalendarFromContext(ctx);
    } else {
        syncReportsCalendarToPeriod(chartPeriod === 'range' ? chartRangeStart?.slice(0, 4) : period);
    }
    if (typeof renderReportsCalendarView === 'function') {
        renderReportsCalendarView();
    } else {
        renderReportsCalendar();
    }
    renderReportsDailyAvg(chartPeriod, periodTx);
    renderReportsSavingsGoal(savingsRate);
    renderReportsTrendChart(chartPeriod, periodTx, chartRangeStart, chartRangeEnd);
    renderReportsYoYChart(chartPeriod, periodTx, ctx);
    renderReportsDowChart(periodTx);
    renderReportsRecurring();
    renderReportsTopCategories(periodTx);
    if (typeof renderPhase3Reports === 'function') renderPhase3Reports(ctx, savingsRate);
}
