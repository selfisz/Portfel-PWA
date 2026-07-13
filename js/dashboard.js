let dashboardTxVisibleCount = LIST_PAGE_SIZE;
let dashboardTxListSignature = '';
let dashboardSelectionActive = false;
const dashboardSelectedFingerprints = new Set();
let dashboardCurrentListTx = [];
const CHART_DRILL_TX_MAX_SLICES = 16;

function resetDashboardTxListPagination() {
    dashboardTxVisibleCount = LIST_PAGE_SIZE;
    dashboardTxListSignature = '';
}

function showMoreDashboardTransactions() {
    dashboardTxVisibleCount += LIST_PAGE_SIZE;
    renderDashboard();
}

function updateDashboardSelectionUi(forecastMode, searchQuery) {
    const hideSelection = forecastMode && !searchQuery;
    const selectBtn = document.getElementById('btn-dashboard-select');
    const selectionBar = document.getElementById('dashboard-tx-selection-bar');
    const hintEl = document.getElementById('dashboard-tx-list-hint');
    const addBtn = document.getElementById('btn-dashboard-add-to-basket');

    if (selectBtn) {
        selectBtn.classList.toggle('hidden', hideSelection);
        selectBtn.textContent = dashboardSelectionActive ? 'Anuluj' : 'Zaznacz';
        selectBtn.setAttribute('aria-pressed', dashboardSelectionActive ? 'true' : 'false');
    }
    if (selectionBar) selectionBar.classList.toggle('hidden', hideSelection || !dashboardSelectionActive);
    if (hintEl && !hideSelection) {
        hintEl.textContent = dashboardSelectionActive
            ? 'Zaznacz transakcje do raportu PDF'
            : 'Dotknij, aby edytować';
    }
    if (addBtn) {
        const count = dashboardSelectedFingerprints.size;
        addBtn.disabled = count === 0;
        addBtn.textContent = count > 0 ? `Dodaj do koszyka (${count})` : 'Dodaj do koszyka';
    }
}

function exitDashboardSelectionMode() {
    dashboardSelectionActive = false;
    dashboardSelectedFingerprints.clear();
}

function toggleDashboardSelectionMode() {
    const forecastMode = document.getElementById('dashboard-period-select')?.value === 'next';
    const searchQuery = document.getElementById('db-search')?.value.trim() || '';
    if (forecastMode && !searchQuery) return;

    if (dashboardSelectionActive) exitDashboardSelectionMode();
    else dashboardSelectionActive = true;

    updateDashboardSelectionUi(forecastMode, searchQuery);
    renderDashboard();
}

function toggleDashboardTxSelection(fingerprint, selected) {
    if (!fingerprint) return;
    if (selected) dashboardSelectedFingerprints.add(fingerprint);
    else dashboardSelectedFingerprints.delete(fingerprint);

    const forecastMode = document.getElementById('dashboard-period-select')?.value === 'next';
    const searchQuery = document.getElementById('db-search')?.value.trim() || '';
    updateDashboardSelectionUi(forecastMode, searchQuery);

    document.querySelectorAll('.tx-row-checkbox').forEach((cb) => {
        if (cb.dataset.txFp !== fingerprint) return;
        cb.checked = selected;
        cb.closest('.tx-row')?.classList.toggle('tx-row--selected', selected);
    });
}

function selectAllDashboardFiltered() {
    dashboardCurrentListTx.forEach((tx) => {
        const fp = typeof transactionFingerprint === 'function' ? transactionFingerprint(tx) : '';
        if (fp) dashboardSelectedFingerprints.add(fp);
    });
    renderDashboard();
}

function deselectAllDashboardFiltered() {
    dashboardSelectedFingerprints.clear();
    renderDashboard();
}

function addSelectedDashboardToBasket() {
    if (!dashboardSelectedFingerprints.size) return;
    const selected = dashboardCurrentListTx.filter((tx) => {
        const fp = typeof transactionFingerprint === 'function' ? transactionFingerprint(tx) : '';
        return fp && dashboardSelectedFingerprints.has(fp);
    });
    const added = typeof addTransactionsToBasket === 'function' ? addTransactionsToBasket(selected) : 0;
    exitDashboardSelectionMode();
    renderDashboard();
    if (typeof showAppToast === 'function') {
        if (added > 0) showAppToast(`Dodano ${added} ${added === 1 ? 'transakcję' : 'transakcje'} do koszyka`);
        else showAppToast('Wybrane pozycje są już w koszyku', 'default');
    }
    if (added > 0 && typeof openNotificationsPanel === 'function' && typeof setNotificationsPanelTab === 'function') {
        openNotificationsPanel();
        setNotificationsPanelTab('basket');
    }
}

function getDashboardTxListSignature(listTx, searchQuery) {
    const period = document.getElementById('dashboard-period-select')?.value || '';
    const { startDate, endDate } = getDashboardDates();
    return [
        period,
        startDate,
        endDate,
        searchQuery,
        activeChartCategory || '',
        activeChartSubCategory || '',
        chartViewType,
        listTx.length,
        listTx[0]?.date ?? '',
        listTx[listTx.length - 1]?.date ?? ''
    ].join('|');
}

function handleDashboardPeriodChange() {
    const period = document.getElementById('dashboard-period-select').value;
    document.getElementById('dashboard-custom-dates').style.display = period === 'custom' ? 'flex' : 'none';
    updateDashboardPeriodResetVisibility();
    renderDashboard();
}

function resetDashboardPeriod() {
    document.getElementById('dashboard-period-select').value = 'current-month';
    document.getElementById('dashboard-custom-dates').style.display = 'none';
    updateDashboardPeriodResetVisibility();
    renderDashboard();
}

function updateDashboardPeriodResetVisibility() {
    const period = document.getElementById('dashboard-period-select').value;
    const btn = document.getElementById('dashboard-period-reset');
    if (btn) btn.classList.toggle('hidden', period === 'current-month');
}

function getTransactionDateBounds() {
    const source = typeof getMergedTransactions === 'function'
        ? getMergedTransactions()
        : appState.transactions;
    if (!source.length) {
        const today = localIsoDate(new Date());
        return { startDate: today, endDate: today };
    }
    let min = source[0].date;
    let max = source[0].date;
    source.forEach((t) => {
        if (t.date < min) min = t.date;
        if (t.date > max) max = t.date;
    });
    return { startDate: min, endDate: max };
}


function getDashboardDates() {
    const period = document.getElementById('dashboard-period-select').value;
    let startDate, endDate;
    const now = new Date();
    if (period === 'current-month') {
        startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
        endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (period === 'next-month') {
        startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
        endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 2, 0));
    } else if (period === 'previous-month') {
        startDate = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        endDate = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (period === 'current-year') {
        startDate = localIsoDate(new Date(now.getFullYear(), 0, 1));
        endDate = localIsoDate(new Date(now.getFullYear(), 11, 31));
    } else if (period === 'previous-year') {
        const y = now.getFullYear() - 1;
        startDate = `${y}-01-01`;
        endDate = `${y}-12-31`;
    } else if (period === 'all') {
        ({ startDate, endDate } = getTransactionDateBounds());
    } else {
        startDate = document.getElementById('db-start-date').value || '1970-01-01';
        endDate = document.getElementById('db-end-date').value || '2099-12-31';
    }
    return { startDate, endDate };
}
function transactionMatchesSearch(t, searchQuery) {
    return transactionMatchesFuzzyQuery(t, searchQuery);
}

function getTransactionSubCategoryLabel(t) {
    return t.subCategory === '[Bez podkategorii]' ? 'Ogólne' : t.subCategory;
}

function transactionMatchesChartDrill(t, type, mainCategory, subCategoryLabel = null) {
    if (t.type !== type || t.mainCategory !== mainCategory) return false;
    if (!subCategoryLabel) return true;
    return getTransactionSubCategoryLabel(t) === subCategoryLabel;
}

function isDashboardChartTransactionLevel() {
    return Boolean(activeChartSubCategory && !isDashboardForecastPeriod());
}

function getChartTransactionLabel(t, usedLabels = null) {
    const used = usedLabels || new Set();
    let title = (t.note || '').trim();
    if (!title) {
        title = t.subCategory && t.subCategory !== '[Bez podkategorii]'
            ? t.subCategory
            : t.mainCategory;
    }
    if (title.length > 32) title = `${title.slice(0, 30)}…`;
    const dateShort = typeof formatTxDate === 'function'
        ? formatTxDate(t.date).replace(/\s+\d{4}$/, '').trim()
        : t.date;
    let label = `${dateShort} · ${title}`;
    let candidate = label;
    let n = 2;
    while (used.has(candidate)) {
        candidate = `${label} (${n})`;
        n += 1;
    }
    used.add(candidate);
    return candidate;
}

function getDashboardChartTransactionSums(transactions, maxSlices = CHART_DRILL_TX_MAX_SLICES) {
    const sorted = [...transactions].sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        return String(b.note || '').localeCompare(String(a.note || ''), 'pl');
    });

    if (!sorted.length) return { sums: {}, truncated: false, totalCount: 0 };

    if (sorted.length <= maxSlices) {
        const sums = {};
        const used = new Set();
        sorted.forEach((t) => {
            sums[getChartTransactionLabel(t, used)] = t.amount;
        });
        return { sums, truncated: false, totalCount: sorted.length };
    }

    const sums = {};
    const used = new Set();
    sorted.slice(0, maxSlices - 1).forEach((t) => {
        sums[getChartTransactionLabel(t, used)] = t.amount;
    });
    sums.Pozostałe = sorted.slice(maxSlices - 1).reduce((sum, t) => sum + t.amount, 0);
    return { sums, truncated: true, totalCount: sorted.length };
}

function isChartMainCategoryVisible(name) {
    return !chartHiddenMainCategories[name];
}

function isChartSubCategoryVisible(mainCategory, subLabel) {
    const hidden = chartHiddenSubCategories[mainCategory];
    return !hidden || !hidden[subLabel];
}

function applyChartViewFilterToSums(sums) {
    if (isDashboardChartTransactionLevel()) return sums;
    const filtered = {};
    if (!activeChartCategory) {
        Object.keys(sums).forEach((label) => {
            if (isChartMainCategoryVisible(label)) filtered[label] = sums[label];
        });
        return filtered;
    }
    if (!activeChartSubCategory) {
        Object.keys(sums).forEach((label) => {
            if (isChartSubCategoryVisible(activeChartCategory, label)) filtered[label] = sums[label];
        });
        return filtered;
    }
    return sums;
}

function isChartViewFilterActive(level, labels, mainCategory = null) {
    if (!labels.length) return false;
    const visibleCount = labels.filter((label) => (
        level === 'main'
            ? isChartMainCategoryVisible(label)
            : isChartSubCategoryVisible(mainCategory, label)
    )).length;
    return visibleCount > 0 && visibleCount < labels.length;
}

function getChartViewFilterLevel() {
    if (isDashboardChartTransactionLevel()) return null;
    if (!activeChartCategory) return 'main';
    if (!activeChartSubCategory) return 'sub';
    return null;
}

function toggleChartMainCategoryVisibility(name) {
    if (chartHiddenMainCategories[name]) {
        delete chartHiddenMainCategories[name];
    } else {
        chartHiddenMainCategories[name] = true;
    }
    renderDashboard();
}

function toggleChartSubCategoryVisibility(mainCategory, subLabel) {
    if (!chartHiddenSubCategories[mainCategory]) {
        chartHiddenSubCategories[mainCategory] = {};
    }
    if (chartHiddenSubCategories[mainCategory][subLabel]) {
        delete chartHiddenSubCategories[mainCategory][subLabel];
        if (!Object.keys(chartHiddenSubCategories[mainCategory]).length) {
            delete chartHiddenSubCategories[mainCategory];
        }
    } else {
        chartHiddenSubCategories[mainCategory][subLabel] = true;
    }
    renderDashboard();
}

function restoreChartViewFilterDefault() {
    setAllChartViewFilterVisible(true);
}

function setAllChartViewFilterVisible(visible) {
    const level = getChartViewFilterLevel();
    if (!level) return;
    const chipsEl = document.getElementById('chart-view-filter-chips');
    if (!chipsEl) return;
    const labels = [...chipsEl.querySelectorAll('[data-label]')].map((btn) => btn.dataset.label);
    if (!labels.length) return;
    if (level === 'main') {
        if (visible) {
            labels.forEach((label) => { delete chartHiddenMainCategories[label]; });
        } else {
            labels.forEach((label) => { chartHiddenMainCategories[label] = true; });
        }
    } else {
        const mainCategory = activeChartCategory;
        if (!mainCategory) return;
        if (visible) {
            delete chartHiddenSubCategories[mainCategory];
        } else {
            chartHiddenSubCategories[mainCategory] = {};
            labels.forEach((label) => { chartHiddenSubCategories[mainCategory][label] = true; });
        }
    }
    renderDashboard();
}

function toggleChartViewFilter() {
    chartViewFilterExpanded = !chartViewFilterExpanded;
    const panel = document.getElementById('chart-view-filter-panel');
    const toggle = document.querySelector('#chart-view-filter-block .chart-view-filter-toggle');
    if (panel) panel.classList.toggle('hidden', !chartViewFilterExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', chartViewFilterExpanded ? 'true' : 'false');
}

function renderChartViewFilter(rawSums) {
    const block = document.getElementById('chart-view-filter-block');
    const chipsEl = document.getElementById('chart-view-filter-chips');
    const hintEl = document.getElementById('chart-view-filter-hint');
    const restoreBtn = document.getElementById('chart-view-filter-restore');
    const panel = document.getElementById('chart-view-filter-panel');
    const toggle = document.querySelector('#chart-view-filter-block .chart-view-filter-toggle');
    if (!block || !chipsEl) return;

    const level = getChartViewFilterLevel();
    const labels = Object.keys(rawSums)
        .sort((a, b) => (rawSums[b] || 0) - (rawSums[a] || 0));

    if (!level || labels.length < 2) {
        block.classList.add('hidden');
        chipsEl.innerHTML = '';
        if (hintEl) hintEl.classList.add('hidden');
        return;
    }

    block.classList.remove('hidden');
    if (panel) panel.classList.toggle('hidden', !chartViewFilterExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', chartViewFilterExpanded ? 'true' : 'false');

    chipsEl.innerHTML = labels.map((label) => {
        const visible = level === 'main'
            ? isChartMainCategoryVisible(label)
            : isChartSubCategoryVisible(activeChartCategory, label);
        const safeLabel = escapeHtml(label);
        const dataLabel = label.replace(/"/g, '&quot;');
        return `<button type="button" class="toggle-btn loans-chip${visible ? ' active' : ''}" data-label="${dataLabel}" data-filter-level="${level}" aria-pressed="${visible ? 'true' : 'false'}">${safeLabel}</button>`;
    }).join('');

    if (!chipsEl.dataset.filterBound) {
        chipsEl.dataset.filterBound = '1';
        chipsEl.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-label]');
            if (!btn) return;
            const label = btn.dataset.label;
            if (btn.dataset.filterLevel === 'main') {
                toggleChartMainCategoryVisibility(label);
            } else {
                toggleChartSubCategoryVisibility(activeChartCategory, label);
            }
        });
    }

    if (hintEl) {
        const visibleCount = labels.filter((label) => (
            level === 'main'
                ? isChartMainCategoryVisible(label)
                : isChartSubCategoryVisible(activeChartCategory, label)
        )).length;
        const filterActive = isChartViewFilterActive(level, labels, activeChartCategory);
        if (filterActive) {
            const unit = level === 'main' ? 'kategorii' : 'podkategorii';
            hintEl.textContent = `W wykresie: ${visibleCount} z ${labels.length} ${unit}`;
            hintEl.classList.remove('hidden');
        } else {
            hintEl.classList.add('hidden');
        }
        if (restoreBtn) restoreBtn.classList.toggle('hidden', !filterActive);
    } else if (restoreBtn) {
        restoreBtn.classList.add('hidden');
    }
}

function resetChartViewFilters() {
    chartHiddenMainCategories = {};
    chartHiddenSubCategories = {};
    chartViewFilterExpanded = false;
}

function computeDashboardChartSums(chartTx, forecastMode) {
    if (forecastMode) {
        return {
            sums: getDashboardForecastCategorySums(chartViewType, activeChartCategory || null),
            truncated: false
        };
    }
    if (!activeChartCategory) {
        const sums = {};
        chartTx.forEach((t) => {
            sums[t.mainCategory] = (sums[t.mainCategory] || 0) + t.amount;
        });
        return { sums, truncated: false };
    }
    if (activeChartSubCategory) {
        const drillTx = chartTx.filter((t) => transactionMatchesChartDrill(
            t,
            chartViewType,
            activeChartCategory,
            activeChartSubCategory
        ));
        const { sums, truncated } = getDashboardChartTransactionSums(drillTx);
        return { sums, truncated };
    }
    const sums = {};
    chartTx.filter((t) => t.mainCategory === activeChartCategory).forEach((t) => {
        const label = getTransactionSubCategoryLabel(t);
        sums[label] = (sums[label] || 0) + t.amount;
    });
    return { sums, truncated: false };
}

function buildDashboardChartSums(chartTx, forecastMode) {
    const { sums: rawSums, truncated } = computeDashboardChartSums(chartTx, forecastMode);
    return {
        sums: applyChartViewFilterToSums(rawSums),
        truncated,
        rawSums
    };
}

function formatLegendCategoryName(name) {
    return escapeHtml(String(name ?? ''))
        .replace(/\/(\s*)/g, '/<wbr>$1');
}

function renderChartLegend(catSums, sliceColors, labels) {
    const legendEl = document.getElementById('chart-legend');
    const centerEl = document.getElementById('chart-center-amount');
    const total = Object.values(catSums).reduce((sum, value) => sum + value, 0);

    if (centerEl) centerEl.textContent = formatPlnAmount(total);

    if (!labels.length) {
        legendEl.innerHTML = '';
        return;
    }

    const entries = labels
        .map((label, index) => ({
            label,
            amount: catSums[label],
            color: sliceColors[index],
            index
        }))
        .sort((a, b) => b.amount - a.amount);

    legendEl.innerHTML = entries.map(({ label, amount, color, index }) => {
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
        const txLevel = isDashboardChartTransactionLevel();
        const isDrillable = !txLevel && (!activeChartCategory || !activeChartSubCategory);
        const isActive = !txLevel && activeChartSubCategory === label;
        const classNames = [
            'chart-legend-item',
            isDrillable ? 'chart-legend-item--drill' : '',
            isActive ? 'chart-legend-item--active' : '',
            activeChartCategory && !isDrillable && !isActive && !txLevel ? 'chart-legend-item--selectable' : ''
        ].filter(Boolean).join(' ');
        const tag = isDrillable ? 'button' : 'div';
        const attrs = isDrillable
            ? ` type="button" data-index="${index}" data-label="${label.replace(/"/g, '&quot;')}"`
            : '';
        return `<${tag} class="${classNames}"${attrs}>
            <span class="chart-legend-swatch" style="background:${color}"></span>
            <span class="chart-legend-text">
                <span class="chart-legend-name">${formatLegendCategoryName(label)}</span>
                <span class="chart-legend-amount">${formatPlnAmount(amount)}</span>
            </span>
            <span class="chart-legend-pct">${pct}%</span>
        </${tag}>`;
    }).join('');

    legendEl.querySelectorAll('.chart-legend-item--drill').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!activeChartCategory) {
                activeChartCategory = btn.dataset.label;
                activeChartSubCategory = null;
                renderDashboard();
                return;
            }
            const label = btn.dataset.label;
            activeChartSubCategory = activeChartSubCategory === label ? null : label;
            renderDashboard();
        });
    });
}

function resetDashboardChart() {
    activeChartCategory = null;
    activeChartSubCategory = null;
    renderDashboard();
}

function setChartViewType(type) {
    if (chartViewType === type) return;
    chartViewType = type;
    activeChartCategory = null;
    activeChartSubCategory = null;
    resetChartViewFilters();
    renderDashboard();
}

function formatDashboardPeriodLabel() {
    const period = document.getElementById('dashboard-period-select').value;
    const now = new Date();
    if (period === 'current-month') {
        const label = now.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (period === 'next-month') {
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const label = next.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return `${label.charAt(0).toUpperCase() + label.slice(1)} · prognoza`;
    }
    if (period === 'previous-month') {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const label = prev.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (period === 'current-year') {
        return String(now.getFullYear());
    }
    if (period === 'previous-year') {
        return String(now.getFullYear() - 1);
    }
    if (period === 'all') {
        return 'Wszystko';
    }
    const { startDate, endDate } = getDashboardDates();
    return `${startDate} – ${endDate}`;
}

function formatDueLabel(days) {
    if (days === null) return '';
    if (days === 0) return 'dzisiaj';
    if (days === 1) return 'jutro';
    if (days < 0) return `${Math.abs(days)} dni temu`;
    return `za ${days} dni`;
}

function formatDashboardInstallmentsTitle() {
    const period = document.getElementById('dashboard-period-select')?.value;
    if (period === 'current-month') return 'Raty w tym miesiącu';
    if (period === 'next-month') return 'Raty w następnym miesiącu';
    if (period === 'previous-month') return 'Raty w poprzednim miesiącu';
    if (period === 'current-year') return 'Raty w bieżącym roku';
    if (period === 'previous-year') return 'Raty w poprzednim roku';
    if (period === 'all') return 'Raty (wszystkie terminy)';
    const { startDate, endDate } = getDashboardDates();
    if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
        const [year, month] = startDate.split('-').map(Number);
        const label = new Date(year, month - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return `Raty — ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    }
    return 'Raty w wybranym okresie';
}

function renderUpcomingLoanInstallments() {
    const section = document.getElementById('dashboard-upcoming-loans');
    const list = document.getElementById('dashboard-upcoming-loans-list');
    const summaryEl = document.getElementById('dashboard-upcoming-loans-summary');
    const titleEl = document.getElementById('dashboard-upcoming-loans-title');
    if (!section || !list) return;

    if (!hasScheduledLoanInstallments()) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    if (titleEl) titleEl.textContent = formatDashboardInstallmentsTitle();

    const { startDate, endDate } = getDashboardDates();
    const loanRows = typeof collectDebtInstallmentRows === 'function'
        ? collectDebtInstallmentRows({ startDate, endDate }).filter((row) => row.kind === 'loan')
        : getUpcomingLoanInstallments({ startDate, endDate }).map((loan) => ({
            id: loan.id,
            name: getLoanDisplayName(loan),
            amount: loan.nextInstallmentAmount,
            scheduledAmount: loan.nextInstallmentAmount,
            paidAmount: typeof sumLoanInstallmentPaymentsForLoanInRange === 'function'
                ? sumLoanInstallmentPaymentsForLoanInRange(loan, startDate, endDate)
                : (typeof sumLoanPaymentsForLoanInRange === 'function'
                    ? sumLoanPaymentsForLoanInRange(loan, startDate, endDate)
                    : 0),
            sortKey: loan.nextInstallmentDue || '9999-99-99'
        }));
    const installmentSummary = typeof getDebtInstallmentRemainingSummary === 'function'
        ? getDebtInstallmentRemainingSummary(startDate, endDate, { loansOnly: true })
        : null;

    if (summaryEl && installmentSummary) {
        summaryEl.classList.remove('hidden');
        summaryEl.innerHTML = `<div class="dashboard-installments-summary-grid">
            <span class="label">Pozostało do spłaty w tym miesiącu</span>
            <strong class="expense">${formatPlnAmount(installmentSummary.remaining)}</strong>
        </div>`;
    } else if (summaryEl) {
        summaryEl.classList.add('hidden');
        summaryEl.innerHTML = '';
    }

    const emptyLabel = isDashboardForecastPeriod()
        ? 'Brak zaplanowanych rat w następnym miesiącu.'
        : 'W tym okresie wszystko spłacone.';
    if (!loanRows.length) {
        list.innerHTML = `<p class="upcoming-loans-empty">${emptyLabel}</p>`;
        return;
    }

    list.innerHTML = loanRows.map((row) => {
        const due = row.sortKey && !row.sortKey.startsWith('9999') ? row.sortKey : '';
        const days = daysUntilDate(due);
        const overdue = days !== null && days < 0;
        const dueLabel = formatDueLabel(days);
        const paidNote = row.paidAmount > 0 ? ` · zapłacono ${formatPlnAmount(row.paidAmount)}` : '';
        return `<div class="dashboard-action-row${overdue ? ' dashboard-action-row--overdue' : ''}">
            <div class="dashboard-action-info">
                <strong class="dashboard-action-name">${escapeHtml(row.name)}</strong>
                <span class="dashboard-action-meta">${formatPlnAmount(row.amount)} · ${due ? formatTxDate(due) : '—'}${dueLabel ? ` · ${dueLabel}` : ''}${paidNote}</span>
            </div>
            <button type="button" class="dashboard-quick-action-btn" onclick="payLoanInstallment('${escapeHtml(row.id)}')">Zapłać</button>
        </div>`;
    }).join('');
}

function formatDashboardSnapshotMonthLabel(monthKey) {
    if (!monthKey) return '';
    const [y, m] = monthKey.split('-').map(Number);
    if (!y || !m) return '';
    const label = new Date(y, m - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildDashboardWealthChangeHtml(monthChange) {
    if (!monthChange) return '';
    const changeClass = monthChange.netWorth >= 0 ? 'snapshot-delta-positive' : 'snapshot-delta-negative';
    const delta = monthChange.pctNet != null
        ? formatSnapshotDelta(monthChange.netWorth, monthChange.pctNet)
        : formatSnapshotDelta(monthChange.netWorth);
    const prevLabel = formatDashboardSnapshotMonthLabel(monthChange.prevMonthKey);
    const hint = prevLabel
        ? `Zmiana ${NET_WORTH_LABEL.toLowerCase()} vs ${prevLabel}`
        : `Zmiana ${NET_WORTH_LABEL.toLowerCase()} vs poprzedni miesiąc`;
    return `<div class="dashboard-wealth-change">
        <span class="dashboard-wealth-change-label">${hint}</span>
        <strong class="dashboard-wealth-change-value ${changeClass}">${delta}</strong>
    </div>`;
}

function renderDashboardWealth() {
    const section = document.getElementById('dashboard-wealth');
    const el = document.getElementById('dashboard-wealth-content');
    if (!section || !el || typeof getPortfolioValuePln !== 'function') return;

    const assets = getPortfolioValuePln();
    if (!assets && !getLoanSummaryTotal()) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');

    const debt = typeof getLoanSummaryTotal === 'function' ? getLoanSummaryTotal() : 0;
    const net = assets - debt;
    const monthChange = typeof getSnapshotMonthChange === 'function' ? getSnapshotMonthChange() : null;
    const operational = typeof getOperationalCashPln === 'function' ? getOperationalCashPln() : 0;
    const changeHtml = buildDashboardWealthChangeHtml(monthChange);

    el.innerHTML = `
        <div class="dashboard-wealth-grid">
            <div><span class="label">Majątek</span><strong class="income">${formatPlnAmount(assets)}</strong></div>
            <div><span class="label">${NET_WORTH_LABEL}</span><strong style="color:${net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatPlnAmount(net)}</strong></div>
            <div><span class="label">Gotówka oper.</span><strong>${formatPlnAmount(operational)}</strong></div>
            <div><span class="label">Zobowiązania</span><strong class="expense">${formatPlnAmount(debt)}</strong></div>
        </div>
        ${changeHtml}`;
}

function renderDashboard() {
    if (typeof renderDashboardTasksPanel === 'function') renderDashboardTasksPanel();
    renderUpcomingLoanInstallments();
    renderDashboardCreditCards();
    renderDashboardWealth();
    if (typeof renderMonthCloseBanners === 'function') renderMonthCloseBanners();
    updateDashboardPeriodResetVisibility();
    const forecastMode = isDashboardForecastPeriod();
    const { startDate, endDate } = getDashboardDates();
    const searchQuery = document.getElementById('db-search').value.toLowerCase().trim();
    const dateFilteredTx = appState.transactions.filter(t => t.date >= startDate && t.date <= endDate);

    let totalIncomes;
    let totalExpenses;
    if (forecastMode) {
        const forecast = getDashboardForecastTotals();
        totalIncomes = forecast.income;
        totalExpenses = forecast.expense;
    } else {
        totalIncomes = dateFilteredTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        totalExpenses = dateFilteredTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    }
    const netBalance = totalIncomes - totalExpenses;

    document.getElementById('db-period-label').innerText = formatDashboardPeriodLabel();
    document.getElementById('db-total-incomes').innerText = `${totalIncomes.toFixed(2)} zł`;
    document.getElementById('db-total-expenses').innerText = `${totalExpenses.toFixed(2)} zł`;
    document.getElementById('db-incomes-label').textContent = forecastMode ? 'Wpływy (prognoza)' : 'Wpływy';
    document.getElementById('db-expenses-label').textContent = forecastMode ? 'Wydatki (prognoza)' : 'Wydatki';
    document.getElementById('db-forecast-hint')?.classList.toggle('hidden', !forecastMode);
    const netEl = document.getElementById('db-net-balance');
    netEl.innerText = `${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)} zł`;
    netEl.style.color = netBalance >= 0 ? '#6ee7b7' : '#fca5a5';

    const fillEl = document.getElementById('budget-progress-fill');
    if (totalIncomes > 0) {
        const pct = Math.min((totalExpenses / totalIncomes) * 100, 100);
        fillEl.style.width = `${pct}%`;
        fillEl.style.background = pct >= 100 ? 'var(--danger)' : 'var(--accent)';
    } else {
        fillEl.style.width = totalExpenses > 0 ? '100%' : '0%';
        fillEl.style.background = 'var(--danger)';
    }

    let listTx = dateFilteredTx;
    const searchHint = document.getElementById('db-search-hint');
    if (searchHint) {
        searchHint.classList.toggle('visible', !!searchQuery);
        if (searchQuery) {
            const archivedCount = typeof getArchivedTransactions === 'function'
                ? getArchivedTransactions().length
                : 0;
            searchHint.textContent = archivedCount
                ? 'Przeszukiwanie aktywnych i archiwum lokalnego'
                : 'Przeszukiwanie wszystkich transakcji';
        }
    }

    if (searchQuery) {
        const searchSource = typeof getMergedTransactions === 'function'
            ? getMergedTransactions()
            : appState.transactions;
        listTx = searchSource.filter((t) => transactionMatchesSearch(t, searchQuery));
    } else if (activeChartCategory) {
        listTx = listTx.filter((t) => transactionMatchesChartDrill(
            t,
            chartViewType,
            activeChartCategory,
            activeChartSubCategory
        ));
    }
    dashboardCurrentListTx = listTx;
    updateDashboardSelectionUi(forecastMode, searchQuery);

    const chartTx = dateFilteredTx.filter(t => t.type === chartViewType);
    const chartTypeLabel = chartViewType === 'income' ? 'wpływów' : 'wydatków';
    const chartTypeSuffix = forecastMode ? ' (prognoza)' : '';
    document.getElementById('btn-reset-chart').style.display = activeChartCategory ? 'block' : 'none';
    const txChartLevel = isDashboardChartTransactionLevel();
    const chartTitleEl = document.getElementById('chart-title');
    if (chartTitleEl) {
        if (txChartLevel) {
            chartTitleEl.innerText = `Transakcje: ${activeChartCategory} › ${activeChartSubCategory}${chartTypeSuffix}`;
        } else if (activeChartSubCategory) {
            chartTitleEl.innerText = `Struktura: ${activeChartCategory} › ${activeChartSubCategory}${chartTypeSuffix}`;
        } else if (activeChartCategory) {
            chartTitleEl.innerText = `Struktura: ${activeChartCategory}${chartTypeSuffix}`;
        } else {
            chartTitleEl.innerText = `Struktura ${chartTypeLabel}${chartTypeSuffix}`;
        }
    }
    document.getElementById('btn-chart-expense').classList.toggle('active', chartViewType === 'expense');
    document.getElementById('btn-chart-income').classList.toggle('active', chartViewType === 'income');

    const { sums: catSums, truncated: chartDrillTruncated, rawSums: chartRawSums } = buildDashboardChartSums(chartTx, forecastMode);
    renderChartViewFilter(chartRawSums);
    const filterLevel = getChartViewFilterLevel();
    const filterLabels = filterLevel ? Object.keys(chartRawSums) : [];
    const filterActive = filterLevel && isChartViewFilterActive(filterLevel, filterLabels, activeChartCategory);
    const centerSubEl = document.querySelector('.chart-center-sub');
    if (centerSubEl) {
        if (txChartLevel && chartDrillTruncated) {
            centerSubEl.textContent = 'top wpisów';
        } else if (filterActive) {
            const visibleCount = filterLabels.filter((label) => (
                filterLevel === 'main'
                    ? isChartMainCategoryVisible(label)
                    : isChartSubCategoryVisible(activeChartCategory, label)
            )).length;
            centerSubEl.textContent = `${visibleCount}/${filterLabels.length} w widoku`;
        } else {
            centerSubEl.textContent = 'razem';
        }
    }

    const ctxDash = document.getElementById('dashboardChart').getContext('2d');
    if (dashboardChartInstance) dashboardChartInstance.destroy();

    if (Object.keys(catSums).length > 0) {
        const chartLabels = Object.keys(catSums);
        const sliceColors = getChartSliceColors(chartLabels);
        const borderColor = getChartBorderColor();

        dashboardChartInstance = new Chart(ctxDash, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: Object.values(catSums),
                    backgroundColor: sliceColors,
                    borderColor: borderColor,
                    borderWidth: 3,
                    borderRadius: 5,
                    spacing: 2,
                    hoverOffset: 10,
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                cutout: '58%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)',
                        titleFont: { family: 'DM Sans', weight: '700' },
                        bodyFont: { family: 'DM Sans', weight: '600' },
                        padding: 12,
                        cornerRadius: 10
                    }
                },
                onClick: (event, elements, chart) => {
                    if (!elements[0]) return;
                    if (isDashboardChartTransactionLevel()) return;
                    const label = chart.data.labels[elements[0].index];
                    if (!activeChartCategory) {
                        activeChartCategory = label;
                        activeChartSubCategory = null;
                    } else {
                        activeChartSubCategory = activeChartSubCategory === label ? null : label;
                    }
                    renderDashboard();
                }
            }
        });
        renderChartLegend(catSums, sliceColors, chartLabels);
    } else {
        document.getElementById('chart-legend').innerHTML = '';
        const centerEl = document.getElementById('chart-center-amount');
        if (centerEl) centerEl.textContent = formatPlnAmount(0);
    }

    const txTitleEl = document.getElementById('dashboard-tx-title');
    const txHintEl = document.getElementById('dashboard-tx-list-hint');
    if (txTitleEl) {
        if (forecastMode && !searchQuery) {
            txTitleEl.textContent = 'Plan na następny miesiąc';
        } else if (!searchQuery && activeChartSubCategory) {
            txTitleEl.textContent = `Transakcje — ${activeChartSubCategory}`;
        } else if (!searchQuery && activeChartCategory) {
            txTitleEl.textContent = `Transakcje — ${activeChartCategory}`;
        } else {
            txTitleEl.textContent = 'Transakcje';
        }
    }
    if (txHintEl) txHintEl.classList.toggle('hidden', forecastMode && !searchQuery);

    const list = document.getElementById('recent-transactions-list');
    list.innerHTML = '';

    if (forecastMode && !searchQuery) {
        renderDashboardForecastPlan(
            list,
            startDate,
            endDate,
            activeChartCategory || null,
            chartViewType,
            activeChartSubCategory || null
        );
        const moreBtn = document.getElementById('dashboard-tx-show-more');
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }

    if (listTx.length === 0) {
        list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg><p>${searchQuery ? 'Brak wyników wyszukiwania' : 'Brak transakcji w tym okresie'}</p></div>`;
        const moreBtn = document.getElementById('dashboard-tx-show-more');
        if (moreBtn) moreBtn.classList.add('hidden');
        return;
    }

    const signature = getDashboardTxListSignature(listTx, searchQuery);
    if (signature !== dashboardTxListSignature) {
        dashboardTxListSignature = signature;
        dashboardTxVisibleCount = LIST_PAGE_SIZE;
    }

    const visibleTx = listTx.slice(0, dashboardTxVisibleCount);
    let lastGroup = '';
    visibleTx.forEach(t => {
        const group = formatDateGroup(t.date);
        if (group !== lastGroup) {
            const label = document.createElement('div');
            label.className = 'tx-group-label';
            label.textContent = group;
            list.appendChild(label);
            lastGroup = group;
        }

        const globalIndex = appState.transactions.indexOf(t);
        const fromArchive = typeof isTransactionArchived === 'function' && isTransactionArchived(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
        const isCard = t.creditCardId ? '<span class="tx-badge tx-badge--card" title="Karta kredytowa">&#128179;</span>' : '';
        const archiveBadge = fromArchive && typeof formatArchivedTransactionBadge === 'function'
            ? formatArchivedTransactionBadge()
            : '';
        const isPlanned = typeof isPlannedTransaction === 'function' && isPlannedTransaction(t);
        const plannedBadge = isPlanned && typeof formatPlannedTransactionBadge === 'function'
            ? formatPlannedTransactionBadge()
            : '';
        const metaText = searchQuery ? `${formatTxDate(t.date)} · ${t.mainCategory}` : t.mainCategory;
        const fp = typeof transactionFingerprint === 'function' ? transactionFingerprint(t) : '';
        const isSelected = dashboardSelectionActive && fp && dashboardSelectedFingerprints.has(fp);
        const row = document.createElement('div');
        row.className = fromArchive ? 'tx-row tx-row--archive' : 'tx-row';
        if (dashboardSelectionActive) {
            row.classList.add('tx-row--selectable');
            if (isSelected) row.classList.add('tx-row--selected');
        }
        const checkboxHtml = dashboardSelectionActive
            ? `<label class="tx-row-select" onclick="event.stopPropagation()"><input type="checkbox" class="tx-row-checkbox" data-tx-fp="${escapeHtml(fp)}" ${isSelected ? 'checked' : ''} aria-label="Zaznacz transakcję"></label>`
            : '';
        row.innerHTML = `
            ${checkboxHtml}
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)}
            <div class="tx-info">
                <div class="tx-title">${title}${isRec}${isCard}${archiveBadge}${plannedBadge}</div>
                <div class="tx-meta">${metaText}</div>
                ${t.note ? `<div class="tx-note">${t.note}</div>` : ''}
            </div>
            <div class="tx-amount-col">
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>
            ${dashboardSelectionActive || fromArchive ? '' : '<span class="tx-chevron" aria-hidden="true">›</span>'}`;
        if (dashboardSelectionActive && fp) {
            const checkbox = row.querySelector('.tx-row-checkbox');
            checkbox?.addEventListener('change', (e) => {
                e.stopPropagation();
                toggleDashboardTxSelection(fp, checkbox.checked);
            });
            row.addEventListener('click', () => {
                toggleDashboardTxSelection(fp, !dashboardSelectedFingerprints.has(fp));
            });
        } else if (globalIndex >= 0) {
            row.addEventListener('click', () => openTransactionDetails(globalIndex));
        }
        list.appendChild(row);
    });

    const moreBtn = getOrCreateShowMoreButton('dashboard-tx-show-more', showMoreDashboardTransactions);
    updateShowMoreButton(moreBtn, listTx.length, visibleTx.length, list.parentElement, list);
}
