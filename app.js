const firebaseConfig = {
    apiKey: "AIzaSyAfvk2_lfsaf5QZkH_MVk-kWbG8GFvjSeI",
    authDomain: "portfel-pwa.firebaseapp.com",
    projectId: "portfel-pwa",
    storageBucket: "portfel-pwa.firebasestorage.app",
    messagingSenderId: "370658952228",
    appId: "1:370658952228:web:b5fedfe155ea1918e584b1",
    measurementId: "G-MF61T2VZ2K"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const stateRef = db.collection('finances').doc('my_state');
const cloudBackupRef = db.collection('finances').doc('cloud_backup');
const STORAGE_KEY = 'app_finance_state';
const THEME_KEY = 'theme_preference';
const LOCAL_BACKUP_KEY = 'finanse_local_backup';
const MODULE_SPLIT_LINE_THRESHOLD = 900;
const MODULE_SPLIT_BANNER_KEY = 'module_split_banner_dismissed_at';

db.enablePersistence().catch(err => console.error("Firebase persistence error:", err));

const DEFAULT_CATEGORY_TREE = {
    expense: {
        "Dom": ["Czynsz", "Meble", "Remont", "Formalności", "Smart home", "Konserwacja", "Inne"],
        "Długi": ["Kredyt Pekao SA", "Karta kredytowa", "Spłata", "Raty", "Odroczenia płatności"],
        "Osobista": ["Randki", "Fryzjer", "Kosmetyki", "Zdrowie", "Sport", "Ubrania"],
        "Przyjemności": ["Wycieczki", "Gierki", "Zakupy", "Rozrywka", "Wyjścia"],
        "Zakupy": ["Zakupy", "Alko", "Zakupy na dowóz"],
        "Samochód": ["Paliwo", "Serwisowanie", "Opłaty", "Inne"],
        "Rachunki/opłaty": ["Elektryczność", "Woda/ogrzewanie", "Internet", "Telefon komórkowy", "Kablówka", "Podatki", "Ubezpieczenia", "Inne"],
        "Subskrypcje": ["Muzyka", "Filmy", "Aplikacje", "Audiobooki", "Książki", "Seriale", "YouTube"],
        "Jedzenie na mieście": ["Restauracje", "Dowóz", "Catering/Pudełka"],
        "Różne": ["Praca", "Różne"],
        "Edukacja": ["Studia", "Edukacja"],
        "Prezenty": [],
        "Transport": []
    },
    income: {
        "Wynagrodzenie": ["Podstawa", "Prowizja", "Nagroda", "Delegacja", "Socjal"],
        "Inne": []
    }
};

let categoryTree = DEFAULT_CATEGORY_TREE;
let categoryEditorType = 'expense';

let appState = {
    transactions: [],
    loan: { totalAmount: 500000.00, currentCapitalLeft: 412500.00, interestRate: 6.75 },
    investments: [{ ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World', quantity: 45, purchasePrice: 104.20, currentPriceManual: 118.50, currency: 'EUR' }],
    categoryBudgets: {}
};

let formState = {
    currentType: 'expense',
    selectedMainCategory: '',
    selectedSubCategory: ''
};

const RECENT_CATEGORIES_KEY = 'recent_categories';
const MAX_RECENT_CATEGORIES = 5;

let editingTxIndex = null;
let activeChartCategory = null;
let chartViewType = 'expense';
let dashboardChartInstance = null;
let reportsChartInstance = null;
let reportsTrendChartInstance = null;
let reportsYoyChartInstance = null;
let reportsDowChartInstance = null;
let reportsViewType = 'expense';
let reportsRankLevel = 'main';
let reportsCalendarYear = null;
let reportsCalendarMonth = null;
let reportsLastPeriod = null;

const SAVINGS_GOAL_KEY = 'reports_savings_goal_pct';

const incomeCategoryColorsLight = {
    'Wynagrodzenie': '#15803d', 'Inne': '#475569',
    'Podstawa': '#166534', 'Prowizja': '#0d9488', 'Nagroda': '#a16207',
    'Delegacja': '#1d4ed8', 'Socjal': '#7c3aed'
};

const incomeCategoryColorsDark = {
    'Wynagrodzenie': '#4ade80', 'Inne': '#94a3b8',
    'Podstawa': '#6ee7b7', 'Prowizja': '#2dd4bf', 'Nagroda': '#fde047',
    'Delegacja': '#60a5fa', 'Socjal': '#c084fc'
};

const incomeChartCategoryColorsLight = {
    'Wynagrodzenie': '#15803D', 'Inne': '#57534E', 'Podstawa': '#166534',
    'Prowizja': '#0F766E', 'Nagroda': '#A16207', 'Delegacja': '#1D4ED8',
    'Socjal': '#6B21A8', 'Ogólne': '#57534E'
};

const incomeChartCategoryColorsDark = {
    'Wynagrodzenie': '#4ADE80', 'Inne': '#A8A29E', 'Podstawa': '#6EE7B7',
    'Prowizja': '#2DD4BF', 'Nagroda': '#FDE047', 'Delegacja': '#60A5FA',
    'Socjal': '#C084FC', 'Ogólne': '#A8A29E'
};

const categoryColorsLight = {
    'Zakupy': '#c0264a', 'Dom': '#6d28d9', 'Osobista': '#be185d', 'Przyjemności': '#c2410c',
    'Samochód': '#0369a1', 'Rachunki/opłaty': '#4338ca', 'Subskrypcje': '#4f46e5',
    'Jedzenie na mieście': '#a16207', 'Różne': '#334155', 'Edukacja': '#0f766e',
    'Prezenty': '#b91c1c', 'Transport': '#1d4ed8', 'Długi': '#9a3412',
    'Wynagrodzenie': '#15803d', 'Inne': '#475569'
};

const categoryColorsDark = {
    'Zakupy': '#93c5fd', 'Dom': '#c4b5fd', 'Osobista': '#f9a8d4', 'Przyjemności': '#fdba74',
    'Samochód': '#67e8f9', 'Rachunki/opłaty': '#a5b4fc', 'Subskrypcje': '#a5b4fc',
    'Jedzenie na mieście': '#fcd34d', 'Różne': '#94a3b8', 'Edukacja': '#5eead4',
    'Prezenty': '#fca5a5', 'Transport': '#7dd3fc', 'Długi': '#fdba74',
    'Wynagrodzenie': '#6ee7b7', 'Inne': '#9ca3af'
};

const chartCategoryColorsLight = {
    'Zakupy': '#C81E1E', 'Dom': '#6B21A8', 'Osobista': '#BE185D', 'Przyjemności': '#C2410C',
    'Samochód': '#0369A1', 'Rachunki/opłaty': '#1D4ED8', 'Subskrypcje': '#5B21B6',
    'Jedzenie na mieście': '#A16207', 'Różne': '#475569', 'Edukacja': '#0F766E',
    'Prezenty': '#9F1239', 'Transport': '#0E7490', 'Długi': '#92400E',
    'Wynagrodzenie': '#15803D', 'Inne': '#57534E'
};

const chartCategoryColorsDark = {
    'Zakupy': '#FF6B6B', 'Dom': '#C084FC', 'Osobista': '#F472B6', 'Przyjemności': '#FB923C',
    'Samochód': '#38BDF8', 'Rachunki/opłaty': '#60A5FA', 'Subskrypcje': '#A78BFA',
    'Jedzenie na mieście': '#FDE047', 'Różne': '#CBD5E1', 'Edukacja': '#2DD4BF',
    'Prezenty': '#FB7185', 'Transport': '#22D3EE', 'Długi': '#FBBF24',
    'Wynagrodzenie': '#4ADE80', 'Inne': '#A8A29E'
};

function isLightTheme() {
    const forced = document.documentElement.getAttribute('data-theme');
    if (forced === 'light') return true;
    if (forced === 'dark') return false;
    return !window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getThemeCssVar(name, lightFallback, darkFallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (value) return value;
    return isLightTheme() ? lightFallback : darkFallback;
}

function getCategoryColor(category, txType = 'expense') {
    if (txType === 'income' || categoryTree.income[category]) {
        const palette = isLightTheme() ? incomeCategoryColorsLight : incomeCategoryColorsDark;
        return palette[category] || (isLightTheme() ? '#15803d' : '#4ade80');
    }
    const palette = isLightTheme() ? categoryColorsLight : categoryColorsDark;
    return palette[category] || (isLightTheme() ? '#5b4fe8' : '#93c5fd');
}

function resolveIconColor(mainCategory, subCategory, txType = 'expense') {
    if (txType === 'income') {
        const key = subCategory && subCategory !== '[Bez podkategorii]' ? subCategory : mainCategory;
        return getCategoryColor(key, 'income');
    }
    return getCategoryColor(mainCategory, 'expense');
}

const categoryIconPaths = {
    'Dom': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'Długi': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z',
    'Osobista': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    'Przyjemności': 'M20 12c0-1.1.9-2 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v4c1.1 0 2 .9 2 2s-.9 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2z',
    'Zakupy': 'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2z',
    'Samochód': 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z',
    'Rachunki/opłaty': 'M7 2v11h3v9l7-12h-4l4-8z',
    'Subskrypcje': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
    'Jedzenie na mieście': 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
    'Różne': 'M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    'Edukacja': 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    'Prezenty': 'M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h16v6z',
    'Transport': 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.61c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
    'Wynagrodzenie': 'M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    'Inne': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'
};

const subCategoryIconPaths = {
    'Czynsz': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'Meble': 'M20 21V9H4v12h16zM7 11h2v2H7v-2zm8 0h2v2h-2v-2z',
    'Remont': 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
    'Formalności': 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    'Smart home': 'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
    'Konserwacja': 'M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
    'Kredyt Pekao SA': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'Kredyt hipoteczny': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'Kredyt na mieszkanie': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
    'Karta kredytowa': 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
    'Spłata': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H8v-2h3V9h2v7z',
    'Raty': 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z',
    'Odroczenia płatności': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    'Randki': 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'Fryzjer': 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    'Kosmetyki': 'M12 2C9 2 7 4 7 7c0 2.5 1.5 4 3 5.5V22h4v-9.5c1.5-1.5 3-3 3-5.5 0-3-2-5-5-5z',
    'Zdrowie': 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z',
    'Sport': 'M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z',
    'Ubrania': 'M16 4h-2.9l-.7-2H9.6L8.9 4H6l-2 5v2h3l-1 9h12l-1-9h3V9l-2-5z',
    'Wycieczki': 'M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22l-9-12z',
    'Gierki': 'M15 7.5V2H9v5.5l3 3 3-3zM7.5 9H2v6h5.5l3-3-3-3zM9 16.5V22h6v-5.5l-3-3-3 3zM16.5 9l-3 3 3 3H22V9h-5.5z',
    'Rozrywka': 'M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z',
    'Wyjścia': 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z',
    'Alko': 'M6 3v6c0 2.97 2.16 5.43 5 5.91V19H8v2h8v-2h-3v-4.09c2.84-.48 5-2.94 5-5.91V3H6zm2 2h8v4c0 2.21-1.79 4-4 4s-4-1.79-4-4V5z',
    'Zakupy': 'M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2z',
    'Zakupy na dowóz': 'M18 18.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM6 18.5c.83 0 1.5-.67 1.5-1.5S6.83 15.5 6 15.5 4.5 16.17 4.5 17 5.17 18.5 6 18.5zm11-9.5V6l-6-6-2.8 2.8 1.4 1.4L9 4.2V6H4v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-7l-3-4z',
    'Paliwo': 'M19.77 7.23l.01-.01-3.72-3.72L15 4.56l2.11 2.11c-.94.36-1.61 1.26-1.61 2.33 0 1.38 1.12 2.5 2.5 2.5.36 0 .69-.08 1-.21v7.21c0 .55-.45 1-1 1s-1-.45-1-1V14c0-1.1-.9-2-2-2h-1V5c0-1.1-.9-2-2-2H6c-1.1 0-2 .9-2 2v16h10v-7.5h1.5v5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V9c0-.69-.28-1.32-.73-1.77zM12 10H6V5h6v5zm6 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z',
    'Serwisowanie': 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z',
    'Opłaty': 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
    'Elektryczność': 'M7 2v11h3v9l7-12h-4l4-8z',
    'Woda/ogrzewanie': 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z',
    'Internet': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    'Telefon komórkowy': 'M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z',
    'Kablówka': 'M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z',
    'Podatki': 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
    'Ubezpieczenia': 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
    'Muzyka': 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    'Filmy': 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
    'Aplikacje': 'M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z',
    'Audiobooki': 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z',
    'Książki': 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 4h2v5l-1-.75L9 9V4zm4 0h2v9l-1-.75L13 12V4z',
    'Seriale': 'M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z',
    'YouTube': 'M10 15l5.19-3L10 9v6zm11.99-8.5c0-.83-.67-1.5-1.5-1.5H3.5C2.67 5 2 5.67 2 6.5v11c0 .83.67 1.5 1.5 1.5h15c.83 0 1.5-.67 1.5-1.5v-11z',
    'Restauracje': 'M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z',
    'Dowóz': 'M18 18.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5-1.5.67-1.5 1.5.67 1.5 1.5 1.5zM6 18.5c.83 0 1.5-.67 1.5-1.5S6.83 15.5 6 15.5 4.5 16.17 4.5 17 5.17 18.5 6 18.5zm11-9.5V6l-6-6-2.8 2.8 1.4 1.4L9 4.2V6H4v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-7l-3-4z',
    'Catering/Pudełka': 'M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z',
    'Praca': 'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
    'Studia': 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    'Edukacja': 'M12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    'Podstawa': 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
    'Prowizja': 'M7.5 4C5.57 4 4 5.57 4 7.5S5.57 11 7.5 11 11 9.43 11 7.5 9.43 4 7.5 4zM16.5 13c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zM5.41 20 4 18.59 18.59 4 20 5.41 5.41 20z',
    'Nagroda': 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z',
    'Delegacja': 'M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22l-9-12z',
    'Socjal': 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    '[Bez podkategorii]': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'
};

const MORTGAGE_ICON_PATH = 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z';

function getCategoryIconPath(mainCategory, subCategory = null) {
    if (subCategory && subCategoryIconPaths[subCategory]) {
        return subCategoryIconPaths[subCategory];
    }
    if (subCategory && /kredyt|hipoteczn|mieszkan/i.test(subCategory)) {
        return MORTGAGE_ICON_PATH;
    }
    return categoryIconPaths[mainCategory] || categoryIconPaths['Inne'];
}

function categoryColorAlpha(hex, alpha) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const num = parseInt(full, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderCategoryIcon(mainCategory, variant = 'grid', subCategory = null, txType = 'expense') {
    const color = resolveIconColor(mainCategory, subCategory, txType);
    const path = getCategoryIconPath(mainCategory, subCategory);
    const wrapClass = variant === 'list' ? 'cat-icon-wrap cat-icon-wrap--list' : variant === 'chip' ? 'cat-icon-wrap cat-icon-wrap--chip' : 'cat-icon-wrap';
    return `<span class="${wrapClass}" style="background:${categoryColorAlpha(color, 0.16)};color:${color}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg></span>`;
}

function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h);
}

function generateDistinctHslColors(count, seed) {
    const light = isLightTheme();
    const colors = [];
    const goldenAngle = 137.508;
    const baseHue = hashString(seed) % 360;
    for (let i = 0; i < count; i++) {
        const hue = (baseHue + i * goldenAngle) % 360;
        colors.push(`hsl(${Math.round(hue)}, ${light ? 78 : 72}%, ${light ? 38 : 56}%)`);
    }
    return colors;
}

function getChartBorderColor() {
    return isLightTheme() ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 12, 0.9)';
}

function getChartSliceColors(labels, type = chartViewType) {
    const chartMap = type === 'income'
        ? (isLightTheme() ? incomeChartCategoryColorsLight : incomeChartCategoryColorsDark)
        : (isLightTheme() ? chartCategoryColorsLight : chartCategoryColorsDark);
    if (!activeChartCategory) {
        const fallback = generateDistinctHslColors(labels.length, labels.join('|'));
        return labels.map((label, i) => chartMap[label] || fallback[i]);
    }
    const fallback = generateDistinctHslColors(labels.length, `${activeChartCategory}|${labels.join('|')}`);
    return labels.map((label, i) => chartMap[label] || fallback[i]);
}

const ONBOARDING_SLIDES = [
    { title: 'Witaj w Finanse', text: 'Twój osobisty portfel — prosty, elegancki i zawsze pod ręką.' },
    { title: 'Synchronizacja live', text: 'Dane trafiają do chmury i są dostępne na telefonie oraz komputerze.' },
    { title: 'Kategorie po Twojemu', text: 'Uporządkowane kategorie z Money Pro — dostosowane pod Ciebie.' }
];

function hapticFeedback() {
    if (navigator.vibrate) navigator.vibrate(12);
}

function formatDateGroup(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Dzisiaj';
    if (d.toDateString() === yesterday.toDateString()) return 'Wczoraj';
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initOnboarding() {
    if (localStorage.getItem('onboarding_done')) return;
    const overlay = document.getElementById('onboarding');
    let step = 0;
    const titleEl = document.getElementById('onboarding-title');
    const textEl = document.getElementById('onboarding-text');
    const dots = document.querySelectorAll('#onboarding-dots span');
    const btnNext = document.getElementById('onboarding-next');
    const btnSkip = document.getElementById('onboarding-skip');

    function showStep(i) {
        titleEl.textContent = ONBOARDING_SLIDES[i].title;
        textEl.textContent = ONBOARDING_SLIDES[i].text;
        dots.forEach((d, idx) => d.classList.toggle('active', idx === i));
        btnNext.textContent = i === ONBOARDING_SLIDES.length - 1 ? 'Zaczynamy' : 'Dalej';
    }

    function close() {
        overlay.classList.add('hidden');
        localStorage.setItem('onboarding_done', '1');
    }

    overlay.classList.remove('hidden');
    showStep(0);
    btnSkip.onclick = close;
    btnNext.onclick = () => {
        step++;
        if (step >= ONBOARDING_SLIDES.length) close();
        else showStep(step);
    };
}

function attachSwipeDelete(row, index) {
    const SWIPE_MAX = 88;
    const SWIPE_DELETE = 64;
    let startX = 0;
    let currentX = 0;
    let swiped = false;
    let isDragging = false;
    let activePointer = null;

    const setOffset = (x) => {
        row.style.transform = `translate3d(${x}px, 0, 0)`;
    };

    const resetRow = (animate = true) => {
        row.classList.remove('swiping', 'is-dragging');
        row.style.transition = animate ? 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
        setOffset(0);
        if (animate) {
            window.setTimeout(() => {
                row.style.transition = '';
                row.style.transform = '';
            }, 280);
        } else {
            row.style.transition = '';
            row.style.transform = '';
        }
    };

    const finishSwipe = () => {
        if (!isDragging) return;
        isDragging = false;
        activePointer = null;
        row.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';

        if (currentX <= -SWIPE_DELETE) {
            swiped = true;
            row.classList.add('swiping');
            setOffset(-SWIPE_MAX);
            row.style.opacity = '0.55';
            window.setTimeout(() => deleteTransaction(index), 180);
            return;
        }

        resetRow(true);
        startX = currentX = 0;
    };

    const onPointerDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        activePointer = e.pointerId;
        isDragging = true;
        swiped = false;
        startX = e.clientX;
        currentX = 0;
        row.classList.add('is-dragging');
        row.style.transition = 'none';
        row.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
        if (!isDragging || e.pointerId !== activePointer) return;
        currentX = e.clientX - startX;
        if (currentX > 0) currentX = 0;
        if (currentX < -SWIPE_MAX) currentX = -SWIPE_MAX;
        if (currentX < -10) row.classList.add('swiping');
        else row.classList.remove('swiping');
        setOffset(currentX);
    };

    const onPointerEnd = (e) => {
        if (e.pointerId !== activePointer) return;
        if (row.hasPointerCapture(e.pointerId)) row.releasePointerCapture(e.pointerId);
        finishSwipe();
    };

    row.addEventListener('pointerdown', onPointerDown);
    row.addEventListener('pointermove', onPointerMove);
    row.addEventListener('pointerup', onPointerEnd);
    row.addEventListener('pointercancel', onPointerEnd);

    row.addEventListener('click', () => {
        if (swiped) {
            swiped = false;
            return;
        }
        editTransaction(index);
    });
}

function getBasePath() {
    const parts = location.pathname.split('/').filter(Boolean);
    const repoIndex = parts.indexOf('Portfel-PWA');
    if (repoIndex >= 0) {
        return '/' + parts.slice(0, repoIndex + 1).join('/');
    }
    return '';
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const base = getBasePath();
    const swUrl = `${base}/sw.js`;
    const scope = base ? `${base}/` : '/';
    navigator.serviceWorker.register(swUrl, { scope }).catch(err => console.error('SW registration failed:', err));
}

function dismissModuleSplitBanner() {
    localStorage.setItem(MODULE_SPLIT_BANNER_KEY, String(Date.now()));
    document.getElementById('module-split-banner').classList.add('hidden');
}

function showModuleSplitAlert(lineCount) {
    const thresholdEl = document.getElementById('module-split-threshold');
    const linesEl = document.getElementById('module-split-lines');
    const notice = document.getElementById('module-split-notice');
    const banner = document.getElementById('module-split-banner');
    const bannerText = document.getElementById('module-split-banner-text');

    if (thresholdEl) thresholdEl.textContent = String(MODULE_SPLIT_LINE_THRESHOLD);
    if (linesEl) linesEl.textContent = String(lineCount);
    if (notice) notice.classList.remove('hidden');
    if (bannerText) {
        bannerText.textContent = `app.js ma ${lineCount} linii (próg: ${MODULE_SPLIT_LINE_THRESHOLD}). Czas podzielić kod na moduły w folderze js/.`;
    }

    console.warn(`[Finanse] app.js: ${lineCount} linii — próg ${MODULE_SPLIT_LINE_THRESHOLD}. Rozważ podział na moduły js/.`);

    const dismissedAt = Number(localStorage.getItem(MODULE_SPLIT_BANNER_KEY) || 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    if (banner && (!dismissedAt || Date.now() - dismissedAt > weekMs)) {
        banner.classList.remove('hidden');
    }
}

async function checkModuleSplitThreshold() {
    try {
        const res = await fetch(`${getBasePath()}/app.js`, { cache: 'no-store' });
        if (!res.ok) return;
        const lineCount = (await res.text()).split('\n').length;
        if (lineCount >= MODULE_SPLIT_LINE_THRESHOLD) {
            showModuleSplitAlert(lineCount);
        }
    } catch {
        /* offline lub cache — pomijamy */
    }
}

function getPersistedState(raw = appState) {
    const data = raw ?? appState ?? {};
    return {
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        loan: data.loan || { totalAmount: 500000.00, currentCapitalLeft: 412500.00, interestRate: 6.75 },
        investments: Array.isArray(data.investments) ? data.investments : [],
        categoryTree: data.categoryTree && typeof data.categoryTree === 'object'
            ? data.categoryTree
            : JSON.parse(JSON.stringify(DEFAULT_CATEGORY_TREE)),
        categoryBudgets: data.categoryBudgets && typeof data.categoryBudgets === 'object'
            ? data.categoryBudgets
            : {}
    };
}

function migrateCategoryData() {
    let changed = false;
    appState.transactions.forEach((tx) => {
        if (tx.mainCategory === 'Komunikacja') {
            tx.mainCategory = 'Transport';
            changed = true;
        }
    });
    if (activeChartCategory === 'Komunikacja') {
        activeChartCategory = 'Transport';
        changed = true;
    }
    try {
        const recents = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY) || '[]');
        const migrated = recents.map((entry) => {
            if (entry.mainCategory === 'Komunikacja') {
                changed = true;
                return { ...entry, mainCategory: 'Transport' };
            }
            return entry;
        });
        if (changed) localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(migrated));
    } catch { /* ignore */ }
    return changed;
}

function normalizeAppState(raw) {
    const hadUiFields = !!(raw && ('currentType' in raw || 'selectedMainCategory' in raw || 'selectedSubCategory' in raw));
    appState = getPersistedState(raw);
    categoryTree = appState.categoryTree;
    return hadUiFields;
}

function migrateRecentCategories(mainMap, subRenames, type) {
    try {
        const recents = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY) || '[]');
        let changed = false;
        const migrated = recents.map((entry) => {
            if (entry.type !== type) return entry;
            let { mainCategory, subCategory } = entry;
            if (mainMap[mainCategory]) {
                mainCategory = mainMap[mainCategory];
                changed = true;
            }
            const origMain = entry.mainCategory;
            subRenames.forEach((r) => {
                if (origMain === r.oldMain && subCategory === r.oldSub) {
                    subCategory = r.newSub;
                    changed = true;
                }
            });
            return { ...entry, mainCategory, subCategory };
        });
        if (changed) localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(migrated));
    } catch { /* ignore */ }
}

function getRecentCategories(type) {
    try {
        const all = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY) || '[]');
        return all.filter((entry) => entry.type === type).slice(0, MAX_RECENT_CATEGORIES);
    } catch {
        return [];
    }
}

function addRecentCategory(type, mainCategory, subCategory) {
    const id = `${type}|${mainCategory}|${subCategory}`;
    let all = [];
    try {
        all = JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY) || '[]');
    } catch { /* ignore */ }
    all = all.filter((entry) => `${entry.type}|${entry.mainCategory}|${entry.subCategory}` !== id);
    all.unshift({ type, mainCategory, subCategory });
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(all.slice(0, MAX_RECENT_CATEGORIES * 3)));
}

function focusAmountField() {
    requestAnimationFrame(() => {
        const input = document.getElementById('tx-amount');
        if (!input) return;
        input.focus();
        if (typeof input.select === 'function') input.select();
    });
}

function createMainCategoryItem(cat) {
    const item = document.createElement('div');
    item.className = 'grid-item';
    if (formState.selectedMainCategory === cat) item.classList.add('selected');
    item.innerHTML = `${renderCategoryIcon(cat, 'grid', null, formState.currentType)}<span class="grid-item-label">${cat}</span>`;
    item.onclick = () => selectMainCategoryForm(cat, item);
    return item;
}

function createSubCategoryItem(sub) {
    const item = document.createElement('div');
    item.className = 'grid-item grid-item-sub';
    if (formState.selectedSubCategory === sub) item.classList.add('selected');
    item.innerHTML = `${renderCategoryIcon(formState.selectedMainCategory, 'grid', sub, formState.currentType)}<span class="grid-item-label">${sub}</span>`;
    item.onclick = () => {
        document.querySelectorAll('#sub-category-grid .grid-item').forEach((i) => i.classList.remove('selected'));
        item.classList.add('selected');
        formState.selectedSubCategory = sub;
        renderRecentCategories();
    };
    return item;
}

function renderRecentCategories() {
    const wrapper = document.getElementById('recent-categories-wrapper');
    const row = document.getElementById('recent-categories-row');
    if (!wrapper || !row) return;

    const recents = getRecentCategories(formState.currentType);
    if (recents.length === 0) {
        wrapper.style.display = 'none';
        row.innerHTML = '';
        return;
    }

    wrapper.style.display = 'block';
    row.innerHTML = '';
    recents.forEach((recent) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'recent-chip';
        const label = recent.subCategory === '[Bez podkategorii]'
            ? recent.mainCategory
            : `${recent.mainCategory} · ${recent.subCategory}`;
        chip.innerHTML = `${renderCategoryIcon(recent.mainCategory, 'chip', recent.subCategory === '[Bez podkategorii]' ? null : recent.subCategory, recent.type)}<span>${label}</span>`;
        if (formState.selectedMainCategory === recent.mainCategory && formState.selectedSubCategory === recent.subCategory) {
            chip.classList.add('selected');
        }
        chip.onclick = () => {
            formState.selectedMainCategory = recent.mainCategory;
            formState.selectedSubCategory = recent.subCategory;
            renderMainCategoriesForm();
        };
        row.appendChild(chip);
    });
}

function initData() {
    if (localStorage.getItem(STORAGE_KEY)) {
        const hadUiFields = normalizeAppState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
        const hadMigration = migrateCategoryData();
        if (hadUiFields) localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
        if (hadMigration) saveState();
        checkAndProcessRecurringTransactions();
        refreshCurrentView();
    }

    stateRef.onSnapshot((docSnap) => {
        const statusEl = document.getElementById('sync-status');
        if (docSnap.exists) {
            const hadUiFields = normalizeAppState(docSnap.data());
            const hadMigration = migrateCategoryData();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedState(appState)));
            if (hadUiFields || hadMigration) saveState();
            statusEl.className = 'online';
            refreshCurrentView();
        } else {
            saveState();
        }
    }, (error) => {
        console.error("Błąd synchronizacji", error);
        document.getElementById('sync-status').className = 'offline';
    });
}

function saveState() {
    const payload = getPersistedState(appState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    stateRef.set(payload).then(() => {
        document.getElementById('sync-status').className = 'online';
    }).catch(err => {
        console.log("Zapisano offline. Zsynchronizuje się później.", err);
        document.getElementById('sync-status').className = 'offline';
    });
}

function refreshCurrentView() {
    if (document.getElementById('view-dashboard').classList.contains('active')) renderDashboard();
    if (document.getElementById('view-reports').classList.contains('active')) renderReports();
    if (document.getElementById('view-investments').classList.contains('active')) renderInvestments();
    if (document.getElementById('view-loans').classList.contains('active')) renderLoans();
}

function checkAndProcessRecurringTransactions() {
    const currentMonthStr = new Date().toISOString().substring(0, 7);
    const recurringTxs = appState.transactions.filter(t => t.recurringId);
    const uniqueRecurringGroups = [...new Set(recurringTxs.map(t => t.recurringId))];

    let changesMade = false;
    uniqueRecurringGroups.forEach(recId => {
        const history = recurringTxs.filter(t => t.recurringId === recId);
        const alreadyAddedThisMonth = history.some(t => t.date.startsWith(currentMonthStr));
        if (!alreadyAddedThisMonth) {
            const clonedTx = { ...history[0] };
            clonedTx.date = `${currentMonthStr}-01`;
            appState.transactions.unshift(clonedTx);
            changesMade = true;
        }
    });
    if (changesMade) saveState();
}

function switchView(viewId, title, element) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    document.getElementById('view-title').innerText = title;
    if (element) element.classList.add('active');

    if (viewId === 'dashboard') renderDashboard();
    if (viewId === 'reports') renderReports();
    if (viewId === 'investments') renderInvestments();
    if (viewId === 'loans') renderLoans();

    if (viewId === 'add' && editingTxIndex === null) {
        document.getElementById('form-header').innerText = 'Nowa Transakcja';
        document.getElementById('btn-cancel-edit').style.display = 'none';
        document.getElementById('recurring-wrapper').style.display = 'flex';
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-note').value = '';
        document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('tx-recurring').checked = false;
        setTransactionType('expense');
        focusAmountField();
    }
}

function setTransactionType(type, keepSelection = false) {
    formState.currentType = type;
    document.getElementById('btn-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-income').classList.toggle('active', type === 'income');
    if (!keepSelection) {
        formState.selectedMainCategory = '';
        formState.selectedSubCategory = '';
    }
    document.getElementById('sub-category-wrapper').style.display = 'none';
    renderMainCategoriesForm();
}

function renderMainCategoriesForm() {
    const grid = document.getElementById('main-category-grid');
    grid.innerHTML = '';
    grid.classList.toggle('grid-selector--income', formState.currentType === 'income');
    Object.keys(categoryTree[formState.currentType]).forEach((cat) => {
        grid.appendChild(createMainCategoryItem(cat));
    });
    if (formState.selectedMainCategory) renderSubCategoriesForm(formState.selectedMainCategory);
    renderRecentCategories();
}

function selectMainCategoryForm(cat, element) {
    document.querySelectorAll('#main-category-grid .grid-item').forEach((i) => i.classList.remove('selected'));
    if (element) element.classList.add('selected');
    formState.selectedMainCategory = cat;
    formState.selectedSubCategory = '';
    renderSubCategoriesForm(cat);
    renderRecentCategories();
}

function renderSubCategoriesForm(cat) {
    const subs = categoryTree[formState.currentType][cat];
    const subWrapper = document.getElementById('sub-category-wrapper');
    const subGrid = document.getElementById('sub-category-grid');
    if (subs.length === 0) {
        subWrapper.style.display = 'none';
        formState.selectedSubCategory = '[Bez podkategorii]';
    } else {
        subGrid.innerHTML = '';
        subs.forEach((sub) => subGrid.appendChild(createSubCategoryItem(sub)));
        subWrapper.style.display = 'block';
        if (!subs.includes(formState.selectedSubCategory)) {
            formState.selectedSubCategory = '';
        }
    }
    renderRecentCategories();
}

function saveTransaction() {
    const amount = parseFloat(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const note = document.getElementById('tx-note').value;
    const isRecurring = document.getElementById('tx-recurring').checked;

    if (!amount || !formState.selectedMainCategory || !formState.selectedSubCategory || !date) {
        return alert('Uzupełnij kwotę i kategorie.');
    }

    const txData = {
        amount,
        type: formState.currentType,
        mainCategory: formState.selectedMainCategory,
        subCategory: formState.selectedSubCategory,
        date,
        note
    };

    if (editingTxIndex !== null) {
        if (appState.transactions[editingTxIndex].recurringId) {
            txData.recurringId = appState.transactions[editingTxIndex].recurringId;
        }
        appState.transactions[editingTxIndex] = txData;
        editingTxIndex = null;
    } else {
        if (isRecurring) txData.recurringId = 'rec_' + Date.now();
        appState.transactions.unshift(txData);
    }
    addRecentCategory(txData.type, txData.mainCategory, txData.subCategory);
    appState.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    saveState();
    hapticFeedback();
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
}

function editTransaction(index) {
    const tx = appState.transactions[index];
    editingTxIndex = index;
    document.getElementById('form-header').innerText = 'Edytuj Transakcję';
    document.getElementById('btn-cancel-edit').style.display = 'block';
    document.getElementById('recurring-wrapper').style.display = 'none';
    document.getElementById('tx-amount').value = tx.amount;
    document.getElementById('tx-date').value = tx.date;
    document.getElementById('tx-note').value = tx.note || '';
    formState.selectedMainCategory = tx.mainCategory;
    formState.selectedSubCategory = tx.subCategory;
    setTransactionType(tx.type, true);
    switchView('add', 'Edytuj', document.querySelectorAll('.nav-item')[1]);
    focusAmountField();
}

function deleteTransaction(index) {
    if (confirm('Na pewno usunąć?')) {
        appState.transactions.splice(index, 1);
        saveState();
        renderDashboard();
    }
}

function cancelEdit() {
    editingTxIndex = null;
    switchView('dashboard', 'Pulpit', document.querySelectorAll('.nav-item')[0]);
}

function handleDashboardPeriodChange() {
    const period = document.getElementById('dashboard-period-select').value;
    document.getElementById('dashboard-custom-dates').style.display = period === 'custom' ? 'flex' : 'none';
    renderDashboard();
}

function getDashboardDates() {
    const period = document.getElementById('dashboard-period-select').value;
    let startDate, endDate;
    const now = new Date();
    if (period === 'current-month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (period === 'previous-month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    } else if (period === 'current-year') {
        startDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        endDate = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
    } else {
        startDate = document.getElementById('db-start-date').value || '1970-01-01';
        endDate = document.getElementById('db-end-date').value || '2099-12-31';
    }
    return { startDate, endDate };
}

function getPortfolioValuePln() {
    const FIXED_EUR_PLN = 4.32;
    return appState.investments.reduce((sum, asset) => {
        const val = asset.quantity * asset.currentPriceManual;
        return sum + (asset.currency === 'EUR' ? val * FIXED_EUR_PLN : val);
    }, 0);
}

function formatPlnAmount(amount) {
    return `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatTxDate(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function transactionMatchesSearch(t, searchQuery) {
    return t.mainCategory.toLowerCase().includes(searchQuery) ||
        t.subCategory.toLowerCase().includes(searchQuery) ||
        (t.note && t.note.toLowerCase().includes(searchQuery)) ||
        t.amount.toString().includes(searchQuery) ||
        t.date.includes(searchQuery);
}

function renderChartLegend(catSums, sliceColors, labels) {
    const legendEl = document.getElementById('chart-legend');
    const centerEl = document.getElementById('chart-center-amount');
    const total = Object.values(catSums).reduce((sum, value) => sum + value, 0);

    if (centerEl) centerEl.textContent = formatPlnAmount(total);

    if (!labels.length) {
        legendEl.innerHTML = '';
        return;
    }

    const entries = labels
        .map((label, index) => ({
            label,
            amount: catSums[label],
            color: sliceColors[index],
            index
        }))
        .sort((a, b) => b.amount - a.amount);

    legendEl.innerHTML = entries.map(({ label, amount, color, index }) => {
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
        return `<button type="button" class="chart-legend-item${activeChartCategory ? '' : ' chart-legend-item--drill'}" data-index="${index}" data-label="${label.replace(/"/g, '&quot;')}">
            <span class="chart-legend-swatch" style="background:${color}"></span>
            <span class="chart-legend-text">
                <span class="chart-legend-name">${label}</span>
                <span class="chart-legend-amount">${formatPlnAmount(amount)}</span>
            </span>
            <span class="chart-legend-pct">${pct}%</span>
        </button>`;
    }).join('');

    legendEl.querySelectorAll('.chart-legend-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!activeChartCategory) {
                activeChartCategory = btn.dataset.label;
                renderDashboard();
                return;
            }
            if (!dashboardChartInstance) return;
            const chartIndex = parseInt(btn.dataset.index, 10);
            dashboardChartInstance.toggleDataVisibility(chartIndex);
            btn.classList.toggle('chart-legend-item--hidden', !dashboardChartInstance.getDataVisibility(chartIndex));
        });
    });
}

function resetDashboardChart() {
    activeChartCategory = null;
    renderDashboard();
}

function setChartViewType(type) {
    if (chartViewType === type) return;
    chartViewType = type;
    activeChartCategory = null;
    renderDashboard();
}

function formatDashboardPeriodLabel() {
    const period = document.getElementById('dashboard-period-select').value;
    const now = new Date();
    if (period === 'current-month') {
        const label = now.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (period === 'previous-month') {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const label = prev.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (period === 'current-year') {
        return String(now.getFullYear());
    }
    const { startDate, endDate } = getDashboardDates();
    return `${startDate} – ${endDate}`;
}

function renderDashboard() {
    const { startDate, endDate } = getDashboardDates();
    const searchQuery = document.getElementById('db-search').value.toLowerCase().trim();
    const dateFilteredTx = appState.transactions.filter(t => t.date >= startDate && t.date <= endDate);

    const totalIncomes = dateFilteredTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = dateFilteredTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncomes - totalExpenses;

    document.getElementById('db-period-label').innerText = formatDashboardPeriodLabel();
    document.getElementById('db-total-incomes').innerText = `${totalIncomes.toFixed(2)} zł`;
    document.getElementById('db-total-expenses').innerText = `${totalExpenses.toFixed(2)} zł`;
    const netEl = document.getElementById('db-net-balance');
    netEl.innerText = `${netBalance >= 0 ? '+' : ''}${netBalance.toFixed(2)} zł`;
    netEl.style.color = netBalance >= 0 ? '#6ee7b7' : '#fca5a5';

    const fillEl = document.getElementById('budget-progress-fill');
    if (totalIncomes > 0) {
        const pct = Math.min((totalExpenses / totalIncomes) * 100, 100);
        fillEl.style.width = `${pct}%`;
        fillEl.style.background = pct >= 100 ? 'var(--danger)' : 'var(--accent)';
    } else {
        fillEl.style.width = totalExpenses > 0 ? '100%' : '0%';
        fillEl.style.background = 'var(--danger)';
    }

    let listTx = dateFilteredTx;
    const searchHint = document.getElementById('db-search-hint');
    if (searchHint) searchHint.classList.toggle('visible', !!searchQuery);

    if (searchQuery) {
        listTx = appState.transactions.filter(t => transactionMatchesSearch(t, searchQuery));
    } else if (activeChartCategory) {
        listTx = listTx.filter(t => t.type === chartViewType && t.mainCategory === activeChartCategory);
    }

    const chartTx = dateFilteredTx.filter(t => t.type === chartViewType);
    const catSums = {};
    const chartTypeLabel = chartViewType === 'income' ? 'wpływów' : 'wydatków';
    document.getElementById('btn-reset-chart').style.display = activeChartCategory ? 'block' : 'none';
    document.getElementById('chart-title').innerText = activeChartCategory
        ? `Struktura: ${activeChartCategory}`
        : `Struktura ${chartTypeLabel}`;
    document.getElementById('btn-chart-expense').classList.toggle('active', chartViewType === 'expense');
    document.getElementById('btn-chart-income').classList.toggle('active', chartViewType === 'income');

    if (!activeChartCategory) {
        chartTx.forEach(t => { catSums[t.mainCategory] = (catSums[t.mainCategory] || 0) + t.amount; });
    } else {
        chartTx.filter(t => t.mainCategory === activeChartCategory).forEach(t => {
            const label = t.subCategory === '[Bez podkategorii]' ? 'Ogólne' : t.subCategory;
            catSums[label] = (catSums[label] || 0) + t.amount;
        });
    }

    const ctxDash = document.getElementById('dashboardChart').getContext('2d');
    if (dashboardChartInstance) dashboardChartInstance.destroy();

    if (Object.keys(catSums).length > 0) {
        const chartLabels = Object.keys(catSums);
        const sliceColors = getChartSliceColors(chartLabels);
        const borderColor = getChartBorderColor();

        dashboardChartInstance = new Chart(ctxDash, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: Object.values(catSums),
                    backgroundColor: sliceColors,
                    borderColor: borderColor,
                    borderWidth: 3,
                    borderRadius: 5,
                    spacing: 2,
                    hoverOffset: 10,
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                cutout: '58%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)',
                        titleFont: { family: 'DM Sans', weight: '700' },
                        bodyFont: { family: 'DM Sans', weight: '600' },
                        padding: 12,
                        cornerRadius: 10
                    }
                },
                onClick: (event, elements, chart) => {
                    if (elements[0] && !activeChartCategory) {
                        activeChartCategory = chart.data.labels[elements[0].index];
                        renderDashboard();
                    }
                }
            }
        });
        renderChartLegend(catSums, sliceColors, chartLabels);
    } else {
        document.getElementById('chart-legend').innerHTML = '';
        const centerEl = document.getElementById('chart-center-amount');
        if (centerEl) centerEl.textContent = formatPlnAmount(0);
    }

    const list = document.getElementById('recent-transactions-list');
    list.innerHTML = '';

    if (listTx.length === 0) {
        list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg><p>${searchQuery ? 'Brak wyników wyszukiwania' : 'Brak transakcji w tym okresie'}</p></div>`;
        return;
    }

    let lastGroup = '';
    listTx.forEach(t => {
        const group = formatDateGroup(t.date);
        if (group !== lastGroup) {
            const label = document.createElement('div');
            label.className = 'tx-group-label';
            label.textContent = group;
            list.appendChild(label);
            lastGroup = group;
        }

        const globalIndex = appState.transactions.indexOf(t);
        const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
        const metaText = searchQuery ? `${formatTxDate(t.date)} · ${t.mainCategory}` : t.mainCategory;
        const row = document.createElement('div');
        row.className = 'tx-row';
        row.innerHTML = `
            ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)}
            <div class="tx-info">
                <div class="tx-title">${title}${isRec}</div>
                <div class="tx-meta">${metaText}</div>
                ${t.note ? `<div class="tx-note">${t.note}</div>` : ''}
            </div>
            <div class="tx-amount-col">
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>
            <div class="tx-swipe-hint">Usuń</div>`;
        attachSwipeDelete(row, globalIndex);
        list.appendChild(row);
    });
}

function getTransactionYears() {
    const years = new Set([new Date().getFullYear()]);
    appState.transactions.forEach((t) => {
        if (t.date) years.add(parseInt(t.date.substring(0, 4), 10));
    });
    return [...years].sort((a, b) => b - a);
}

function getTransactionsForYear(year) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return appState.transactions.filter(t => t.date >= start && t.date <= end);
}

function getTransactionsForReportsPeriod(period) {
    if (period === 'all') return appState.transactions;
    return getTransactionsForYear(parseInt(period, 10));
}

function populateReportsYearSelect() {
    const select = document.getElementById('reports-year-select');
    if (!select) return;
    const preferred = select.value || String(new Date().getFullYear());
    const years = getTransactionYears();
    const options = [`<option value="all"${preferred === 'all' ? ' selected' : ''}>Całość</option>`];
    years.forEach((year) => {
        const value = String(year);
        options.push(`<option value="${value}"${value === preferred ? ' selected' : ''}>${value}</option>`);
    });
    select.innerHTML = options.join('');
    if (preferred !== 'all' && !years.map(String).includes(preferred) && years.length) {
        select.value = String(years[0]);
    }
}

function setReportsViewType(type) {
    if (reportsViewType === type) return;
    reportsViewType = type;
    renderReports();
}

function setReportsRankLevel(level) {
    if (reportsRankLevel === level) return;
    reportsRankLevel = level;
    renderReports();
}

function getReportsChartTheme() {
    return {
        legendColor: getThemeCssVar('--text', '#0f172a', '#f5f5f5'),
        gridColor: isLightTheme() ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)',
        expenseColor: isLightTheme() ? 'rgba(220, 38, 38, 0.8)' : 'rgba(248, 113, 113, 0.8)',
        expenseFill: isLightTheme() ? 'rgba(220, 38, 38, 0.12)' : 'rgba(248, 113, 113, 0.18)',
        incomeColor: isLightTheme() ? 'rgba(13, 148, 136, 0.85)' : 'rgba(52, 211, 153, 0.8)',
        prevYearColor: isLightTheme() ? 'rgba(100, 116, 139, 0.55)' : 'rgba(148, 163, 184, 0.5)',
        tooltipBg: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)'
    };
}

function getReportsChartOptions(theme, yAxis = true) {
    const options = {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.45,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: theme.legendColor,
                    font: { family: 'DM Sans', weight: '600', size: 11 },
                    boxWidth: 12,
                    padding: 14
                }
            },
            tooltip: {
                backgroundColor: theme.tooltipBg,
                titleFont: { family: 'DM Sans', weight: '700' },
                bodyFont: { family: 'DM Sans', weight: '600' },
                padding: 12,
                cornerRadius: 10,
                callbacks: {
                    label: (context) => `${context.dataset.label}: ${formatPlnAmount(context.parsed.y)}`
                }
            }
        },
        scales: {
            x: {
                ticks: { color: theme.legendColor, font: { family: 'DM Sans', size: 10 } },
                grid: { display: false }
            }
        }
    };
    if (yAxis) {
        options.scales.y = {
            ticks: {
                color: theme.legendColor,
                font: { family: 'DM Sans', size: 10 },
                callback: (value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)
            },
            grid: { color: theme.gridColor }
        };
    }
    return options;
}

function formatCompactPln(amount) {
    if (amount >= 10000) return `${(amount / 1000).toFixed(0)}k`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
    return `${Math.round(amount)}`;
}

function getExpenseHeatColor(amount, maxAmount) {
    if (!amount || amount <= 0) return 'transparent';
    const ratio = Math.min(amount / (maxAmount || 1), 1);
    if (isLightTheme()) return `rgba(220, 38, 38, ${0.1 + ratio * 0.5})`;
    return `rgba(248, 113, 113, ${0.12 + ratio * 0.55})`;
}

function syncReportsCalendarToPeriod(period) {
    const now = new Date();
    if (reportsLastPeriod === period && reportsCalendarYear !== null) return;
    reportsLastPeriod = period;

    if (period === 'all') {
        reportsCalendarYear = now.getFullYear();
        reportsCalendarMonth = now.getMonth();
        return;
    }
    const year = parseInt(period, 10);
    reportsCalendarYear = year;
    reportsCalendarMonth = year === now.getFullYear() ? now.getMonth() : 11;
}

function shiftReportsCalendarMonth(delta) {
    if (typeof reportsCalendarView !== 'undefined' && reportsCalendarView === 'year') {
        if (reportsCalendarYear === null) reportsCalendarYear = new Date().getFullYear();
        reportsCalendarYear += delta;
        if (typeof renderReportsYearHeatmap === 'function') renderReportsYearHeatmap();
        return;
    }
    const period = document.getElementById('reports-year-select')?.value || 'all';
    reportsCalendarMonth += delta;
    if (period !== 'all') {
        const year = parseInt(period, 10);
        reportsCalendarYear = year;
        if (reportsCalendarMonth > 11) reportsCalendarMonth = 0;
        if (reportsCalendarMonth < 0) reportsCalendarMonth = 11;
    } else {
        if (reportsCalendarMonth > 11) {
            reportsCalendarMonth = 0;
            reportsCalendarYear++;
        }
        if (reportsCalendarMonth < 0) {
            reportsCalendarMonth = 11;
            reportsCalendarYear--;
        }
    }
    renderReportsCalendar();
}

function renderReportsCalendar() {
    const grid = document.getElementById('reports-calendar-grid');
    const labelEl = document.getElementById('reports-calendar-label');
    if (!grid || !labelEl || reportsCalendarYear === null) return;

    const year = reportsCalendarYear;
    const month = reportsCalendarMonth;
    const monthLabel = new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    labelEl.textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
    const monthExpenses = appState.transactions.filter(
        (t) => t.type === 'expense' && t.date >= monthStart && t.date <= monthEnd
    );

    const byDay = {};
    monthExpenses.forEach((t) => {
        if (!byDay[t.date]) byDay[t.date] = { total: 0, cats: {} };
        byDay[t.date].total += t.amount;
        const cat = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
        byDay[t.date].cats[cat] = (byDay[t.date].cats[cat] || 0) + t.amount;
    });

    const maxDay = Math.max(0, ...Object.values(byDay).map((d) => d.total));
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];

    const parts = ['<div class="cal-weekday">Pn</div>', '<div class="cal-weekday">Wt</div>', '<div class="cal-weekday">Śr</div>', '<div class="cal-weekday">Cz</div>', '<div class="cal-weekday">Pt</div>', '<div class="cal-weekday">Sb</div>', '<div class="cal-weekday">Nd</div>'];

    for (let i = 0; i < firstDow; i++) parts.push('<div class="cal-cell cal-cell--empty"></div>');

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const data = byDay[dateStr];
        const todayClass = dateStr === today ? ' cal-cell--today' : '';
        const clickable = ' cal-cell--clickable';
        if (data) {
            const topCats = Object.entries(data.cats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([name]) => escapeHtml(name));
            const heat = getExpenseHeatColor(data.total, maxDay);
            const catsHtml = topCats.map((name) => `<span class="cal-day-cat">${name}</span>`).join('');
            const moreCount = Object.keys(data.cats).length - topCats.length;
            const moreHtml = moreCount > 0 ? `<span class="cal-day-more">+${moreCount}</span>` : '';
            parts.push(`<button type="button" class="cal-cell${todayClass}${clickable}" data-date="${dateStr}" style="background:${heat}" onclick="openCalendarDay('${dateStr}')">
                <span class="cal-day-num">${day}</span>
                <span class="cal-day-amount">${formatCompactPln(data.total)} zł</span>
                <span class="cal-day-cats">${catsHtml}${moreHtml}</span>
            </button>`);
        } else {
            parts.push(`<button type="button" class="cal-cell${todayClass}${clickable}" data-date="${dateStr}" onclick="openCalendarDay('${dateStr}')">
                <span class="cal-day-num">${day}</span>
            </button>`);
        }
    }

    grid.innerHTML = parts.join('');
}

function openCalendarDay(dateStr) {
    if (typeof openCalendarDayPanel === 'function') {
        openCalendarDayPanel(dateStr);
        return;
    }
    const overlay = document.getElementById('calendar-day-overlay');
    const titleEl = document.getElementById('calendar-day-title');
    const summaryEl = document.getElementById('calendar-day-summary');
    const listEl = document.getElementById('calendar-day-list');
    if (!overlay || !titleEl || !summaryEl || !listEl) return;

    const dayTx = appState.transactions
        .filter((t) => t.date === dateStr)
        .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'expense' ? -1 : 1;
            return b.amount - a.amount;
        });

    const weekday = new Date(`${dateStr}T12:00:00`).toLocaleDateString('pl-PL', { weekday: 'long' });
    titleEl.textContent = formatTxDate(dateStr);

    const expenseTotal = dayTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const incomeTotal = dayTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);

    summaryEl.innerHTML = `<div class="calendar-day-summary-row">
        <span class="calendar-day-weekday">${weekday.charAt(0).toUpperCase() + weekday.slice(1)}</span>
        <div class="calendar-day-totals">
            ${expenseTotal > 0 ? `<span class="calendar-day-total expense">−${formatPlnAmount(expenseTotal)}</span>` : ''}
            ${incomeTotal > 0 ? `<span class="calendar-day-total income">+${formatPlnAmount(incomeTotal)}</span>` : ''}
        </div>
    </div>`;

    if (!dayTx.length) {
        listEl.innerHTML = '<div class="empty-state"><p>Brak transakcji tego dnia</p></div>';
    } else {
        listEl.innerHTML = dayTx.map((t) => {
            const title = t.subCategory === '[Bez podkategorii]' ? t.mainCategory : t.subCategory;
            const meta = t.subCategory === '[Bez podkategorii]' ? '' : t.mainCategory;
            const isRec = t.recurringId ? '<span class="tx-badge">&#10227;</span>' : '';
            return `<div class="calendar-day-tx">
                ${renderCategoryIcon(t.mainCategory, 'list', t.subCategory !== '[Bez podkategorii]' ? t.subCategory : null, t.type)}
                <div class="tx-info">
                    <div class="tx-title">${escapeHtml(title)}${isRec}</div>
                    ${meta ? `<div class="tx-meta">${escapeHtml(meta)}</div>` : ''}
                    ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ''}
                </div>
                <div class="tx-amount ${t.type}">${t.type === 'expense' ? '−' : '+'}${t.amount.toFixed(2)} zł</div>
            </div>`;
        }).join('');
    }

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeCalendarDay() {
    const overlay = document.getElementById('calendar-day-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
}

function calcReportsDailyAverage(period, periodTx) {
    const expenses = periodTx.filter((t) => t.type === 'expense');
    const now = new Date();

    if (period === 'all') {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 29);
        const cutoffStr = cutoff.toISOString().split('T')[0];
        const recentTotal = expenses
            .filter((t) => t.date >= cutoffStr)
            .reduce((sum, t) => sum + t.amount, 0);
        return { avg: recentTotal / 30, hint: 'ostatnie 30 dni' };
    }

    if (period === 'range' || period === 'compare') {
        const dates = expenses.map((t) => t.date).sort();
        if (!dates.length) return { avg: 0, hint: 'brak wydatków' };
        const start = dates[0];
        const end = dates[dates.length - 1];
        const days = Math.max(1, Math.ceil((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) + 1);
        const total = expenses.reduce((sum, t) => sum + t.amount, 0);
        return { avg: total / days, hint: `zakres (${days} dni)` };
    }

    const year = parseInt(period, 10);
    const isCurrentYear = year === now.getFullYear();
    const start = new Date(year, 0, 1);
    const end = isCurrentYear ? now : new Date(year, 11, 31);
    const days = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
    const total = expenses.reduce((sum, t) => sum + t.amount, 0);
    return { avg: total / days, hint: isCurrentYear ? `od 1 sty do dziś (${days} dni)` : `cały rok (${days} dni)` };
}

function renderReportsDailyAvg(period, periodTx) {
    const { avg, hint } = calcReportsDailyAverage(period, periodTx);
    const avgEl = document.getElementById('reports-daily-avg');
    const hintEl = document.getElementById('reports-daily-avg-hint');
    if (avgEl) avgEl.textContent = formatPlnAmount(avg);
    if (hintEl) hintEl.textContent = hint;
}

function loadSavingsGoal() {
    const value = parseInt(localStorage.getItem(SAVINGS_GOAL_KEY), 10);
    return Number.isFinite(value) ? value : 20;
}

function saveSavingsGoal() {
    const input = document.getElementById('savings-goal-input');
    if (!input) return;
    const value = Math.max(0, Math.min(100, parseInt(input.value, 10) || 0));
    input.value = value;
    localStorage.setItem(SAVINGS_GOAL_KEY, String(value));
    const period = document.getElementById('reports-year-select')?.value;
    if (!period) return;
    const periodTx = getTransactionsForReportsPeriod(period);
    const totalIncome = periodTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = periodTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const savingsRate = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;
    renderReportsSavingsGoal(savingsRate);
}

function renderReportsSavingsGoal(savingsRate) {
    const goal = loadSavingsGoal();
    const input = document.getElementById('savings-goal-input');
    if (input && document.activeElement !== input) input.value = goal;
    const fill = document.getElementById('reports-goal-fill');
    const label = document.getElementById('reports-goal-label');
    if (!fill || !label) return;
    const progress = goal > 0 ? Math.min(100, Math.round((savingsRate / goal) * 100)) : 0;
    fill.style.width = `${progress}%`;
    fill.style.background = savingsRate >= goal ? 'var(--success)' : (savingsRate >= 0 ? 'var(--accent)' : 'var(--danger)');
    label.textContent = `${savingsRate}% z ${goal}%`;
}

function renderReportsTrendChart(period, periodTx, rangeStart, rangeEnd) {
    const canvas = document.getElementById('reportsTrendChart');
    if (!canvas) return;
    const { monthLabels, expenseData } = buildReportsMonthChartData(period, periodTx, rangeStart, rangeEnd);
    const theme = getReportsChartTheme();
    const ctx = canvas.getContext('2d');
    if (reportsTrendChartInstance) reportsTrendChartInstance.destroy();

    reportsTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Wydatki',
                data: expenseData,
                borderColor: theme.expenseColor,
                backgroundColor: theme.expenseFill,
                fill: true,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 5,
                borderWidth: 2
            }]
        },
        options: getReportsChartOptions(theme)
    });
}

function getMonthExpenseTotal(year, month, sourceTx) {
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
    return sourceTx
        .filter((t) => t.type === 'expense' && t.date >= monthStart && t.date <= monthEnd)
        .reduce((sum, t) => sum + t.amount, 0);
}

function renderReportsYoYChart(period, periodTx, reportsCtx) {
    const canvas = document.getElementById('reportsYoyChart');
    const titleEl = document.getElementById('reports-yoy-title');
    if (!canvas) return;

    const theme = getReportsChartTheme();
    const ctx = canvas.getContext('2d');
    if (reportsYoyChartInstance) reportsYoyChartInstance.destroy();

    const now = new Date();
    const labels = [];
    const currentData = [];
    const prevData = [];
    const allTx = appState.transactions;

    if (period === 'range' || period === 'compare') {
        const start = reportsCtx?.rangeStart || reportsCtx?.periodA?.start;
        const end = reportsCtx?.rangeEnd || reportsCtx?.periodA?.end;
        const { monthKeys } = buildReportsMonthChartData(period, periodTx, start, end);
        if (titleEl) titleEl.textContent = 'Porównanie rok do roku (zakres)';
        monthKeys.forEach(({ year, month }) => {
            labels.push(new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            currentData.push(getMonthExpenseTotal(year, month, periodTx));
            prevData.push(getMonthExpenseTotal(year - 1, month, allTx));
        });
    } else if (period === 'all') {
        if (titleEl) titleEl.textContent = 'Porównanie rok do roku (ostatnie 6 mies.)';
        for (let offset = 5; offset >= 0; offset--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            labels.push(monthDate.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            currentData.push(getMonthExpenseTotal(year, month, allTx));
            prevData.push(getMonthExpenseTotal(year - 1, month, allTx));
        }
    } else {
        const year = parseInt(period, 10);
        const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : 12;
        if (titleEl) titleEl.textContent = `Porównanie ${year} vs ${year - 1}`;
        for (let month = 0; month < monthCount; month++) {
            labels.push(new Date(year, month, 1).toLocaleDateString('pl-PL', { month: 'short' }));
            currentData.push(getMonthExpenseTotal(year, month, periodTx));
            prevData.push(getMonthExpenseTotal(year - 1, month, allTx));
        }
    }

    reportsYoyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: period === 'all' ? 'Ten rok' : String(parseInt(period, 10)),
                    data: currentData,
                    backgroundColor: theme.expenseColor,
                    borderRadius: 5,
                    borderSkipped: false
                },
                {
                    label: period === 'all' ? 'Rok wcześniej' : String(parseInt(period, 10) - 1),
                    data: prevData,
                    backgroundColor: theme.prevYearColor,
                    borderRadius: 5,
                    borderSkipped: false
                }
            ]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsDowChart(periodTx) {
    const canvas = document.getElementById('reportsDowChart');
    if (!canvas) return;

    const dowLabels = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];

    periodTx.filter((t) => t.type === 'expense').forEach((t) => {
        const dow = (new Date(t.date + 'T12:00:00').getDay() + 6) % 7;
        dowTotals[dow] += t.amount;
        dowCounts[dow]++;
    });

    const dowAvg = dowTotals.map((total, i) => (dowCounts[i] > 0 ? total / dowCounts[i] : 0));
    const theme = getReportsChartTheme();
    const ctx = canvas.getContext('2d');
    if (reportsDowChartInstance) reportsDowChartInstance.destroy();

    const maxAvg = Math.max(...dowAvg, 1);
    const barColors = dowAvg.map((avg) => {
        const ratio = avg / maxAvg;
        if (isLightTheme()) return `rgba(220, 38, 38, ${0.25 + ratio * 0.65})`;
        return `rgba(248, 113, 113, ${0.3 + ratio * 0.65})`;
    });

    reportsDowChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dowLabels,
            datasets: [{
                label: 'Śr. wydatek',
                data: dowAvg,
                backgroundColor: barColors,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: getReportsChartOptions(theme)
    });
}

function renderReportsRecurring() {
    const list = document.getElementById('reports-recurring-list');
    if (!list) return;

    const recurringMap = {};
    appState.transactions.forEach((t) => {
        if (!t.recurringId || t.type !== 'expense') return;
        if (!recurringMap[t.recurringId]) {
            recurringMap[t.recurringId] = {
                amount: t.amount,
                mainCategory: t.mainCategory,
                subCategory: t.subCategory
            };
        }
    });

    const entries = Object.values(recurringMap).sort((a, b) => b.amount - a.amount);
    if (!entries.length) {
        list.innerHTML = '<div class="empty-state"><p>Brak wydatków cyklicznych</p></div>';
        return;
    }

    const monthlyTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);
    list.innerHTML = entries.map((entry) => {
        const title = entry.subCategory === '[Bez podkategorii]' ? entry.mainCategory : entry.subCategory;
        const meta = entry.subCategory === '[Bez podkategorii]' ? '' : entry.mainCategory;
        return `<div class="reports-recurring-item">
            ${renderCategoryIcon(entry.mainCategory, 'list', entry.subCategory === '[Bez podkategorii]' ? null : entry.subCategory, 'expense')}
            <div class="reports-top-text">
                <span class="reports-top-name">${title}</span>
                ${meta ? `<span class="reports-top-meta">${meta}</span>` : ''}
            </div>
            <span class="reports-recurring-amount">${formatPlnAmount(entry.amount)}/mies.</span>
        </div>`;
    }).join('') + `<div class="reports-recurring-total">Suma miesięczna: <strong>${formatPlnAmount(monthlyTotal)}</strong></div>`;
}

function escapeCsvField(value) {
    const text = String(value ?? '');
    if (text.includes(';') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function exportReportsCsv() {
    const period = document.getElementById('reports-year-select').value;
    const periodTx = [...getTransactionsForReportsPeriod(period)].sort((a, b) => a.date.localeCompare(b.date));
    const headers = ['Data', 'Typ', 'Kategoria', 'Podkategoria', 'Kwota', 'Notatka', 'Cykliczna'];
    const rows = periodTx.map((t) => [
        t.date,
        t.type === 'expense' ? 'Wydatek' : 'Wpływ',
        t.mainCategory,
        t.subCategory === '[Bez podkategorii]' ? '' : t.subCategory,
        t.amount.toFixed(2).replace('.', ','),
        t.note || '',
        t.recurringId ? 'Tak' : 'Nie'
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsvField).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `portfel-raport-${period === 'all' ? 'cala-historia' : period}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function renderReportsTopCategories(periodTx) {
    const topEl = document.getElementById('reports-top-categories');
    document.getElementById('btn-reports-expense').classList.toggle('active', reportsViewType === 'expense');
    document.getElementById('btn-reports-income').classList.toggle('active', reportsViewType === 'income');
    document.getElementById('btn-reports-main').classList.toggle('active', reportsRankLevel === 'main');
    document.getElementById('btn-reports-sub').classList.toggle('active', reportsRankLevel === 'sub');
    document.getElementById('reports-top-title').innerText = reportsRankLevel === 'sub' ? 'Top podkategorie' : 'Top kategorie';

    const typeTx = periodTx.filter(t => t.type === reportsViewType);
    const catSums = {};

    if (reportsRankLevel === 'sub') {
        typeTx.forEach((t) => {
            const sub = t.subCategory === '[Bez podkategorii]' ? null : t.subCategory;
            const key = sub ? `${t.mainCategory}|${sub}` : t.mainCategory;
            if (!catSums[key]) {
                catSums[key] = { amount: 0, mainCategory: t.mainCategory, subCategory: sub, label: sub || t.mainCategory };
            }
            catSums[key].amount += t.amount;
        });
    } else {
        typeTx.forEach((t) => {
            if (!catSums[t.mainCategory]) {
                catSums[t.mainCategory] = { amount: 0, mainCategory: t.mainCategory, subCategory: null, label: t.mainCategory };
            }
            catSums[t.mainCategory].amount += t.amount;
        });
    }

    const total = Object.values(catSums).reduce((sum, entry) => sum + entry.amount, 0);
    const entries = Object.values(catSums)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    if (!entries.length) {
        topEl.innerHTML = '<div class="empty-state"><p>Brak danych za wybrany okres</p></div>';
        return;
    }

    topEl.innerHTML = entries.map((entry, index) => {
        const pct = total > 0 ? Math.round((entry.amount / total) * 100) : 0;
        const meta = reportsRankLevel === 'sub' && entry.subCategory ? entry.mainCategory : '';
        return `<div class="reports-top-item">
            <span class="reports-top-rank">${index + 1}</span>
            ${renderCategoryIcon(entry.mainCategory, 'list', entry.subCategory, reportsViewType)}
            <div class="reports-top-text">
                <span class="reports-top-name">${entry.label}</span>
                ${meta ? `<span class="reports-top-meta">${meta}</span>` : ''}
                <span class="reports-top-amount">${formatPlnAmount(entry.amount)}</span>
            </div>
            <span class="reports-top-pct">${pct}%</span>
        </div>`;
    }).join('');
}

function buildReportsMonthChartData(period, periodTx, rangeStart, rangeEnd) {
    const now = new Date();
    const monthLabels = [];
    const monthKeys = [];
    const incomeData = [];
    const expenseData = [];

    if ((period === 'range' || period === 'compare') && rangeStart && rangeEnd) {
        const end = new Date(`${rangeEnd}T12:00:00`);
        let cursor = new Date(`${rangeStart}T12:00:00`);
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        while (cursor <= end) {
            const year = cursor.getFullYear();
            const month = cursor.getMonth();
            const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const monthEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
            const monthTx = periodTx.filter((t) => t.date >= monthStart && t.date <= monthEnd);
            monthLabels.push(cursor.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            monthKeys.push({ year, month });
            incomeData.push(monthTx.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
            expenseData.push(monthTx.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
            cursor = new Date(year, month + 1, 1);
        }
        return { monthLabels, monthKeys, incomeData, expenseData, title: 'Miesiące w zakresie' };
    }

    if (period === 'all') {
        for (let offset = 11; offset >= 0; offset--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const monthEnd = new Date(year, month + 1, 0).toISOString().split('T')[0];
            const monthTx = periodTx.filter(t => t.date >= monthStart && t.date <= monthEnd);
            monthLabels.push(monthDate.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' }));
            monthKeys.push({ year, month });
            incomeData.push(monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
            expenseData.push(monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
        }
        return { monthLabels, monthKeys, incomeData, expenseData, title: 'Ostatnie 12 miesięcy' };
    }

    const year = parseInt(period, 10);
    const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    for (let month = 0; month < monthCount; month++) {
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const monthEndDate = new Date(year, month + 1, 0);
        const monthEnd = monthEndDate.toISOString().split('T')[0];
        const monthTx = periodTx.filter(t => t.date >= monthStart && t.date <= monthEnd);
        monthLabels.push(monthEndDate.toLocaleDateString('pl-PL', { month: 'short' }));
        monthKeys.push({ year, month });
        incomeData.push(monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
        expenseData.push(monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
    }
    return { monthLabels, monthKeys, incomeData, expenseData, title: 'Miesiące w roku' };
}

function renderReports() {
    populateReportsYearSelect();
    const ctx = typeof getReportsPeriodContext === 'function'
        ? getReportsPeriodContext()
        : (() => {
            const period = document.getElementById('reports-year-select').value;
            return {
                mode: 'year',
                period,
                label: period === 'all' ? 'Całość' : period,
                periodTx: getTransactionsForReportsPeriod(period),
                rangeStart: null,
                rangeEnd: null
            };
        })();

    const { period, periodTx, label, rangeStart, rangeEnd, periodA } = ctx;
    let chartPeriod = period;
    let chartRangeStart = rangeStart;
    let chartRangeEnd = rangeEnd;
    if (period === 'compare' && periodA) {
        chartPeriod = 'range';
        chartRangeStart = periodA.start;
        chartRangeEnd = periodA.end;
    }
    const totalIncome = periodTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = periodTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;

    document.getElementById('reports-year-label').innerText = label;
    document.getElementById('reports-total-income').innerText = formatPlnAmount(totalIncome);
    document.getElementById('reports-total-expense').innerText = formatPlnAmount(totalExpense);
    const netEl = document.getElementById('reports-net-balance');
    netEl.innerText = `${netBalance >= 0 ? '+' : ''}${netBalance.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
    netEl.style.color = netBalance >= 0 ? 'var(--success)' : 'var(--danger)';
    const savingsEl = document.getElementById('reports-savings-rate');
    savingsEl.innerText = `${savingsRate}%`;
    savingsEl.style.color = savingsRate >= 0 ? 'var(--success)' : 'var(--danger)';

    const { monthLabels, monthKeys, incomeData, expenseData, title } = buildReportsMonthChartData(chartPeriod, periodTx, chartRangeStart, chartRangeEnd);
    document.getElementById('reports-months-title').innerText = title;
    if (typeof storeReportsMonthChartMeta === 'function') {
        storeReportsMonthChartMeta(chartPeriod, monthLabels, ctx, monthKeys);
    }

    const ctx2 = document.getElementById('reportsMonthsChart').getContext('2d');
    if (reportsChartInstance) reportsChartInstance.destroy();

    const legendColor = getThemeCssVar('--text', '#0f172a', '#f5f5f5');
    const gridColor = isLightTheme() ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';

    const monthChartOptions = {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.35,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: legendColor,
                        font: { family: 'DM Sans', weight: '600', size: 11 },
                        boxWidth: 12,
                        padding: 14
                    }
                },
                tooltip: {
                    backgroundColor: isLightTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(0, 0, 0, 0.88)',
                    titleFont: { family: 'DM Sans', weight: '700' },
                    bodyFont: { family: 'DM Sans', weight: '600' },
                    padding: 12,
                    cornerRadius: 10,
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatPlnAmount(context.parsed.y)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: legendColor, font: { family: 'DM Sans', size: 10 } },
                    grid: { display: false }
                },
                y: {
                    ticks: {
                        color: legendColor,
                        font: { family: 'DM Sans', size: 10 },
                        callback: (value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)
                    },
                    grid: { color: gridColor }
                }
            }
        };
    if (typeof attachReportsMonthChartClick === 'function') attachReportsMonthChartClick(monthChartOptions);

    reportsChartInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: 'Wpływy',
                    data: incomeData,
                    backgroundColor: isLightTheme() ? 'rgba(13, 148, 136, 0.85)' : 'rgba(52, 211, 153, 0.8)',
                    borderRadius: 6,
                    borderSkipped: false
                },
                {
                    label: 'Wydatki',
                    data: expenseData,
                    backgroundColor: isLightTheme() ? 'rgba(220, 38, 38, 0.8)' : 'rgba(248, 113, 113, 0.8)',
                    borderRadius: 6,
                    borderSkipped: false
                }
            ]
        },
        options: monthChartOptions
    });

    syncReportsCalendarToPeriod(chartPeriod === 'range' ? chartRangeStart?.slice(0, 4) : period);
    if (typeof renderReportsCalendarView === 'function') {
        renderReportsCalendarView();
    } else {
        renderReportsCalendar();
    }
    renderReportsDailyAvg(chartPeriod, periodTx);
    renderReportsSavingsGoal(savingsRate);
    renderReportsTrendChart(chartPeriod, periodTx, chartRangeStart, chartRangeEnd);
    renderReportsYoYChart(chartPeriod, periodTx, ctx);
    renderReportsDowChart(periodTx);
    renderReportsRecurring();
    renderReportsTopCategories(periodTx);
    if (typeof renderPhase3Reports === 'function') renderPhase3Reports(ctx, savingsRate);
}

function renderInvestments() {
    const list = document.getElementById('assets-list');
    const select = document.getElementById('update-asset-select');
    list.innerHTML = '';
    select.innerHTML = '';
    let totalValuePLN = 0;
    const FIXED_EUR_PLN = 4.32;
    appState.investments.forEach((asset, idx) => {
        const currentVal = asset.quantity * asset.currentPriceManual;
        const costVal = asset.quantity * asset.purchasePrice;
        const profitPct = ((currentVal - costVal) / costVal) * 100;
        totalValuePLN += asset.currency === 'EUR' ? currentVal * FIXED_EUR_PLN : currentVal;
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `<div class="tx-info"><div style="font-weight:700; font-size:0.95rem;">${asset.ticker}</div><div style="font-size:0.75rem; color:var(--text-muted);">${asset.name}</div><div style="font-size:0.75rem; color:var(--text-muted);">${asset.quantity} szt. • Średnia: ${asset.purchasePrice.toFixed(2)} ${asset.currency}</div></div><div style="text-align:right;"><div style="font-weight:700; font-size:0.95rem;">${currentVal.toFixed(2)} ${asset.currency}</div><div style="font-size:0.8rem; font-weight:700; color:${profitPct >= 0 ? 'var(--success)' : 'var(--danger)'}">${profitPct >= 0 ? '+' : ''}${profitPct.toFixed(2)}%</div></div>`;
        list.appendChild(row);
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = asset.ticker;
        select.appendChild(opt);
    });
    document.getElementById('portfolio-value').innerText = `${totalValuePLN.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN`;
}

function updateAssetPriceManual() {
    const idx = document.getElementById('update-asset-select').value;
    const newPrice = parseFloat(document.getElementById('update-asset-price').value);
    if (!newPrice || newPrice <= 0) return;
    appState.investments[idx].currentPriceManual = newPrice;
    saveState();
    document.getElementById('update-asset-price').value = '';
    renderInvestments();
}

function renderLoans() {
    const loan = appState.loan;
    document.getElementById('loan-left').innerText = `${loan.currentCapitalLeft.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł`;
    document.getElementById('loan-rate').innerText = `${loan.interestRate}%`;
    const paidPct = ((loan.totalAmount - loan.currentCapitalLeft) / loan.totalAmount) * 100;
    document.getElementById('loan-progress-fill').style.width = `${paidPct}%`;
}

function addLoanOverpayment() {
    const amount = parseFloat(document.getElementById('loan-overpayment-amount').value);
    if (!amount || amount <= 0) return;
    appState.loan.currentCapitalLeft -= amount;
    appState.transactions.unshift({
        amount,
        type: 'expense',
        mainCategory: 'Długi',
        subCategory: 'Kredyt Pekao SA',
        date: new Date().toISOString().split('T')[0],
        note: 'Dodatkowa nadpłata kapitału'
    });
    saveState();
    document.getElementById('loan-overpayment-amount').value = '';
    renderLoans();
}

function getExportPayload() {
    const data = getPersistedState(appState);
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactionCount: data.transactions.length,
        data
    };
}

function applyBackupPayload(payload) {
    const data = payload.data || payload;
    if (!data || !Array.isArray(data.transactions)) {
        throw new Error('Nieprawidłowy plik kopii zapasowej.');
    }
    normalizeAppState(data);
    saveState();
    refreshCurrentView();
}

function showSettingsToast(message) {
    const toast = document.getElementById('settings-toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
}

function setTheme(mode) {
    localStorage.setItem(THEME_KEY, mode);
    const html = document.documentElement;
    if (mode === 'auto') {
        html.removeAttribute('data-theme');
    } else {
        html.setAttribute('data-theme', mode);
    }
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === mode);
    });
    updateThemeColorMeta();
    refreshCurrentView();
}

function updateThemeColorMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const forced = document.documentElement.getAttribute('data-theme');
    const isDark = forced === 'dark' || (!forced && window.matchMedia('(prefers-color-scheme: dark)').matches);
    meta.content = isDark ? '#0a0a0a' : '#e4eaf4';
}

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    setTheme(saved);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if ((localStorage.getItem(THEME_KEY) || 'auto') === 'auto') updateThemeColorMeta();
    });
}

async function refreshBackupInfo() {
    const infoEl = document.getElementById('backup-cloud-info');
    try {
        const snap = await cloudBackupRef.get();
        if (snap.exists && snap.data().exportedAt) {
            const date = new Date(snap.data().exportedAt).toLocaleString('pl-PL');
            const count = snap.data().transactionCount || snap.data().data?.transactions?.length || '?';
            infoEl.textContent = `Ostatnia kopia w chmurze: ${date} (${count} transakcji)`;
        } else {
            infoEl.textContent = 'Kopia w chmurze: brak zapisanej kopii';
        }
    } catch {
        infoEl.textContent = 'Kopia w chmurze: niedostępna (sprawdź połączenie)';
    }
    const localRaw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (localRaw) {
        try {
            const local = JSON.parse(localRaw);
            infoEl.textContent += `\nKopia lokalna: ${new Date(local.exportedAt).toLocaleString('pl-PL')}`;
        } catch { /* ignore */ }
    }
}

function openSettings() {
    document.getElementById('settings-overlay').classList.remove('hidden');
    const saved = localStorage.getItem(THEME_KEY) || 'auto';
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === saved);
    });
    refreshBackupInfo();
}

function openCategoryEditor() {
    categoryEditorType = 'expense';
    document.getElementById('category-editor-overlay').classList.remove('hidden');
    document.getElementById('btn-category-editor-expense').classList.add('active');
    document.getElementById('btn-category-editor-income').classList.remove('active');
    renderCategoryEditor();
}

function closeCategoryEditor() {
    document.getElementById('category-editor-overlay').classList.add('hidden');
}

function setCategoryEditorType(type) {
    if (categoryEditorType === type) return;
    categoryEditorType = type;
    document.getElementById('btn-category-editor-expense').classList.toggle('active', type === 'expense');
    document.getElementById('btn-category-editor-income').classList.toggle('active', type === 'income');
    renderCategoryEditor();
}

function renderCategoryEditor() {
    const list = document.getElementById('category-editor-list');
    list.innerHTML = '';
    const txType = categoryEditorType;

    Object.keys(categoryTree[txType]).forEach((main) => {
        const group = document.createElement('div');
        group.className = 'category-edit-group';

        const mainRow = document.createElement('div');
        mainRow.className = 'category-edit-row category-edit-row--main';
        mainRow.innerHTML = renderCategoryIcon(main, 'chip', null, txType);
        const mainInput = document.createElement('input');
        mainInput.type = 'text';
        mainInput.className = 'category-edit-input category-edit-input--main';
        mainInput.value = main;
        mainInput.dataset.original = main;
        mainInput.maxLength = 40;
        mainRow.appendChild(mainInput);
        group.appendChild(mainRow);

        const subsWrap = document.createElement('div');
        subsWrap.className = 'category-edit-subs';
        categoryTree[txType][main].forEach((sub) => {
            const subRow = document.createElement('div');
            subRow.className = 'category-edit-row category-edit-row--sub';
            subRow.innerHTML = renderCategoryIcon(main, 'chip', sub, txType);
            const subInput = document.createElement('input');
            subInput.type = 'text';
            subInput.className = 'category-edit-input category-edit-input--sub';
            subInput.value = sub;
            subInput.dataset.original = sub;
            subInput.maxLength = 40;
            subRow.appendChild(subInput);
            subsWrap.appendChild(subRow);
        });
        if (categoryTree[txType][main].length) group.appendChild(subsWrap);
        list.appendChild(group);
    });
}

function saveCategoryEditor() {
    const type = categoryEditorType;
    const mainRenames = [];
    const subRenames = [];
    const newTypeTree = {};

    const groups = document.querySelectorAll('#category-editor-list .category-edit-group');
    for (const group of groups) {
        const mainInput = group.querySelector('.category-edit-input--main');
        const oldMain = mainInput.dataset.original;
        const newMain = mainInput.value.trim();
        if (!newMain) {
            alert('Nazwa kategorii głównej nie może być pusta.');
            mainInput.focus();
            return;
        }

        const subs = [];
        const subInputs = group.querySelectorAll('.category-edit-input--sub');
        for (const subInput of subInputs) {
            const oldSub = subInput.dataset.original;
            const newSub = subInput.value.trim();
            if (!newSub) {
                alert('Nazwa podkategorii nie może być pusta.');
                subInput.focus();
                return;
            }
            subs.push(newSub);
            if (oldSub !== newSub) subRenames.push({ oldMain, oldSub, newSub });
        }

        if (oldMain !== newMain) mainRenames.push({ oldMain, newMain });
        newTypeTree[newMain] = subs;
    }

    const mainNames = Object.keys(newTypeTree);
    if (mainNames.length !== new Set(mainNames).size) {
        alert('Kategorie główne muszą mieć unikalne nazwy.');
        return;
    }
    for (const main of mainNames) {
        const subs = newTypeTree[main];
        if (subs.length !== new Set(subs).size) {
            alert(`Podkategorie w „${main}” muszą mieć unikalne nazwy.`);
            return;
        }
    }

    const mainMap = {};
    mainRenames.forEach((r) => { mainMap[r.oldMain] = r.newMain; });

    categoryTree[type] = newTypeTree;
    appState.categoryTree = categoryTree;

    appState.transactions.forEach((tx) => {
        if (tx.type !== type) return;
        const origMain = tx.mainCategory;
        const origSub = tx.subCategory;
        if (mainMap[origMain]) tx.mainCategory = mainMap[origMain];
        subRenames.forEach((r) => {
            if (origMain === r.oldMain && origSub === r.oldSub) tx.subCategory = r.newSub;
        });
    });

    if (activeChartCategory && mainMap[activeChartCategory]) {
        activeChartCategory = mainMap[activeChartCategory];
    }
    if (formState.selectedMainCategory && mainMap[formState.selectedMainCategory]) {
        formState.selectedMainCategory = mainMap[formState.selectedMainCategory];
    }
    subRenames.forEach((r) => {
        if (formState.selectedSubCategory === r.oldSub && formState.selectedMainCategory === (mainMap[r.oldMain] || r.oldMain)) {
            formState.selectedSubCategory = r.newSub;
        }
    });

    migrateRecentCategories(mainMap, subRenames, type);
    saveState();
    hapticFeedback();
    closeCategoryEditor();
    showSettingsToast('Nazwy kategorii zapisane');
    refreshCurrentView();
}

function closeSettings() {
    document.getElementById('settings-overlay').classList.add('hidden');
}

async function backupToCloud() {
    try {
        const payload = getExportPayload();
        await cloudBackupRef.set(payload);
        showSettingsToast('Kopia wysłana do chmury');
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        alert('Nie udało się wysłać kopii do chmury. Opublikuj zaktualizowane reguły Firestore (cloud_backup).');
        console.error(err);
    }
}

function backupToPhone() {
    const payload = getExportPayload();
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(payload));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finanse-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showSettingsToast('Kopia zapisana na telefonie');
    hapticFeedback();
}

async function restoreFromCloud() {
    try {
        const snap = await cloudBackupRef.get();
        if (!snap.exists) return alert('Brak kopii zapasowej w chmurze.');
        const payload = snap.data();
        const count = payload.transactionCount || payload.data?.transactions?.length || 0;
        if (!confirm(`Przywrócić kopię z chmury (${count} transakcji)? Obecne dane zostaną zastąpione.`)) return;
        applyBackupPayload(payload);
        showSettingsToast('Przywrócono kopię z chmury');
        refreshBackupInfo();
        hapticFeedback();
    } catch (err) {
        alert('Nie udało się pobrać kopii z chmury.');
        console.error(err);
    }
}

function restoreFromPhoneFile() {
    document.getElementById('backup-file-input').click();
}

function handleBackupFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const payload = JSON.parse(reader.result);
            const count = payload.transactionCount || payload.data?.transactions?.length || 0;
            if (!confirm(`Przywrócić kopię z pliku (${count} transakcji)? Obecne dane zostaną zastąpione.`)) return;
            applyBackupPayload(payload);
            localStorage.setItem(LOCAL_BACKUP_KEY, reader.result);
            showSettingsToast('Przywrócono kopię z pliku');
            refreshBackupInfo();
            hapticFeedback();
        } catch (err) {
            alert('Nieprawidłowy plik kopii zapasowej.');
            console.error(err);
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

document.getElementById('tx-date').value = new Date().toISOString().split('T')[0];
renderMainCategoriesForm();
initTheme();
initOnboarding();
initData();
registerServiceWorker();
checkModuleSplitThreshold();
