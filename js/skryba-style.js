const SKRYBA_FALLBACK_REPLY = 'Nie do końca rozumiem — napisz np. kwotę i sklep („20 zł Biedronka”), zapytaj o miesiąc albo budżet, albo wybierz podpowiedź poniżej.';

function getSkrybaGreeting(referenceDate = new Date()) {
    const hour = referenceDate.getHours();
    if (hour < 6) return 'Hej';
    if (hour < 12) return 'Dzień dobry';
    if (hour < 18) return 'Cześć';
    return 'Dobry wieczór';
}

function buildSkrybaPersonaBlock() {
    return `PERSONA SKRYBY:
- Jesteś Skrybą — spokojny, konkretny doradca finansów osobistych w aplikacji Portfel.
- Masz pełny dostęp do lokalnej bazy użytkownika: wszystkie transakcje, budżety, kredyty, karty, aktywa, rozliczenia — jak concierge i zarządca aplikacji.
- Mówisz po polsku, zwracasz się na „ty”. Ton: ciepły, ale rzeczowy — bez korpo-bełkotu i bez protekcjonalności.
- Nigdy nie mów „nie mam dostępu do danych”, „otwórz analizę żeby zobaczyć” ani „jako AI…” — jeśli liczby są w kontekście (w tym previous_month_summary, month_summary_compare), podaj je wprost.
- Dostosuj długość: proste pytanie → 1–2 zdania; analiza → do 5 krótkich akapitów.
- Odwołuj się do poprzednich wiadomości w rozmowie (np. „a suma?”, „a poprzedni miesiąc?”, „pokaż więcej”).
- Kwoty zawsze z „zł” (np. 1 234,50 zł). Procenty z „%”.
- Nie wymyślaj kategorii ani transakcji spoza danych.`;
}

function buildSkrybaReplyStyleBlock() {
    return `STYL ODPOWIEDZI (pole reply — zwykły tekst, bez markdown i bez JSON w środku):

Struktura dla analizy (użyj tylu sekcji, ile potrzeba — nie wszystkie naraz):
Werdykt: [OK / Uwaga / Warto poprawić] — jedno zdanie z głównym wnioskiem.
Liczby: [konkretne kwoty i % z danych, porównanie jeśli jest w kontekście]
Co dalej: [jedna praktyczna rekomendacja lub następny krok]
Pytanie: [opcjonalnie jedno krótkie pytanie follow-up]

Dla prostych pytań (np. jedna kwota, potwierdzenie akcji) — pomiń sekcje, odpowiedz naturalnie w 1–2 zdaniach.

Przykład analizy:
Werdykt: Uwaga — wydatki rosną szybciej niż wpływy.
Liczby: W maju wydałeś 4 200 zł przy wpływach 5 100 zł (bilans +900 zł, oszczędności 18%).
Co dalej: Rozważ obcięcie kategorii Jedzenie na mieście — to +320 zł vs kwiecień.
Pytanie: Chcesz top kategorie z maja?

Zakazy w reply: bez markdown (#, **), bez list numerowanych 1. 2. 3., bez angielskich skrótów bez wyjaśnienia.`;
}

function polishSkrybaReply(text) {
    let out = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!out) return out;
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.replace(/(\d[\d\s]*[.,]\d{2})(?!\s*zł)/g, '$1 zł');
    return out;
}

function formatBriefingItemsAsProse(items) {
    if (!Array.isArray(items) || !items.length) return '';
    if (items.length === 1) return `Na dziś: ${items[0].text}.`;
    const head = items.slice(0, -1).map((item) => item.text).join('; ');
    const tail = items[items.length - 1].text;
    return `Na dziś: ${head}; oraz ${tail}.`;
}

function buildSkrybaWelcomeBody() {
    const greeting = getSkrybaGreeting();
    const lines = [`${greeting}! Tu Skryba — pomogę ogarnąć wydatki, budżet i podsumowania.`];

    const isMonday = new Date().getDay() === 1;
    const weekly = isMonday && typeof skrybaToolWeeklyBriefing === 'function'
        ? skrybaToolWeeklyBriefing()
        : null;
    const daily = typeof buildSkrybaDailyBriefing === 'function'
        ? buildSkrybaDailyBriefing(3)
        : null;

    if (weekly?.text) {
        lines.push('', 'Briefing tygodnia:', weekly.text);
    } else if (daily?.items?.length) {
        lines.push('', formatBriefingItemsAsProse(daily.items));
    } else {
        lines.push('', 'Wpisz wydatek, zadaj pytanie o finanse albo wybierz podpowiedź.');
    }

    lines.push('', 'Możesz też powiedzieć mi po prostu, co Cię teraz martwi finansowo.');
    return lines.join('\n');
}

function getSkrybaActionReplyPhrase(tool, params = {}) {
    const fmt = typeof formatPlnAmount === 'function'
        ? formatPlnAmount
        : (n) => `${Number(n).toFixed(2)} zł`;

    switch (tool) {
        case 'add_transaction':
            return 'Proponuję dodać taką transakcję — sprawdź szczegóły i potwierdź:';
        case 'pay_installment':
            return `Zaksięguję ratę${params.loanQuery ? ` (${params.loanQuery})` : ''} — potwierdź:`;
        case 'repay_card':
            return `Spłacę kartę kwotą ${params.amount ? fmt(params.amount) : '…'} — potwierdź:`;
        case 'repay_loan':
            return `Spłacę kredyt kwotą ${params.amount ? fmt(params.amount) : '…'} — potwierdź:`;
        case 'set_budget':
            return 'Ustawię taki limit budżetu — potwierdź:';
        case 'add_category_rule':
            return 'Dodam regułę auto-kategoryzacji — potwierdź:';
        case 'set_savings_goal':
            return `Ustawię cel oszczędności na ${params.goalPct || '…'}% — potwierdź:`;
        case 'navigate':
            return 'Już przechodzę — chwilę…';
        default:
            return 'Potwierdź operację:';
    }
}

function formatAssistantSummarizeFriendly(items, operation = 'sum') {
    if (!items.length) {
        return 'Najpierw wyszukaj transakcje (np. „ile na paliwo w maju?”), a potem zapytaj o sumę.';
    }
    if (operation === 'count') {
        return `Masz ${items.length} ${items.length === 1 ? 'transakcję' : 'transakcje'} w ostatnim wyniku.`;
    }
    let expenseTotal = 0;
    let incomeTotal = 0;
    items.forEach((t) => {
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') incomeTotal += amount;
        else expenseTotal += amount;
    });
    const format = typeof formatPlnAmount === 'function'
        ? formatPlnAmount
        : (n) => `${Number(n).toFixed(2)} zł`;
    const parts = [];
    if (expenseTotal > 0) parts.push(`wydatki ${format(expenseTotal)}`);
    if (incomeTotal > 0) parts.push(`wpływy ${format(incomeTotal)}`);
    const summary = parts.length ? parts.join(', ') : format(0);
    return `Z ostatniego wyszukiwania (${items.length} pozycji): ${summary}.`;
}
