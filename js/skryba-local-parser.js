function tryParseLocalAddTransaction(text) {
    const t = String(text || '').trim();
    if (!t || t.length < 4) return null;

    if (typeof isSkrybaReadOnlyQuery === 'function' && isSkrybaReadOnlyQuery(t)) return null;

    if (typeof tryParseTransactionSplit === 'function') {
        const split = tryParseTransactionSplit(t);
        if (split) {
            const today = typeof localIsoDate === 'function'
                ? localIsoDate(new Date())
                : new Date().toISOString().slice(0, 10);
            const parts = typeof buildSplitTransactions === 'function'
                ? buildSplitTransactions({
                    amount: split.total,
                    type: 'expense',
                    mainCategory: 'Różne',
                    subCategory: '[Bez podkategorii]',
                    date: today,
                    note: '',
                    affectsCash: true
                }, split)
                : [];
            if (parts.length >= 2) {
                return {
                    intent: 'add_transaction_split',
                    reply: `Podzielę zakup na ${parts.length} pozycje (${split.total.toFixed(2)} zł).`,
                    transactions: parts
                };
            }
        }
    }

    let amount = null;
    let desc = '';
    const m1 = t.match(/^(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?\s+(.+)$/i);
    const m2 = t.match(/^(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)?$/i);
    if (m1) {
        amount = typeof parsePlnInput === 'function' ? parsePlnInput(m1[1]) : parseFloat(m1[1].replace(',', '.'));
        desc = m1[2].trim();
    } else if (m2) {
        desc = m2[1].trim();
        amount = typeof parsePlnInput === 'function' ? parsePlnInput(m2[2]) : parseFloat(m2[2].replace(',', '.'));
    }
    if (!Number.isFinite(amount) || amount <= 0 || desc.length < 2) return null;
    if (typeof isLikelySkrybaYearAmount === 'function' && isLikelySkrybaYearAmount(amount, t)) return null;

    const lower = desc.toLowerCase();
    let type = 'expense';
    let mainCategory = 'Różne';
    let subCategory = '[Bez podkategorii]';
    if (/wynagrodzenie|pensja|wpływ|wplyw|premia/.test(lower)) {
        type = 'income';
        mainCategory = 'Wynagrodzenie';
    } else if (/biedronka|lidl|kaufland|żabka|zabka|carrefour|aldi|dino|zakupy/.test(lower)) {
        mainCategory = 'Zakupy';
    } else if (/orlen|paliwo|bp |circle k|stacja/.test(lower)) {
        mainCategory = 'Samochód';
        subCategory = 'Paliwo';
    } else if (/netflix|spotify|hbo|subskrypcj/.test(lower)) {
        mainCategory = 'Subskrypcje';
    } else if (/uber|bolt|taxi|bilet/.test(lower)) {
        mainCategory = 'Transport';
    }

    const today = typeof localIsoDate === 'function'
        ? localIsoDate(new Date())
        : new Date().toISOString().slice(0, 10);
    const cats = typeof resolveAssistantCategories === 'function'
        ? resolveAssistantCategories(type, mainCategory, subCategory)
        : { mainCategory, subCategory };
    return {
        intent: 'add_transaction',
        reply: `Dodaję: ${desc} — ${amount.toFixed(2)} zł.`,
        transaction: {
            amount,
            type,
            mainCategory: cats.mainCategory,
            subCategory: cats.subCategory,
            date: today,
            note: desc
        },
        search: null,
        summarize: null
    };
}
