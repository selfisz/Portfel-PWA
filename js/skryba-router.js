async function callGroqSkrybaRaw(messages, { retry = true } = {}) {
    const apiKey = typeof getAssistantApiKey === 'function' ? getAssistantApiKey() : '';
    if (!apiKey) {
        throw new Error('Ustaw klucz API Groq w Ustawienia → Asystent AI.');
    }

    const response = await fetch(ASSISTANT_GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: ASSISTANT_GROQ_MODEL,
            temperature: 0.2,
            max_tokens: 1024,
            response_format: { type: 'json_object' },
            messages
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        if (response.status === 401) {
            throw new Error('Nieprawidłowy klucz API Groq — sprawdź Ustawienia → Asystent AI.');
        }
        if (response.status === 429) {
            throw new Error('Limit zapytań Groq — spróbuj za chwilę.');
        }
        throw new Error(`Błąd Groq (${response.status}). Spróbuj ponownie.`);
    }

    const data = await response.json();
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) throw new Error('Pusta odpowiedź modelu.');
    const parsed = parseSkrybaModelJson(rawText);
    if (!parsed && retry) {
        return callGroqSkrybaRaw(messages, { retry: false });
    }
    return parsed;
}

function formatSkrybaHistoryEntryContent(entry) {
    const text = String(entry?.text || '');
    const pendingTx = entry?.meta?.pending?.transaction;
    if (pendingTx) {
        return `${text}\n[[PENDING_TX]]:${JSON.stringify(pendingTx)}`;
    }
    return text;
}

function buildSkrybaHistoryMessages(limit = 10) {
    const history = typeof skrybaChatHistory !== 'undefined' ? skrybaChatHistory : [];
    return history.slice(-limit).map((entry) => ({
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: formatSkrybaHistoryEntryContent(entry)
    }));
}

async function callGroqSkrybaUnified(userMessage, lightContext = {}) {
    const lightJson = JSON.stringify(lightContext, null, 0);
    const messages = [
        { role: 'system', content: buildSkrybaUnifiedPrompt(lightJson) },
        ...buildSkrybaHistoryMessages(8),
        { role: 'user', content: userMessage }
    ];
    return callGroqSkrybaRaw(messages);
}

async function callGroqSkrybaPlanner(userMessage) {
    const messages = [
        { role: 'system', content: buildSkrybaPlannerPrompt() },
        ...buildSkrybaHistoryMessages(8),
        { role: 'user', content: userMessage }
    ];
    return callGroqSkrybaRaw(messages);
}

async function callGroqSkrybaAdvisor(userMessage, context) {
    const contextJson = JSON.stringify(context, null, 0);
    const messages = [
        { role: 'system', content: buildSkrybaAdvisorSystemPrompt(contextJson) },
        ...buildSkrybaHistoryMessages(8),
        { role: 'user', content: userMessage }
    ];
    return callGroqSkrybaRaw(messages);
}

async function callGroqSkrybaActionParser(userMessage) {
    const messages = [
        { role: 'system', content: buildSkrybaActionSystemPrompt() },
        ...buildSkrybaHistoryMessages(8),
        { role: 'user', content: userMessage }
    ];
    return callGroqSkrybaRaw(messages);
}

async function callGroqSkrybaPendingCorrection(userMessage, pendingTransaction) {
    const pendingJson = JSON.stringify(pendingTransaction, null, 0);
    const messages = [
        { role: 'system', content: buildSkrybaPendingCorrectionPrompt(pendingJson) },
        ...buildSkrybaHistoryMessages(8),
        { role: 'user', content: userMessage }
    ];
    return callGroqSkrybaRaw(messages);
}

function isSkrybaUnrelatedQueryWhilePending(text) {
    const t = String(text || '').toLowerCase();
    if (/^(anuluj|nie dodawaj|odrzuć|rezygnuj|potwierdź|dodaj|zapisz)/.test(t)) return false;
    if (/zmie[nń]|kategoria|kwota|data|wczoraj|dzisiaj|dziś/.test(t)) return false;
    if (/^\d+(?:[.,]\d{1,2})?\s*zł?/.test(t)) return false;
    return /^(ile|pokaż|pokaz|suma|majątek|majątek|kredyt|hipotek|net worth|saldo)/.test(t)
        || /\b(ile wyda|ile mam|ile zost|harmonogram)\b/.test(t);
}

async function processSkrybaPendingCorrection(userMessage) {
    const pending = typeof getSkrybaPendingTransactionState === 'function'
        ? getSkrybaPendingTransactionState()
        : null;
    if (!pending) return null;

    const local = typeof tryApplyLocalPendingCorrection === 'function'
        ? tryApplyLocalPendingCorrection(userMessage, pending)
        : null;
    if (local?.action === 'cancel') {
        return { kind: 'pending_cancel', reply: local.reply };
    }
    if (local?.action === 'update' && local.transaction) {
        return { kind: 'pending_update', transaction: local.transaction, reply: local.reply };
    }

    if (isSkrybaUnrelatedQueryWhilePending(userMessage)) {
        return {
            kind: 'pending_clarify',
            reply: 'Masz oczekującą propozycję transakcji. Najpierw ją popraw (np. „zmień kategorię na Kosmetyki”), kliknij Dodaj/Anuluj, albo napisz „anuluj”.'
        };
    }

    const corrected = await callGroqSkrybaPendingCorrection(userMessage, pending.transaction);
    if (corrected?.mode === 'cancel_pending') {
        return { kind: 'pending_cancel', reply: corrected.reply || 'OK, nie dodaję transakcji.' };
    }
    if (corrected?.mode === 'correct_pending' && corrected.transaction) {
        return {
            kind: 'pending_update',
            transaction: corrected.transaction,
            reply: corrected.reply || 'Zaktualizowałem propozycję.'
        };
    }
    return {
        kind: 'pending_clarify',
        reply: corrected?.reply || 'Nie rozumiem korekty — podaj np. „zmień kategorię na Zakupy” lub „kwota 50”.'
    };
}

async function processSkrybaUserMessage(text) {
    const pending = typeof getSkrybaPendingTransactionState === 'function'
        ? getSkrybaPendingTransactionState()
        : null;
    if (pending) {
        return processSkrybaPendingCorrection(text);
    }

    const localAction = typeof tryParseLocalSkrybaAction === 'function'
        ? tryParseLocalSkrybaAction(text)
        : null;
    if (localAction) {
        return { kind: 'action', action: localAction };
    }

    const localTx = typeof tryParseLocalAddTransaction === 'function'
        ? tryParseLocalAddTransaction(text)
        : null;
    if (localTx) {
        return { kind: 'parsed', parsed: localTx };
    }

    const detection = typeof detectSkrybaToolsFromText === 'function'
        ? detectSkrybaToolsFromText(text)
        : { tools: [], toolParams: {} };

    if (typeof isSkrybaAdvisorQuery === 'function' && isSkrybaAdvisorQuery(detection) && detection.tools.length) {
        const context = buildSkrybaContextBundle(detection.tools, detection.toolParams);
        const advisor = await callGroqSkrybaAdvisor(text, context);
        if (advisor) {
            return {
                kind: 'parsed',
                parsed: advisor,
                advisorContext: context,
                advisorToolParams: detection.toolParams
            };
        }
    }

    const plan = await callGroqSkrybaUnified(text, typeof buildSkrybaLightContext === 'function'
        ? buildSkrybaLightContext()
        : {});
    if (plan?.mode === 'action' && plan?.action?.tool) {
        return {
            kind: 'action',
            action: {
                tool: plan.action.tool,
                params: plan.action.params || {},
                reply: plan.reply || ''
            }
        };
    }

    if (plan?.tools?.length) {
        const lightContext = typeof buildSkrybaLightContext === 'function'
            ? buildSkrybaLightContext()
            : {};
        const context = {
            ...lightContext,
            ...buildSkrybaContextBundle(plan.tools, plan.toolParams || {})
        };
        const advisor = await callGroqSkrybaAdvisor(text, context);
        if (advisor) {
            return {
                kind: 'parsed',
                parsed: advisor,
                advisorContext: context,
                advisorToolParams: plan.toolParams || {}
            };
        }
    }

    if (plan?.mode === 'advisor' && plan.reply) {
        const lightContext = typeof buildSkrybaLightContext === 'function'
            ? buildSkrybaLightContext()
            : {};
        return {
            kind: 'parsed',
            parsed: plan,
            advisorContext: lightContext,
            advisorToolParams: {}
        };
    }

    return {
        kind: 'parsed',
        parsed: {
            mode: 'advisor',
            reply: 'Nie jestem pewien, o co pytasz. Podaj kwotę i opis wydatku, zapytaj o majątek albo np. „ile wydałem na paliwo w maju”.'
        }
    };
}
