function hapticFeedback() {
    if (navigator.vibrate) navigator.vibrate(12);
}

let appToastTimeout = null;

function showAppToast(message, variant = 'success') {
    const toast = document.getElementById('settings-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden', 'settings-toast--success', 'settings-toast--error', 'settings-toast--default');
    const variantClass = variant === 'error'
        ? 'settings-toast--error'
        : variant === 'default'
            ? 'settings-toast--default'
            : 'settings-toast--success';
    toast.classList.add(variantClass);
    if (appToastTimeout) clearTimeout(appToastTimeout);
    appToastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
        appToastTimeout = null;
    }, variant === 'error' ? 3600 : 2800);
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

function createDetailsPanelHeaderActions({ editBtnId, viewBtnId, onEdit, onView, onClose }) {
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
    mountPanelHeader('panel-header-notifications', createPanelHeader('Powiadomienia', { onClose: closeNotificationsPanel }));
    mountPanelHeader('panel-header-category-editor', createPanelHeader('Kategorie', { onClose: closeCategoryEditor }));
    mountPanelHeader('panel-header-budget-editor', createPanelHeader('Limity kategorii', { onClose: closeBudgetEditor }));
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
        onEdit: () => editTransactionFromDetails(),
        onView: () => {},
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

function attachSwipeDelete(row, index) {
    const SWIPE_MAX = 88;
    const SWIPE_DELETE = 64;
    let startX = 0;
    let currentX = 0;
    let swiped = false;
    let isDragging = false;
    let activePointer = null;

    const setOffset = (x) => {
        row.style.transform = `translate3d(${x}px, 0, 0)`;
    };

    const resetRow = (animate = true) => {
        row.classList.remove('swiping', 'is-dragging');
        row.style.transition = animate ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        setOffset(0);
        if (animate) {
            window.setTimeout(() => {
                row.style.transition = '';
                row.style.transform = '';
            }, 280);
        } else {
            row.style.transition = '';
            row.style.transform = '';
        }
    };

    const finishSwipe = () => {
        if (!isDragging) return;
        isDragging = false;
        activePointer = null;
        row.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';

        if (currentX <= -SWIPE_DELETE) {
            swiped = true;
            row.classList.add('swiping');
            setOffset(-SWIPE_MAX);
            row.style.opacity = '0.55';
            window.setTimeout(() => deleteTransaction(index), 180);
            return;
        }

        resetRow(true);
        startX = currentX = 0;
    };

    const onPointerDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        activePointer = e.pointerId;
        isDragging = true;
        swiped = false;
        startX = e.clientX;
        currentX = 0;
        row.classList.add('is-dragging');
        row.style.transition = 'none';
        row.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
        if (!isDragging || e.pointerId !== activePointer) return;
        currentX = e.clientX - startX;
        if (currentX > 0) currentX = 0;
        if (currentX < -SWIPE_MAX) currentX = -SWIPE_MAX;
        if (currentX < -10) row.classList.add('swiping');
        else row.classList.remove('swiping');
        setOffset(currentX);
    };

    const onPointerEnd = (e) => {
        if (e.pointerId !== activePointer) return;
        if (row.hasPointerCapture(e.pointerId)) row.releasePointerCapture(e.pointerId);
        finishSwipe();
    };

    row.addEventListener('pointerdown', onPointerDown);
    row.addEventListener('pointermove', onPointerMove);
    row.addEventListener('pointerup', onPointerEnd);
    row.addEventListener('pointercancel', onPointerEnd);

    row.addEventListener('click', () => {
        if (swiped) {
            swiped = false;
            return;
        }
        openTransactionDetails(index);
    });
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
    'js/state.js',
    'js/format.js',
    'js/theme.js',
    'js/categories.js',
    'js/loan-details.js',
    'js/credit-cards.js',
    'js/portfolio.js',
    'js/ui.js',
    'js/transactions.js',
    'js/dashboard.js',
    'js/reports-core.js',
    'js/assets.js',
    'js/cash.js',
    'js/asset-analytics.js',
    'js/investments.js',
    'js/loans.js',
    'js/settings.js',
    'js/bootstrap.js',
    'js/reports-calendar.js',
    'js/reports-debt.js',
    'js/reports-assets.js',
    'js/reports-phase3.js'
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
