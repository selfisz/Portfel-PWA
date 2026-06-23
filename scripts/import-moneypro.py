#!/usr/bin/env python3
"""Import transakcji z backupu Money Pro (.back) do Firestore Portfel-PWA."""

import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request

BACKUP_PATH = Path("/Users/dawid/Downloads/Osobista_20260623224223.back")
OUTPUT_JSON = Path(__file__).resolve().parent / "import-result.json"

FIREBASE_CONFIG = {
    "apiKey": "AIzaSyAfvk2_lfsaf5QZkH_MVk-kWbG8GFvjSeI",
    "projectId": "portfel-pwa",
}

DEFAULT_APP_STATE = {
    "currentType": "expense",
    "selectedMainCategory": "",
    "selectedSubCategory": "",
    "loan": {
        "totalAmount": 500000.0,
        "currentCapitalLeft": 412500.0,
        "interestRate": 6.75,
    },
    "investments": [
        {
            "ticker": "VWCE.DE",
            "name": "Vanguard FTSE All-World",
            "quantity": 45,
            "purchasePrice": 104.20,
            "currentPriceManual": 118.50,
            "currency": "EUR",
        }
    ],
}

CATEGORY_OVERRIDES = {
    ("", "Jedzenie na dowóz"): ("Jedzenie na mieście", "Dowóz"),
    ("", "Ubrania"): ("Osobista", "Ubrania"),
    ("", "Transport"): ("Transport", "[Bez podkategorii]"),
    ("", "Prezenty"): ("Prezenty", "[Bez podkategorii]"),
    ("Długi", "Kredyt na mieszkanie"): ("Długi", "Kredyt Pekao SA"),
    ("Subskrypcję", "Netflix"): ("Subskrypcje", "Seriale"),
    ("", "Oszczędzam"): ("Różne", "Różne"),
    ("", "Ubezpieczenie"): ("Rachunki/opłaty", "Ubezpieczenia"),
    ("Różne", "Nieistotne"): ("Różne", "Różne"),
    ("Długi", "Pożyczka"): ("Długi", "Raty"),
    ("Edukacja", "Aplikacja"): ("Edukacja", "Edukacja"),
    ("Dom", "Konserwacja i naprawy"): ("Dom", "Konserwacja"),
    ("Inne", "Nagroda"): ("Wynagrodzenie", "Nagroda"),
    ("Rachunki", "Woda/ścieki"): ("Rachunki/opłaty", "Woda/ogrzewanie"),
    ("Samochód", "Parkowanie i opłaty"): ("Samochód", "Opłaty"),
    ("", "Catering/Pudełka"): ("Jedzenie na mieście", "Catering/Pudełka"),
    ("", "Podatki"): ("Rachunki/opłaty", "Podatki"),
}


def map_category(parent: str, child: str) -> tuple[str, str]:
    parent = parent or ""
    override = CATEGORY_OVERRIDES.get((parent, child))
    if override:
        return override

    if parent == "Rachunki":
        return ("Rachunki/opłaty", child)
    if parent == "Subskrypcję":
        return ("Subskrypcje", child)
    if not parent:
        if child == "Inne":
            return ("Inne", "[Bez podkategorii]")
        return (child, "[Bez podkategorii]")
    return (parent, child)


def extract_sqlite(backup_path: Path) -> bytes:
    data = backup_path.read_bytes()
    start = data.find(b"SQLite format 3")
    if start < 0:
        raise ValueError("Nie znaleziono bazy SQLite w pliku backupu.")
    sqlite_data = data[start:]
    match = re.search(rb"database\.sql\n(\d+)\n", data)
    if match:
        sqlite_data = sqlite_data[: int(match.group(1))]
    return sqlite_data


def load_transactions(conn: sqlite3.Connection) -> list[dict]:
    query = """
        SELECT
            t.date,
            t.description,
            st.sum,
            c.flowType,
            COALESCE(p.name, '') AS parent_name,
            c.name AS child_name
        FROM transactions t
        JOIN splitTransaction st ON st.transactionsPrimaryKey = t.primaryKey
        JOIN category c ON st.categoryPrimaryKey = c.primaryKey
        LEFT JOIN category p ON c.parentPrimaryKey = p.primaryKey
        WHERE t.isDeleted = 0
        ORDER BY t.date DESC
    """
    rows = conn.execute(query).fetchall()
    transactions = []

    for date_ts, description, amount, flow_type, parent_name, child_name in rows:
        tx_type = "income" if flow_type == 1 else "expense"
        main_category, sub_category = map_category(parent_name, child_name)

        value = abs(float(amount or 0))
        if value == 0:
            continue

        note = (description or "").strip().replace("\n", " ")
        transactions.append(
            {
                "amount": round(value, 2),
                "type": tx_type,
                "mainCategory": main_category,
                "subCategory": sub_category,
                "date": datetime.fromtimestamp(date_ts, tz=timezone.utc).strftime("%Y-%m-%d"),
                "note": note,
            }
        )

    transactions.sort(key=lambda tx: tx["date"], reverse=True)
    return transactions


def to_firestore_value(value):
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [to_firestore_value(item) for item in value]}}
    if isinstance(value, dict):
        return {
            "mapValue": {
                "fields": {key: to_firestore_value(val) for key, val in value.items()}
            }
        }
    raise TypeError(f"Nieobsługiwany typ: {type(value)}")


def upload_to_firestore(app_state: dict) -> None:
    url = (
        f"https://firestore.googleapis.com/v1/projects/{FIREBASE_CONFIG['projectId']}"
        f"/databases/(default)/documents/finances/my_state"
        f"?key={FIREBASE_CONFIG['apiKey']}"
    )
    payload = json.dumps({"fields": to_firestore_value(app_state)["mapValue"]["fields"]}).encode("utf-8")
    req = request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="PATCH",
    )
    try:
        with request.urlopen(req) as response:
            response.read()
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Firestore HTTP {exc.code}: {body}") from exc


def main() -> int:
    if not BACKUP_PATH.exists():
        print(f"Brak pliku backupu: {BACKUP_PATH}", file=sys.stderr)
        return 1

    sqlite_data = extract_sqlite(BACKUP_PATH)
    db_path = Path("/tmp/moneypro_import.db")
    db_path.write_bytes(sqlite_data)

    conn = sqlite3.connect(db_path)
    try:
        transactions = load_transactions(conn)
    finally:
        conn.close()

    app_state = {
        **DEFAULT_APP_STATE,
        "transactions": transactions,
    }

    OUTPUT_JSON.write_text(json.dumps(app_state, ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        upload_to_firestore(app_state)
        firestore_msg = "Firestore: finances/my_state zaktualizowany."
    except RuntimeError as exc:
        firestore_msg = (
            "Firestore z terminala niedostępny — otwórz scripts/import.html w przeglądarce.\n"
            f"  ({exc})"
        )

    incomes = sum(1 for tx in transactions if tx["type"] == "income")
    expenses = sum(1 for tx in transactions if tx["type"] == "expense")
    print(f"Zaimportowano {len(transactions)} transakcji ({incomes} wpływów, {expenses} wydatków).")
    print(f"Zapisano podgląd: {OUTPUT_JSON}")
    print(firestore_msg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
