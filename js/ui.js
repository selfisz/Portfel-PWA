function hapticFeedback() {
    if (navigator.vibrate) navigator.vibrate(12);
}

let appToastTimeout = null;
let undoToastCleanup = null;

function clearAppToastTimer() {
    if (appToastTimeout) {
        clearTimeout(appToastTimeout);
        appToastTimeout = null;
    }
}

function resetUndoToast() {
    if (undoToastCleanup) {
        undoToastCleanup();
        undoToastCleanup = null;
    }
}

function showAppToast(message, variant = 'success') {
    resetUndoToast();
    const toast = document.getElementById('settings-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden', 'settings-toast--success', 'settings-toast--error', 'settings-toast--default', 'settings-toast--undo');
    const variantClass = variant === 'error'
        ? 'settings-toast--error'
        : variant === 'default'
            ? 'settings-toast--default'
            : 'settings-toast--success';
    toast.classList.add(variantClass);
    clearAppToastTimer();
    appToastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
        appToastTimeout = null;
    }, variant === 'error' ? 3600 : 2800);
}

function showUndoToast(message, onUndo, durationMs = 5000) {
    resetUndoToast();
    clearAppToastTimer();
    const toast = document.getElementById('settings-toast');
    if (!toast || typeof onUndo !== 'function') return;

    toast.classList.remove('hidden', 'settings-toast--success', 'settings-toast--error', 'settings-toast--default');
    toast.classList.add('settings-toast--undo');
    toast.replaceChildren();

    const text = document.createElement('span');
    text.className = 'settings-toast-text';
    text.textContent = message;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-toast-undo';
    btn.textContent = 'Cofnij';

    const hide = () => {
        toast.classList.add('hidden');
        toast.replaceChildren();
        toast.classList.remove('settings-toast--undo');
        undoToastCleanup = null;
        clearAppToastTimer();
    };

    btn.addEventListener('click', () => {
        hide();
        onUndo();
    });

    toast.append(text, btn);
    undoToastCleanup = hide;
    appToastTimeout = setTimeout(hide, durationMs);
}

let printPreviewContext = null;

function openPrintPreview(bodyHtml, title = 'Podgląd', context = null) {
    const overlay = document.getElementById('reports-pdf-overlay');
    const content = document.getElementById('reports-pdf-content');
    const titleEl = document.getElementById('reports-pdf-title');
    if (!overlay || !content) return;
    printPreviewContext = context || null;
    if (titleEl) titleEl.textContent = title;
    content.innerHTML = bodyHtml;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    content.scrollTop = 0;
}

function closePrintPreview() {
    const overlay = document.getElementById('reports-pdf-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    printPreviewContext = null;
    document.body.style.overflow = '';
}

function notifyPrintPreviewExported() {
    const ctx = printPreviewContext;
    if (ctx?.source === 'tx-basket' && typeof promptClearTxBasketAfterPrint === 'function') {
        window.setTimeout(() => promptClearTxBasketAfterPrint(), 300);
    }
}

function isIosLikeClient() {
    return /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
}

function buildPrintDocumentHtml(title, bodyHtml) {
    const safeTitle = String(title || 'Raport').replace(/[<>&"]/g, '');
    return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>
        body { margin: 16px; background: #fff; color: #111; font-family: system-ui, -apple-system, sans-serif; font-size: 14px; line-height: 1.45; }
        .reports-pdf-title, .reports-pdf-section-title { margin: 0 0 8px; font-size: 1.25rem; font-weight: 700; color: #111; }
        .reports-pdf-summary, .reports-pdf-disclaimer { margin: 0 0 16px; font-size: 0.82rem; color: #333; line-height: 1.45; }
        .reports-pdf-table { width: 100%; border-collapse: collapse; }
        .reports-pdf-table th, .reports-pdf-table td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 0.72rem; vertical-align: top; color: #111; }
        .reports-pdf-table th { background: #f5f5f5; font-weight: 600; }
        .reports-pdf-chart-img { display: block; width: 100%; max-width: 100%; height: auto; max-height: 280px; object-fit: contain; margin: 8px 0 12px; }
        .reports-pdf-analysis-body .card, .reports-pdf-analysis-body .compare-overview-card,
        .reports-pdf-analysis-body .hero-card, .reports-pdf-analysis-body .dashboard-panel, .reports-pdf-analysis-body .chart-card {
            border: 1px solid #ddd; background: #fff; box-shadow: none; margin-bottom: 14px; padding: 12px;
        }
        .reports-pdf-analysis-body .hero-balance, .reports-pdf-analysis-body .compare-overview-delta,
        .reports-pdf-analysis-body .value, .reports-pdf-analysis-body strong { color: #111 !important; }
        @page { margin: 12mm; }
        @media print { body { margin: 0; } }
    </style></head><body>${bodyHtml}</body></html>`;
}

function triggerPrintOnWindow(win) {
    if (!win) return false;
    try {
        win.focus();
        win.print();
        return true;
    } catch (err) {
        console.warn('triggerPrintOnWindow', err);
        return false;
    }
}

function schedulePrintOnce(win, { doc = null, frame = null } = {}) {
    let printed = false;
    const run = () => {
        if (printed) return;
        printed = true;
        triggerPrintOnWindow(win);
    };
    if (doc?.readyState === 'complete') setTimeout(run, 150);
    else if (frame) frame.onload = () => setTimeout(run, 150);
    else win?.addEventListener?.('load', () => setTimeout(run, 200), { once: true });
    setTimeout(run, 500);
}

function printViaPopupWindow(html) {
    const win = window.open('about:blank', '_blank');
    if (!win) return false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    schedulePrintOnce(win, { doc: win.document });
    return true;
}

function printViaHiddenFrame(html) {
    let frame = document.getElementById('reports-pdf-print-frame');
    if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'reports-pdf-print-frame';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-1';
        document.body.appendChild(frame);
    }
    const win = frame.contentWindow;
    const doc = frame.contentDocument || win?.document;
    if (!doc || !win) return false;
    doc.open();
    doc.write(html);
    doc.close();
    schedulePrintOnce(win, { doc, frame });
    return true;
}

async function sharePrintPreviewHtml(html, title = 'Raport') {
    if (!navigator.share) return false;
    try {
        const file = new File([html], 'raport-finanse.html', { type: 'text/html;charset=utf-8' });
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title, files: [file] });
            return true;
        }
        await navigator.share({ title, text: title });
        return true;
    } catch (err) {
        if (err?.name === 'AbortError') return true;
        console.warn('sharePrintPreviewHtml', err);
        return false;
    }
}

function runPrintPreviewExport(html, title) {
    if (isIosLikeClient()) {
        if (printViaPopupWindow(html)) {
            showAppToast('Wybierz Drukuj lub Zapisz jako PDF', 'default');
            notifyPrintPreviewExported();
            return;
        }
        sharePrintPreviewHtml(html, title).then((shared) => {
            if (shared) {
                notifyPrintPreviewExported();
                return;
            }
            if (printViaHiddenFrame(html)) {
                notifyPrintPreviewExported();
                return;
            }
            showAppToast('Nie udało się otworzyć druku — spróbuj ponownie', 'error');
        });
        return;
    }
    if (printViaHiddenFrame(html)) {
        notifyPrintPreviewExported();
        return;
    }
    if (printViaPopupWindow(html)) {
        notifyPrintPreviewExported();
        return;
    }
    showAppToast('Nie udało się otworzyć druku', 'error');
}

function printPrintPreview() {
    const content = document.getElementById('reports-pdf-content');
    if (!content || !content.innerHTML.trim()) {
        showAppToast('Brak treści do druku', 'error');
        return;
    }

    const title = document.getElementById('reports-pdf-title')?.textContent || 'Raport';
    const html = buildPrintDocumentHtml(title, content.innerHTML);
    const startPrint = () => runPrintPreviewExport(html, title);

    const images = [...content.querySelectorAll('img')];
    const pending = images.filter((img) => !img.complete);
    if (!pending.length) {
        startPrint();
        return;
    }

    let settled = 0;
    const onImageSettled = () => {
        settled += 1;
        if (settled >= pending.length) startPrint();
    };

    pending.forEach((img) => {
        img.addEventListener('load', onImageSettled, { once: true });
        img.addEventListener('error', onImageSettled, { once: true });
    });
    setTimeout(startPrint, 3000);
}

function clearAddFormError() {
    const el = document.getElementById('add-form-error');
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
}

function showAddFormError(message) {
    const el = document.getElementById('add-form-error');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function cloneCloseIcon() {
    const tpl = document.getElementById('tpl-icon-close');
    return tpl ? tpl.content.firstElementChild.cloneNode(true) : null;
}

function createCloseIconButton(onClose, ariaLabel = 'Zamknij') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon';
    btn.setAttribute('aria-label', ariaLabel);
    btn.addEventListener('click', onClose);
    const icon = cloneCloseIcon();
    if (icon) btn.appendChild(icon);
    return btn;
}

function createPanelHeader(title, options = {}) {
    const header = document.createElement('div');
    header.className = ['settings-header', options.headerClass].filter(Boolean).join(' ');

    const heading = document.createElement('h2');
    heading.className = options.titleClass || 'overlay-title';
    if (options.titleId) heading.id = options.titleId;
    heading.textContent = title;
    header.appendChild(heading);

    if (options.actions) {
        header.appendChild(options.actions);
    } else if (options.onClose) {
        header.appendChild(createCloseIconButton(options.onClose, options.closeLabel));
    }

    return header;
}

function createDetailsPanelHeaderActions({ editBtnId, viewBtnId, deleteBtnId, onEdit, onView, onDelete, onClose }) {
    const wrap = document.createElement('div');
    wrap.className = 'loan-details-header-actions';

    const editBtn = document.createElement('button');
    editBtn.id = editBtnId;
    editBtn.type = 'button';
    editBtn.className = 'loan-details-header-btn';
    editBtn.textContent = 'Edytuj';
    editBtn.addEventListener('click', onEdit);

    const viewBtn = document.createElement('button');
    viewBtn.id = viewBtnId;
    viewBtn.type = 'button';
    viewBtn.className = 'loan-details-header-btn hidden';
    viewBtn.textContent = 'Podgląd';
    viewBtn.addEventListener('click', onView);

    wrap.appendChild(editBtn);
    wrap.appendChild(viewBtn);
    if (deleteBtnId && typeof onDelete === 'function') {
        const deleteBtn = document.createElement('button');
        deleteBtn.id = deleteBtnId;
        deleteBtn.type = 'button';
        deleteBtn.className = 'loan-details-header-btn loan-details-header-btn--danger hidden';
        deleteBtn.textContent = 'Usuń';
        deleteBtn.addEventListener('click', onDelete);
        wrap.appendChild(deleteBtn);
    }
    wrap.appendChild(createCloseIconButton(onClose));
    return wrap;
}

function createDetailsPanelHeader(config) {
    return createPanelHeader(config.title, {
        headerClass: 'loan-details-header',
        titleId: config.titleId,
        actions: createDetailsPanelHeaderActions(config),
    });
}

function mountPanelHeader(mountId, header) {
    const mount = document.getElementById(mountId);
    if (mount) mount.replaceWith(header);
}

function initPanelHeaders() {
    mountPanelHeader('panel-header-settings', createPanelHeader('Ustawienia', { onClose: closeSettings }));
    mountPanelHeader('panel-header-notifications', createPanelHeader('Powiadomienia i tablica', { onClose: closeNotificationsPanel }));
    mountPanelHeader('panel-header-tasks-item-edit', createPanelHeader('Edytuj zadanie', { onClose: closeTodoItemEditor }));
    mountPanelHeader('panel-header-category-editor', createPanelHeader('Kategorie', { onClose: closeCategoryEditor }));
    mountPanelHeader('panel-header-cloud-restore', createPanelHeader('Kopia z chmury', { onClose: closeCloudRestorePicker }));
    mountPanelHeader('panel-header-asset-picker', createPanelHeader('Dodaj aktywo', { onClose: closeAssetPicker }));
    mountPanelHeader('panel-header-credit-card-quick', createPanelHeader('Spłata karty', {
        titleId: 'credit-card-quick-title',
        onClose: closeCreditCardQuickAction,
    }));
    mountPanelHeader('panel-header-calendar-day', createPanelHeader('Dzień', {
        titleId: 'calendar-day-title',
        onClose: closeCalendarDay,
    }));
    mountPanelHeader('panel-header-month-drill', createPanelHeader('Miesiąc', {
        titleId: 'month-drill-title',
        onClose: closeMonthDrill,
    }));
    mountPanelHeader('panel-header-reports-pdf', createPanelHeader('Podgląd', {
        titleId: 'reports-pdf-title',
        onClose: closePrintPreview,
        closeLabel: 'Wróć',
    }));
    mountPanelHeader('panel-header-tx-basket', createPanelHeader('Koszyk raportów', { onClose: closeTxBasketPanel }));

    mountPanelHeader('panel-header-asset-details', createDetailsPanelHeader({
        titleId: 'asset-details-title',
        title: 'Aktywo',
        editBtnId: 'btn-asset-details-edit',
        viewBtnId: 'btn-asset-details-view',
        onEdit: () => setAssetDetailsMode('edit'),
        onView: () => setAssetDetailsMode('view'),
        onClose: closeAssetDetails,
    }));
    mountPanelHeader('panel-header-loan-details', createDetailsPanelHeader({
        titleId: 'loan-details-title',
        title: 'Szczegóły kredytu',
        editBtnId: 'btn-loan-details-edit',
        viewBtnId: 'btn-loan-details-view',
        onEdit: () => setLoanDetailsMode('edit'),
        onView: () => setLoanDetailsMode('view'),
        onClose: closeLoanDetails,
    }));
    mountPanelHeader('panel-header-credit-card-details', createDetailsPanelHeader({
        titleId: 'credit-card-details-title',
        title: 'Karta kredytowa',
        editBtnId: 'btn-credit-card-details-edit',
        viewBtnId: 'btn-credit-card-details-view',
        onEdit: () => setCreditCardDetailsMode('edit'),
        onView: () => setCreditCardDetailsMode('view'),
        onClose: closeCreditCardDetails,
    }));
    mountPanelHeader('panel-header-ikze-limit', createDetailsPanelHeader({
        titleId: 'ikze-limit-title',
        title: 'Limit IKZE',
        editBtnId: 'btn-ikze-limit-edit',
        viewBtnId: 'btn-ikze-limit-view',
        onEdit: () => setIkzeLimitMode('edit'),
        onView: () => setIkzeLimitMode('view'),
        onClose: closeIkzeLimitPanel,
    }));
    mountPanelHeader('panel-header-transaction-details', createDetailsPanelHeader({
        titleId: 'transaction-details-title',
        title: 'Transakcja',
        editBtnId: 'btn-transaction-details-edit',
        viewBtnId: 'btn-transaction-details-view',
        deleteBtnId: 'btn-transaction-details-delete',
        onEdit: () => editTransactionFromDetails(),
        onView: () => {},
        onDelete: () => deleteTransactionFromDetails(),
        onClose: closeTransactionDetails,
    }));
}

function initOverlayCloseIcons() {
    document.querySelectorAll('.btn-icon[aria-label="Zamknij"]').forEach((btn) => {
        btn.textContent = '';
        const icon = cloneCloseIcon();
        if (icon) btn.appendChild(icon);
    });
}

let appActionDelegationBound = false;

function initAppActionDelegation() {
    if (appActionDelegationBound) return;
    appActionDelegationBound = true;

    document.body.addEventListener('click', (e) => {
        const openTx = e.target.closest('[data-action="open-transaction"]');
        if (openTx) {
            const index = parseInt(openTx.dataset.txIndex, 10);
            if (!Number.isNaN(index) && typeof openTransactionDetails === 'function') {
                openTransactionDetails(index);
            }
            return;
        }

        const monthCloseTx = e.target.closest('[data-action="month-close-transaction"]');
        if (monthCloseTx) {
            const index = parseInt(monthCloseTx.dataset.txIndex, 10);
            if (!Number.isNaN(index) && typeof monthCloseOpenTransactionDetails === 'function') {
                monthCloseOpenTransactionDetails(index);
            }
            return;
        }

        const duplicateReviewTx = e.target.closest('[data-action="duplicate-review-transaction"]');
        if (duplicateReviewTx) {
            const index = parseInt(duplicateReviewTx.dataset.txIndex, 10);
            if (!Number.isNaN(index) && typeof duplicateReviewEdit === 'function') {
                duplicateReviewEdit(index);
            }
            return;
        }

        const closeOverlay = e.target.closest('[data-action="close-transaction-details"]');
        if (closeOverlay && e.target === closeOverlay) {
            if (typeof closeTransactionDetails === 'function') closeTransactionDetails();
        }
    });
}

function getOrCreateShowMoreButton(id, onClick) {
    let btn = document.getElementById(id);
    if (!btn) {
        btn = document.createElement('button');
        btn.id = id;
        btn.type = 'button';
        btn.className = 'list-show-more-btn';
        btn.textContent = 'Pokaż więcej';
        btn.addEventListener('click', onClick);
    }
    return btn;
}

function updateShowMoreButton(btn, totalCount, visibleCount, parent, insertAfter) {
    if (!btn || !parent) return;
    const hasMore = totalCount > visibleCount;
    btn.classList.toggle('hidden', !hasMore);
    if (!hasMore) return;
    if (insertAfter && btn.previousElementSibling !== insertAfter) {
        insertAfter.insertAdjacentElement('afterend', btn);
    } else if (!insertAfter && btn.parentElement !== parent) {
        parent.appendChild(btn);
    }
}
function initOnboarding() {
    if (localStorage.getItem('onboarding_done')) return;
    const overlay = document.getElementById('onboarding');
    let step = 0;
    const titleEl = document.getElementById('onboarding-title');
    const textEl = document.getElementById('onboarding-text');
    const dots = document.querySelectorAll('#onboarding-dots span');
    const btnNext = document.getElementById('onboarding-next');
    const btnSkip = document.getElementById('onboarding-skip');

    function showStep(i) {
        titleEl.textContent = ONBOARDING_SLIDES[i].title;
        textEl.textContent = ONBOARDING_SLIDES[i].text;
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        btnNext.textContent = i === ONBOARDING_SLIDES.length - 1 ? 'Zaczynamy' : 'Dalej';
    }

    function close() {
        overlay.classList.add('hidden');
        localStorage.setItem('onboarding_done', '1');
    }

    overlay.classList.remove('hidden');
    showStep(0);
    btnSkip.onclick = close;
    btnNext.onclick = () => {
        step++;
        if (step >= ONBOARDING_SLIDES.length) close();
        else showStep(step);
    };
}

function getBasePath() {
    const parts = location.pathname.split('/').filter(Boolean);
    const repoIndex = parts.indexOf('Portfel-PWA');
    if (repoIndex >= 0) {
        return '/' + parts.slice(0, repoIndex + 1).join('/');
    }
    return '';
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const base = getBasePath();
    const swUrl = `${base}/sw.js`;
    const scope = base ? `${base}/` : '/';
    navigator.serviceWorker.register(swUrl, { scope }).catch(err => console.error('SW registration failed:', err));
}

function dismissModuleSplitBanner() {
    localStorage.setItem(MODULE_SPLIT_BANNER_KEY, String(Date.now()));
    document.getElementById('module-split-banner').classList.add('hidden');
}

function showModuleSplitAlert(fileName, lineCount) {
    const thresholdEl = document.getElementById('module-split-threshold');
    const linesEl = document.getElementById('module-split-lines');
    const notice = document.getElementById('module-split-notice');
    const banner = document.getElementById('module-split-banner');
    const bannerText = document.getElementById('module-split-banner-text');

    if (thresholdEl) thresholdEl.textContent = String(MODULE_SPLIT_LINE_THRESHOLD);
    if (linesEl) linesEl.textContent = String(lineCount);
    if (notice) notice.classList.remove('hidden');
    if (bannerText) {
        bannerText.textContent = `${fileName} ma ${lineCount} linii (próg: ${MODULE_SPLIT_LINE_THRESHOLD}). Rozważ dalszy podział modułów w js/.`;
    }

    console.warn(`[Finanse] ${fileName}: ${lineCount} linii — próg ${MODULE_SPLIT_LINE_THRESHOLD}.`);

    const dismissedAt = Number(localStorage.getItem(MODULE_SPLIT_BANNER_KEY) || 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    if (banner && (!dismissedAt || Date.now() - dismissedAt > weekMs)) {
        banner.classList.remove('hidden');
    }
}

const MODULE_JS_FILES = [
    'js/constants.js',
    'js/firebase.js',
    'js/chart-instances.js',
    'js/state.js',
    'js/format.js',
    'js/theme.js',
    'js/categories.js',
    'js/loan-details.js',
    'js/credit-cards.js',
    'js/portfolio.js',
    'js/ui.js',
    'js/transactions.js',
    'js/dashboard-forecast.js',
    'js/dashboard.js',
    'js/reports-core.js',
    'js/assets.js',
    'js/assets-migrations.js',
    'js/cash.js',
    'js/asset-analytics.js',
    'js/loans.js',
    'js/settings-backup.js',
    'js/settings.js',
    'js/skryba-dates.js',
    'js/skryba-entities.js',
    'js/skryba-tools.js',
    'js/skryba-actions.js',
    'js/skryba-style.js',
    'js/skryba-prompts.js',
    'js/skryba-router.js',
    'js/assistant.js',
    'js/bootstrap.js',
    'js/reports-calendar.js',
    'js/reports-debt-calculations.js',
    'js/reports-debt.js',
    'js/reports-assets.js',
    'js/reports-analysis-chart.js',
    'js/reports-analysis-cache.js',
    'js/reports-analysis.js',
];

async function checkModuleSplitThreshold() {
    const base = getBasePath();
    try {
        let largest = { file: '', lines: 0 };
        await Promise.all(MODULE_JS_FILES.map(async (file) => {
            const res = await fetch(`${base}/${file}`, { cache: 'no-store' });
            if (!res.ok) return;
            const lineCount = (await res.text()).split('\n').length;
            if (lineCount > largest.lines) largest = { file, lines: lineCount };
        }));
        if (largest.lines >= MODULE_SPLIT_LINE_THRESHOLD) {
            showModuleSplitAlert(largest.file, largest.lines);
        }
    } catch {
        /* offline lub cache — pomijamy */
    }
}
