#!/usr/bin/env python3
"""
pull_accurate_receive_item.py — Pull goods receipts (Penerimaan Barang) from Accurate Online API.

Captures incoming stock to warehouses from suppliers/production:
  - Supplier → Warehouse Pusat (purchase receiving)
  - Production → Warehouse Pusat (finished goods)

This is the INCOMING counterpart to pull_accurate_item_transfer.py (which captures
inter-warehouse OUTBOUND movements). Together they replace the manual GSheet
"Rekapan Box" transaksi tables.

API endpoints:
  - /accurate/api/receive-item/list.do  (paginated list with date filter)
  - /accurate/api/receive-item/detail.do (line items with item_code, qty, warehouse)

Deployed to VPS: /opt/openclaw/scripts/pull_accurate_receive_item.py
Cron: daily 05:10 WIB via cron_receive_item_pull.sh

DB tables:
  - raw.accurate_receive_item_ddd
  - raw.accurate_receive_item_mbb
  - raw.accurate_receive_item_ljbb
  - core.receive_item (union view)

Usage:
    python pull_accurate_receive_item.py ddd              # DDD only, last 7 days
    python pull_accurate_receive_item.py mbb              # MBB only, last 7 days
    python pull_accurate_receive_item.py ljbb             # LJBB only, last 7 days
    python pull_accurate_receive_item.py all              # All entities
    python pull_accurate_receive_item.py all --days 30    # Historical
    python pull_accurate_receive_item.py ddd --dry-run    # Preview only
"""

import os, sys, time, hashlib, hmac, requests, json, argparse, psycopg2
from psycopg2.extras import execute_values
from datetime import datetime, timedelta, date
from pathlib import Path
from dotenv import load_dotenv
from requests.exceptions import ConnectionError, Timeout, RequestException

SCRIPT_DIR = Path(__file__).parent
MAX_RETRIES = 3
STATUS_FILE = "/opt/openclaw/logs/receive_item_latest_status.json"

DB_CONFIG = {
    "host": "76.13.194.120",
    "port": 5432,
    "dbname": "openclaw_ops",
    "user": "openclaw_app",
    "password": "Zuma-0psCl4w-2026!",
}

# Entity configuration — mirrors pull_accurate_item_transfer.py
# UBB excluded from scope per business requirement
ENTITIES = {
    "ddd": {
        "name": "DDD",
        "env_file": ".env.ddd",
        "pg_table": "raw.accurate_receive_item_ddd",
        "api_host": "https://zeus.accurate.id",
    },
    "mbb": {
        "name": "MBB",
        "env_file": ".env.mbb",
        "pg_table": "raw.accurate_receive_item_mbb",
        "api_host": "https://iris.accurate.id",
    },
    "ljbb": {
        "name": "LJBB",
        "env_file": ".env.ljbb",
        "pg_table": "raw.accurate_receive_item_ljbb",
        "api_host": "https://iris.accurate.id",
    },
}


class AccurateClient:
    """Accurate Online API client with HMAC-SHA256 auth."""

    def __init__(self, token, secret, host):
        self.token = token
        self.secret = secret
        self.host = host.rstrip("/")
        self.session = requests.Session()

    def _headers(self):
        ts = str(int(time.time()))
        sig = hmac.new(self.secret.encode(), ts.encode(), hashlib.sha256).hexdigest()
        return {
            "Authorization": f"Bearer {self.token}",
            "X-Api-Timestamp": ts,
            "X-Api-Signature": sig,
            "Accept": "application/json",
        }

    def _get(self, endpoint, params=None, retries=MAX_RETRIES):
        for attempt in range(retries):
            try:
                r = self.session.get(
                    f"{self.host}{endpoint}",
                    headers=self._headers(),
                    params=params,
                    timeout=30,
                )
                r.raise_for_status()
                data = r.json()
                if data.get("s") is not False:
                    return data
                err = data.get("d", "")
                print(f"  [API] Error: {err}")
                return data
            except (ConnectionError, Timeout, RequestException) as e:
                if attempt < retries - 1:
                    wait = 2**attempt
                    print(f"  [API] Retry {attempt + 1}/{retries} after {wait}s: {e}")
                    time.sleep(wait)
                else:
                    raise
        return {}

    def list_receive_items(self, page=1, page_size=50):
        """List receive-item documents (Penerimaan Barang), newest first."""
        return self._get(
            "/accurate/api/receive-item/list.do",
            {
                "sp.page": page,
                "sp.pageSize": page_size,
                "sp.sort": "transDate|desc",
                "fields": "id,number,transDate",
            },
        )

    def get_receive_item_detail(self, record_id):
        """Get full detail including line items for a single receive-item."""
        return self._get("/accurate/api/receive-item/detail.do", {"id": record_id})


def parse_date(date_str):
    """Parse DD/MM/YYYY to date object."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, "%d/%m/%Y").date()
    except Exception:
        return None


def create_table_if_not_exists(conn, table_name):
    """Create receive_item table for the given entity (if not exists)."""
    bare = table_name.replace("raw.", "")
    cur = conn.cursor()
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id                SERIAL PRIMARY KEY,
            trans_date        DATE,
            receive_number    TEXT NOT NULL,
            vendor_name       TEXT,
            warehouse_name    TEXT,
            status_name       TEXT,
            item_code         TEXT NOT NULL,
            item_name         TEXT,
            quantity          NUMERIC(12,2),
            unit_name         TEXT,
            po_number         TEXT,
            snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
            loaded_at         TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (receive_number, item_code)
        )
    """)
    cur.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{bare}_trans_date ON {table_name}(trans_date)"
    )
    cur.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{bare}_warehouse ON {table_name}(warehouse_name)"
    )
    cur.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{bare}_item_code ON {table_name}(item_code)"
    )
    conn.commit()
    cur.close()
    print(f"[receive-item] Table {table_name} ready")


def load_entity_credentials(entity_key, entity):
    """Load API credentials from entity-specific .env file."""
    env_file_path = SCRIPT_DIR / entity["env_file"]
    if env_file_path.exists():
        load_dotenv(env_file_path, override=True)

    api_token = os.getenv("ACCURATE_API_TOKEN")
    signature_secret = os.getenv("ACCURATE_SIGNATURE_SECRET")

    if not api_token or not signature_secret:
        raise ValueError(
            f"Missing credentials for {entity['name']}. "
            f"Provide {entity['env_file']} in {SCRIPT_DIR}"
        )

    return api_token, signature_secret


def pull_entity(entity_key, days=7, dry_run=False):
    """Pull and load receive-items for a single entity."""
    entity = ENTITIES.get(entity_key)
    if not entity:
        print(f"ERROR: Unknown entity: {entity_key}")
        return 0

    table = entity["pg_table"]
    print(f"\n{'=' * 60}")
    print(f"  {entity['name']} RECEIVE ITEM PULL")
    print(f"{'=' * 60}")

    try:
        token, secret = load_entity_credentials(entity_key, entity)
    except ValueError as e:
        print(f"ERROR: {e}")
        return 0

    cutoff_date = date.today() - timedelta(days=days)
    print(f"[{entity['name']}] Pulling receive-items since {cutoff_date} ({days} days)")
    print(f"[{entity['name']}] Target table: {table}")

    client = AccurateClient(token, secret, entity["api_host"])
    conn = psycopg2.connect(**DB_CONFIG)
    create_table_if_not_exists(conn, table)

    rows_collected = []
    page = 1
    stop = False

    while not stop:
        resp = client.list_receive_items(page=page, page_size=50)
        records = resp.get("d", [])
        if not records:
            break

        print(f"  Page {page}: {len(records)} receive-items")

        for rec in records:
            rid = rec.get("id")
            if not rid:
                continue

            list_date = parse_date(rec.get("transDate"))
            if list_date and list_date < cutoff_date:
                stop = True
                break

            det_resp = client.get_receive_item_detail(rid)
            det = det_resp.get("d", {})

            trans_date = parse_date(det.get("transDate"))
            if trans_date and trans_date < cutoff_date:
                stop = True
                break

            receive_number = det.get("number", f"ID_{rid}")
            status = det.get("statusName") or ""
            vendor_obj = det.get("vendor") or {}
            vendor_name = (
                vendor_obj.get("name", "") if isinstance(vendor_obj, dict) else ""
            )
            detail_items = det.get("detailItem", [])

            for it in detail_items:
                item_obj = it.get("item", {})
                item_code = item_obj.get("no", "")
                item_name = it.get("detailName", "")
                qty = it.get("quantity", 0)
                wh_obj = it.get("warehouse", {})
                warehouse_name = (
                    wh_obj.get("name", "") if isinstance(wh_obj, dict) else ""
                )
                unit_obj = it.get("itemUnit", {})
                unit_name = (
                    unit_obj.get("name", "") if isinstance(unit_obj, dict) else ""
                )
                po_obj = it.get("purchaseOrder", {})
                po_number = po_obj.get("number", "") if isinstance(po_obj, dict) else ""

                if not item_code:
                    continue

                rows_collected.append(
                    (
                        trans_date,
                        receive_number,
                        vendor_name or None,
                        warehouse_name or None,
                        status,
                        item_code,
                        item_name,
                        qty,
                        unit_name or None,
                        po_number or None,
                        date.today(),
                    )
                )

        page += 1
        time.sleep(0.3)

    n_receipts = len(set(r[1] for r in rows_collected))
    print(
        f"[{entity['name']}] Collected {len(rows_collected)} rows from {n_receipts} receipts"
    )

    if dry_run:
        print(f"[{entity['name']}] DRY RUN — not inserting")
        for r in rows_collected[:5]:
            print(
                f"  {r[0]} | {r[1]} | vendor={r[2]} | wh={r[3]} | {r[5]} | qty={r[7]} {r[8]} | po={r[9]}"
            )
        conn.close()
        return len(rows_collected)

    if not rows_collected:
        print(f"[{entity['name']}] No data collected")
        conn.close()
        return 0

    cur = conn.cursor()
    upsert_sql = f"""
        INSERT INTO {table}
            (trans_date, receive_number, vendor_name, warehouse_name,
             status_name, item_code, item_name, quantity, unit_name,
             po_number, snapshot_date)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (receive_number, item_code)
        DO UPDATE SET
            trans_date     = EXCLUDED.trans_date,
            vendor_name    = EXCLUDED.vendor_name,
            warehouse_name = EXCLUDED.warehouse_name,
            status_name    = EXCLUDED.status_name,
            item_name      = EXCLUDED.item_name,
            quantity       = EXCLUDED.quantity,
            unit_name      = EXCLUDED.unit_name,
            po_number      = EXCLUDED.po_number,
            snapshot_date  = EXCLUDED.snapshot_date,
            loaded_at      = NOW()
    """
    dedup = {}
    for row in rows_collected:
        key = (row[1], row[5])
        dedup[key] = row
    rows_deduped = list(dedup.values())
    removed = len(rows_collected) - len(rows_deduped)
    if removed:
        print(f"[{entity['name']}] Deduped: removed {removed} duplicate rows")

    for row in rows_deduped:
        cur.execute(upsert_sql, row)
    conn.commit()
    cur.close()
    conn.close()

    print(
        f"[{entity['name']}] Upserted {len(rows_deduped)} rows ({n_receipts} receipts) -> {table}"
    )
    return len(rows_deduped)


def write_status(results, status, error=None):
    data = {
        "results": results,
        "status": status,
        "calculated_at": datetime.now().isoformat(),
    }
    if error:
        data["error"] = error
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        with open(STATUS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"WARNING: could not write status file: {e}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="Pull receive-items (goods receipts) from Accurate Online API -> PostgreSQL"
    )
    ap.add_argument(
        "entity",
        choices=["ddd", "mbb", "ljbb", "all"],
        help="Entity to pull (ddd/mbb/ljbb/all). UBB excluded from scope.",
    )
    ap.add_argument("--days", type=int, default=7, help="Days to pull (default: 7)")
    ap.add_argument("--dry-run", action="store_true", help="Preview only, no DB insert")
    args = ap.parse_args()

    entities = ["ddd", "mbb", "ljbb"] if args.entity == "all" else [args.entity]

    results = {}
    overall_status = "success"

    try:
        for ent in entities:
            try:
                rows = pull_entity(ent, days=args.days, dry_run=args.dry_run)
                results[ent] = {"rows": rows, "status": "success"}
            except Exception as e:
                print(f"ERROR [{ent}]: {e}", file=sys.stderr)
                results[ent] = {"rows": 0, "status": "error", "error": str(e)}
                overall_status = "partial_error"

        print(f"\n{'=' * 60}")
        print("RECEIVE ITEM PULL — SUMMARY")
        print(f"{'=' * 60}")
        for ent, res in results.items():
            entity_name = ENTITIES[ent]["name"]
            print(f"  {entity_name}: {res['status']} ({res['rows']} rows)")

        write_status(results, overall_status)

        if overall_status != "success":
            sys.exit(1)

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        write_status({}, "error", str(e))
        sys.exit(1)
