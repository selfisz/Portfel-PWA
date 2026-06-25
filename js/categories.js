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

function getCategoryColor(category, txType = 'expense') {
    const isIncome = txType === 'income' || !!(categoryTree?.income?.[category]);
    if (isIncome) {
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
function getRecentFormScope() {
    return formState.formMode || formState.currentType || 'expense';
}

function readRecentFormEntries() {
    try {
        return JSON.parse(localStorage.getItem(RECENT_CATEGORIES_KEY) || '[]');
    } catch {
        return [];
    }
}

function recentFormEntryKey(entry) {
    const scope = entry.scope || entry.type;
    if (scope === 'loan') return `loan|${entry.loanId}`;
    if (scope === 'card') return `card|${entry.cardId}|${entry.cardOperation || 'repayment'}`;
    return `${scope}|${entry.mainCategory}|${entry.subCategory}`;
}

function getRecentEntriesForScope(scope) {
    return readRecentFormEntries()
        .filter((entry) => (entry.scope || entry.type) === scope)
        .slice(0, MAX_RECENT_CATEGORIES);
}

function pushRecentFormEntry(entry) {
    const scope = entry.scope || entry.type;
    const normalized = { ...entry, scope };
    let all = readRecentFormEntries();
    const key = recentFormEntryKey(normalized);
    all = all.filter((item) => recentFormEntryKey(item) !== key);
    all.unshift(normalized);
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(all.slice(0, MAX_RECENT_CATEGORIES * 4)));
}

function migrateRecentCategories(mainMap, subRenames, type) {
    try {
        const recents = readRecentFormEntries();
        let changed = false;
        const migrated = recents.map((entry) => {
            if ((entry.scope || entry.type) !== type) return entry;
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
    return getRecentEntriesForScope(type).filter((entry) => entry.mainCategory);
}

function getRecentLoans() {
    return getRecentEntriesForScope('loan').filter((entry) => entry.loanId);
}

function getRecentCards() {
    return getRecentEntriesForScope('card').filter((entry) => entry.cardId);
}

function addRecentCategory(type, mainCategory, subCategory) {
    pushRecentFormEntry({ type, mainCategory, subCategory });
}

function addRecentLoan(loanId) {
    if (!loanId) return;
    pushRecentFormEntry({ scope: 'loan', loanId });
}

function addRecentCard(cardId, cardOperation = 'repayment') {
    if (!cardId) return;
    pushRecentFormEntry({ scope: 'card', cardId, cardOperation });
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

function renderRecentCategoryChips() {
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

function renderRecentLoanChips() {
    const wrapper = document.getElementById('recent-loans-wrapper');
    const row = document.getElementById('recent-loans-row');
    const select = document.getElementById('add-loan-payment-select');
    if (!wrapper || !row) return;

    const recents = getRecentLoans().filter((entry) => {
        const loan = getLoanById(entry.loanId);
        return loan && isLoanActive(loan);
    });

    if (recents.length === 0) {
        wrapper.style.display = 'none';
        row.innerHTML = '';
        return;
    }

    wrapper.style.display = 'block';
    row.innerHTML = '';
    recents.forEach((recent) => {
        const loan = getLoanById(recent.loanId);
        if (!loan) return;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'recent-chip';
        if (select?.value === recent.loanId) chip.classList.add('selected');
        chip.innerHTML = `<span>${escapeHtml(getLoanDisplayName(loan))}</span>`;
        chip.onclick = () => {
            if (select) select.value = recent.loanId;
            row.querySelectorAll('.recent-chip').forEach((el) => el.classList.remove('selected'));
            chip.classList.add('selected');
        };
        row.appendChild(chip);
    });
}

function renderRecentCardChips() {
    const wrapper = document.getElementById('recent-cards-wrapper');
    const row = document.getElementById('recent-cards-row');
    const select = document.getElementById('add-credit-card-select');
    const typeSelect = document.getElementById('add-credit-card-type');
    if (!wrapper || !row) return;

    const recents = getRecentCards().filter((entry) => {
        const card = getCreditCardById(entry.cardId);
        return card && !card.archived && card.limit > 0;
    });

    if (recents.length === 0) {
        wrapper.style.display = 'none';
        row.innerHTML = '';
        return;
    }

    wrapper.style.display = 'block';
    row.innerHTML = '';
    recents.forEach((recent) => {
        const card = getCreditCardById(recent.cardId);
        if (!card) return;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'recent-chip';
        const opLabel = recent.cardOperation === 'transfer_out' ? 'Przelew' : 'Spłata';
        const isSelected = select?.value === recent.cardId
            && (typeSelect?.value || 'repayment') === (recent.cardOperation || 'repayment');
        if (isSelected) chip.classList.add('selected');
        chip.innerHTML = `<span>${escapeHtml(card.name)} · ${opLabel}</span>`;
        chip.onclick = () => {
            if (typeSelect) typeSelect.value = recent.cardOperation || 'repayment';
            populateAddCreditCardForm();
            if (select) select.value = recent.cardId;
            row.querySelectorAll('.recent-chip').forEach((el) => el.classList.remove('selected'));
            chip.classList.add('selected');
        };
        row.appendChild(chip);
    });
}

function renderRecentCategories() {
    const scope = getRecentFormScope();
    document.getElementById('recent-categories-wrapper')?.style.setProperty('display', 'none');
    document.getElementById('recent-loans-wrapper')?.style.setProperty('display', 'none');
    document.getElementById('recent-cards-wrapper')?.style.setProperty('display', 'none');

    if (scope === 'loan') {
        renderRecentLoanChips();
        return;
    }
    if (scope === 'card') {
        renderRecentCardChips();
        return;
    }
    renderRecentCategoryChips();
}
