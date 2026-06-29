# Backlog — do zrobienia później

Lista świadomie odłożonych prac. Nie blokuje bieżącego użytkowania przy typowej skali danych.

---

## Archiwum transakcji — wyszukiwanie i kalendarz

**Status:** odłożone (2026-06-29)  
**Kontekst:** `js/state-limits.js` — limit **3500 aktywnych** transakcji; starsze trafiają do lokalnego archiwum (`finanse_archived_transactions`).

### Problem

Po przekroczeniu limitu aktywnych transakcji starsze wpisy są w archiwum lokalnym. Nadal widać je w:

- raportach (rok / „Całość”) — `getMergedTransactions()` w `js/reports-core.js`
- eksporcie JSON v2 — pole `archivedTransactions` w `js/settings.js`

Nie widać ich w:

- **wyszukiwarce na pulpicie** — `js/dashboard.js` (`renderDashboard`, filtr `db-search` używa tylko `appState.transactions`)
- **kalendarzu** — `js/reports-calendar.js` (tylko `appState.transactions`)

### Do zrobienia

1. Wyszukiwanie transakcji na pulpicie powinno przeszukiwać **aktywne + archiwum** (`getMergedTransactions()` lub równoważnie).
2. Kalendarz powinien pokazywać dni z transakcjami z archiwum (przynajmniej przy widoku historycznym).
3. Rozważyć oznaczenie w UI, że wynik pochodzi z archiwum (np. badge „archiwum”).
4. Testy: scenariusz >3500 transakcji, wyszukiwanie i kalendarz dla daty w archiwum.

### Uwagi

- Archiwum jest **tylko lokalne** (nie sync do Firestore) — osobna decyzja, czy kiedyś syncować archiwum lub trzymać pełną historię w chmurze.
- Limit 3500 dotyczy **liczby** transakcji, nie wieku — przy mniejszej bazie transakcje sprzed wielu lat pozostają aktywne.

---

## Firestore Auth + reguły bezpieczeństwa (audyt pkt 5)

**Status:** odłożone (2026-06-29)  
**Kontekst:** `firestore.rules` — dziś `finances/my_state`, `cloud_backup`, `backups` są **publicznie zapisywalne** (tylko ograniczenie po `docId`, bez `request.auth`). Aplikacja nie ma logowania; sync idzie w **jeden wspólny dokument** (`js/firebase.js` → `stateRef`).

### Problem

- Każdy z kluczem API z klienta może czytać i modyfikować dane finansowe w chmurze.
- REST fallback w `js/firebase.js` (`fetchFirestoreDocumentRest`, `fetchAppStateRest`) używa wyłącznie `apiKey` — po zaostrzeniu reguł dostanie **403**.
- Skrypt `scripts/upload-to-firestore.mjs` też nie uwzględnia Auth.

### Ryzyko wdrożenia „od razu”

**Nie wdrażać twardych reguł przed logowaniem w apce** — inaczej:

- sync (`stateRef.set`, `onSnapshot`) przestanie działać;
- auto-odzysk kopii z chmury i lista snapshotów — błędy uprawnień;
- kropka sync: offline / pending (patrz `js/sync-queue.js`).

**Lokalne dane (`localStorage`, eksport JSON) zostają** — dotknięta jest głównie chmura.

Inne pułapki:

- zmiana modelu: z `finances/my_state` na `users/{uid}/state` — migracja i przypisanie starych danych;
- telefon + komputer muszą używać **tego samego konta** Firebase;
- PWA na iOS — sesja / wylogowanie bywa kapryśne;
- zła migracja → pusty profil w chmurze albo nadpisanie nowszych danych.

### Do zrobienia (bezpieczna kolejność)

1. **Decyzja produktowa:** jedno konto (Ty, wiele urządzeń) vs wspólny portfel domowy; metoda logowania (Google / e-mail / Anonymous Auth).
2. **UI logowania** w apce + zapis do `users/{uid}/…` (na razie **równolegle** ze starym `my_state`).
3. **Migracja przy pierwszym logowaniu:** skopiuj `my_state` → dokument użytkownika, jeśli konto jest puste.
4. **Przepisać REST fallbacki** na SDK z tokenem Auth albo usunąć po weryfikacji.
5. **Dopiero na końcu** zaostrzyć `firestore.rules` i zablokować zapis do `my_state` / anonimowy dostęp.
6. Zaktualizować skrypty admina (`upload-to-firestore.mjs`) — service account lub logowanie.
7. Testy: sync po logowaniu, odzysk kopii, wylogowanie, dwa urządzenia na jednym koncie, stara wersja apki (jeśli jeszcze w użyciu).

### Uwagi

- **Nigdy:** najpierw `allow read, write: if request.auth != null` w produkcji, potem login w apce.
- Wdrożenie etapami minimalizuje ryzyko utraty dostępu do chmury (nie do danych lokalnych).
