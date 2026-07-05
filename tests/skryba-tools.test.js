import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    globalThis.appState = {
        transactions: [
            { date: '2025-05-03', type: 'expense', amount: 250, mainCategory: 'Samochód', subCategory: 'Paliwo', note: 'Orlen' },
            { date: '2025-05-18', type: 'expense', amount: 180, mainCategory: 'Samochód', subCategory: 'Paliwo', note: 'BP' },
            { date: '2025-06-01', type: 'expense', amount: 90, mainCategory: 'Samochód', subCategory: 'Paliwo', note: 'Orlen' }
        ],
        loans: [],
        creditCards: []
    };
    globalThis.getMergedTransactions = () => globalThis.appState.transactions;
    globalThis.localIsoDate = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    globalThis.formatPlnAmount = (n) => `${Number(n).toFixed(2)} zł`;
    globalThis.getPortfolioValuePln = () => 100000;
    globalThis.getLoanCapitalLeft = () => 20000;
    globalThis.getCreditCardDebtTotal = () => 5000;
    globalThis.getLoanSummaryTotal = () => 25000;
    globalThis.getOperationalCashPln = () => 8000;
    globalThis.calcNetWorthPln = () => 80000;
    globalThis.getActiveLoans = () => [];
    globalThis.getActiveCreditCards = () => [];
    globalThis.getCurrentMonthKey = () => '2025-06';
    globalThis.summarizePeriod = (tx) => {
        const income = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const balance = income - expense;
        return { income, expense, balance, savings: income > 0 ? Math.round((balance / income) * 100) : 0 };
    };
    globalThis.hasConfiguredCategoryBudgets = () => true;
    globalThis.getAllCategoryBudgetStatuses = () => ([
        {
            scope: 'main',
            label: 'Samochód',
            category: 'Samochód',
            subCategory: null,
            limit: 1000,
            spent: 900,
            remaining: 100,
            pct: 90,
            state: 'warn'
        }
    ]);
    globalThis.suggestCategoryBudget = () => 750;
    globalThis.getCategoryBudgetLimit = () => 500;
    globalThis.getCategorySpentInMonth = () => 320;
    globalThis.addDaysToIsoDate = (iso, days) => {
        const d = new Date(`${iso}T12:00:00`);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    };
    globalThis.estimatePeriodMonthlySurplus = () => ({ surplus: 500, income: 3000, expense: 2500, label: 'ten miesiąc' });
    globalThis.buildSurplusScenarios = (amount) => ([
        { id: 'cushion', title: 'Poduszka', amount, headline: `${amount}`, detail: 'test' }
    ]);
    globalThis.getUnclosedMonthsWithData = () => ['2025-05'];
    globalThis.formatMonthKeyLabel = (mk) => mk;
    globalThis.buildMonthCloseSteps = () => ([{ id: 'budget', empty: false }, { id: 'summary', empty: false }]);
    globalThis.loadSavingsGoal = () => 20;

    loadScript('js/search-utils.js');
    loadScript('js/transaction-search.js');
    loadScript('js/skryba-dates.js');
    loadScript('js/constants.js');
    loadScript('js/skryba-entities.js');
    loadScript('js/skryba-tools.js');
});

describe('parseSkrybaPeriodFromText', () => {
    it('rozpoznaje „w maju”', () => {
        const period = parseSkrybaPeriodFromText('Ile wydałem na paliwo w maju?', new Date('2025-06-15'));
        expect(period?.startDate).toBe('2025-05-01');
        expect(period?.endDate).toBe('2025-05-31');
    });

    it('rozpoznaje „poprzedniego miesiąca”', () => {
        const period = parseSkrybaPeriodFromText('Ile wpływów w poprzednim miesiącu?', new Date('2025-06-15'));
        expect(period?.startDate).toBe('2025-05-01');
        expect(period?.endDate).toBe('2025-05-31');
    });

    it('rozpoznaje rok w „w 2026”', () => {
        const period = parseSkrybaPeriodFromText('Ile czynsz w 2026', new Date('2026-07-05'));
        expect(period?.startDate).toBe('2026-01-01');
        expect(period?.endDate).toBe('2026-12-31');
    });
});

describe('skrybaToolFilterTransactions', () => {
    it('sumuje paliwo w maju', () => {
        const result = skrybaToolFilterTransactions({
            startDate: '2025-05-01',
            endDate: '2025-05-31',
            mainCategory: 'Samochód',
            subCategory: 'Paliwo',
            type: 'expense'
        });
        expect(result.count).toBe(2);
        expect(result.sumExpensesPln).toBe(430);
    });
});

describe('detectSkrybaToolsFromText', () => {
    it('wykrywa zapytanie o majątek', () => {
        const d = detectSkrybaToolsFromText('Jaki jest mój majątek?');
        expect(d.tools).toContain('snapshot_wealth');
    });

    it('wykrywa filtr transakcji dla paliwa w maju', () => {
        const year = new Date().getFullYear();
        const d = detectSkrybaToolsFromText('Ile wydałem na paliwo w maju?');
        expect(d.tools).toContain('filter_transactions');
        expect(d.toolParams.filter_transactions.startDate).toBe(`${year}-05-01`);
        expect(d.toolParams.filter_transactions.mainCategory).toBe('Samochód');
    });

    it('wykrywa wpływy z poprzedniego miesiąca', () => {
        const ref = new Date('2025-06-15');
        const d = detectSkrybaToolsFromText('Ile było wpływów w poprzednim miesiącu?', ref);
        expect(d.tools).toContain('month_summary');
        expect(d.toolParams.month_summary.startDate).toBe('2025-05-01');
        expect(d.toolParams.month_summary.comparePrevious).toBe(false);
    });

    it('wykrywa przyjemności w czerwcu', () => {
        const d = detectSkrybaToolsFromText('Ile wydałem na przyjemności w czerwcu?', new Date('2026-07-05'));
        expect(d.tools).toContain('filter_transactions');
        expect(d.toolParams.filter_transactions.mainCategory).toBe('Przyjemności');
        expect(d.toolParams.filter_transactions.startDate).toBe('2026-06-01');
    });
});

describe('inferSkrybaFilterFromAssistantText', () => {
    it('wyciąga kategorię z odpowiedzi doradcy', () => {
        const filter = inferSkrybaFilterFromAssistantText(
            'Wydałeś 1278,98 zł na Przyjemności w czerwcu. To głównie Wycieczki.',
            '2026-06'
        );
        expect(filter?.mainCategory).toBe('Przyjemności');
        expect(filter?.startDate).toBe('2026-06-01');
    });
});

describe('tryAnswerSkrybaTransactionQuery', () => {
    it('odpowiada na pytanie o czynsz bez dodawania transakcji', () => {
        globalThis.appState.transactions.push(
            { date: '2026-03-01', type: 'expense', amount: 2500, mainCategory: 'Dom', subCategory: 'Czynsz', note: 'Czynsz marzec' }
        );
        const answer = tryAnswerSkrybaTransactionQuery('Ile czynsz w 2026');
        expect(answer?.intro).toContain('Dom');
        expect(answer?.items).toHaveLength(1);
    });
});

describe('formatSkrybaOfflineReply', () => {
    it('formatuje majątek bez API', () => {
        const text = formatSkrybaOfflineReply(['snapshot_wealth'], {});
        expect(text).toContain('100');
        expect(text).toContain('80');
    });
});

describe('skrybaToolMonthSummary', () => {
    it('sumuje maj i porównuje z kwietniem', () => {
        globalThis.appState.transactions.push(
            { date: '2025-04-10', type: 'expense', amount: 100, mainCategory: 'Zakupy', subCategory: '[Bez podkategorii]', note: '' }
        );
        const result = skrybaToolMonthSummary({
            startDate: '2025-05-01',
            endDate: '2025-05-31',
            label: 'maj',
            comparePrevious: true
        });
        expect(result.expensePln).toBe(430);
        expect(result.previous.expensePln).toBe(100);
        expect(result.deltas.expenseDeltaPln).toBe(330);
    });
});

describe('skrybaToolTopCategories', () => {
    it('zwraca ranking kategorii', () => {
        const result = skrybaToolTopCategories({
            startDate: '2025-05-01',
            endDate: '2025-05-31',
            limit: 3
        });
        expect(result.top[0].name).toBe('Samochód');
        expect(result.top[0].amountPln).toBe(430);
    });
});

describe('skrybaToolBudgetStatus', () => {
    it('zwraca status budżetu', () => {
        const result = skrybaToolBudgetStatus({ monthKey: '2025-06' });
        expect(result.configured).toBe(true);
        expect(result.warnCount).toBe(1);
        expect(result.budgets[0].state).toBe('warn');
    });
});

describe('captureSkrybaAdvisorContext', () => {
    it('zapisuje wyniki wyszukiwania do follow-upów', () => {
        globalThis.skrybaLastSearchResults = [];
        globalThis.skrybaLastAdvisorContext = null;
        globalThis.skrybaLastTransactionFilter = null;
        const context = buildSkrybaContextBundle(['filter_transactions'], {
            filter_transactions: {
                startDate: '2025-05-01',
                endDate: '2025-05-31',
                mainCategory: 'Samochód',
                subCategory: 'Paliwo',
                type: 'expense'
            }
        });
        captureSkrybaAdvisorContext(context, {
            filter_transactions: {
                startDate: '2025-05-01',
                endDate: '2025-05-31',
                mainCategory: 'Samochód',
                subCategory: 'Paliwo',
                type: 'expense'
            }
        });
        expect(skrybaLastSearchResults).toHaveLength(2);
        expect(skrybaLastAdvisorContext.context.filter_transactions.count).toBe(2);
    });

    it('zapamiętuje filtr kategorii z budżetu', () => {
        globalThis.skrybaLastSearchResults = [];
        globalThis.skrybaLastTransactionFilter = null;
        const context = {
            budget_status: {
                monthKey: '2025-06',
                budgets: [{
                    label: 'Dom › Czynsz',
                    scope: 'sub',
                    category: 'Dom',
                    subCategory: 'Czynsz',
                    state: 'over'
                }]
            }
        };
        captureSkrybaAdvisorContext(context, { budget_status: { monthKey: '2025-06' } });
        expect(skrybaLastTransactionFilter.mainCategory).toBe('Dom');
        expect(skrybaLastTransactionFilter.subCategory).toBe('Czynsz');
    });
});

describe('detectSkrybaToolsFromText — analityka', () => {
    it('wykrywa podsumowanie miesiąca', () => {
        const d = detectSkrybaToolsFromText('Jak wyglądał ten miesiąc finansowo?');
        expect(d.tools).toContain('month_summary');
    });

    it('wykrywa budżet', () => {
        const d = detectSkrybaToolsFromText('Czy przekroczę budżet na jedzenie?');
        expect(d.tools).toContain('budget_status');
    });

    it('wykrywa top kategorie', () => {
        const d = detectSkrybaToolsFromText('Gdzie najwięcej wydałem w maju?');
        expect(d.tools).toContain('top_categories');
        expect(d.toolParams.top_categories.startDate).toMatch(/-05-01$/);
    });

    it('wykrywa DSR', () => {
        const d = detectSkrybaToolsFromText('Jakie mam obciążenie dochodem?');
        expect(d.tools).toContain('debt_dsr');
    });

    it('wykrywa insighty', () => {
        const d = detectSkrybaToolsFromText('Co mnie zaskoczyło w tym miesiącu?');
        expect(d.tools).toContain('spending_insights');
    });

    it('wykrywa braki cykliczne', () => {
        const d = detectSkrybaToolsFromText('Czego brakuje w cyklicznych?');
        expect(d.tools).toContain('recurring_gaps');
    });
});

describe('buildSkrybaDailyBriefing', () => {
    it('zwraca tekst briefingu gdy są dane', () => {
        globalThis.appState.categoryBudgets = { Samochód: 1000 };
        const briefing = buildSkrybaDailyBriefing(3);
        expect(briefing.text).toBeTruthy();
        expect(briefing.items.length).toBeGreaterThan(0);
    });
});

describe('skrybaToolWeeklyBriefing', () => {
    it('porównuje ostatnie 7 dni', () => {
        const week = skrybaToolWeeklyBriefing();
        expect(week.text).toContain('Wydatki');
        expect(week.weekKey).toMatch(/^\d{4}-W\d{2}$/);
    });
});

describe('skrybaToolSuggestBudget', () => {
    it('proponuje limit z historii', () => {
        const result = skrybaToolSuggestBudget({ mainCategory: 'Samochód' });
        expect(result.suggestedLimitPln).toBe(750);
        expect(result.currentLimitPln).toBe(500);
    });
});

describe('buildSkrybaLightContext', () => {
    it('zawiera podstawowe metryki i poprzedni miesiąc', () => {
        const ctx = buildSkrybaLightContext();
        expect(ctx.month_summary).toBeTruthy();
        expect(ctx.previous_month_summary).toBeTruthy();
        expect(ctx.month_summary_compare?.deltas).toBeTruthy();
        expect(ctx.data_catalog?.transactionCount).toBeGreaterThan(0);
        expect(ctx.list_debts).toBeTruthy();
        expect(ctx.budget_status).toBeTruthy();
        expect(ctx.snapshot_wealth).toBeTruthy();
        expect(ctx.savings_goal_status).toBeTruthy();
        expect(ctx.month_close_status).toBeTruthy();
    });
});

describe('skrybaToolSurplusHints', () => {
    it('zwraca scenariusze alokacji', () => {
        const result = skrybaToolSurplusHints({});
        expect(result.estimatedSurplusPln).toBe(500);
        expect(result.scenarios.length).toBeGreaterThan(0);
    });
});

describe('buildSkrybaFollowUpChips', () => {
    it('proponuje chipy na podstawie kontekstu', () => {
        const chips = buildSkrybaFollowUpChips({
            filter_transactions: { count: 3 },
            month_close_status: { unclosedCount: 1 }
        });
        expect(chips).toContain('suma');
        expect(chips).toContain('Rozlicz miesiąc');
    });
});

describe('parseSkrybaAmountFilterFromText', () => {
    it('rozpoznaje „powyżej 600”', () => {
        expect(parseSkrybaAmountFilterFromText('pokaz transakcje powyzej 600')?.minAmount).toBe(600);
    });

    it('rozpoznaje literówkę „powyuzej 599”', () => {
        expect(parseSkrybaAmountFilterFromText('pokaz transakcje powyuzej 599 w czerwcu')?.minAmount).toBe(599);
    });

    it('rozpoznaje „powyżej 2000” nawet gdy w zapytaniu jest rok', () => {
        expect(parseSkrybaAmountFilterFromText('transakcje powyzej 2000 w 2026')?.minAmount).toBe(2000);
    });

    it('nie myli roku 2026 z progiem kwoty', () => {
        expect(isLikelySkrybaYearAmount(2000, 'transakcje powyzej 2000 w 2026')).toBe(false);
        expect(isLikelySkrybaYearAmount(2026, 'transakcje w 2026')).toBe(true);
    });
});

describe('tryAnswerSkrybaTransactionQuery — kwota', () => {
    beforeAll(() => {
        globalThis.appState.transactions = [
            { date: '2026-06-01', type: 'expense', amount: 532, mainCategory: 'Przyjemności', subCategory: 'Wycieczki', note: 'A' },
            { date: '2026-06-02', type: 'expense', amount: 1037.5, mainCategory: 'Przyjemności', subCategory: 'Wycieczki', note: 'B' },
            { date: '2026-06-03', type: 'expense', amount: 28, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: 'C' }
        ];
    });

    it('filtruje transakcje powyżej 600 w czerwcu', () => {
        const answer = tryAnswerSkrybaTransactionQuery('pokaz transakcje powyzej 600 w czerwcu');
        expect(answer?.items).toHaveLength(1);
        expect(answer.items[0].amount).toBe(1037.5);
    });

    it('filtruje transakcje powyżej 599 w czerwcu', () => {
        const answer = tryAnswerSkrybaTransactionQuery('pokaz transakcje powyuzej 599 w czerwcu');
        expect(answer?.items).toHaveLength(1);
        expect(answer.items[0].amount).toBe(1037.5);
    });

    it('filtruje transakcje powyżej 2000 w 2026', () => {
        globalThis.appState.transactions = [
            { date: '2026-01-15', type: 'expense', amount: 1500, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: 'A' },
            { date: '2026-03-20', type: 'expense', amount: 2500, mainCategory: 'Przyjemności', subCategory: 'Wycieczki', note: 'B' },
            { date: '2025-12-01', type: 'expense', amount: 3000, mainCategory: 'Zakupy', subCategory: 'Zakupy', note: 'C' }
        ];
        const answer = tryAnswerSkrybaTransactionQuery('transakcje powyzej 2000 w 2026');
        expect(answer?.items).toHaveLength(1);
        expect(answer.items[0].amount).toBe(2500);
    });

    it('rozpoznaje „transakcje 1500 w czerwcu” bez słowa powyżej', () => {
        globalThis.appState.transactions = [
            { date: '2026-06-11', type: 'expense', amount: 4130.69, mainCategory: 'Długi', subCategory: 'Kredyt hipoteczny', note: 'H' },
            { date: '2026-06-29', type: 'expense', amount: 682.13, mainCategory: 'Dom', subCategory: 'Remont', note: 'R' },
            { date: '2026-05-11', type: 'expense', amount: 4134.36, mainCategory: 'Długi', subCategory: 'Kredyt hipoteczny', note: 'H2' }
        ];
        const params = extractSkrybaTransactionListParams('Transakcje 1500 w czerwcu', new Date('2026-06-29'));
        expect(params.minAmount).toBe(1500);
        expect(params.startDate).toBe('2026-06-01');
        const answer = tryAnswerSkrybaTransactionQuery('Transakcje 1500 w czerwcu');
        expect(answer?.items).toHaveLength(1);
        expect(answer.items[0].amount).toBe(4130.69);
    });

    it('łączy poprzedni filtr kwoty z doprecyzowaniem okresu', () => {
        globalThis.appState.transactions = [
            { date: '2026-06-11', type: 'expense', amount: 4130.69, mainCategory: 'Długi', subCategory: 'Kredyt hipoteczny', note: 'H' },
            { date: '2026-06-29', type: 'expense', amount: 682.13, mainCategory: 'Dom', subCategory: 'Remont', note: 'R' },
            { date: '2026-05-11', type: 'expense', amount: 4134.36, mainCategory: 'Długi', subCategory: 'Kredyt hipoteczny', note: 'H2' }
        ];
        tryAnswerSkrybaTransactionQuery('Transakcje powyżej 1500');
        expect(globalThis.skrybaLastTransactionFilter?.minAmount).toBe(1500);
        const answer = tryAnswerSkrybaTransactionQuery('Tylko w czerwcu');
        expect(answer?.items).toHaveLength(1);
        expect(answer.items[0].amount).toBe(4130.69);
        expect(answer.filter.minAmount).toBe(1500);
        expect(answer.filter.startDate).toBe('2026-06-01');
    });
});

describe('transakcje bez podkategorii — Skryba', () => {
    beforeEach(() => {
        globalThis.skrybaLastTransactionFilter = null;
        globalThis.skrybaLastSearchResults = [];
        globalThis.appState.transactions = [
            { date: '2026-06-05', type: 'expense', amount: 40, mainCategory: 'Zakupy', subCategory: '[Bez podkategorii]', note: 'A' },
            { date: '2026-06-06', type: 'expense', amount: 50, mainCategory: 'Zakupy', subCategory: 'Alko', note: 'B' },
            { date: '2026-05-20', type: 'expense', amount: 30, mainCategory: 'Dom', subCategory: '[Bez podkategorii]', note: 'C' }
        ];
    });

    it('wykrywa intencję braku podkategorii', () => {
        expect(parseSkrybaMissingSubCategoryIntent('pokaż transakcje bez podkategorii')).toBe(true);
        expect(parseSkrybaMissingSubCategoryIntent('ile wydałem na paliwo')).toBe(false);
    });

    it('filtruje transakcje bez podkategorii w czerwcu', () => {
        const params = resolveSkrybaTransactionListParams('transakcje bez podkategorii w czerwcu', new Date('2026-06-15'));
        expect(params.missingSubCategory).toBe(true);
        expect(params.startDate).toBe('2026-06-01');
        const items = skrybaGetFilteredTransactionItems(params);
        expect(items).toHaveLength(1);
        expect(items[0].note).toBe('A');
    });

    it('domyślnie bierze bieżący miesiąc gdy brak okresu', () => {
        const params = resolveSkrybaTransactionListParams('pokaż transakcje bez podkategorii', new Date('2026-06-15'));
        expect(params.startDate).toBe('2026-06-01');
        expect(params.endDate).toBe('2026-06-30');
        const answer = tryAnswerSkrybaTransactionQuery('pokaż transakcje bez podkategorii');
        expect(answer?.items).toHaveLength(1);
        expect(answer.intro).toMatch(/bez podkategorii/i);
        expect(answer.intro).toMatch(/Kliknij pozycję/i);
    });
});
