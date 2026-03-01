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
| 2 | [Entity] Transaksi IN | SUM of "Transaksi in" from supabase_transkasi[Entity] |
| 3 | [Entity] Transaksi OUT | SUM of "transaksi out" from supabase_transkasi[Entity] |
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
- Transaksi IN = boxes received at Warehouse Pusat (from core.receive_item, Jan 2026+)
- Transaksi OUT = boxes shipped from Warehouse Pusat (from core.outbound_whs_attributed, Jan 2026+)
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
| DDD Transaksi OUT | `core.outbound_whs_attributed` WHERE `attributed_entity='DDD'` | Automated from Accurate API |
| LJBB Transaksi OUT | `core.outbound_whs_attributed` WHERE `attributed_entity='LJBB'` | Via `ljbb_dnpb_list` + baby filter |
| MBB Transaksi OUT | `core.outbound_whs_attributed` WHERE `attributed_entity='MBB'` | Automated from Accurate API |
| DDD Transaksi IN | `core.receive_item` WHERE `entity='DDD'` | Automated from Accurate API |
| LJBB Transaksi IN | Always 0 | LJBB has no physical warehouse receiving |
| MBB Transaksi IN | `core.receive_item` WHERE `entity='MBB'` | Automated from Accurate API |
| ro_ongoing_* | `ro_process` (where `dnpb_match = FALSE`) | Unchanged |
| Date filter | `trans_date >= '2026-01-01'` | All transaksi CTEs filter to Jan 2026+ (post stock awal) |
---

## 3. DNPB Matching Logic

DNPB = Delivery Note Pengiriman Barang

### Flow

1. User submits RO → `ro_process` row created with `dnpb_match = FALSE`
2. RO goes through status flow (QUEUE → APPROVED → ... → IN_DELIVERY)
3. At delivery stage, user inputs DNPB number (e.g., `DNPB/DDD/WHS/2026/I/001`)
4. System checks if DNPB exists in Accurate API transfer data:
   - `core.item_transfer` (transfer_number field)
   - Previously checked GSheet tables (supabase_transkasi*) — now automated
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
*Latest change: master_mutasi_whs automated (Accurate API replaces GSheet transaksi)*

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

**Solution**: Manual DNPB list + baby article filter.

1. **Manual list**: `branch_super_app_clawdbot.ljbb_dnpb_list` table stores transfer_numbers
   that belong to LJBB (added by human review of GSheet/Accurate data)
2. **Baby filter**: From those DNPBs, only articles with Z2 (Baby) or J1 (Junior) prefix
   are attributed to LJBB. Adult items (L1, M1, etc.) stay with source entity.

```sql
-- Attribution logic in core.outbound_whs_attributed:
CASE
  WHEN ljbb.transfer_number IS NOT NULL AND km.kode ~ '^(Z2|J1)' THEN 'LJBB'
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

**Why not auto-detect?** User rejected pure-baby auto-detection rule because:
- Some DNPBs are mixed (baby + adult items) — auto-detect would miss or over-attribute
- Manual review gives human control over attribution decisions
- The `ljbb_dnpb_list` approach prevents double-counting by exclusive ownership

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
| `attributed_entity` | Final: LJBB if DNPB in list AND baby article, else source_entity |
| `to_warehouse` | Destination warehouse/store |

### Verification Results (2026-03-02)
- **DDD outbound**: 6,849 boxes (Jan-Feb 2026, all outbound from Warehouse Pusat)
- **MBB outbound**: 1,837 boxes (Jan-Feb 2026)
- **LJBB outbound**: 177 boxes from 26 DNPBs (21 DDD-origin + 5 MBB-origin)
- **Date filter**: `trans_date >= '2026-01-01'` applied in master_mutasi_whs (post stock-awal)
- Zero duplication: each DNPB attributed to exactly one entity
- Baby filter prevents adult items in mixed DNPBs from being counted as LJBB

### Pipeline Status
- [x] item_transfer ETL (deployed, cron active at 04:50 WIB)
- [x] receive_item ETL (deployed, cron active at 05:10 WIB)
- [x] Historical backfill complete (DDD: 2326 rows, MBB: 8777 rows, LJBB: 3 rows)
- [x] LJBB entity attribution view (`core.outbound_whs_attributed`) with ljbb_dnpb_list
- [x] `master_mutasi_whs` replaced with automated data (March 2, 2026)
- [x] Date filter `>= 2026-01-01` applied to all transaksi CTEs
---

## 9. RO Process Flow (Current)

### Entry Point
Area Supervisor (AS) creates RO via app GUI:
1. Select store → add articles one-by-one (or click AUTO to load from `ro_recommendations`)
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
- Whether to keep `ro_recommendations` table or replace with Iris output
- Stock validation at import time vs at approval time
