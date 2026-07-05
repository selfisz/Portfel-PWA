/**
 * Generator realistycznych danych demo dla konta test@test.pl
 */

function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function localIsoDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + days);
    return d;
}

function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
}

function roundMoney(n) {
    return Math.round(n * 100) / 100;
}

const EXPENSE_TEMPLATES = [
    { mainCategory: 'Zakupy', subCategory: 'Zakupy', notes: ['Biedronka', 'Lidl', 'Kaufland', 'Żabka', 'Aldi'], amount: [12, 180] },
    { mainCategory: 'Jedzenie na mieście', subCategory: 'Restauracje', notes: ['Pizza', 'Kebab', 'Sushi', 'Lunch'], amount: [25, 120] },
    { mainCategory: 'Jedzenie na mieście', subCategory: 'Dowóz', notes: ['Pyszne', 'Glovo', 'Wolt'], amount: [35, 95] },
    { mainCategory: 'Samochód', subCategory: 'Paliwo', notes: ['Orlen', 'BP', 'Circle K'], amount: [80, 320] },
    { mainCategory: 'Samochód', subCategory: 'Serwisowanie', notes: ['Wymiana oleju', 'Opony', 'Przegląd'], amount: [150, 900] },
    { mainCategory: 'Przyjemności', subCategory: 'Rozrywka', notes: ['Kino', 'Koncert', 'Teatr'], amount: [40, 200] },
    { mainCategory: 'Przyjemności', subCategory: 'Wycieczki', notes: ['Hotel', 'Bilety PKP', 'Weekend'], amount: [120, 1800] },
    { mainCategory: 'Subskrypcje', subCategory: 'Filmy', notes: ['Netflix', 'HBO Max'], amount: [29, 60] },
    { mainCategory: 'Subskrypcje', subCategory: 'Muzyka', notes: ['Spotify', 'Tidal'], amount: [19, 40] },
    { mainCategory: 'Rachunki/opłaty', subCategory: 'Elektryczność', notes: ['Tauron', 'PGE'], amount: [90, 280] },
    { mainCategory: 'Rachunki/opłaty', subCategory: 'Internet', notes: ['Orange', 'Play'], amount: [49, 89] },
    { mainCategory: 'Osobista', subCategory: 'Zdrowie', notes: ['Apteka', 'Lekarz'], amount: [20, 250] },
    { mainCategory: 'Osobista', subCategory: 'Ubrania', notes: ['H&M', 'Decathlon'], amount: [50, 400] },
    { mainCategory: 'Dom', subCategory: 'Remont', notes: ['Castorama', 'OBI', 'Farby'], amount: [40, 1200] },
    { mainCategory: 'Edukacja', subCategory: 'Edukacja', notes: ['Kurs online', 'Książki'], amount: [30, 350] },
    { mainCategory: 'Transport', subCategory: '[Bez podkategorii]', notes: ['Uber', 'Bolt', 'Bilet ZTM'], amount: [8, 45] }
];

const CARD_EXPENSE_NOTES = ['Amazon', 'Allegro', 'Media Expert', 'Booking', 'Zalando', 'IKEA'];

export function generateDemoAppState(options = {}) {
    const transactionCount = Number(options.transactionCount) || 1000;
    const rng = mulberry32(options.seed ?? 20260705);
    const today = options.referenceDate ? new Date(options.referenceDate) : new Date();
    const start = addDays(today, -730);

    const loanMortgageId = 'loan-demo-hipoteka';
    const loanCarId = 'loan-demo-samochod';
    const cardMbankId = 'card-demo-mbank';
    const cardVisaId = 'card-demo-visa';

    const loans = [
        {
            id: loanMortgageId,
            name: 'Kredyt hipoteczny',
            subCategory: 'Kredyt hipoteczny',
            totalAmount: 520000,
            currentCapitalLeft: 418500,
            interestRate: 6.2,
            nextInstallmentAmount: 4130.69,
            nextInstallmentDue: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 11)),
            archived: false,
            includeInSummary: true,
            details: {
                bank: 'mBank',
                purpose: 'Zakup mieszkania',
                propertyValue: 650000,
                endDate: `${today.getFullYear() + 18}-06-11`,
                remainingInstallments: 216
            }
        },
        {
            id: loanCarId,
            name: 'Kredyt samochodowy',
            subCategory: 'Kredyt Pekao SA',
            totalAmount: 68000,
            currentCapitalLeft: 28400,
            interestRate: 8.9,
            nextInstallmentAmount: 1180,
            nextInstallmentDue: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 5)),
            archived: false,
            includeInSummary: true,
            details: {
                bank: 'Pekao SA',
                purpose: 'Zakup auta',
                endDate: `${today.getFullYear() + 2}-05-05`,
                remainingInstallments: 24
            }
        }
    ];

    const creditCards = [
        { id: cardMbankId, name: 'mBank Visa', limit: 18000, currentBalance: 4360, includeInSummary: true },
        { id: cardVisaId, name: 'Revolut', limit: 8000, currentBalance: 1240, includeInSummary: true }
    ];

    const assets = [
        { id: 'asset-cash-total', type: 'cash', name: 'Gotówka', amount: 18420.55, cashBaseline: 18420.55 },
        { id: 'asset-cash-oszczednosci', type: 'cash', name: 'Konto oszczędnościowe', amount: 32500, cashBaseline: 32500 },
        { id: 'asset-etf-ike', type: 'etf', name: 'ETF World (IKE)', amount: 42800, quantity: 520, currency: 'PLN' },
        { id: 'asset-lokata', type: 'deposit', name: 'Lokata 3M', amount: 15000, currency: 'PLN' }
    ];

    const categoryBudgets = {
        Zakupy: 1200,
        'Jedzenie na mieście': 600,
        Samochód: 900,
        Przyjemności: 500,
        'Rachunki/opłaty': 1100,
        Osobista: 400
    };

    const transactions = [];
    const creditCardMovements = [];

    const pushTx = (tx) => {
        transactions.push({
            id: `tx-demo-${transactions.length + 1}`,
            ...tx
        });
    };

    let monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (monthCursor <= today && transactions.length < transactionCount) {
        const y = monthCursor.getFullYear();
        const m = monthCursor.getMonth();
        const salaryDay = Math.min(10, new Date(y, m + 1, 0).getDate());
        const mortgageDay = Math.min(11, new Date(y, m + 1, 0).getDate());
        const carDay = Math.min(5, new Date(y, m + 1, 0).getDate());

        pushTx({
            date: localIsoDate(new Date(y, m, salaryDay)),
            type: 'income',
            amount: roundMoney(9200 + rng() * 2800),
            mainCategory: 'Wynagrodzenie',
            subCategory: 'Podstawa',
            note: 'Wynagrodzenie',
            affectsCash: true
        });

        if (transactions.length < transactionCount) {
            pushTx({
                date: localIsoDate(new Date(y, m, mortgageDay)),
                type: 'expense',
                amount: roundMoney(4080 + rng() * 120),
                mainCategory: 'Długi',
                subCategory: 'Kredyt hipoteczny',
                note: 'Rata hipoteczna',
                affectsCash: true
            });
        }

        if (transactions.length < transactionCount) {
            pushTx({
                date: localIsoDate(new Date(y, m, carDay)),
                type: 'expense',
                amount: roundMoney(1150 + rng() * 80),
                mainCategory: 'Długi',
                subCategory: 'Kredyt Pekao SA',
                note: 'Rata auta',
                affectsCash: true
            });
        }

        if (rng() > 0.55 && transactions.length < transactionCount) {
            pushTx({
                date: localIsoDate(new Date(y, m, Math.min(15, new Date(y, m + 1, 0).getDate()))),
                type: 'income',
                amount: roundMoney(400 + rng() * 1200),
                mainCategory: 'Wynagrodzenie',
                subCategory: pick(rng, ['Prowizja', 'Nagroda']),
                note: pick(rng, ['Prowizja', 'Premia kwartalna']),
                affectsCash: true
            });
        }

        monthCursor = new Date(y, m + 1, 1);
    }

    while (transactions.length < transactionCount) {
        const daysRange = Math.max(1, Math.floor((today - start) / 86400000));
        const dayOffset = Math.floor(rng() * daysRange);
        const date = addDays(start, dayOffset);
        if (date > today) continue;

        const useCard = rng() < 0.14;
        const tpl = pick(rng, EXPENSE_TEMPLATES);
        const minA = tpl.amount[0];
        const maxA = tpl.amount[1];
        const amount = roundMoney(minA + rng() * (maxA - minA));
        const note = pick(rng, tpl.notes);
        const cardId = useCard ? pick(rng, [cardMbankId, cardVisaId]) : undefined;

        pushTx({
            date: localIsoDate(date),
            type: 'expense',
            amount,
            mainCategory: tpl.mainCategory,
            subCategory: tpl.subCategory,
            note,
            ...(cardId ? { creditCardId: cardId } : { affectsCash: true })
        });

        if (cardId) {
            creditCardMovements.push({
                id: `ccm-demo-${creditCardMovements.length + 1}`,
                cardId,
                type: 'transfer_out',
                amount,
                date: localIsoDate(date),
                note
            });
        }
    }

    transactions.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(a.id));

    return {
        transactions,
        loans,
        creditCards,
        creditCardMovements,
        assets,
        cashMovements: [],
        assetSnapshots: [],
        assetValueHistory: [],
        categoryBudgets,
        subCategoryBudgets: {
            'Samochód|Paliwo': 500,
            'Zakupy|Zakupy': 900
        },
        categoryTree: null,
        categoryIcons: { expense: { mains: {}, subs: {} }, income: { mains: {}, subs: {} } },
        reportPrefs: {},
        categoryRules: [
            { id: 'rule-biedronka', pattern: 'biedronka', mainCategory: 'Zakupy', subCategory: 'Zakupy', type: 'expense' },
            { id: 'rule-orlen', pattern: 'orlen', mainCategory: 'Samochód', subCategory: 'Paliwo', type: 'expense' }
        ],
        pendingRecurringConfirmations: [],
        skippedRecurringMonths: {},
        deletedAssetIds: []
    };
}
