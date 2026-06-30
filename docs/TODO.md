# Backlog — Portfel-PWA

Ostatnia aktualizacja: **2026-06-29** (sesja kończona — dokończenie **jutro**).

---

## Na jutro — zamknięcie Auth (checklist)

**Cel:** potwierdzić, że produkcja działa end-to-end; zamknąć wątek audytu pkt 5.

- [ ] **Migracja danych** — w Firebase Console sprawdzić, że po zalogowaniu stan jest pod `users/<uid>/state/main` (nie pusty profil).
- [ ] **Sync** — dodać transakcję na jednym urządzeniu, odświeżyć na drugim (telefon + PC, to samo konto).
- [ ] **Kopia zapasowa** — w Ustawieniach: lista snapshotów + przywrócenie kopii z chmury.
- [ ] **Wylogowanie** — po wylogowaniu brak dostępu do danych w chmurze; po ponownym logowaniu sync wraca.
- [ ] **iOS PWA** — szybki smoke: logowanie hasłem, odświeżenie, sync (wiadomo z wcześniejszej sesji, że działa — potwierdzić po ostatnich zmianach).
- [ ] **Opcjonalnie:** po potwierdzonej migracji usunąć blok `match /finances/...` z reguł (legacy już niepotrzebny do odczytu).
- [ ] **Opcjonalnie:** testy automatyczne auth (emulator / mocki) — niski priorytet.

**Reguły Firestore:** zweryfikowane 2026-06-29 — konsola = `firestore.rules` w repo. **Nie wymagają zmian** przy obecnym kodzie.

---

## Archiwum transakcji — wyszukiwanie i kalendarz

**Status:** ✅ zamknięte w kodzie (2026-06-29)

Limit **3500 aktywnych** transakcji; starsze w lokalnym archiwum (`finanse_archived_transactions`).

### Zrobione

- Wyszukiwarka na pulpicie — `getMergedTransactions()` (`js/dashboard.js`).
- Kalendarz raportów — `getCalendarTransactions()` (`js/reports-calendar.js`, `js/reports-core.js`).
- Badge **arch.**, wiersze tylko do odczytu (`js/state-limits.js`).
- Testy jednostkowe: `tests/state-limits.test.js`.

### Odłożone (niski priorytet)

- Smoke/E2E przy >3500 transakcjach.
- Sync archiwum do Firestore — osobna decyzja (dziś archiwum **tylko lokalne**).

---

## Firestore Auth + reguły bezpieczeństwa (audyt pkt 5)

**Status:** kod ✅ · reguły ✅ · **weryfikacja migracji + testy manualne — jutro**

Jedno konto (`dawidrekal@gmail.com`), hybryda logowania (iOS/localhost: hasło, PC produkcja: Google), ścieżki `users/{uid}/state/main`, `meta/cloud_backup`, `snapshots/`.

### Zrobione

| Element | Pliki |
|---------|--------|
| UI logowania + reset hasła | `index.html`, `js/auth.js`, `styles.css` |
| Zapis pod `users/{uid}/…` | `js/firebase.js`, `js/state.js` |
| Migracja z `finances/my_state` | `js/firebase.js` |
| REST bez tokenu usunięty | `js/firebase.js` |
| Reguły w repo = konsola | `firestore.rules` |
| Skrypty admina z Auth | `scripts/firebase-auth.mjs`, `restore-cloud-backup.mjs`, `upload-to-firestore.mjs`, `purge-ghost-loan.mjs`, `import.html`, `import-moneypro.py` |
| Sync po auth, storage per uid | `js/bootstrap.js`, `js/sync-queue.js`, `js/constants.js` |
| Sekcja Konto | `js/settings.js` |

### Uwagi

- Lokalne dane (`localStorage`, eksport JSON) niezależne od chmury.
- Archiwum transakcji nie syncuje się do Firestore.
- Skrypty Node/Python: `$env:FIREBASE_AUTH_PASSWORD` przed uruchomieniem.
