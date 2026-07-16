# Portfel PWA — wersja 1.0.0

**Data zamknięcia:** 25 czerwca 2026  
**Tag:** [`v1.0.0`](https://github.com/selfisz/Portfel-PWA/releases/tag/v1.0.0)  
**Commit:** `927449a`  
**Gałąź backup:** [`backup/stable-2026-06-25`](https://github.com/selfisz/Portfel-PWA/tree/backup/stable-2026-06-25)  
**Service Worker:** v123

---

## Zamknięcie wersji 1.0

Wersja **1.0** uznana za **zamkniętą i stabilną**. To punkt przywracania przed większymi zmianami w rozwoju aplikacji (wersja 2.x na gałęzi `main`).

### Zakres funkcjonalny v1.0

| Zakładka | Stan |
|----------|------|
| **Pulpit** | Hero z okresem i zużyciem wpływów, wykres, transakcje, raty, karty, majątek |
| **Dodaj** | Wydatek/wpływ z toastem po zapisie; kredyt/karta bez redesignu |
| **Analiza** | Raporty, kalendarz, długi, aktywa |
| **Aktywa** | Hero majątku, „Dostosuj sumę”, lista transakcji gotówki, kompaktowe karty |
| **Długi** | Hero zadłużenia, kredyty, karty, wpłaty, archiwum |
| **Ustawienia** | Kopie zapasowe z potwierdzeniami |

---

## Jak wrócić do wersji 1.0

```bash
# Tag (zalecane)
git fetch origin
git checkout v1.0.0

# Gałąź backup (ten sam kod)
git checkout backup/stable-2026-06-25
```

### Przywrócenie `main` do v1.0 (ostrożnie)

```bash
git checkout main
git reset --hard v1.0.0
git push --force origin main   # tylko świadomie — nadpisuje historię
```

### Bezpieczniejsza opcja — nowa gałąź

```bash
git checkout -b restore-v1.0 v1.0.0
```

---

## Wersjonowanie od tego momentu

- **`v1.0.0`** — zamknięta, niezmienna na GitHubie
- **`main`** — dalszy rozwój (docelowo 2.x)
- **`backup/stable-2026-06-25`** — kopia zapasowa tego samego stanu
