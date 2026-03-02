# Zuma Branch Super App

A mobile-first Progressive Web Application (PWA) for Zuma Indonesia retail store management — combining sales analytics, warehouse stock monitoring, RO (Replenishment Orders) processing, and SOPB document generation.

[![Deploy on Vercel](https://img.shields.io/badge/Vercel-Live-success?style=flat&logo=vercel)](https://zuma-branch-superapp.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-VPS-4169E1?style=flat&logo=postgresql)](https://www.postgresql.org/)

## Overview

Zuma Branch Super App is a comprehensive mobile-first PWA designed for Zuma Indonesia's Jatim branch retail operations. It provides iSeller sales analytics, warehouse stock dashboards, a full RO lifecycle (request → process → SOPB), and role-based access via NextAuth.js — all powered by a self-hosted VPS PostgreSQL database (`openclaw_ops`).

**Live URL:** [https://zuma-branch-superapp.vercel.app](https://zuma-branch-superapp.vercel.app)

**Repository:** [github.com/database-zuma/zuma-branch-superapp](https://github.com/database-zuma/zuma-branch-superapp)

## Features

### Navigation (5-Tab System)
| Tab | Purpose | Data Source |
|-----|---------|-------------|
| **Home** | iSeller SKU Charts — sales by gender, series, tier, tipe, size, color, top articles (Jatim branch only, last 60 days default) | `mart.mv_iseller_summary` |
| **WH Stock** | Warehouse stock dashboard — KPIs, warehouse×gender bar, tipe donut, tier bar, size bar, series bar, top articles table (Warehouse Pusat + Protol + Reject) | `core.dashboard_cache` |
| **Action** | Quick actions center (future) | — |
| **RO** | Replenishment Orders management (3 sub-tabs) | `branch_super_app_clawdbot.*` |
| **Settings** | System status and configuration | — |

### Home Page (iSeller Sales Analytics)
- **Source:** `mart.mv_iseller_summary` (iSeller POS data, Jatim branch hardcoded)
- **Default date range:** Last 60 days (avoids empty data when current month has no iSeller sync yet)
- **Charts:** Gender donut, Series horizontal bar, Tier bar, Tipe donut, Size bar, Color bar, Top Articles table
- **Filters:** Date range, gender, series, tier, tipe, size, color, search

### WH Stock Page (Warehouse Stock Dashboard)
- **Source:** `core.dashboard_cache` (Accurate stock snapshot, refreshed daily 07:00 WIB via cron)
- **Hardcoded warehouses:** `Warehouse Pusat`, `Warehouse Pusat Protol`, `Warehouse Pusat Reject`
- **Non-product exclusion:** `kode_besar !~ '^(gwp|hanger|paperbag|shopbag)'`
- **KPI cards:** Total Pairs, Unique Articles, Dead Stock (T4+T5), Est RSP Value
- **Charts:** Warehouse×Gender stacked bar, Tipe donut, Tier bar, Size bar, Series horizontal bar
- **Top Articles table:** Sortable by pairs/est_rsp, shows article/kode_besar/series/tier/tipe/gender
- **Filters:** Gender, series, color, tier, tipe, size, entitas, version, search (NO date filter — stock is a point-in-time snapshot)

### RO Page (3 Sub-tabs)

#### 1. Dashboard (Read-Only)
- Stats cards: Total RO, Queued, Total Boxes, Total Pairs
- RO list table with status badges
- Real-time aggregations

#### 2. RO Process (Track & Update)
- 8-stage visual timeline
- Status progression with manual "Next Stage" button (one stage at a time)
- DNPB number input per entity (DDD, LJBB, MBB, UBB)
- SOPB number input (user-entered)
- Article breakdown with allocations

#### 3. SOPB Generator
- Automatically lists all RO IDs in `DNPB_PROCESS` stage
- Per-entity SOPB grouping (each entity = separate SOPB)
- SOPB number is user input
- DNPB number comes from Accurate after upload
- Download SOPB as formatted XLSX

### RO Status Flow
```
QUEUE → APPROVED → PICKING → PICK_VERIFIED → DNPB_PROCESS → READY_TO_SHIP → IN_DELIVERY → ARRIVED → COMPLETED
  │
  └─► CANCELLED (from any status except COMPLETED)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + Shadcn/ui |
| Database | **VPS PostgreSQL** (`openclaw_ops` on `76.13.194.120:5432`) |
| Auth | **NextAuth.js** (credentials provider, JWT sessions) |
| Icons | Lucide React |
| Charts | Recharts |
| Deployment | Vercel |

### Database Schemas Used
| Schema | Purpose |
|--------|---------|
| `branch_super_app_clawdbot` | RO tables (ro_process, ro_recommendations, stock tables, transaction views) |
| `mart` | iSeller sales mart (`mv_iseller_summary`, filter dimensions) |
| `core` | Stock data (`dashboard_cache` — materialized view refreshed daily) |
| `raw` | Accurate raw stock tables (source for `core.dashboard_cache`) |
| `public` | Shared reference tables (`portal_kodemix`, article metadata) |

### Zuma Branding
- **Primary Dark:** `#0D3B2E`
- **Accent Green:** `#00D084`
- **Card style:** `bg-white rounded-xl border border-gray-100 shadow-sm`
- **Background:** `bg-gray-50`

## Database Architecture

### Schema: `branch_super_app_clawdbot`

#### `ro_process` - Active RO Allocations
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| ro_id | VARCHAR(50) | Auto-generated: RO-YYMM-XXXX |
| article_code | VARCHAR(50) | Product code |
| article_name | VARCHAR(255) | Product name |
| boxes_requested | INTEGER | Total boxes requested |
| boxes_allocated_ddd | INTEGER | Boxes from DDD |
| boxes_allocated_ljbb | INTEGER | Boxes from LJBB |
| boxes_allocated_mbb | INTEGER | Boxes from MBB |
| boxes_allocated_ubb | INTEGER | Boxes from UBB |
| status | VARCHAR(50) | Current status (default: QUEUE) |
| store_name | VARCHAR(255) | Destination store |
| notes | TEXT | Optional notes |
| dnpb_number_ddd | VARCHAR(100) | DDD DNPB number |
| dnpb_number_ljbb | VARCHAR(100) | LJBB DNPB number |
| dnpb_number_mbb | VARCHAR(100) | MBB DNPB number |
| dnpb_number_ubb | VARCHAR(100) | UBB DNPB number |
| sopb_number | VARCHAR(100) | SOPB document number |
| dnpb_match | BOOLEAN | TRUE if matched with transaction |
| created_at | TIMESTAMP | Creation time |
| updated_at | TIMESTAMP | Last update |

#### Stock & Transaction Tables
- `supabase_stockawalDDD` / `supabase_stockawalLJBB` / `supabase_stockawalMBB` — Initial stock per entity
- `supabase_transaksiDDD` / `supabase_transaksiLJBB` / `supabase_transaksiMBB` — Transaction views per entity (has DNPB column)

#### VIEW: `master_mutasi_whs`
Calculated view combining stock + transactions + article metadata:
```
Stock Akhir = Stock Awal + Transaksi IN - Transaksi OUT - RO Allocations
```

### Schema: `mart` (iSeller Sales)
- `mv_iseller_summary` — Materialized view of iSeller POS sales data
- Columns: date, branch, store, gender, series, tier, tipe, size, color, qty_pairs, revenue

### Schema: `core` (Stock Dashboard)
- `dashboard_cache` — Materialized view of Accurate stock positions
- Columns: kode_barang, kode_besar, kode, kode_mix, article, nama_gudang, branch, category, gender_group, series, group_warna, tier, tipe, ukuran, v, source_entity, pairs, est_rsp, snapshot_date
- Refreshed daily at 07:00 WIB via VPS cron job

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/home/dashboard` | GET | iSeller sales aggregations (Jatim) |
| `/api/home/filter-options` | GET | iSeller filter dimensions |
| `/api/wh-stock/dashboard` | GET | Stock KPIs + chart data (3 warehouses) |
| `/api/wh-stock/filter-options` | GET | Stock filter dimensions |
| `/api/stores` | GET | List stores from recommendations |
| `/api/articles` | GET | Search articles with stock |
| `/api/ro/recommendations` | GET | Store-specific RO recommendations |
| `/api/ro/submit` | POST | Create new RO |
| `/api/ro/process` | GET | List submitted ROs |
| `/api/ro/status` | PATCH | Update RO status |
| `/api/ro/dnpb` | PATCH | Update DNPB numbers |
| `/api/ro/sopb` | GET/PATCH | Get/update SOPB data |
| `/api/ro/sopb/download` | POST | Download SOPB as XLSX |
| `/api/ro/upload` | POST | Upload approved RO XLSX |
| `/api/ro/upload/confirm` | POST | Confirm uploaded RO |
| `/api/dashboard` | GET | RO dashboard stats |

## Development

### Prerequisites
- Node.js 20+
- npm
- Access to VPS PostgreSQL (`76.13.194.120`)

### Setup
```bash
git clone https://github.com/database-zuma/zuma-branch-superapp.git
cd zuma-branch-superapp
npm install
cp .env.example .env.local
npm run dev
```

### Environment Variables
```env
# Database (VPS PostgreSQL)
DATABASE_URL=postgresql://openclaw_app:***@76.13.194.120:5432/openclaw_ops

# NextAuth
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000

# No longer uses Supabase — fully migrated to VPS PostgreSQL + NextAuth.js
```

### Commands
```bash
npm run dev      # Development server (localhost:3000)
npm run build    # Production build (type check + lint)
npm run lint     # ESLint check
```

## File Structure
```
app/
├── api/
│   ├── auth/[...nextauth]/route.ts   # NextAuth.js handler
│   ├── home/
│   │   ├── dashboard/route.ts        # iSeller sales data
│   │   └── filter-options/route.ts   # iSeller filters
│   ├── wh-stock/
│   │   ├── dashboard/route.ts        # Stock KPIs + charts
│   │   └── filter-options/route.ts   # Stock filters
│   ├── ro/
│   │   ├── submit/route.ts           # Create RO
│   │   ├── process/route.ts          # List ROs
│   │   ├── status/route.ts           # Update status
│   │   ├── dnpb/route.ts             # DNPB matching
│   │   ├── sopb/route.ts             # SOPB data
│   │   ├── sopb/download/route.ts    # SOPB XLSX download
│   │   ├── upload/route.ts           # Upload RO XLSX
│   │   └── recommendations/route.ts  # Auto suggestions
│   ├── articles/route.ts
│   ├── stores/route.ts
│   └── dashboard/route.ts
├── globals.css
├── layout.tsx
└── page.tsx

components/
├── MainLayout.tsx         # App shell with tab routing
├── BottomNavigation.tsx   # 5-tab bottom nav
├── HomePage.tsx           # iSeller SKU Charts (Jatim)
├── WHStockPage.tsx        # Stock dashboard (3 warehouses)
├── ROPage.tsx             # RO container (3 sub-tabs)
├── ROProcess.tsx          # RO Process timeline
├── SOPBGenerator.tsx      # SOPB document generator
├── SalesDashboard.tsx     # RO Dashboard stats
├── SettingsPage.tsx       # Settings & system info
└── ui/                    # shadcn/ui components

lib/
├── db.ts                  # PostgreSQL pool + SCHEMA export
├── auth.ts                # NextAuth.js config
└── utils.ts               # cn() + helpers

middleware.ts              # Auth middleware (protects all routes)
```

## Business Rules

1. **RO ID Format:** `RO-YYMM-XXXX` (auto-generated, unique per month)
2. **1 Box = 12 Pairs** (size assortment)
3. **Warehouse Entities:** DDD, LJBB (primary for retail), MBB, UBB (wholesale/online)
4. **Stock Validation:** Cannot request more than available
5. **DNPB per Entity:** Each entity (DDD/LJBB/MBB/UBB) has its own DNPB number
6. **SOPB:** User-entered number; DNPB comes from Accurate after upload
7. **Stage Progression:** Manual — user clicks "Next Stage" one at a time
8. **Home Hardcodes:** Jatim branch only, last 60 days default
9. **WH Stock Hardcodes:** Warehouse Pusat + Protol + Reject, excludes GWP/hanger/paperbag/shopbag

## Roadmap

- [x] 5-tab navigation
- [x] RO Dashboard with stats
- [x] RO Request Form with per-warehouse allocation
- [x] RO Process with 8-stage timeline
- [x] DNPB matching logic (per-entity DDD/LJBB/MBB/UBB)
- [x] Stock deduction on RO submit
- [x] SOPB Generator tab
- [x] Home page — iSeller SKU Charts (Jatim, last 60 days)
- [x] WH Stock page — Stock dashboard from core.dashboard_cache
- [x] Migration from Supabase to VPS PostgreSQL
- [x] Migration from Supabase Auth to NextAuth.js
- [x] Toast notifications (sonner)
- [x] Confirmation dialogs for destructive actions
- [x] Vercel deployment
- [ ] Authentication (Phase 2 — Role-based access)
- [ ] Push notifications
- [ ] Offline sync

---

Built for Zuma Indonesia
