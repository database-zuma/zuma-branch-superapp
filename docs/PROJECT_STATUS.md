# Project Status - Zuma RO PWA

**Last Updated:** 2026-03-02  
**Current Version:** v2.0.0  
**Live URL:** https://zuma-branch-superapp.vercel.app

---

## ✅ COMPLETED FEATURES

### Core Application
- [x] 4-tab navigation (Dashboard, RO Process, SOPB Generator, DNPB Error)
- [x] RO Dashboard with real-time stats + Upload RO button
- [x] ~~RO Request Form~~ (DELETED Mar 2026 — replaced by XLSX Upload)
- [x] RO XLSX Upload with entity allocation preview (DDD/LJBB/MBB/UBB)
- [x] RO Process with 11-status timeline (QUEUE → COMPLETED)
- [x] SOPB Generator (auto-shows DNPB_PROCESS ROs, per-entity XLSX download)
- [x] DNPB matching logic with per-entity validation (4 entities)
- [x] MBB/UBB DNPB support (read-only article display, DNPB input, validation gate)
- [x] Stock deduction on RO submit
- [x] Sales analytics dashboard (7 breakdown tables)
- [x] Settings page with system status

### Backend & Infrastructure
- [x] VPS PostgreSQL direct connection (migrated from Supabase Feb 2026)
- [x] NextAuth.js authentication (migrated from Supabase Auth)
- [x] 18+ API routes with auth protection
- [x] Vercel deployment with auto-builds
- [x] Toast notifications (sonner)
- [x] Confirmation dialogs for destructive actions
- [x] Unsaved changes warnings
- [x] exceljs for XLSX parsing and generation

### Security
- [x] Authentication via NextAuth.js (Email/Password)
- [x] Route protection via middleware
- [x] API authorization (401 for unauthenticated requests)
- [x] Session management with JWT
- [x] Logout functionality

### UX Improvements (Recent)
- [x] Clear All button in Request Form
- [x] Fixed +/- quantity buttons (type conversion bug)
- [x] Improved button visibility and responsiveness
- [x] **Relaxed stock validation** - Users can request even when DDD/LJBB shows 0 stock

### Editable Quantity Input (2026-02-02)
- [x] **RequestForm:** Added input fields where users can type integers directly
- [x] **RequestForm:** Added "Apply" button that appears when there are pending changes
- [x] **RequestForm:** Changes only save to state after clicking Apply (confirmation step)
- [x] **RequestForm:** Shows "Unsaved changes" indicator
- [x] **ROProcess:** Replaced static quantity spans with editable input fields for DDD/LJBB columns
- [x] **ROProcess:** Added `setArticleQty` function for direct integer value input
- [x] **ROProcess:** Disabled (-) button when quantity is 0
- [x] Maintained +/- buttons for quick increment/decrement on both components

### RO Process - CSV Download & Readonly Quantities (2026-02-04)
- [x] **ROProcess:** Added CSV download button in Article Breakdown
- [x] **ROProcess:** Quantity editing locked after READY_TO_SHIP status
  - Editable: QUEUE, APPROVED, PICKING, PICK_VERIFIED, DNPB_PROCESS
  - Readonly: READY_TO_SHIP, IN_DELIVERY, ARRIVED, COMPLETED
- [x] **ROProcess:** Save Changes button hidden when RO is not editable
- [x] CSV format: RO_ID, Store, Status, Created_Date, DNPB_DDD, DNPB_LJBB, DNPB_MBB, DNPB_UBB, Article_Code, Article_Name, Box, DDD, LJBB, MBB, UBB

### DNPB Error Tab (2026-02-05)
- [x] **New Tab:** Added "DNPB Error" tab to RO Page (4th tab)
- [x] **Copied from ro-arrive-app:** Full implementation mirrored from ro-arrive-app DNPB Error page
- [x] **⚠️ CRITICAL Dependency:** RO cannot move to COMPLETED without ro-arrive-app action
  - ro-arrive-app (SPG/B users) inputs fisik (physical) quantities
  - zuma-ro-pwa (AS/WH users) can only Banding (dispute) or Confirmed (accept)
  - No ro-arrive-app input = RO stays blocked at ARRIVED status
- [x] **API:** Created `/api/ro/dnpb-error` endpoint using `get_confirmed_ro_list()` function
- [x] **List View:** Shows confirmed ROs with discrepancy counts
  - DNPB number display (if available)
  - Store name
  - Item count badge
  - Discrepancy indicator (orange warning or green check)
- [x] **Detail Modal:** Full article breakdown when clicking an RO
  - Article code and name
  - SKU code
  - Pairs per box (Asst)
  - Shipped quantity
  - Physical received quantity
  - Discrepancy (selisih) with color-coded badges
  - Notes
- [x] **Database:** Created `get_confirmed_ro_list()` function in public schema
- [x] **Styling:** Zuma brand colors (#0D3B2E header, proper badge colors)
- [x] **Empty States:** 
  - Loading spinner
  - "No DNPB errors found" when all ROs match
  - "No discrepancy" message when individual RO has no issues

### Dual DNPB Support (2026-02-05)
- [x] **Database Migration:** Split single DNPB column into warehouse-specific columns
  - Renamed `dnpb_number` → `dnpb_number_ddd`
  - Added `dnpb_number_ljbb` column
  - Added `dnpb_match_ddd` and `dnpb_match_ljbb` boolean flags
  - Migrations: `014_rename_dnpb_add_ljbb.sql`, `015_add_dnpb_match_columns.sql`
- [x] **API Updates:** `/api/ro/dnpb` now accepts and validates dual DNPB numbers
  - Separate validation for DDD and LJBB DNPB numbers
  - Each number validated against its respective transaction table (`supabase_transaksiDDD`, `supabase_transaksiLJBB`)
  - Format validation: `DNPB/WAREHOUSE/WHS/YEAR/ROMAN/NUMBER`
- [x] **ROProcess Component:** Dynamic DNPB form based on warehouse allocation
  - Shows DDD DNPB input only if RO has DDD boxes
  - Shows LJBB DNPB input only if RO has LJBB boxes
  - Format hint displayed below each input
  - Separate match indicators for each warehouse
- [x] **DNPB Error Tab:** Updated to display both DNPB numbers
  - Color-coded display (blue for DDD, purple for LJBB)
  - Modal shows warehouse-specific DNPB info
  - Banding & Confirmed buttons for dispute resolution
- [x] **CSV Export:** Updated to include both DNPB columns
  - Columns: `DNPB_DDD` and `DNPB_LJBB`

### Banding & Confirmed Actions (2026-02-05)
- [x] **Banding Button:** Dispute discrepancy and send notice to ro-arrive-app
  - Creates entry in `ro_banding_notices` table
  - API endpoint: `/api/ro/banding`
- [x] **Confirmed Button:** Accept discrepancy and complete RO
  - Updates `ro_process` status to COMPLETED
  - Uses `fisik` quantities as final accepted quantities
  - API endpoint: `/api/ro/banding` (with action: 'confirm')

### Database Migration to VPS (2026-02-28)
- [x] Migrated from Supabase to VPS PostgreSQL (76.13.194.120)
- [x] Replaced Supabase Auth with NextAuth.js
- [x] Direct pg Pool connection via `lib/db.ts`
- [x] All API routes use SCHEMA constant for table references

### Automated Transaksi Pipeline (2026-03-01)
- [x] supabase_transaksi[Entity] VIEWs replace manual GSheet tables
- [x] Data sourced from Accurate API via core.* schema views
- [x] LJBB entity attribution via ljbb_dnpb_list (DNPB-level, no baby filter)
- [x] master_mutasi_whs VIEW reads from automated VIEWs

### Database Cleanup (2026-03-02)
- [x] Deleted 6 deprecated tables (_backup_transaksi*, ro_stockwhs, ro_recommendations)
- [x] Rewired ro_whs_readystock VIEW (uses master_mutasi_whs instead of deleted ro_stockwhs)
- [x] Created sopb_backdata VIEW for SOPB XLSX generation
- [x] ALTER TABLE ro_process: added 9 columns (sopb_*/dnpb_* for MBB/UBB)

### SOPB Generator (2026-03-02)
- [x] New tab: SOPB Generator (next to RO Process)
- [x] Auto-shows all ROs at DNPB_PROCESS status
- [x] Per-entity SOPB number input (DDD, LJBB, MBB, UBB)
- [x] Date picker for sopb_tanggal_diminta
- [x] XLSX download for Accurate import (per entity)
- [x] API: GET/PATCH /api/ro/sopb, POST /api/ro/sopb/download

### RO XLSX Upload (2026-03-02)
- [x] Upload RO Request XLSX via Dashboard tab
- [x] Parses Sheet 3 ("Daftar RO Box") for articles
- [x] Cross-references portal.kodemix (kode_mix → kode mapping)
- [x] Entity allocation: DDD → LJBB → MBB → UBB waterfall
- [x] Preview with entity breakdown before confirm
- [x] Bulk INSERT into ro_process on confirm
- [x] API: POST /api/ro/upload, POST /api/ro/upload/confirm

### MBB/UBB DNPB Support (2026-03-02)
- [x] Process API returns mbbBoxes, ubbBoxes, dnpbNumberMBB, dnpbNumberUBB
- [x] DNPB API GET returns MBB/UBB DNPB numbers
- [x] Article table shows MBB/UBB as read-only columns (no +/- editing)
- [x] Box total sums all 4 entities (DDD+LJBB+MBB+UBB)
- [x] CSV download includes MBB/UBB columns and DNPB numbers
- [x] DNPB input fields for MBB/UBB (shown when boxes > 0)
- [x] All entities must have DNPB# before advancing past DNPB_PROCESS

### WH Stock Page v2 - Real-Time Dashboard (2026-02-01)
- [x] **Tab renamed** from "SKU" to "WH Stock"
- [x] **Real-time warehouse dashboard** pulling from `master_mutasi_whs`
- [x] **Key Metrics Cards:**
  - Total Articles (unique SKU count)
  - Total Stock (boxes + pairs conversion)
  - Available Stock (after RO allocations)
  - RO Ongoing (boxes allocated)
- [x] **Stock by Warehouse** breakdown with progress bars (DDD, LJBB, MBB, UBB)
- [x] **Gender breakdown** section
- [x] **Low Stock Alerts** (items with <10 boxes)
- [x] Created `/api/dashboard` endpoint for aggregated warehouse data
- [x] Home page preserved with original dummy sales data (as intended)

### WH Stock Page v1 (2026-01-31)
- [x] **WH Stock Page** replaces empty SKU tab
- [x] Search by code, name, tipe, gender, or series
- [x] Warehouse filter (All, DDD, LJBB, MBB, UBB)
- [x] Article cards with metadata tags (tipe, gender, series)
- [x] Color-coded stock badges per warehouse
- [x] master_mutasi_whs VIEW updated with tipe, gender, series from public.portal_kodemix

### Stock Validation Update (2026-02-01)
- [x] **Removed strict stock validation** - Users can now submit ROs even when DDD/LJBB shows 0 stock
- [x] Updated `/api/ro/submit` - Removed server-side stock cap validation
- [x] Updated `RequestForm` - Removed quantity caps and disabled states based on stock
- [x] Stock display still shows available quantities for reference (informational only)
- Reason: Warehouse stock data may not always be accurate, allowing operational flexibility

---

## REMAINING TASKS

### High Priority
- [ ] **Role-Based Access Control**: Gate QUEUE→APPROVED transition by role (deferred — remind user)
- [ ] **Role-Based UI**: Show/hide tabs and actions based on user role

### Medium Priority
- [ ] **Push Notifications**: PWA push for RO status changes
- [ ] **Update build_ro_royal_plaza.py**: Script code to use `ro_whs_readystock` (skill docs updated, script not)

### Low Priority
- [ ] Accessibility improvements (aria-labels, focus indicators)
- [ ] Offline Sync (queue actions when offline)
---

## 📊 PROJECT STATISTICS

**Codebase:**
- Total commits: 25+
- Files created/modified: 40+
- Lines of code: ~15,000

**Database (VPS 76.13.194.120, schema: branch_super_app_clawdbot):**
- ro_process (RO tracking, 29 columns)
- ro_banding_notices (banding dispute tracking)
- ro_id_sequences (RO ID counter)
- ro_receipt (delivery receipts)
- ljbb_dnpb_list (LJBB entity attribution)
- supabase_stockawalDDD/LJBB/MBB (manual stock snapshots)
- users (NextAuth.js)

**VIEWs:**
- master_mutasi_whs (calculated warehouse stock)
- ro_whs_readystock (available stock per entity)
- sopb_backdata (SOPB XLSX generation data)
- supabase_transaksiDDD/LJBB/MBB (automated transaksi from Accurate)

**API Endpoints:**
- GET /api/articles
- GET /api/stores
- GET /api/dashboard
- POST /api/update-ro
- GET /api/ro/recommendations
- POST /api/ro/submit
- GET /api/ro/process
- GET /api/ro/dashboard
- PATCH /api/ro/status
- PATCH /api/ro/articles/batch
- GET/PATCH /api/ro/dnpb
- GET /api/ro/dnpb-error
- POST /api/ro/banding
- GET/PATCH /api/ro/sopb
- POST /api/ro/sopb/download
- POST /api/ro/upload
- POST /api/ro/upload/confirm

---

## 🔗 IMPORTANT LINKS

- **Live Application:** https://zuma-branch-superapp.vercel.app
- **Login Page:** https://zuma-branch-superapp.vercel.app/login
- **GitHub Repository:** https://github.com/database-zuma/zuma-branch-superapp

---

## 📚 DOCUMENTATION

> **AI Agents:** Start with [`AI_REFERENCE.md`](./AI_REFERENCE.md) for complete navigation

### Core Documentation
- [`AI_REFERENCE.md`](./AI_REFERENCE.md) - **AI Agent Hub** - Start here!
- [`APP_LOGIC.md`](./APP_LOGIC.md) - Complete flowcharts and application logic
- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) - This file - Feature status and roadmap
- [`DATABASE_LOGIC.md`](./DATABASE_LOGIC.md) - Table schemas and relationships
- [`DNPB_MATCHING_LOGIC.md`](./DNPB_MATCHING_LOGIC.md) - DNPB validation and matching

### Architecture & Planning
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - High-level system architecture
- [`RO_REQUEST_ARCHITECTURE.md`](./RO_REQUEST_ARCHITECTURE.md) - RO submission flow
- [`AUTH_IMPLEMENTATION_PLAN.md`](./AUTH_IMPLEMENTATION_PLAN.md) - Authentication design
- [`RO_WHS_READYSTOCK_VIEW.md`](./RO_WHS_READYSTOCK_VIEW.md) - Stock calculation view

### Operations & Debugging
- [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) - Common issues and fixes
- [`AUDIT_REPORT_2026-01-30.md`](./AUDIT_REPORT_2026-01-30.md) - Security audit results
- [`SUPABASE_AUTH_SETUP_GUIDE.md`](./SUPABASE_AUTH_SETUP_GUIDE.md) - Auth setup instructions

### Progress & Session Logs
- [`opencode_kimi_k25.md`](../opencode_kimi_k25.md) - Session-by-session progress log
- [`README.md`](../README.md) - Project overview (user-facing)

---

## IMMEDIATE NEXT STEPS

1. **Role-Based Access Control** (deferred — user requested reminder)
   - Gate QUEUE→APPROVED transition by role
   - Show/hide tabs and actions based on user role
   - Roles: AS, WH SPV, WH Admin, WH Helper

2. **Update build_ro_royal_plaza.py**: Script code to use `ro_whs_readystock`

3. **Push Notifications**: PWA push for RO status changes

---

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@zuma.co.id | zuma2026 |
| WH Supervisor | whs@zuma.co.id | zuma2026 |
| Area Supervisor | as@zuma.co.id | zuma2026 |

---

**Status:** Production  
**Last Deployment:** 2026-03-02 (v2.0.0 - XLSX Upload + SOPB Generator + MBB/UBB DNPB Support)  
**Health:** All systems operational
