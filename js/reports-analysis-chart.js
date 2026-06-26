/* Analiza — wykres struktury (donut + drill-down jak Pulpit) */

let reportsStructureChartInstance = null;
let reportsStructureViewType = 'expense';
let reportsStructureMainCategory = null;
let reportsStructureSubCategory = null;
let reportsStructureTxExpanded = false;

function isReportsStructureTransactionLevel() {
    return Boolean(reportsStructureSubCategory);
}

function computeReportsStructureSums(chartTx) {
    if (!reportsStructureMainCategory) {
        const sums = {};
        chartTx.forEach((t) => {
            sums[t.mainCategory] = (sums[t.mainCategory] || 0) + t.amount;
        });
        return { sums, truncated: false };
    }
    if (reportsStructureSubCategory) {
        const drillTx = chartTx.filter((t) => transactionMatchesChartDrill(
            t,
            reportsStructureViewType,
            reportsStructureMainCategory,
            reportsStructureSubCategory
        ));
        return getDashboardChartTransactionSums(drillTx);
    }
    const sums = {};
    chartTx.filter((t) => t.mainCategory === reportsStructureMainCategory).forEach((t) => {
        const label = getTransactionSubCategoryLabel(t);
        sums[label] = (sums[label] || 0) + t.amount;
    });
    return { sums, truncated: false };
}

function getReportsStructureChartTitle() {
    const chartTypeLabel = reportsStructureViewType === 'income' ? 'wpływów' : 'wydatków';
    if (isReportsStructureTransactionLevel()) {
        return `Transakcje: ${reportsStructureMainCategory} › ${reportsStructureSubCategory}`;
    }
    if (reportsStructureSubCategory) {
        return `Struktura: ${reportsStructureMainCategory} › ${reportsStructureSubCategory}`;
    }
    if (reportsStructureMainCategory) {
        return `Struktura: ${reportsStructureMainCategory}`;
    }
    return `Struktura ${chartTypeLabel}`;
}

function renderReportsStructureLegend(catSums, sliceColors, labels) {
    const legendEl = document.getElementById('reports-structure-legend');
    const centerEl = document.getElementById('reports-structure-center-amount');
    const centerSubEl = document.getElementById('reports-structure-center-sub');
    if (!legendEl) return;

    const total = Object.values(catSums).reduce((sum, value) => sum + value, 0);
    if (centerEl) centerEl.textContent = formatPlnAmount(total);
    if (centerSubEl) {
        centerSubEl.textContent = isReportsStructureTransactionLevel() ? 'top wpisów' : 'razem';
    }

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
        const txLevel = isReportsStructureTransactionLevel();
        const isDrillable = !txLevel && (!reportsStructureMainCategory || !reportsStructureSubCategory);
        const isActive = !txLevel && reportsStructureSubCategory === label;
        const classNames = [
            'chart-legend-item',
            isDrillable ? 'chart-legend-item--drill' : '',
            isActive ? 'chart-legend-item--active' : ''
        ].filter(Boolean).join(' ');
        const tag = isDrillable ? 'button' : 'div';
        const attrs = isDrillable
            ? ` type="button" data-index="${index}" data-label="${String(label).replace(/"/g, '&quot;')}"`
            : '';
        const nameHtml = typeof formatLegendCategoryName === 'function'
            ? formatLegendCategoryName(label)
            : escapeHtml(String(label ?? ''));
        return `<${tag} class="${classNames}"${attrs}>
            <span class="chart-legend-swatch" style="background:${color}"></span>
            <span class="chart-legend-text">
                <span class="chart-legend-name">${nameHtml}</span>
                <span class="chart-legend-amount">${formatPlnAmount(amount)}</span>
            </span>
            <span class="chart-legend-pct">${pct}%</span>
        </${tag}>`;
    }).join('');

    legendEl.querySelectorAll('.chart-legend-item--drill').forEach((btn) => {
        btn.addEventListener('click', () => drillReportsStructureCategory(btn.dataset.label));
    });
}

function drillReportsStructureCategory(label) {
    if (!reportsStructureMainCategory) {
        reportsStructureMainCategory = label;
        reportsStructureSubCategory = null;
    } else {
        reportsStructureSubCategory = reportsStructureSubCategory === label ? null : label;
    }
    reportsStructureTxExpanded = false;
    document.getElementById('reports-structure-tx-panel')?.classList.add('hidden');
    if (reportsLastCtx) renderReportsStructureChart(reportsLastCtx);
}

function resetReportsStructureChart() {
    reportsStructureMainCategory = null;
    reportsStructureSubCategory = null;
    reportsStructureTxExpanded = false;
    document.getElementById('reports-structure-tx-panel')?.classList.add('hidden');
    document.getElementById('reports-structure-tx-toggle')?.setAttribute('aria-expanded', 'false');
    if (reportsLastCtx) renderReportsStructureChart(reportsLastCtx);
}

function toggleReportsStructureTx() {
    const panel = document.getElementById('reports-structure-tx-panel');
    const toggle = document.getElementById('reports-structure-tx-toggle');
    if (!panel || !toggle) return;
    reportsStructureTxExpanded = !reportsStructureTxExpanded;
    panel.classList.toggle('hidden', !reportsStructureTxExpanded);
    toggle.setAttribute('aria-expanded', reportsStructureTxExpanded ? 'true' : 'false');
    if (reportsStructureTxExpanded && reportsLastCtx) {
        renderReportsStructureTransactions(reportsLastCtx);
    }
}

function getReportsStructureDrillTransactions(ctx) {
    if (!ctx || !reportsStructureMainCategory) return [];
    return ctx.periodTx
        .filter((t) => t.type === reportsStructureViewType)
        .filter((t) => transactionMatchesChartDrill(
            t,
            reportsStructureViewType,
            reportsStructureMainCategory,
            reportsStructureSubCategory
        ))
        .sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

function renderReportsStructureTransactions(ctx) {
    const block = document.getElementById('reports-structure-tx-block');
    const list = document.getElementById('reports-structure-tx-list');
    const toggle = document.getElementById('reports-structure-tx-toggle');
    if (!block || !list) return;

    const hasDrill = Boolean(reportsStructureMainCategory);
    block.classList.toggle('hidden', !hasDrill);
    if (!hasDrill) {
        reportsStructureTxExpanded = false;
        document.getElementById('reports-structure-tx-panel')?.classList.add('hidden');
        toggle?.setAttribute('aria-expanded', 'false');
        return;
    }

    const txs = getReportsStructureDrillTransactions(ctx);
    const countLabel = txs.length === 1 ? '1 transakcja' : `${txs.length} transakcji`;
    if (toggle) {
        toggle.querySelector('span').textContent = reportsStructureTxExpanded
            ? `Ukryj transakcje (${countLabel})`
            : `Pokaż transakcje (${countLabel})`;
    }
    if (reportsStructureTxExpanded) {
        list.innerHTML = typeof renderReportsTxListHtml === 'function'
            ? renderReportsTxListHtml(txs)
            : '<p class="reports-hint">Brak transakcji.</p>';
    }
}

function setReportsStructureViewType(type) {
    if (reportsStructureViewType === type) return;
    reportsStructureViewType = type;
    reportsStructureMainCategory = null;
    reportsStructureSubCategory = null;
    reportsStructureTxExpanded = false;
    if (reportsLastCtx) renderReportsStructureChart(reportsLastCtx);
}

function renderReportsStructureChart(ctx) {
    const canvas = document.getElementById('reportsStructureChart');
    if (!canvas || !ctx) return;

    const titleEl = document.getElementById('reports-structure-title');
    const resetBtn = document.getElementById('btn-reset-reports-structure');
    if (titleEl) titleEl.textContent = getReportsStructureChartTitle();
    if (resetBtn) resetBtn.classList.toggle('hidden', !reportsStructureMainCategory);

    document.getElementById('btn-reports-structure-expense')?.classList.toggle('active', reportsStructureViewType === 'expense');
    document.getElementById('btn-reports-structure-income')?.classList.toggle('active', reportsStructureViewType === 'income');

    const chartTx = ctx.periodTx.filter((t) => t.type === reportsStructureViewType);
    const { sums: catSums, truncated } = computeReportsStructureSums(chartTx);

    if (reportsStructureChartInstance) reportsStructureChartInstance.destroy();

    const centerSubEl = document.getElementById('reports-structure-center-sub');
    if (centerSubEl && truncated) centerSubEl.textContent = 'top wpisów';

    if (!Object.keys(catSums).length) {
        renderReportsStructureLegend({}, [], []);
        renderReportsStructureTransactions(ctx);
        return;
    }

    const chartLabels = Object.keys(catSums);
    const sliceColors = getChartSliceColors(chartLabels);
    const borderColor = getChartBorderColor();
    const chartCtx = canvas.getContext('2d');

    reportsStructureChartInstance = new Chart(chartCtx, {
        type: 'doughnut',
        data: {
            labels: chartLabels,
            datasets: [{
                data: Object.values(catSums),
                backgroundColor: sliceColors,
                borderColor,
                borderWidth: 3,
                borderRadius: 5,
                spacing: 2,
                hoverOffset: 10,
                hoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.35,
            cutout: '58%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)',
                    titleFont: { family: 'DM Sans', weight: '700' },
                    bodyFont: { family: 'DM Sans', weight: '600' },
                    padding: 12,
                    cornerRadius: 10,
                    callbacks: {
                        label: (context) => `${context.label}: ${formatPlnAmount(context.parsed)}`
                    }
                }
            },
            onClick: (_event, elements, chart) => {
                if (!elements[0]) return;
                if (isReportsStructureTransactionLevel()) return;
                drillReportsStructureCategory(chart.data.labels[elements[0].index]);
            }
        }
    });

    renderReportsStructureLegend(catSums, sliceColors, chartLabels);
    renderReportsStructureTransactions(ctx);
}
