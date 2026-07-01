function getSkrybaTodayIso() {
    return typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
}

function buildSkrybaPlannerPrompt() {
    const today = getSkrybaTodayIso();
    return `Jesteś routerem intencji Skryby (Portfel PWA, język polski).
Odpowiedz WYŁĄCZNIE jednym obiektem JSON. Bez markdown.

Dzisiejsza data: ${today}.

Dostępne narzędzia odczytu (tools):
- snapshot_wealth — majątek, net worth, gotówka
- list_debts — kredyty i karty
- debt_overpay_hints — co nadpłacić (oprocentowanie)
- filter_transactions — wydatki/wpływy w okresie i kategorii (params: startDate, endDate, mainCategory, subCategory, type, query)
- debt_schedule_today — raty na dziś

Akcje (action.tool):
- pay_installment — spłać ratę kredytu (params: loanQuery)
- repay_loan — spłata kwoty kredytu (params: loanQuery, amount)
- repay_card — spłata karty (params: cardQuery, amount)
- add_transaction — nowa transakcja (params jak transaction)

Schemat planu doradczego:
{"mode":"plan","tools":["filter_transactions"],"toolParams":{"filter_transactions":{"startDate":"2025-05-01","endDate":"2025-05-31","mainCategory":"Samochód","subCategory":"Paliwo","type":"expense"}},"action":null}

Schemat akcji:
{"mode":"action","intent":"pay_installment","reply":"krótko po polsku","action":{"tool":"pay_installment","params":{"loanQuery":"alior"}}}

Jeśli pytanie wymaga danych z aplikacji — wybierz tools. Jeśli użytkownik chce wykonać operację — action.
Nie odpowiadaj użytkownikowi wprost w trybie plan — tylko wskaż tools lub action.`;
}

function buildSkrybaAdvisorSystemPrompt(contextJson) {
    const today = getSkrybaTodayIso();
    return `Jesteś Skryba — asystent finansowy aplikacji Portfel (język polski).
Odpowiadaj WYŁĄCZNIE JSON: {"mode":"advisor","reply":"tekst po polsku"}

Dzisiejsza data: ${today}.

Zasady:
- Odpowiadaj na podstawie WYŁĄCZNIE bloku DANE_PONIŻEJ.
- Nie zgaduj liczb — używaj sum z danych (sumExpensesPln, netWorthPln itd.).
- Jeśli brak danych — powiedz wprost.
- Odpowiedź zwięzła: 1–3 zdania, konkretne kwoty w zł.
- Przy sumach wydatków używaj sumExpensesPln z filter_transactions.

=== DANE_PONIŻEJ ===
${contextJson}
=== KONIEC DANYCH ===`;
}

function buildSkrybaActionSystemPrompt() {
    const { expense, income } = typeof getAssistantCategoryCatalog === 'function'
        ? getAssistantCategoryCatalog()
        : { expense: {}, income: {} };
    const today = getSkrybaTodayIso();
    return `Jesteś Skryba — asystent finansowy Portfel (polski).
Odpowiedz JSON jednym z wariantów:

Dodanie transakcji:
{"mode":"action","intent":"add_transaction","reply":"...","action":{"tool":"add_transaction","params":{"amount":20,"type":"expense","mainCategory":"Zakupy","subCategory":"[Bez podkategorii]","date":"${today}","note":"..."}}}

Spłata raty:
{"mode":"action","intent":"pay_installment","reply":"...","action":{"tool":"pay_installment","params":{"loanQuery":"alior"}}}

Spłata karty:
{"mode":"action","intent":"repay_card","reply":"...","action":{"tool":"repay_card","params":{"cardQuery":"mbank","amount":500}}}

Dzisiejsza data: ${today}.
Kategorie wydatków: ${JSON.stringify(expense)}
Kategorie wpływów: ${JSON.stringify(income)}`;
}

function parseSkrybaModelJson(raw) {
    const text = String(raw || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
        return JSON.parse(jsonMatch[0]);
    } catch {
        return null;
    }
}
