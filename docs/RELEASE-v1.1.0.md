# Portfel PWA — wersja 1.1.0

**Data zamknięcia:** 26 czerwca 2026  
**Tag:** [`v1.1.0`](https://github.com/selfisz/Portfel-PWA/releases/tag/v1.1.0)  
**Commit:** `d0989fd`  
**Gałąź backup:** [`backup/stable-2026-06-26`](https://github.com/selfisz/Portfel-PWA/tree/backup/stable-2026-06-26)  
**Service Worker:** v175

---

## Zamknięcie wersji 1.1

Wersja **1.1** to stabilny punkt przywracania po rozbudowie Analizy, raportu porównawczego i ujednoliceniu podglądu transakcji. Poprzednia kopia zapasowa: [`v1.0.0`](RELEASE-v1.0.0.md).

### Nowości względem v1.0

| Obszar | Zmiany |
|--------|--------|
| **Analiza** | Raport porównawczy okresów w zakładkach (Przegląd, Wydatki, Majątek, Długi); sekcja Długi i IKZE |
| **Porównanie** | Układ w wierszach, etykiety okresów (np. „Czerwiec 2026”), „Wartość netto” zamiast net worth |
| **Pulpit** | Trzeci poziom wykresu, filtr kategorii / podkategorii |
| **Transakcje** | Panel podglądu z edycją z nagłówka — pulpit, analiza, aktywa, długi, kalendarz, największe wydatki |
| **UI** | Ujednolicony wygląd zakładek; mniejszy przycisk „Edytuj” w panelach szczegółów |

### Zakres funkcjonalny v1.1

| Zakładka | Stan |
|----------|------|
| **Pulpit** | Hero, wykres z drill-down, transakcje z podglądem, raty, karty, majątek |
| **Dodaj** | Wydatek/wpływ, kredyt, karta |
| **Analiza** | Raporty, porównanie okresów, kalendarz, długi, trendy, największe wydatki |
| **Aktywa** | Hero majątku, transakcje gotówki z podglądem |
| **Długi** | Hero zadłużenia, spłaty z podglądem transakcji |
| **Ustawienia** | Kopie zapasowe |

---

## Jak wrócić do wersji 1.1

```bash
# Tag (zalecane)
git fetch origin
git checkout v1.1.0

# Gałąź backup (ten sam kod)
git checkout backup/stable-2026-06-26
```

### Bezpieczniejsza opcja — nowa gałąź

```bash
git checkout -b restore-v1.1 v1.1.0
```

---

## Wersjonowanie

- **`v1.0.0`** — pierwsza zamknięta wersja
- **`v1.1.0`** — analiza porównawcza + podgląd transakcji
- **`main`** — dalszy rozwój
- **`backup/stable-2026-06-26`** — kopia zapasowa stanu v1.1.0
