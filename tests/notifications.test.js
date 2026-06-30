import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadScript } from './helpers/load.js';

beforeAll(() => {
    const store = {};
    globalThis.localStorage = {
        getItem: (k) => store[k] ?? null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };

    globalThis.document = {
        getElementById: () => null,
        addEventListener: () => {},
        querySelector: () => null
    };

    loadScript('js/constants.js');
    loadScript('js/format.js');
    loadScript('js/portfolio.js');
    loadScript('js/notifications.js');
    loadScript('js/budget-ui.js');
    loadScript('js/budget-alerts.js');
    loadScript('js/debt-reminders.js');

    globalThis.getLoanById = () => null;
    globalThis.getCreditCardById = () => null;
    globalThis.getActiveCreditCards = () => [];
    globalThis.getScheduledDebtPaymentsOnDate = () => [];
    globalThis.normalizeCreditCardMovement = (raw) => raw;
    globalThis.transactionFingerprint = (tx) => `${tx.date}|${tx.amount}|${tx.mainCategory}`;
    globalThis.suggestCategoryBudget = (cat) => (cat === 'Transport' ? 500 : 0);
    globalThis.getAllRecurringEntries = () => [];
    globalThis.getIkzeContributionsInYear = () => 1000;
    globalThis.getIkzeAnnualLimitPln = () => 8000;
    globalThis.loadSavingsGoal = () => 20;

    loadScript('js/spending-insights.js');
});

beforeEach(() => {
    localStorage.clear();
    globalThis.appState = {
        transactions: [],
        categoryBudgets: {},
        creditCards: [],
        creditCardMovements: [],
        loans: []
    };
});

describe('addDaysToIsoDate', () => {
    it('dodaje 50 dni', () => {
        expect(addDaysToIsoDate('2026-01-01', 50)).toBe('2026-02-20');
    });
});

describe('evaluateBudgetAlerts', () => {
    it('tworzy alert 80% i 100%', () => {
        saveNotificationPrefs({ enabled: true, budgetAlerts: true });
        const monthKey = getCurrentMonthKey();
        const midMonth = `${monthKey}-15`;
        appState.categoryBudgets = { Jedzenie: 1000 };
        appState.transactions = [
            { type: 'expense', mainCategory: 'Jedzenie', subCategory: 'X', amount: 850, date: midMonth }
        ];
        const created = evaluateBudgetAlerts();
        expect(created.some((n) => n.type === 'budget_warn')).toBe(true);

        appState.transactions[0].amount = 1100;
        const created2 = evaluateBudgetAlerts();
        expect(created2.some((n) => n.type === 'budget_over')).toBe(true);
    });
});

describe('collectCardRepaymentEvents', () => {
    it('zbiera przelew i zakup kartą', () => {
        const card = { id: 'c1', name: 'mBank', limit: 5000, currentBalance: 200, archived: false };
        appState.creditCards = [card];
        globalThis.getCreditCardById = (id) => (id === 'c1' ? card : null);
        appState.creditCardMovements = [{
            id: 'm1', cardId: 'c1', type: 'transfer_out', amount: 100, date: '2026-01-10', note: ''
        }];
        appState.transactions = [{
            type: 'expense', creditCardId: 'c1', amount: 50, date: '2026-01-12',
            mainCategory: 'Zakupy', subCategory: 'X'
        }];
        const events = collectCardRepaymentEvents();
        expect(events).toHaveLength(2);
        expect(events[0].dueDate).toBe(addDaysToIsoDate('2026-01-10', 50));
    });
});

describe('dismiss i snooze', () => {
    it('snooze ukrywa do jutra', () => {
        upsertNotification({
            id: 'test-1',
            type: 'loan_due_0d',
            title: 'Test',
            body: 'Body',
            payload: {}
        });
        snoozeNotification('test-1');
        const item = getNotificationById('test-1');
        expect(item.snoozedUntil).toBe(getTomorrowIsoDate());
        expect(isNotificationVisible(item)).toBe(false);
    });

    it('dismiss ukrywa w bieżącym miesiącu', () => {
        upsertNotification({
            id: 'test-2',
            type: 'loan_due_1d',
            title: 'Test',
            body: 'Body',
            payload: { loanId: 'l1' }
        });
        dismissNotification('test-2');
        const item = getNotificationById('test-2');
        expect(item.dismissed).toBe(true);
        expect(isNotificationVisible(item)).toBe(false);
    });
});

describe('markAllNotificationsRead', () => {
    it('zeruje licznik nieprzeczytanych', () => {
        upsertNotification({ id: 'a', type: 'budget_warn', title: 'A', body: 'b', payload: {} });
        upsertNotification({ id: 'b', type: 'budget_warn', title: 'B', body: 'b', payload: {} });
        markAllNotificationsRead();
        expect(getUnreadNotificationCount()).toBe(0);
    });
});

describe('evaluateSpendingPaceAlerts', () => {
    it('prognozuje przekroczenie limitu przed 80%', () => {
        const monthKey = getCurrentMonthKey();
        const day = new Date().getDate();
        if (day < 4) return;

        appState.categoryBudgets = { Jedzenie: 1000 };
        appState.transactions = [{
            type: 'expense',
            mainCategory: 'Jedzenie',
            subCategory: 'X',
            amount: Math.round((1000 / day) * day * 0.55),
            date: `${monthKey}-${String(day).padStart(2, '0')}`
        }];
        const spent = getCategorySpentInMonth('Jedzenie', monthKey);
        if (spent >= 800) return;

        const created = evaluateSpendingPaceAlerts();
        if (spent / day * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() > 1000) {
            expect(created.some((n) => n.type === 'budget_pace')).toBe(true);
        }
    });
});

describe('evaluateMissingRecurringAlerts', () => {
    it('zgłasza brak ręcznej transakcji cyklicznej', () => {
        const monthKey = getCurrentMonthKey();
        const day = new Date().getDate();
        if (day < 8) return;

        appState.transactions = [
            { type: 'expense', recurringId: 'rec_1', mainCategory: 'Subskrypcje', subCategory: 'Netflix', amount: 49, date: '2025-12-05' },
            { type: 'expense', recurringId: 'rec_1', mainCategory: 'Subskrypcje', subCategory: 'Netflix', amount: 49, date: '2025-11-05' }
        ];
        const created = evaluateMissingRecurringAlerts();
        expect(created.some((n) => n.type === 'recurring_missing')).toBe(true);
    });
});

describe('evaluateSpendingAnomalyAlerts', () => {
    it('wykrywa anomalię wydatków', () => {
        const monthKey = getCurrentMonthKey();
        const day = new Date().getDate();
        if (day < 8) return;

        appState.transactions = [
            { type: 'expense', mainCategory: 'Transport', subCategory: 'Paliwo', amount: 1000, date: `${monthKey}-10` }
        ];
        const created = evaluateSpendingAnomalyAlerts();
        expect(created.some((n) => n.type === 'spending_anomaly')).toBe(true);
    });
});
