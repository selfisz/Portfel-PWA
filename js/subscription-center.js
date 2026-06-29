const SUBSCRIPTION_PREFS_KEY = 'finanse_subscription_prefs';

const SUBSCRIPTION_SIGNAL = /subskrypc|netflix|spotify|disney|hbo|youtube|apple|google|microsoft|adobe|canva|icloud|prime|audible|playstation|xbox|dropbox|notion|chatgpt|openai|cursor|github|patronite|storytel|wirtualn|polsat|player|skyshowtime|crunchyroll|deezer|tidal|legimi|empik go/i;

let subscriptionExpandedId = null;
let subscriptionDismissedExpanded = false;

function readSubscriptionPrefs() {
    try {
        const raw = JSON.parse(localStorage.getItem(SUBSCRIPTION_PREFS_KEY) || '{}');
        return {
            dismissed: raw.dismissed && typeof raw.dismissed === 'object' ? raw.dismissed : {}
        };
    } catch {
        return { dismissed: {} };
    }
}

function writeSubscriptionPrefs(prefs) {
    localStorage.setItem(SUBSCRIPTION_PREFS_KEY, JSON.stringify(prefs));
}

function getSubscriptionId(entry) {
    if (entry.source === 'manual' && entry.recurringId) return `manual:${entry.recurringId}`;
    return `detected:${entry.key}`;
}

function isSubscriptionLike(entry) {
    if (!entry || entry.type === 'income') return false;
    if (entry.mainCategory === 'Subskrypcje') return true;
    if (entry.hasKeyword) return true;
    if (entry.source === 'manual') return true;
    const label = `${entry.mainCategory || ''} ${entry.subCategory || ''} ${entry.label || ''}`.toLowerCase();
    return SUBSCRIPTION_SIGNAL.test(label);
}

function getSubscriptionTransactions(entry) {
    return (appState.transactions || [])
        .filter((t) => {
            if (t.type !== 'expense') return false;
            if (entry.recurringId && t.recurringId === entry.recurringId) return true;
            if (typeof getExpenseGroupKey === 'function') {
                return getExpenseGroupKey(t, 'sub') === entry.key;
            }
            const sub = t.subCategory === '[Bez podkategorii]' ? '' : t.subCategory;
            return `${t.mainCategory}|${sub}` === entry.key;
        })
        .sort((a, b) => b.date.localeCompare(a.date));
}

function pickSubscriptionLabel(entry, txs) {
    const notes = txs.map((t) => (t.note || '').trim()).filter(Boolean);
    if (notes.length) {
        const best = [...notes].sort((a, b) => b.length - a.length)[0];
        if (best.length <= 40) return best;
    }
    if (entry.subCategory && entry.subCategory !== '[Bez podkategorii]') return entry.subCategory;
    return entry.mainCategory || 'Subskrypcja';
}

function estimateNextPaymentDate(lastDate, monthsActive) {
    if (!lastDate) return null;
    const [y, m, d] = lastDate.split('-').map(Number);
    const base = new Date(y, m - 1, d || 1);
    const intervalDays = monthsActive >= 10 ? 365 : 30;
    base.setDate(base.getDate() + intervalDays);
    return typeof localIsoDate === 'function' ? localIsoDate(base) : lastDate;
}

function detectSubscriptionPriceHike(txs) {
    const monthly = {};
    txs.forEach((t) => {
        const mk = t.date.slice(0, 7);
        monthly[mk] = (monthly[mk] || 0) + t.amount;
    });
    const keys = Object.keys(monthly).sort();
    if (keys.length < 3) return null;
    const latestKey = keys[keys.length - 1];
    const latest = monthly[latestKey];
    const prior = keys.slice(0, -1).map((k) => monthly[k]);
    const median = [...prior].sort((a, b) => a - b)[Math.floor(prior.length / 2)];
    if (median > 0 && latest > median * 1.12 && latest - median >= 5) {
        return { previous: median, current: latest, delta: latest - median };
    }
    return null;
}

function buildSubscriptionEntry(raw) {
    const txs = getSubscriptionTransactions(raw);
    const label = pickSubscriptionLabel(raw, txs);
    const priceHike = detectSubscriptionPriceHike(txs);
    const daysSince = raw.lastDate
        ? Math.floor((Date.now() - new Date(raw.lastDate).getTime()) / 86400000)
        : 999;
    const isZombie = daysSince > 75 && raw.months >= 2;
    const annual = raw.amount * (raw.months >= 10 && raw.amount > 200 ? 1 : 12);
    return {
        ...raw,
        id: getSubscriptionId(raw),
        label,
        monthly: raw.amount,
        annual: Math.round(annual),
        nextDate: estimateNextPaymentDate(raw.lastDate, raw.months),
        priceHike,
        isZombie,
        daysSince,
        txs
    };
}

function findDuplicatePairs(entries) {
    const pairs = new Set();
    for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
            const a = entries[i].label.toLowerCase();
            const b = entries[j].label.toLowerCase();
            const similarName = a.includes(b) || b.includes(a) || a.slice(0, 4) === b.slice(0, 4);
            const similarAmount = Math.abs(entries[i].monthly - entries[j].monthly) <= Math.max(5, entries[i].monthly * 0.05);
            if (similarName && similarAmount) {
                pairs.add(entries[i].id);
                pairs.add(entries[j].id);
            }
        }
    }
    return pairs;
}

function enrichManualRecurringEntry(entry) {
    if (entry.source !== 'manual' || typeof getExpenseGroupKey !== 'function') return entry;
    const tx = (appState.transactions || []).find((t) => (
        t.recurringId
        && t.type === 'expense'
        && getExpenseGroupKey(t, 'sub') === entry.key
    ));
    return { ...entry, recurringId: tx?.recurringId || entry.recurringId || null };
}

function buildAllSubscriptionEntries() {
    if (typeof getAllRecurringEntries !== 'function') return [];
    const raw = getAllRecurringEntries('sub')
        .map(enrichManualRecurringEntry)
        .filter(isSubscriptionLike);

    const entries = raw.map(buildSubscriptionEntry);
    const dupes = findDuplicatePairs(entries);
    return entries
        .map((e) => ({
            ...e,
            isDuplicate: dupes.has(e.id)
        }))
        .sort((a, b) => b.monthly - a.monthly);
}

function buildSubscriptionCatalog() {
    const prefs = readSubscriptionPrefs();
    return buildAllSubscriptionEntries().filter((e) => !prefs.dismissed[e.id]);
}

function buildDismissedSubscriptionCatalog() {
    const prefs = readSubscriptionPrefs();
    return buildAllSubscriptionEntries().filter((e) => prefs.dismissed[e.id]);
}

function dismissSubscription(id) {
    const prefs = readSubscriptionPrefs();
    prefs.dismissed[id] = new Date().toISOString();
    writeSubscriptionPrefs(prefs);
    if (subscriptionExpandedId === id) subscriptionExpandedId = null;
    renderSubscriptionCenter();
}

function restoreSubscription(id) {
    const prefs = readSubscriptionPrefs();
    delete prefs.dismissed[id];
    writeSubscriptionPrefs(prefs);
    renderSubscriptionCenter();
}

function toggleSubscriptionTransactions(id) {
    subscriptionExpandedId = subscriptionExpandedId === id ? null : id;
    renderSubscriptionCenter();
}

function toggleSubscriptionDismissed() {
    subscriptionDismissedExpanded = !subscriptionDismissedExpanded;
    renderSubscriptionCenter();
}

function renderSubscriptionBadges(entry) {
    const badges = [];
    if (entry.source === 'manual') {
        badges.push('<span class="recurring-badge recurring-badge--manual">Oznaczone ręcznie</span>');
    } else {
        badges.push(`<span class="recurring-badge recurring-badge--detected">Wykryte · ${entry.months} mies.</span>`);
    }
    if (entry.priceHike) {
        badges.push(`<span class="recurring-badge subscription-badge--hike">Podwyżka +${formatPlnAmount(entry.priceHike.delta)}</span>`);
    }
    if (entry.isZombie) {
        badges.push('<span class="recurring-badge subscription-badge--zombie">Brak płatności 75+ dni</span>');
    }
    if (entry.isDuplicate) {
        badges.push('<span class="recurring-badge subscription-badge--dupe">Możliwy duplikat</span>');
    }
    return badges.join(' ');
}

function renderSubscriptionTransactionsPanel(entry, expanded) {
    if (!expanded) return '';
    const count = entry.txs?.length || 0;
    if (!count) {
        return '<div class="subscription-tx-panel"><p class="reports-hint">Brak transakcji w historii.</p></div>';
    }
    const listHtml = typeof renderReportsTxListHtml === 'function'
        ? renderReportsTxListHtml(entry.txs)
        : '<p class="reports-hint">Brak transakcji.</p>';
    const countLabel = count === 1 ? '1 transakcja' : `${count} transakcji`;
    return `<div class="subscription-tx-panel">
        <p class="subscription-tx-panel-label">${countLabel}</p>
        <div class="subscription-tx-list">${listHtml}</div>
    </div>`;
}

function renderSubscriptionEntryRow(entry, { dismissed = false } = {}) {
    const expanded = subscriptionExpandedId === entry.id;
    const nextLine = entry.nextDate ? `nast. szac. ${formatTxDate(entry.nextDate)}` : '';
    const lastLine = entry.lastDate ? `ostatnio ${formatTxDate(entry.lastDate)}` : '';
    const metaParts = [escapeHtml(entry.mainCategory), lastLine, nextLine].filter(Boolean);
    const metaLine = metaParts.join(' · ');
    const txHint = entry.txs?.length
        ? (expanded ? 'Ukryj transakcje' : `Pokaż ${entry.txs.length} transakcji`)
        : 'Brak transakcji';
    const actionBtn = dismissed
        ? `<button type="button" class="btn-text-link subscription-skip-btn" onclick="event.stopPropagation(); restoreSubscription(${JSON.stringify(entry.id)})">Przywróć</button>`
        : `<button type="button" class="btn-text-link subscription-skip-btn" title="Usuwa pozycję tylko z tej listy — transakcje zostają w portfelu" onclick="event.stopPropagation(); dismissSubscription(${JSON.stringify(entry.id)})">Pomiń</button>`;
    const rowClass = [
        'reports-recurring-item',
        'subscription-recurring-item',
        'subscription-recurring-item--clickable',
        expanded ? 'subscription-recurring-item--expanded' : ''
    ].filter(Boolean).join(' ');

    return `<div class="subscription-entry${dismissed ? ' subscription-entry--dismissed' : ''}">
        <div class="${rowClass}" role="button" tabindex="0"
            onclick="toggleSubscriptionTransactions(${JSON.stringify(entry.id)})"
            onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSubscriptionTransactions(${JSON.stringify(entry.id)}); }"
            aria-expanded="${expanded ? 'true' : 'false'}">
            ${renderCategoryIcon(entry.mainCategory, 'list', entry.subCategory !== '[Bez podkategorii]' ? entry.subCategory : null, 'expense')}
            <div class="reports-top-text">
                <span class="reports-top-name">${escapeHtml(entry.label)}</span>
                <span class="reports-top-meta">${metaLine} ${renderSubscriptionBadges(entry)}</span>
                <span class="subscription-tx-hint">${txHint}</span>
            </div>
            <div class="subscription-recurring-side">
                <span class="reports-recurring-amount">${formatPlnAmount(entry.monthly)}/mies.</span>
                <span class="subscription-recurring-annual">${formatPlnAmount(entry.annual)}/rok</span>
                ${actionBtn}
            </div>
            <svg class="subscription-expand-chevron${expanded ? ' subscription-expand-chevron--open' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
        </div>
        ${renderSubscriptionTransactionsPanel(entry, expanded)}
    </div>`;
}

function renderSubscriptionDismissedSection(dismissed) {
    if (!dismissed.length) return '';
    const countLabel = dismissed.length === 1 ? '1 pominięta' : `${dismissed.length} pominięte`;
    return `<div class="reports-hero-expand subscription-dismissed-expand">
        <button type="button" class="reports-hero-expand-toggle" onclick="toggleSubscriptionDismissed()"
            aria-expanded="${subscriptionDismissedExpanded ? 'true' : 'false'}" aria-controls="subscription-dismissed-panel">
            <span>${subscriptionDismissedExpanded ? 'Ukryj pominięte' : `Pokaż pominięte (${countLabel})`}</span>
            <svg class="reports-hero-expand-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
        </button>
        <div id="subscription-dismissed-panel" class="reports-hero-expand-panel${subscriptionDismissedExpanded ? '' : ' hidden'}">
            ${dismissed.map((entry) => renderSubscriptionEntryRow(entry, { dismissed: true })).join('')}
        </div>
    </div>`;
}

function renderSubscriptionCenter() {
    const root = document.getElementById('reports-subscription-center');
    const summaryEl = document.getElementById('reports-subscription-summary');
    if (!root) return;

    const entries = buildSubscriptionCatalog();
    const dismissed = buildDismissedSubscriptionCatalog();
    const allCount = entries.length + dismissed.length;

    if (!allCount) {
        root.innerHTML = '<div class="empty-state"><p>Brak wykrytych subskrypcji — dodaj wydatki w kategorii Subskrypcje lub oznacz transakcję jako powtarzalną.</p></div>';
        if (summaryEl) summaryEl.textContent = '';
        subscriptionExpandedId = null;
        subscriptionDismissedExpanded = false;
        return;
    }

    const monthlyTotal = entries.reduce((s, e) => s + e.monthly, 0);
    const annualTotal = entries.reduce((s, e) => s + e.annual, 0);
    if (summaryEl) {
        if (entries.length) {
            summaryEl.textContent = `${entries.length} aktywnych · ${formatPlnAmount(monthlyTotal)}/mies. · ${formatPlnAmount(annualTotal)}/rok`;
        } else {
            summaryEl.textContent = 'Brak aktywnych subskrypcji — przywróć pozycje z listy pominiętych.';
        }
    }

    const activeHtml = entries.length
        ? entries.map((entry) => renderSubscriptionEntryRow(entry)).join('')
        : '<div class="empty-state subscription-empty-active"><p>Brak aktywnych pozycji na liście.</p></div>';

    const totalHtml = entries.length
        ? `<div class="reports-recurring-total">Szacunkowa suma: <strong>${formatPlnAmount(monthlyTotal)}</strong>/mies. · <strong>${formatPlnAmount(annualTotal)}</strong>/rok</div>`
        : '';

    root.innerHTML = activeHtml
        + renderSubscriptionDismissedSection(dismissed)
        + totalHtml;
}
