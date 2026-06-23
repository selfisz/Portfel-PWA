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

const categoryTree = {
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

let appState = {
    transactions: [],
    loan: { totalAmount: 500000.00, currentCapitalLeft: 412500.00, interestRate: 6.75 },
    investments: [{ ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World', quantity: 45, purchasePrice: 104.20, currentPriceManual: 118.50, currency: 'EUR' }]
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
let reportsViewType = 'expense';

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
    'Długi': 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
    'Osobista': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
    'Przyjemności': 'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5S14.67 12 15.5 12s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    'Zakupy': 'M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 13l.6-2h9.6l.6 2H7.2zM6 4h14l-1.5 6h-12L6 4z',
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
    'Kredyt Pekao SA': 'M4 10v7h3v-7H4zm10 0v7h3v-7h-3zM2 19h20v2H2v-2zm2-15h2v4H4V4zm14 0h2v4h-2V4z',
    'Karta kredytowa': 'M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
    'Spłata': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H8v-2h3V9h2v7z',
    'Raty': 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z',
    'Odroczenia płatności': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    'Randki': 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    'Fryzjer': 'M12 2C8.43 2 5.23 3.54 3 6l1.5 1.5C6.12 5.55 8.87 4.3 12 4.3c3.13 0 5.88 1.25 7.5 3.2L21 6c-2.23-2.46-5.43-4-9-4zm0 4c-2.76 0-5 2.24-5 5 0 2.5 1.5 4.5 3.5 5.5V22h3v-4.5c2-1 3.5-3 3.5-5.5 0-2.76-2.24-5-5-5z',
    'Kosmetyki': 'M12 2C9 2 7 4 7 7c0 2.5 1.5 4 3 5.5V22h4v-9.5c1.5-1.5 3-3 3-5.5 0-3-2-5-5-5z',
    'Zdrowie': 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z',
    'Sport': 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z',
    'Ubrania': 'M16 4h-2.9l-.7-2H9.6L8.9 4H6l-2 5v2h3l-1 9h12l-1-9h3V9l-2-5z',
    'Wycieczki': 'M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22l-9-12z',
    'Gierki': 'M15 7.5V2H9v5.5l3 3 3-3zM7.5 9H2v6h5.5l3-3-3-3zM9 16.5V22h6v-5.5l-3-3-3 3zM16.5 9l-3 3 3 3H22V9h-5.5z',
    'Rozrywka': 'M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z',
    'Wyjścia': 'M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z',
    'Alko': 'M6 3v6c0 2.97 2.16 5.43 5 5.91V19H8v2h8v-2h-3v-4.09c2.84-.48 5-2.94 5-5.91V3H6zm2 2h8v4c0 2.21-1.79 4-4 4s-4-1.79-4-4V5z',
    'Zakupy': 'M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 13l.6-2h9.6l.6 2H7.2zM6 4h14l-1.5 6h-12L6 4z',
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
    'Prowizja': 'M7.5 4C5.57 4 4 5.57 4 7.5S5.57 11 7.5 11 11 9.43 11 7.5 9.43 4 7.5 4zm0 2C6.67 6 6 6.67 6 7.5S6.67 9 7.5 9 9 8.33 9 7.5 8.33 6 7.5 6zM16.5 13c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zm0 2c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zM5.41 20 4 18.59 18.59 4 20 5.41 5.41 20z',
    'Nagroda': 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27z',
    'Delegacja': 'M14 6l-3.75 5 2.85 3.8-1.6 1.2C9.81 13.75 7 10 7 10l-6 8h22l-9-12z',
    'Socjal': 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    '[Bez podkategorii]': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'
};

function getCategoryIconPath(mainCategory, subCategory = null) {
    if (subCategory && subCategoryIconPaths[subCategory]) {
        return subCategoryIconPaths[subCategory];
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
        investments: Array.isArray(data.investments) ? data.investments : []
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
    return hadUiFields;
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

function formatPlnAmount(amount) {
    return `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatTxDate(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
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

function populateReportsYearSelect() {
    const select = document.getElementById('reports-year-select');
    if (!select) return;
    const preferred = select.value || String(new Date().getFullYear());
    const years = getTransactionYears();
    select.innerHTML = years.map((year) => {
        const value = String(year);
        return `<option value="${value}"${value === preferred ? ' selected' : ''}>${value}</option>`;
    }).join('');
    if (!years.map(String).includes(preferred) && years.length) {
        select.value = String(years[0]);
    }
}

function setReportsViewType(type) {
    if (reportsViewType === type) return;
    reportsViewType = type;
    renderReports();
}

function renderReportsTopCategories(yearTx) {
    const topEl = document.getElementById('reports-top-categories');
    document.getElementById('btn-reports-expense').classList.toggle('active', reportsViewType === 'expense');
    document.getElementById('btn-reports-income').classList.toggle('active', reportsViewType === 'income');

    const typeTx = yearTx.filter(t => t.type === reportsViewType);
    const catSums = {};
    typeTx.forEach(t => { catSums[t.mainCategory] = (catSums[t.mainCategory] || 0) + t.amount; });
    const total = Object.values(catSums).reduce((sum, value) => sum + value, 0);
    const entries = Object.keys(catSums)
        .map(label => ({ label, amount: catSums[label] }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);

    if (!entries.length) {
        topEl.innerHTML = '<div class="empty-state"><p>Brak danych za ten rok</p></div>';
        return;
    }

    topEl.innerHTML = entries.map((entry, index) => {
        const pct = total > 0 ? Math.round((entry.amount / total) * 100) : 0;
        return `<div class="reports-top-item">
            <span class="reports-top-rank">${index + 1}</span>
            ${renderCategoryIcon(entry.label, 'list', null, reportsViewType)}
            <div class="reports-top-text">
                <span class="reports-top-name">${entry.label}</span>
                <span class="reports-top-amount">${formatPlnAmount(entry.amount)}</span>
            </div>
            <span class="reports-top-pct">${pct}%</span>
        </div>`;
    }).join('');
}

function renderReports() {
    populateReportsYearSelect();
    const year = parseInt(document.getElementById('reports-year-select').value, 10);
    const yearTx = getTransactionsForYear(year);

    const totalIncome = yearTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = yearTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round((netBalance / totalIncome) * 100) : 0;

    document.getElementById('reports-year-label').innerText = String(year);
    document.getElementById('reports-total-income').innerText = formatPlnAmount(totalIncome);
    document.getElementById('reports-total-expense').innerText = formatPlnAmount(totalExpense);
    const netEl = document.getElementById('reports-net-balance');
    netEl.innerText = `${netBalance >= 0 ? '+' : ''}${netBalance.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
    netEl.style.color = netBalance >= 0 ? 'var(--success)' : 'var(--danger)';
    const savingsEl = document.getElementById('reports-savings-rate');
    savingsEl.innerText = `${savingsRate}%`;
    savingsEl.style.color = savingsRate >= 0 ? 'var(--success)' : 'var(--danger)';

    const now = new Date();
    const monthCount = year === now.getFullYear() ? now.getMonth() + 1 : 12;
    const monthLabels = [];
    const incomeData = [];
    const expenseData = [];

    for (let month = 0; month < monthCount; month++) {
        const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const monthEndDate = new Date(year, month + 1, 0);
        const monthEnd = monthEndDate.toISOString().split('T')[0];
        const monthTx = yearTx.filter(t => t.date >= monthStart && t.date <= monthEnd);
        monthLabels.push(monthEndDate.toLocaleDateString('pl-PL', { month: 'short' }));
        incomeData.push(monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
        expenseData.push(monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
    }

    const ctx = document.getElementById('reportsMonthsChart').getContext('2d');
    if (reportsChartInstance) reportsChartInstance.destroy();

    const legendColor = getThemeCssVar('--text', '#0f172a', '#f5f5f5');
    const gridColor = isLightTheme() ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';

    reportsChartInstance = new Chart(ctx, {
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
        options: {
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
        }
    });

    renderReportsTopCategories(yearTx);
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
