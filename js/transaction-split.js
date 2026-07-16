function tryParseTransactionSplit(text) {
    const source = String(text || '').trim();
    if (!source) return null;

    const matches = [...source.matchAll(/(\S+)\s+(\d+(?:[.,]\d{1,2})?)/g)];
    if (matches.length < 2) return null;

    const parts = matches.map((match) => {
        const amount = typeof parsePlnInput === 'function'
            ? parsePlnInput(match[2])
            : parseFloat(String(match[2]).replace(',', '.'));
        return {
            label: match[1],
            amount
        };
    }).filter((part) => Number.isFinite(part.amount) && part.amount > 0);

    if (parts.length < 2) return null;

    const total = parts.reduce((sum, part) => sum + part.amount, 0);
    return { parts, total, source };
}

function buildSplitTransactions(baseTx, split) {
    if (!baseTx || !split?.parts?.length) return [];
    return split.parts.map((part) => {
        const tx = {
            ...baseTx,
            amount: part.amount,
            note: part.label
        };
        return typeof applyCategoryRulesToTransaction === 'function'
            ? applyCategoryRulesToTransaction(tx)
            : tx;
    });
}

function amountsRoughlyEqual(a, b, tolerance = 0.02) {
    return Math.abs(Number(a) - Number(b)) <= tolerance;
}

function shouldOfferTransactionSplit(note, amount, editingIndex = null) {
    if (editingIndex !== null) return null;
    const split = tryParseTransactionSplit(note);
    if (!split) return null;
    if (!amountsRoughlyEqual(split.total, amount)) return null;
    return split;
}

function commitMultipleTransactions(txList, options = {}) {
    const committed = [];
    for (const rawTx of txList) {
        const result = commitTransactionData(rawTx, options);
        if (!result.ok) {
            committed.reverse().forEach((tx) => removeCommittedTransaction(tx));
            saveState();
            return result;
        }
        committed.push(result.tx);
    }
    return { ok: true, txs: committed };
}
