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
        throw new Error(`Groq HTTP ${response.status}: ${errText.slice(0, 200)}`);
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

function buildSkrybaHistoryMessages(limit = 10) {
    const history = typeof skrybaChatHistory !== 'undefined' ? skrybaChatHistory : [];
    return history.slice(-limit).map((entry) => ({
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: entry.text
    }));
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

async function processSkrybaUserMessage(text) {
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
        if (advisor) return { kind: 'parsed', parsed: advisor };
    }

    const plan = await callGroqSkrybaPlanner(text);
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
        const context = buildSkrybaContextBundle(plan.tools, plan.toolParams || {});
        const advisor = await callGroqSkrybaAdvisor(text, context);
        if (advisor) return { kind: 'parsed', parsed: advisor };
    }

    const actionParsed = await callGroqSkrybaActionParser(text);
    if (actionParsed?.mode === 'action' && actionParsed?.action?.tool) {
        return {
            kind: 'action',
            action: {
                tool: actionParsed.action.tool,
                params: actionParsed.action.params || {},
                reply: actionParsed.reply || ''
            }
        };
    }

    if (actionParsed?.mode === 'advisor' && actionParsed.reply) {
        return { kind: 'parsed', parsed: actionParsed };
    }

    return {
        kind: 'parsed',
        parsed: {
            mode: 'advisor',
            reply: 'Nie jestem pewien, o co pytasz. Podaj kwotę i opis wydatku, zapytaj o majątek albo np. „ile wydałem na paliwo w maju”.'
        }
    };
}
