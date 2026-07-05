function getSkrybaTodayIso() {
    return typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
}

function getSkrybaCategoryCatalogForPrompt() {
    if (typeof getAssistantCategoryCatalog === 'function') {
        return getAssistantCategoryCatalog();
    }
    const fallback = typeof DEFAULT_CATEGORY_TREE !== 'undefined'
        ? DEFAULT_CATEGORY_TREE
        : { expense: {}, income: {} };
    return { expense: fallback.expense || {}, income: fallback.income || {} };
}

function buildSkrybaCategorySchemaBlock() {
    const { expense, income } = getSkrybaCategoryCatalogForPrompt();
    const formatTree = (tree) => Object.entries(tree || {}).map(([main, subs]) => {
        const subList = Array.isArray(subs) && subs.length ? subs.join(', ') : '[Bez podkategorii]';
        return `${main} → ${subList}`;
    }).join('\n');

    return `DOZWOLONE_KATEGORIE (używaj WYŁĄCZNIE tych nazw — bez tworzenia nowych, bez skracania, bez tłumaczenia):

Wydatki:
${formatTree(expense)}

Wpływy:
${formatTree(income)}

Zasady mapowania:
- mainCategory i subCategory muszą być dokładnie z listy powyżej.
- Gdy brak podkategorii w drzewie — użyj "[Bez podkategorii]".
- Gdy produkt nie pasuje jednoznacznie — wybierz najbliższą istniejącą parę (np. Różne / Inne), nigdy wymyślonej kategorii spoza listy.`;
}

function buildSkrybaPlannerPrompt() {
    const today = getSkrybaTodayIso();
    const categoryBlock = buildSkrybaCategorySchemaBlock();
    return `Jesteś routerem intencji Skryby (Portfel PWA, język polski).
Odpowiedz WYŁĄCZNIE jednym obiektem JSON. Bez markdown.

Dzisiejsza data: ${today}.

${categoryBlock}

Dostępne narzędzia odczytu (tools):
- snapshot_wealth — majątek, net worth, gotówka
- list_debts — kredyty i karty
- debt_overpay_hints — co nadpłacić (oprocentowanie)
- filter_transactions — wydatki/wpływy w okresie i kategorii (params: startDate, endDate, mainCategory, subCategory, type, query). mainCategory/subCategory TYLKO z DOZWOLONE_KATEGORIE.
- debt_schedule_today — raty na dziś
- budget_status — limity kategorii w miesiącu (params: monthKey YYYY-MM)
- month_summary — wpływy, wydatki, bilans, stopa oszczędności (params: startDate, endDate, label, comparePrevious: true/false)
- top_categories — ranking kategorii wydatków (params: startDate, endDate, label, limit)
- debt_dsr — obciążenie dochodem DSR (params: startDate, endDate, label)
- spending_insights — anomalie, tempo budżetu, cel oszczędności, IKZE
- recurring_gaps — brakujące cykliczne wpisy w bieżącym miesiącu
- suggest_budget — propozycja limitu z historii (params: mainCategory, subCategory, categoryQuery)
- weekly_briefing — podsumowanie ostatnich 7 dni vs poprzedni tydzień
- surplus_hints — alokacja nadwyżki (params: amountPln opcjonalnie)
- month_close_status — nierozliczone miesiące i otwarte kroki
- savings_goal_status — cel oszczędności vs bieżąca stopa
- todo_overview — otwarte zadania użytkownika (params: kind shopping|payments|finance, scope week opcjonalnie)

Akcje (action.tool):
- pay_installment — spłać ratę kredytu (params: loanQuery)
- repay_loan — spłata kwoty kredytu (params: loanQuery, amount)
- repay_card — spłata karty (params: cardQuery, amount)
- add_transaction — nowa transakcja (params jak transaction; kategorie tylko z DOZWOLONE_KATEGORIE)
- set_budget — ustaw limit miesięczny (params: mainCategory, subCategory opcjonalnie, limitPln)
- add_category_rule — reguła auto-kategoryzacji (params: pattern, mainCategory, subCategory)
- set_savings_goal — cel oszczędności % (params: goalPct)
- navigate — przejście w aplikacji (params: target: dashboard|reports|investments|add|budgets|month_close|debts|categories|assistant|tasks). „Analiza” w UI = reports, „Pulpit” = dashboard, „Zadania” = tasks.

Schemat planu doradczego:
{"mode":"plan","tools":["filter_transactions"],"toolParams":{"filter_transactions":{"startDate":"2025-05-01","endDate":"2025-05-31","mainCategory":"Samochód","subCategory":"Paliwo","type":"expense"}},"action":null}

Schemat akcji:
{"mode":"action","intent":"pay_installment","reply":"krótko po polsku","action":{"tool":"pay_installment","params":{"loanQuery":"alior"}}}

Jeśli pytanie wymaga danych z aplikacji — wybierz tools. Jeśli użytkownik chce wykonać operację — action.
Nie odpowiadaj użytkownikowi wprost w trybie plan — tylko wskaż tools lub action.`;
}

function getSkrybaCommunicationBlocks() {
    const persona = typeof buildSkrybaPersonaBlock === 'function' ? buildSkrybaPersonaBlock() : '';
    const style = typeof buildSkrybaReplyStyleBlock === 'function' ? buildSkrybaReplyStyleBlock() : '';
    return { persona, style };
}

function buildSkrybaAdvisorSystemPrompt(contextJson) {
    const today = getSkrybaTodayIso();
    const categoryBlock = buildSkrybaCategorySchemaBlock();
    const { persona, style } = getSkrybaCommunicationBlocks();
    return `Jesteś Skryba — asystent finansowy aplikacji Portfel.
Odpowiadaj WYŁĄCZNIE JSON: {"mode":"advisor","reply":"tekst po polsku"}

Dzisiejsza data: ${today}.

${persona}

${style}

Zasady merytoryczne:
- Odpowiadaj na podstawie WYŁĄCZNIE bloku DANE_PONIŻEJ oraz historii rozmowy.
- Masz dostęp do pełnej bazy lokalnej — transakcje z dowolnego miesiąca, długi, budżety, majątek.
- Nie zgaduj liczb — używaj sum z danych (incomePln, expensePln, previous.incomePln, previous_month_summary itd.).
- Gdy user pyta o poprzedni miesiąc — użyj previous_month_summary lub month_summary.previous / compare deltas.
- Jeśli w danych jest 0 transakcji w okresie — powiedz „brak wpisów w tym okresie”, nie „brak dostępu”.
- Przy wymienianiu kategorii używaj wyłącznie nazw z DOZWOLONE_KATEGORIE.

Mapowanie narzędzi:
- filter_transactions → sumExpensesPln, sumIncomePln, count
- month_summary → incomePln, expensePln, balancePln, savingsRatePct; przy comparePrevious użyj deltas i previous
- previous_month_summary (w KONTEKST_BIEŻĄCY) → wpływy/wydatki poprzedniego miesiąca
- month_summary_compare → bieżący miesiąc z deltas vs poprzedni
- data_catalog → zakres dostępnych danych (transactionCount, earliestDate, latestDate)
- list_debts → loans[], creditCards[]
- budget_status → budgets ze state (ok/warn/over), overCount, warnCount
- top_categories → top[] z amountPln i pctOfTotal
- debt_dsr → dsrPct, riskLevel (low/medium/high), totalDebtPaymentsPln, incomePln
- spending_insights → insights[] z kind, severity, title, detail
- recurring_gaps → missing[] z label, amountPln, detail
- suggest_budget → suggestedLimitPln, currentLimitPln, spentThisMonthPln
- weekly_briefing → current, previous, expenseDeltaPct, topCategories, dsrPct
- surplus_hints → estimatedSurplusPln, scenarios[]
- month_close_status → unclosedCount, months[]
- savings_goal_status → goalPct, currentRatePct, onTrack
- snapshot_wealth → netWorthPln, operationalCashPln, totalDebtPln

${categoryBlock}

=== DANE_PONIŻEJ ===
${contextJson}
=== KONIEC DANYCH ===`;
}

function buildSkrybaActionSystemPrompt() {
    const today = getSkrybaTodayIso();
    const categoryBlock = buildSkrybaCategorySchemaBlock();
    const { persona, style } = getSkrybaCommunicationBlocks();
    return `Jesteś Skryba — asystent finansowy Portfel (polski).
Odpowiedz JSON jednym z wariantów:

${persona}

Pole reply: krótkie, naturalne zdanie po polsku — co proponujesz i co user ma potwierdzić (bez żargonu technicznego).
${style ? `\n${style}` : ''}

Dodanie transakcji:
{"mode":"action","intent":"add_transaction","reply":"...","action":{"tool":"add_transaction","params":{"amount":20,"type":"expense","mainCategory":"Zakupy","subCategory":"[Bez podkategorii]","date":"${today}","note":"..."}}}

- Prowizja, pensja, wynagrodzenie, premia, bonus = wpływ (type "income"), zwykle Wynagrodzenie (Prowizja lub Podstawa).

Spłata raty:
{"mode":"action","intent":"pay_installment","reply":"...","action":{"tool":"pay_installment","params":{"loanQuery":"alior"}}}

Spłata karty:
{"mode":"action","intent":"repay_card","reply":"...","action":{"tool":"repay_card","params":{"cardQuery":"mbank","amount":500}}}

Ustawienie limitu budżetu:
{"mode":"action","intent":"set_budget","reply":"...","action":{"tool":"set_budget","params":{"mainCategory":"Zakupy","subCategory":"[Bez podkategorii]","limitPln":800}}}

Reguła kategoryzacji:
{"mode":"action","intent":"add_category_rule","reply":"...","action":{"tool":"add_category_rule","params":{"pattern":"biedronka","mainCategory":"Zakupy","subCategory":"[Bez podkategorii]"}}}

Cel oszczędności:
{"mode":"action","intent":"set_savings_goal","reply":"...","action":{"tool":"set_savings_goal","params":{"goalPct":25}}}

Nawigacja:
{"mode":"action","intent":"navigate","reply":"...","action":{"tool":"navigate","params":{"target":"reports"}}}

Dzisiejsza data: ${today}.

${categoryBlock}`;
}

function buildSkrybaPendingCorrectionPrompt(pendingTransactionJson) {
    const today = getSkrybaTodayIso();
    const categoryBlock = buildSkrybaCategorySchemaBlock();
    const { persona } = getSkrybaCommunicationBlocks();
    return `Jesteś Skryba — asystent Portfel (polski).
Użytkownik koryguje OCZEKUJĄCĄ transakcję (jeszcze niezapisana). Odpowiedz WYŁĄCZNIE JSON.

Dzisiejsza data: ${today}.

${persona}

Pole reply: potwierdź zmianę jednym zdaniem (np. „OK, zmieniam kategorię na Zakupy.”) albo przy anulowaniu — „Zostawiam bez zapisu.”

${categoryBlock}

OCZEKUJĄCA_TRANSAKCJA:
${pendingTransactionJson}

Schematy odpowiedzi:
Aktualizacja pól:
{"mode":"correct_pending","reply":"krótko po polsku","transaction":{"amount":50,"type":"expense","mainCategory":"...","subCategory":"...","date":"${today}","note":"..."}}

Anulowanie propozycji (gdy użytkownik wyraźnie rezygnuje):
{"mode":"cancel_pending","reply":"OK, nie dodaję transakcji."}

Zasady:
- Zwróć pełny obiekt transaction po korekcie (wszystkie pola).
- Pola niewymienione przez użytkownika — zachowaj z OCZEKUJĄCA_TRANSAKCJA.
- „jako wpływ”, „to wpływ”, „dodaj jako wpływ” → type "income" i dopasuj kategorię (prowizja → Wynagrodzenie > Prowizja).
- „jako wydatek” → type "expense".
- NIE zwracaj podsumowania miesiąca ani trybu advisor — tylko correct_pending lub cancel_pending.
- Kategorie tylko z DOZWOLONE_KATEGORIE.
- Nie twórz drugiej transakcji — tylko aktualizuj oczekującą.`;
}

function buildSkrybaUnifiedPrompt(lightContextJson) {
    const today = getSkrybaTodayIso();
    const categoryBlock = buildSkrybaCategorySchemaBlock();
    const { persona, style } = getSkrybaCommunicationBlocks();
    return `Jesteś Skryba — pełny asystent finansowy Portfel PWA (język polski).
Odpowiedz WYŁĄCZNIE jednym obiektem JSON. Bez markdown.

Dzisiejsza data: ${today}.

${persona}

${style}

${categoryBlock}

KONTEKST_BIEŻĄCY (dane lokalne — możesz odpowiadać bez dodatkowych tools):
${lightContextJson}

Warianty odpowiedzi:

1) Potrzebujesz DODATKOWYCH danych (konkretny filtr transakcji / okres / kategoria):
{"mode":"plan","tools":["filter_transactions"],"toolParams":{"filter_transactions":{"startDate":"2025-05-01","endDate":"2025-05-31","mainCategory":"Samochód","type":"expense"}},"action":null}

2) Odpowiedź analityczna (na podstawie KONTEKST_BIEŻĄCY lub po planie) — użyj struktury Werdykt/Liczby/Co dalej w polu reply:
{"mode":"advisor","reply":"tekst po polsku"}

3) Akcja do wykonania — reply: naturalne zaproszenie do potwierdzenia:
{"mode":"action","intent":"add_transaction","reply":"krótko po polsku","action":{"tool":"add_transaction","params":{...}}}

Tools: snapshot_wealth, list_debts, debt_overpay_hints, filter_transactions, debt_schedule_today, budget_status, month_summary, top_categories, debt_dsr, spending_insights, recurring_gaps, suggest_budget, weekly_briefing, surplus_hints, month_close_status, savings_goal_status

Akcje: pay_installment, repay_loan, repay_card, add_transaction, set_budget, add_category_rule, set_savings_goal, navigate (dashboard=pulpit, reports=analiza, investments=aktywa, add=formularz)

Zasady:
- Jeśli użytkownik chce OTWORZYĆ widok (np. „otwórz analizę”, „przejdź do pulpitu”) — użyj navigate, NIE advisor.
- Jeśli pytanie da się odpowiedzieć z KONTEKST_BIEŻĄCY — użyj advisor bez plan (w tym previous_month_summary).
- Nie zgaduj liczb spoza kontekstu — kontekst ma bieżący i poprzedni miesiąc, długi, majątek.
- Nigdy nie twierdź, że nie masz dostępu do bazy — pełny dostęp lokalny.
- Kategorie tylko z DOZWOLONE_KATEGORIE.
- Prowizja, pensja, wynagrodzenie, premia, bonus = wpływ (type income), nie wydatek.
- Uwzględniaj historię rozmowy (follow-upy: „a suma?”, „porównaj”, „więcej”).`;
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
