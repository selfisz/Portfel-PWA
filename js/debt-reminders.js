function collectCardRepaymentEvents() {
    const events = [];
    const seen = new Set();

    (appState.creditCardMovements || []).forEach((raw) => {
        const movement = typeof normalizeCreditCardMovement === 'function'
            ? normalizeCreditCardMovement(raw)
            : null;
        if (!movement || movement.type !== 'transfer_out') return;
        const card = getCreditCardById(movement.cardId);
        if (!card || card.archived) return;
        const id = `card-repay|transfer|${movement.id}`;
        if (seen.has(id)) return;
        seen.add(id);
        events.push({
            id,
            cardId: movement.cardId,
            cardName: card.name,
            amount: movement.amount,
            sourceDate: movement.date,
            dueDate: addDaysToIsoDate(movement.date, CARD_REPAYMENT_REMINDER_DAYS),
            sourceType: 'transfer'
        });
    });

    (appState.transactions || []).forEach((tx) => {
        if (tx.type !== 'expense' || !tx.creditCardId) return;
        const card = getCreditCardById(tx.creditCardId);
        if (!card || card.archived) return;
        const fp = typeof transactionFingerprint === 'function' ? transactionFingerprint(tx) : `${tx.date}|${tx.amount}`;
        const id = `card-repay|tx|${fp}`;
        if (seen.has(id)) return;
        seen.add(id);
        events.push({
            id,
            cardId: tx.creditCardId,
            cardName: card.name,
            amount: tx.amount,
            sourceDate: tx.date,
            dueDate: addDaysToIsoDate(tx.date, CARD_REPAYMENT_REMINDER_DAYS),
            sourceType: 'purchase'
        });
    });

    return events;
}

function isCardRepaymentEventSettled(payload) {
    const card = getCreditCardById(payload.cardId);
    if (!card || card.currentBalance <= 0) return true;
    if (!payload.sourceDate || !payload.amount) return false;

    const repaid = (appState.creditCardMovements || [])
        .map((raw) => (typeof normalizeCreditCardMovement === 'function' ? normalizeCreditCardMovement(raw) : null))
        .filter((m) => m && m.cardId === payload.cardId && m.type === 'repayment' && m.date >= payload.sourceDate)
        .reduce((sum, m) => sum + m.amount, 0);
    return repaid >= payload.amount - 0.01;
}

function evaluateLoanReminders() {
    const today = localIsoDate(new Date());
    const tomorrow = getTomorrowIsoDate();
    const created = [];

    const checkDate = (dateStr, type, titlePrefix) => {
        if (typeof getScheduledDebtPaymentsOnDate !== 'function') return;
        getScheduledDebtPaymentsOnDate(dateStr)
            .filter((payment) => payment.type === 'loan')
            .forEach((payment) => {
                const loan = getLoanById(payment.id);
                if (!loan || !(loan.currentCapitalLeft > 0)) return;
                const item = upsertNotification({
                    id: `loan-due|${payment.id}|${dateStr}|${type}`,
                    type,
                    title: `${titlePrefix}: ${payment.name}`,
                    body: `${formatPlnAmount(payment.amount)} · ${formatTxDate(dateStr)}`,
                    refreshRead: true,
                    payload: { loanId: payment.id, dueDate: dateStr }
                });
                if (item) created.push(item);
            });
    };

    checkDate(tomorrow, 'loan_due_1d', 'Rata jutro');
    checkDate(today, 'loan_due_0d', 'Rata dziś');
    return created;
}

function evaluateCardReminders() {
    const today = localIsoDate(new Date());
    const created = [];

    collectCardRepaymentEvents().forEach((event) => {
        if (event.dueDate !== today) return;
        if (isCardRepaymentEventSettled(event)) return;
        const sourceLabel = event.sourceType === 'transfer' ? 'przelew z karty' : 'zakup kartą';
        const item = upsertNotification({
            id: event.id,
            type: 'card_repay_50d',
            title: `Spłata karty: ${event.cardName}`,
            body: `${formatPlnAmount(event.amount)} (${sourceLabel} z ${formatTxDate(event.sourceDate)})`,
            refreshRead: true,
            payload: {
                cardId: event.cardId,
                amount: event.amount,
                sourceDate: event.sourceDate,
                sourceType: event.sourceType
            }
        });
        if (item) created.push(item);
    });

    const day = new Date(`${today}T12:00:00`).getDate();
    if (day === 1) {
        const cards = getActiveCreditCards().filter((c) => c.currentBalance > 0);
        if (cards.length) {
            const monthKey = today.slice(0, 7);
            const names = cards.map((c) => c.name).join(', ');
            const total = cards.reduce((sum, c) => sum + c.currentBalance, 0);
            const item = upsertNotification({
                id: `card-monthly|${monthKey}`,
                type: 'card_monthly_check',
                title: 'Sprawdź karty do spłaty',
                body: `${cards.length} ${cards.length === 1 ? 'karta' : 'kart'} · łącznie ${formatPlnAmount(total)} (${names})`,
                refreshRead: true,
                payload: {
                    cardIds: cards.map((c) => c.id),
                    cardId: cards[0].id
                }
            });
            if (item) created.push(item);
        }
    }

    return created;
}
