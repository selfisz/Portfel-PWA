const STORAGE_KEY = 'app_finance_state';
let activeFinanceStorageKey = null;

function setFinanceStorageKey(uid) {
    activeFinanceStorageKey = uid ? `${STORAGE_KEY}_${uid}` : null;
}

function getFinanceStorageKey() {
    return activeFinanceStorageKey || STORAGE_KEY;
}
const THEME_KEY = 'theme_preference';
const LOCAL_BACKUP_KEY = 'finanse_local_backup';
const MAX_CLOUD_BACKUP_SNAPSHOTS_MANUAL = 10;
const MAX_CLOUD_BACKUP_SNAPSHOTS_AUTO = 10;
const MAX_CLOUD_BACKUP_SNAPSHOTS = MAX_CLOUD_BACKUP_SNAPSHOTS_MANUAL + MAX_CLOUD_BACKUP_SNAPSHOTS_AUTO;
const AUTO_CLOUD_BACKUP_ENABLED_KEY = 'finanse_auto_cloud_backup_enabled';
const LAST_AUTO_CLOUD_BACKUP_DATE_KEY = 'finanse_last_auto_cloud_backup_date';
const ASSISTANT_ENABLED_KEY = 'finanse_assistant_enabled';
const ASSISTANT_CONFIRM_TX_KEY = 'finanse_assistant_confirm_tx';
const ASSISTANT_API_KEY_KEY = 'finanse_assistant_api_key';
const ASSISTANT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const ASSISTANT_GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const LIST_PAGE_SIZE = 6;
const MODULE_SPLIT_LINE_THRESHOLD = 900;
const MODULE_SPLIT_BANNER_KEY = 'module_split_banner_dismissed_at';
const DEFAULT_CATEGORY_TREE = {
    expense: {
        "Dom": ["Czynsz", "Meble", "Remont", "Formalności", "Smart home", "Konserwacja", "Inne"],
        "Długi": ["Kredyt hipoteczny", "Kredyt Pekao SA", "Meble", "Remont", "Karta kredytowa", "Spłata", "Raty", "Odroczenia płatności"],
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
const RECENT_CATEGORIES_KEY = 'recent_categories';
const MAX_RECENT_CATEGORIES = 5;
const SAVINGS_GOAL_KEY = 'reports_savings_goal_pct';
const NET_WORTH_LABEL = 'Wartość netto';
const NOTIFICATION_INBOX_KEY = 'finanse_notification_inbox';
const NOTIFICATION_PREFS_KEY = 'finanse_notification_prefs';
const NOTIFICATION_ALERT_STATE_KEY = 'finanse_budget_alert_state';
const NOTIFICATION_INSIGHT_STATE_KEY = 'finanse_insight_alert_state';
const CARD_REPAYMENT_REMINDER_DAYS = 50;
const MAX_ACTIVE_TRANSACTIONS = 3500;
const MAX_CASH_MOVEMENTS = 1500;
const MAX_FIRESTORE_PAYLOAD_BYTES = 900000;
const TX_ARCHIVE_WARN_RATIO = 0.85;
const ARCHIVED_TRANSACTIONS_KEY = 'finanse_archived_transactions';
const PENDING_CLOUD_SYNC_KEY = 'finanse_pending_cloud_sync';
const CLOUD_SYNC_BASE_RETRY_MS = 5000;
const CLOUD_SYNC_MAX_RETRY_MS = 120000;
const CLOUD_SYNC_MAX_ATTEMPTS = 8;
const IKZE_SECOND_BRACKET_RATE = 0.32;
const ONBOARDING_SLIDES = [
    { title: 'Witaj w Finanse', text: 'Twój osobisty portfel — prosty, elegancki i zawsze pod ręką.' },
    { title: 'Synchronizacja live', text: 'Dane trafiają do chmury i są dostępne na telefonie oraz komputerze.' },
    { title: 'Kategorie po Twojemu', text: 'Uporządkowane kategorie z Money Pro — dostosowane pod Ciebie.' }
];
