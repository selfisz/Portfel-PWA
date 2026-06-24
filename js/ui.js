function hapticFeedback() {
    if (navigator.vibrate) navigator.vibrate(12);
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
        editTransaction(index);
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
    'js/investments.js',
    'js/loans.js',
    'js/settings.js',
    'js/bootstrap.js',
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
