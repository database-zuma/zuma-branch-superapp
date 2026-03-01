# Database Logic & Table Mechanisms

> **AI Agent Reference:** For complete app navigation, see [`AI_REFERENCE.md`](./AI_REFERENCE.md)  
> **Related:** [`APP_LOGIC.md`](./APP_LOGIC.md) - Application flowcharts | [`DNPB_MATCHING_LOGIC.md`](./DNPB_MATCHING_LOGIC.md) - DNPB validation

## Schema: `branch_super_app_clawdbot`

---

## 1. ro_process Table

Stores all RO (Replenishment Order) allocations.

### Columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | UUID | auto | Primary key |
| ro_id | VARCHAR(50) | - | Auto-generated: RO-YYMM-XXXX |
| article_code | VARCHAR(50) | - | Product code |
| article_name | VARCHAR(255) | - | Product name |
| boxes_requested | INTEGER | 0 | Total boxes requested |
| boxes_allocated_ddd | INTEGER | 0 | Boxes from DDD warehouse |
| boxes_allocated_ljbb | INTEGER | 0 | Boxes from LJBB warehouse |
| boxes_allocated_mbb | INTEGER | 0 | Boxes from MBB warehouse (internal use) |
| boxes_allocated_ubb | INTEGER | 0 | Boxes from UBB warehouse (internal use) |
| status | VARCHAR(50) | 'QUEUE' | Current RO status |
| store_name | VARCHAR(255) | - | Destination store |
| notes | TEXT | - | Optional notes |
| dnpb_number | VARCHAR(100) | NULL | Delivery Note number (e.g., DNPB/DDD/WHS/2026/I/001) |
| dnpb_match | BOOLEAN | FALSE | TRUE if DNPB exists in transaction tables |
| created_at | TIMESTAMP | now() | Creation time |
| updated_at | TIMESTAMP | now() | Last update time |

### Business Rules

1. **Frontend Only Allows DDD & LJBB:**
   - Users can only request boxes from DDD and LJBB warehouses
   - MBB and UBB are NOT for retail - internal warehouse use only
   - MBB/UBB columns exist for warehouse staff to manually adjust if needed

2. **RO ID Format:** `RO-YYMM-XXXX`
   - YY = 2-digit year
   - MM = 2-digit month
   - XXXX = sequential number (resets each month)
   - Example: RO-2601-0001

3. **Status Flow:**
   ```
   QUEUE → APPROVED → PICKING → PICK_VERIFIED → DNPB_PROCESS → READY_TO_SHIP → IN_DELIVERY → ARRIVED → COMPLETED
     │
     └─► CANCELLED (from any status except COMPLETED)
   ```

4. **DNPB Matching:**
   - When `dnpb_number` is set, system checks transaction tables
   - If match found: `dnpb_match = TRUE`
   - If `dnpb_match = TRUE`: RO allocation excluded from stock calculation (already counted in transaksi)

---

## 2. master_mutasi_whs VIEW

Calculated VIEW that combines stock, transactions, and RO allocations.

### Column Order (per entity)

For each entity (DDD, LJBB, MBB, UBB), columns appear in this order:

| # | Column | Description |
|---|--------|-------------|
| 1 | Stock Awal [Entity] | Initial stock from supabase_stockawal[Entity] |
| 2 | [Entity] Transaksi IN | SUM of "Transaksi in" from supabase_transaksi[Entity] VIEW |
| 3 | [Entity] Transaksi OUT | SUM of "transaksi out" from supabase_transaksi[Entity] VIEW |
| 4 | ro_ongoing_[entity] | SUM of boxes_allocated_[entity] WHERE dnpb_match = FALSE |
| 5 | Stock Akhir [Entity] | S.AWAL + Transaksi IN - Transaksi OUT - ro_ongoing |

### Full Column List

```
Entitas
Kode Artikel
Nama Artikel
Tier
Stock Awal DDD
Stock Awal LJBB
Stock Awal MBB
Stock Awal UBB
DDD Transaksi IN
DDD Transaksi OUT
ro_ongoing_ddd          <-- NEW: RO allocations pending
LJBB Transaksi IN
LJBB Transaksi OUT
ro_ongoing_ljbb         <-- NEW: RO allocations pending
MBB Transaksi IN
MBB Transaksi OUT
ro_ongoing_mbb          <-- NEW: RO allocations pending
UBB Transaksi IN
UBB Transaksi OUT
ro_ongoing_ubb          <-- NEW: RO allocations pending
Stock Akhir DDD
Stock Akhir LJBB
Stock Akhir MBB
Stock Akhir UBB
Stock Awal Total
Transaksi IN Total
Transaksi OUT Total
ro_ongoing_total        <-- NEW: Total RO allocations pending
Stock Akhir Total
```

### Calculation Formula

```
Stock Akhir [Entity] = S.AWAL + Transaksi IN - Transaksi OUT - ro_ongoing_[entity]

Where:
- S.AWAL = Stock awal (Dec 31 2025 snapshot) from supabase_stockawal[Entity]
- Transaksi IN = boxes received at Warehouse Pusat (via supabase_transaksi[Entity] VIEW ← core.receive_item)
- Transaksi OUT = boxes shipped from Warehouse Pusat (via supabase_transaksi[Entity] VIEW ← core.outbound_whs_attributed)
- ro_ongoing_[entity] = SUM from ro_process.boxes_allocated_[entity]
                        WHERE dnpb_match = FALSE
```

### ro_ongoing Logic

```sql
ro_totals AS (
    SELECT article_code,
        sum(CASE WHEN dnpb_match = FALSE THEN boxes_allocated_ddd ELSE 0 END) AS ro_ongoing_ddd,
        sum(CASE WHEN dnpb_match = FALSE THEN boxes_allocated_ljbb ELSE 0 END) AS ro_ongoing_ljbb,
        sum(CASE WHEN dnpb_match = FALSE THEN boxes_allocated_mbb ELSE 0 END) AS ro_ongoing_mbb,
        sum(CASE WHEN dnpb_match = FALSE THEN boxes_allocated_ubb ELSE 0 END) AS ro_ongoing_ubb
    FROM ro_process
    GROUP BY article_code
)
```

**Key Points:**
- Only counts allocations where `dnpb_match = FALSE`
- When `dnpb_match = TRUE`, the stock movement is already in transaksi tables
- This prevents double-counting

### Entity-Specific Rows

Each row in the VIEW represents ONE entity:
- Row with Entitas='DDD' → only shows DDD stock/transactions
- Row with Entitas='LJBB' → only shows LJBB stock/transactions
- Row with Entitas='MBB' → only shows MBB stock/transactions

### Data Sources (Automated — March 2026)

| Data | Source | Notes |
|------|--------|-------|
| Stock Awal DDD | `supabase_stockawalDDD."S. AWAL"` | Manual GSheet snapshot, Dec 31 2025 |
| Stock Awal LJBB | `supabase_stockawalLJBB."S. AWAL"` | Manual GSheet snapshot, Dec 31 2025 |
| Stock Awal MBB | `supabase_stockawalMBB."S. AWAL"` | Manual GSheet snapshot, Dec 31 2025 |
| DDD Transaksi OUT | `supabase_transaksiDDD` VIEW → `core.outbound_whs_attributed` WHERE `attributed_entity='DDD'` | Automated from Accurate API |
| LJBB Transaksi OUT | `supabase_transaksiLJBB` VIEW → `core.outbound_whs_attributed` WHERE `attributed_entity='LJBB'` | Via `ljbb_dnpb_list` (DNPB-level, no baby filter) |
| MBB Transaksi OUT | `supabase_transaksiMBB` VIEW → `core.outbound_whs_attributed` WHERE `attributed_entity='MBB'` | Automated from Accurate API |
| DDD Transaksi IN | `supabase_transaksiDDD` VIEW → `core.receive_item` WHERE `entity='DDD'` | Automated from Accurate API |
| LJBB Transaksi IN | Always 0 | LJBB has no physical warehouse receiving |
| MBB Transaksi IN | `supabase_transaksiMBB` VIEW → `core.receive_item` WHERE `entity='MBB'` | Automated from Accurate API |
| ro_ongoing_* | `ro_process` (where `dnpb_match = FALSE`) | Unchanged |
| Date filter | `trans_date >= '2026-01-01'` | Applied inside supabase_transaksi* VIEWs (post stock awal) |
---

## 2b. supabase_transaksi[Entity] VIEWs (Intermediate Layer)

Human-readable VIEWs that replace the old GSheet transaksi tables. Same 4-column structure
as the original tables, but data comes from Accurate API via `core` schema views.

### Purpose
- **Human inspection**: Teams can query these VIEWs directly to see per-DNPB transactions
- **Transparency**: Intermediate layer between raw Accurate data and master_mutasi_whs
- **Backwards compatibility**: Same columns as old GSheet tables (`Artikel`, `Transaksi in`, `transaksi out`, `DNPB`)

### Column Structure (all 3 VIEWs)

| Column | Type | Description |
|--------|------|-------------|
| Artikel | varchar | Article code (e.g., L1CMV207) |
| Transaksi in | integer | Boxes received (0 for outbound rows) |
| transaksi out | integer | Boxes shipped (0 for incoming rows) |
| DNPB | varchar | Transfer number or receive number |

### Data Flow

```
Accurate API → raw.* → core.* → supabase_transaksi[Entity] (VIEW) → master_mutasi_whs (VIEW)
```

### Entity VIEWs

| VIEW | Outbound Source | Incoming Source |
|------|----------------|-----------------|
| `supabase_transaksiDDD` | `core.outbound_whs_attributed` WHERE `attributed_entity='DDD'` | `core.receive_item` WHERE `entity='DDD'` AND `warehouse_name='Warehouse Pusat'` |
| `supabase_transaksiLJBB` | `core.outbound_whs_attributed` WHERE `attributed_entity='LJBB'` | Always 0 (LJBB has no WHS receiving) |
| `supabase_transaksiMBB` | `core.outbound_whs_attributed` WHERE `attributed_entity='MBB'` | `core.receive_item` WHERE `entity='MBB'` AND `warehouse_name='Warehouse Pusat'` |

### Date Filter
All VIEWs include `trans_date >= '2026-01-01'` to only show transactions after the stock awal snapshot.

### Incoming Conversion (receive_item → boxes)
Incoming rows require pairs-to-boxes conversion:
- Join `item_code` → `portal.kodemix.kode_besar` (with version dedup)
- ppb = SUM(count_by_assortment) per article (default 12 if missing)
- boxes = ROUND(SUM(pairs) / ppb)

### Backup Tables (DELETED Mar 2026)
Old GSheet data has been deleted:
- `_backup_transaksiDDD` — DELETED (replaced by automated `supabase_transaksiDDD` VIEW)
- `_backup_transaksiLJBB` — DELETED (replaced by automated `supabase_transaksiLJBB` VIEW)
- `_backup_transaksiMBB` — DELETED (replaced by automated `supabase_transaksiMBB` VIEW)
- `_backup_transaksiUBB` — DELETED (archived then removed)

### Deleted Tables (Mar 2026)
- `ro_stockwhs` — DELETED (replaced by `ro_whs_readystock` VIEW which reads from `master_mutasi_whs`)
- `ro_recommendations` — DELETED (replaced by planogram-driven RO logic)

## 2c. ro_whs_readystock VIEW (WH Box Availability)

Aggregated VIEW that shows available box stock per article in WH Pusat, across all entities.
Reads from `master_mutasi_whs` Stock Akhir columns (which already subtract ro_ongoing).

### Column Structure

| Column | Type | Description |
|--------|------|-------------|
| `article_code` | varchar | Article code (from Kode Artikel) |
| `article_name` | varchar | Article name |
| `tier` | varchar | Product tier |
| `tipe` | varchar | Product type (Jepit/Fashion) |
| `gender` | varchar | Gender |
| `series` | varchar | Series |
| `ddd_available` | bigint | Available boxes in DDD entity |
| `ljbb_available` | bigint | Available boxes in LJBB entity |
| `mbb_available` | bigint | Available boxes in MBB entity |
| `ubb_available` | bigint | Available boxes in UBB entity |
| `total_available` | bigint | Total available boxes (DDD + LJBB + MBB + UBB) |
| `last_calculated` | timestamp | Timestamp of query (always now()) |

### Logic

```sql
SELECT
    m."Kode Artikel" AS article_code,
    MAX(m."Nama Artikel") AS article_name,
    MAX(m."Tier") AS tier,
    MAX(m.tipe) AS tipe, MAX(m.gender) AS gender, MAX(m.series) AS series,
    SUM(m."Stock Akhir DDD") AS ddd_available,
    SUM(m."Stock Akhir LJBB") AS ljbb_available,
    SUM(m."Stock Akhir MBB") AS mbb_available,
    SUM(m."Stock Akhir UBB") AS ubb_available,
    SUM(m."Stock Akhir Total") AS total_available,
    now() AS last_calculated
FROM master_mutasi_whs m
GROUP BY m."Kode Artikel"
```

### Usage
- **RO Box availability filter**: `WHERE ddd_available > 0` to check if WH has boxes for a given article
- **Dashboard stock overview**: Quick article-level stock check across all entities
- **RO Surplus skill**: Used as WH stock source instead of deleted `ro_stockwhs` table

### Key Notes
- Aggregates across DDD/LJBB/MBB rows (master_mutasi_whs has per-entity rows)
- Stock Akhir already subtracts `ro_ongoing` (in-flight RO not yet DNPB-matched)
- Negative values are possible (more outbound than stock awal for that entity)
- Auto-updates as source VIEWs/data changes (no manual refresh needed)

## 3. DNPB Matching Logic

DNPB = Delivery Note Pengiriman Barang

### Flow

1. User submits RO → `ro_process` row created with `dnpb_match = FALSE`
2. RO goes through status flow (QUEUE → APPROVED → ... → IN_DELIVERY)
3. At delivery stage, user inputs DNPB number (e.g., `DNPB/DDD/WHS/2026/I/001`)
4. System checks if DNPB exists in Accurate API transfer data:
   - `core.item_transfer` (transfer_number field) via `supabase_transaksi*` VIEWs
5. If match found → `dnpb_match = TRUE`
6. RO allocation excluded from `ro_ongoing_*` calculation

### Why This Matters

**Without DNPB matching (double-counting problem):**
```
Stock Akhir = Transaksi IN - Transaksi OUT - ro_ongoing

If same delivery is in BOTH transaksi AND ro_process:
→ Stock deducted TWICE (once in Transaksi OUT, once in ro_ongoing)
→ WRONG!
```

**With DNPB matching:**
```
When dnpb_match = TRUE:
→ ro_ongoing excludes this RO
→ Stock only deducted once (in Transaksi OUT)
→ CORRECT!
```

---

## 4. Frontend Behavior

### Request Form (User-Facing)

| Warehouse | User Can Request? | Reason |
|-----------|-------------------|--------|
| DDD | ✅ YES | Primary retail warehouse |
| LJBB | ✅ YES | Secondary retail warehouse |
| MBB | ❌ NO | Not for retail (internal) |
| UBB | ❌ NO | Not for retail (internal) |

### Per-Warehouse Quantity Controls

Users see +/- buttons for:
- DDD quantity (capped at ddd_available)
- LJBB quantity (capped at ljbb_available)

MBB and UBB are hidden from user interface but columns exist in database for warehouse staff.

---

## 5. Example Scenario

### Before RO
```
Article: B2TS01
DDD Transaksi IN: 73
DDD Transaksi OUT: 42
ro_ongoing_ddd: 0
Stock Akhir DDD: 73 - 42 - 0 = 31
```

### After RO Submit (2 boxes DDD, 1 box LJBB)
```
Article: B2TS01
DDD Transaksi IN: 73
DDD Transaksi OUT: 42
ro_ongoing_ddd: 2          <-- NEW RO allocation
Stock Akhir DDD: 73 - 42 - 2 = 29

LJBB Transaksi IN: 31
LJBB Transaksi OUT: 0
ro_ongoing_ljbb: 1         <-- NEW RO allocation
Stock Akhir LJBB: 31 - 0 - 1 = 30
```

### After DNPB Match (delivery recorded in transaksi)
```
Article: B2TS01
DDD Transaksi IN: 73
DDD Transaksi OUT: 44      <-- Increased by 2 (delivery recorded)
ro_ongoing_ddd: 0          <-- Excluded (dnpb_match = TRUE)
Stock Akhir DDD: 73 - 44 - 0 = 29   <-- Same result, no double-count
```

---

*Last Updated: 2026-03-02*
*Latest change: supabase_transaksi* intermediate VIEWs + master_mutasi_whs reads from VIEWs (not directly from core)*

---

## 8. Automated Transaksi Pipeline (Accurate API)

### Overview
The manual GSheet "Rekapan Box" transaksi tables are being replaced with automated
data from Accurate Online API. Two ETL scripts pull data daily:

| Script | API Endpoint | DB Tables | Captures |
|--------|-------------|-----------|----------|
| `pull_accurate_item_transfer.py` | `item-transfer/list.do` + `detail.do` | `raw.accurate_item_transfer_[entity]` | Inter-warehouse transfers (WH→Store, Store→WH) |
| `pull_accurate_receive_item.py` | `receive-item/list.do` + `detail.do` | `raw.accurate_receive_item_[entity]` | Incoming stock from suppliers (Penerimaan Barang) |

### Union Views
- `core.item_transfer` — UNION ALL of DDD, MBB, UBB, LJBB item_transfer tables
- `core.receive_item` — UNION ALL of DDD, MBB, LJBB receive_item tables
- `core.outbound_whs_attributed` — Article-level outbound with LJBB entity attribution (see below)

### Cron Schedule (VPS 76.13.194.120)
```
03:00 WIB — stock pull
04:50 WIB — cron_item_transfer_pull.sh (all entities, last 3 days)
05:00 WIB — sales pull
05:10 WIB — cron_receive_item_pull.sh (DDD/MBB/LJBB, last 3 days)
05:30 WIB — materialized view refresh
07:00 WIB — dashboard cache refresh
```

### Data Mapping (GSheet → Accurate)
- **Transaksi OUT** = `core.outbound_whs_attributed` (aggregated to article+DNPB level with entity attribution)
- **Transaksi IN** = `core.receive_item` WHERE `warehouse_name = 'Warehouse Pusat'`
- **Conversion**: pairs / 12 = boxes (verified: 838/839 articles have ppb=12 via kodemix assortment sum)
- **Join key**: `item_code = portal.kodemix.kode_besar` (direct match, no status filter)
- **Article code**: `portal.kodemix.kode` (article-level, stripped from size-level `kode_besar`)

### LJBB Entity Attribution (core.outbound_whs_attributed)

**Problem**: LJBB has no Accurate entity for item transfers. Baby/kids products are shipped
via DDD or MBB entity DNPBs. Without separation, the same transfer would double-count in both
DDD and LJBB stock calculations.

**Solution**: Manual DNPB list — pure DNPB-level attribution.

1. **Manual list**: `branch_super_app_clawdbot.ljbb_dnpb_list` table stores transfer_numbers
   that belong to LJBB (added by human review of GSheet/Accurate data)
2. **Attribution**: If a DNPB is in `ljbb_dnpb_list`, the **entire DNPB** is attributed to LJBB
   — all articles in that DNPB go to LJBB, regardless of article type (baby/adult/mixed).
   The source entity (DDD/MBB) is removed from accounting for that DNPB.

```sql
-- Attribution logic in core.outbound_whs_attributed:
CASE
  WHEN ljbb.transfer_number IS NOT NULL THEN 'LJBB'
  ELSE t.entity
END AS attributed_entity
```

**ljbb_dnpb_list table** (`branch_super_app_clawdbot`):
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| transfer_number | VARCHAR(100) UNIQUE | Accurate transfer_number (e.g., DNPB/DDD/WHS/T/2026/I/002) |
| source_entity | VARCHAR(10) | DDD or MBB |
| notes | TEXT | Why this DNPB was assigned to LJBB |
| added_at | TIMESTAMP | When added |
| added_by | VARCHAR(50) | Who added it |

**Important**: This is a MANUAL process. Someone must periodically review new DDD/MBB DNPBs
and tag which ones should be attributed to LJBB. The view then uses this list automatically.

**Why DNPB-level (not baby-article filter)?** User decision ("sesimple itu"):
- If DNPB is in `ljbb_dnpb_list`, entire DNPB goes to LJBB — no article-level filtering
- Prevents partial attribution confusion on mixed DNPBs
- Human already decides which DNPBs belong to LJBB when adding to the list

**View columns** (core.outbound_whs_attributed):
| Column | Description |
|--------|-------------|
| `trans_date` | Transfer date |
| `transfer_number` | DNPB number |
| `article_code` | Article-level code (from kodemix.kode) |
| `article_name` | Article description |
| `pairs` | Total pairs (sum across sizes) |
| `boxes` | Boxes = pairs / pairs_per_box (default 12) |
| `source_entity` | Original Accurate entity (DDD/MBB) |
| `attributed_entity` | Final: LJBB if DNPB in ljbb_dnpb_list, else source_entity |
| `to_warehouse` | Destination warehouse/store |

### Verification Results (2026-03-02)
- **DDD outbound**: 11,426 boxes total (6,849 matched to stockawal articles) — Jan 2026+
- **MBB outbound**: 1,743 boxes total (Jan 2026+)
- **LJBB outbound**: 275 boxes from 26 DNPBs (DNPB-level attribution, no baby filter)
- **DDD incoming**: 13,207 boxes (via receive_item, Jan 2026+)
- **MBB incoming**: 1,933 boxes (via receive_item, Jan 2026+)
- **Date filter**: `trans_date >= '2026-01-01'` applied inside supabase_transaksi* VIEWs
- Zero duplication: each DNPB attributed to exactly one entity

### Pipeline Status
- [x] item_transfer ETL (deployed, cron active at 04:50 WIB)
- [x] receive_item ETL (deployed, cron active at 05:10 WIB)
- [x] Historical backfill complete (DDD: 2326 rows, MBB: 8777 rows, LJBB: 3 rows)
- [x] LJBB entity attribution view (`core.outbound_whs_attributed`) with ljbb_dnpb_list
- [x] LJBB entity attribution view (`core.outbound_whs_attributed`) with ljbb_dnpb_list (DNPB-level, no baby filter)
- [x] Intermediate `supabase_transaksi[Entity]` VIEWs (human-readable layer, same columns as old GSheet tables)
- [x] `master_mutasi_whs` reads from supabase_transaksi* VIEWs (March 2, 2026)
---

## 9. RO Process Flow (Current)

### Entry Point
Area Supervisor (AS) creates RO via app GUI:
1. Select store → add articles one-by-one (AUTO load from `ro_recommendations` has been removed — table deleted)
2. Submit → POST `/api/ro/submit` → validates stock → generates RO ID → bulk INSERT into `ro_process`
3. All articles enter as status = QUEUE

### Status Lifecycle (11 statuses)
```
QUEUE → APPROVED → PICKING → PICK_VERIFIED → DNPB_PROCESS → READY_TO_SHIP
  → IN_DELIVERY → ARRIVED → COMPLETED
                     ↘ BANDING_SENT → ARRIVED/COMPLETED
Any status (except terminal) → CANCELLED
```

### Planned Change: Iris AI RO Request Import
**Status: DOCUMENTED — not yet implementing** (per user: "catet dulu aja")

New flow replaces manual GUI article entry:
1. **Iris AI** generates RO Request (articles + quantities per store)
2. **AS** reviews and adjusts in Google Sheet
3. **WH Supervisor** approves the adjusted request
4. **System** bulk-imports approved articles into `ro_process` as QUEUE with auto-generated `ro_id`
5. All downstream status tracking stays the same (QUEUE → ... → COMPLETED)

Key design decisions TBD:
- New API endpoint `/api/ro/import/iris` for bulk import
- GSheet → JSON parsing for import format
- `ro_recommendations` table deleted (Mar 2026) — Iris output replaces it
- Stock validation at import time vs at approval time
- SOPB Generator at DNPB_PROCESS status (box → SKU pairs conversion)
