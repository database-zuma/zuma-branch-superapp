# RO Request Architecture

> **AI Agent Reference:** For complete app navigation, see [`AI_REFERENCE.md`](./AI_REFERENCE.md)  
> **Related:** [`APP_LOGIC.md`](./APP_LOGIC.md) - Application flowcharts | [`DATABASE_LOGIC.md`](./DATABASE_LOGIC.md) - Table schemas

## Overview
The RO Request Form needs to support **dual data sources** for article selection:
1. **Auto-Generated Recommendations** - System-suggested articles based on store selection
2. **Manual Article Addition** - User-selected articles from catalog

Both sources display **unified warehouse stock levels** for easier management.

---

## User Flow

### 1. Store Selection
- User selects a store from dropdown
- **Options:**
  - Regular stores (Zuma Tunjungan, Zuma Royal Plaza, etc.)
  - **Special options for warehouse supervisor access:**
    - `Other Need` - For miscellaneous stock requests
    - `Wholesale` - For wholesale orders
    - `Consignment` - For consignment stock
- **Trigger**: Auto-generate button becomes active (only for regular stores)
- System fetches recommendations for that store (if regular store selected)

### 2. Auto-Generated Request (Source 1)
**Purpose**: System recommends articles that need replenishment

**Logic**:
- Based on store's sales velocity, current stock, and reorder points
- Algorithm calculates: `Recommended Boxes = (Sales Velocity × Lead Time) - Current Stock`
- Only shows articles below reorder threshold

**UI Behavior**:
- Display as pre-filled list with suggested box quantities
- User can:
  - ✅ Accept all recommendations (one-click)
  - ✏️ Edit quantities per article
  - 🗑️ Remove specific articles
  - ➕ Add more articles manually (Source 2)

### 3. Manual Article Addition (Source 2)
**Purpose**: User wants to add articles not in auto-generated list

**Logic**:
- Opens article selector modal
- Search/filter through complete article catalog
- Select articles one by one
- Default quantity: 1 box (editable)

**UI Behavior**:
- "+ Add Article" button opens selector
- Selected articles append to the request list
- Can mix with auto-generated articles

---

## Data Architecture

### Table 1: `ro_recommendations` (Auto-Generated Source)
Stores system-generated RO suggestions per store.

```sql
-- Purpose: Pre-calculated recommendations for each store
-- Updated: Daily/hourly via scheduled job or trigger

create table ro_recommendations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id),
  article_code varchar(50) references articles(code),
  
  -- Recommendation Logic
  current_stock_store int,           -- Current stock at store
  current_stock_warehouse int,       -- Current stock at warehouse (from master)
  avg_weekly_sales decimal(10,2),    -- Average weekly sales velocity
  weeks_of_stock decimal(5,2),       -- Current weeks of stock remaining
  
  -- Recommendation
  suggested_boxes int,               -- Algorithm-recommended boxes
  priority varchar(20),              -- 'urgent' | 'normal' | 'low'
  reason text,                       -- Why recommended (e.g., "Low stock + high velocity")
  
  -- Metadata
  calculated_at timestamp default now(),
  valid_until timestamp,             -- Recommendation expiry
  
  -- Constraints
  unique(store_id, article_code)
);
```

**Key Columns**:
- `current_stock_warehouse` → References unified warehouse stock
- `suggested_boxes` → Pre-calculated recommendation
- `priority` → Visual indicator (red/yellow/green)

---

### Table 2: `articles` (Manual Addition Source)
Master catalog of all available articles.

```sql
-- Purpose: Complete product catalog for manual selection
-- Note: Stock column is a VIEW from warehouse master, not stored here

create table articles (
  code varchar(50) primary key,      -- Article code (e.g., M1AMV102)
  name varchar(255) not null,        -- Article name
  series varchar(100),               -- Product series (AIRMOVE, CLASSIC, etc.)
  gender varchar(20),                -- MEN | WOMEN | KIDS
  base_price decimal(10,2),          -- Base price per pair
  box_size int default 12,           -- Pairs per box (usually 12)
  
  -- Categorization
  category varchar(100),
  is_active boolean default true,
  
  -- Metadata
  created_at timestamp default now(),
  updated_at timestamp default now()
);
```

**Note**: No stock column here - stock is pulled dynamically from warehouse master via JOIN.

---

### Table 3: `ro_stockwhs` (Master Stock Source)
**Single Source of Truth** for all warehouse inventory.

```sql
-- Purpose: Master warehouse stock levels (DDD + LJBB)
-- Updated: From Google Sheets sync

create table ro_stockwhs (
  id uuid primary key default gen_random_uuid(),
  article_code varchar(50) not null unique,
  article_name varchar(255),
  ddd_stock int default 0,           -- DDD warehouse physical stock
  ljbb_stock int default 0,          -- LJBB warehouse physical stock
  total_stock int default 0,         -- Total across all locations
  last_updated timestamp default now()
);
```

### View: `ro_whs_readystock` (Available Stock)
**Dynamic VIEW** that calculates real-time available stock for new ROs.

```sql
-- Purpose: Available stock = ro_stockwhs - active ro_process allocations
-- Formula: Physical stock minus boxes allocated to active ROs
-- Auto-updates: When either ro_stockwhs or ro_process changes

CREATE OR REPLACE VIEW ro_whs_readystock AS
SELECT 
    s.article_code,
    s.article_name,
    -- DDD available: DDD stock minus allocated in active processes
    GREATEST(0, 
        COALESCE(s.ddd_stock, 0) - 
        COALESCE(SUM(CASE 
            WHEN p.status IN ('QUEUE', 'PROCESSING', 'DELIVERY', 'COMPLETE') 
            THEN p.boxes_allocated_ddd 
            ELSE 0 
        END), 0)
    ) AS ddd_available,
    -- LJBB available: LJBB stock minus allocated in active processes  
    GREATEST(0, 
        COALESCE(s.ljbb_stock, 0) - 
        COALESCE(SUM(CASE 
            WHEN p.status IN ('QUEUE', 'PROCESSING', 'DELIVERY', 'COMPLETE') 
            THEN p.boxes_allocated_ljbb 
            ELSE 0 
        END), 0)
    ) AS ljbb_available,
    -- Total available: Total stock minus all allocated boxes
    GREATEST(0, 
        COALESCE(s.total_stock, 0) - 
        COALESCE(SUM(CASE 
            WHEN p.status IN ('QUEUE', 'PROCESSING', 'DELIVERY', 'COMPLETE') 
            THEN (p.boxes_allocated_ddd + p.boxes_allocated_ljbb)
            ELSE 0 
        END), 0)
    ) AS total_available,
    NOW() AS last_calculated
FROM ro_stockwhs s
LEFT JOIN ro_process p ON s.article_code = p.article_code
GROUP BY s.article_code, s.article_name, s.ddd_stock, s.ljbb_stock, s.total_stock;
```

**Key Points**:
- **Was**: Static table with triggers (003_create_ro_whs_readystock.sql)
- **Now**: Dynamic VIEW (007_convert_readystock_to_view.sql) - no sync jobs needed
- **Statuses subtracted**: QUEUE, PROCESSING, DELIVERY, COMPLETE
- **Statuses NOT subtracted**: DNPB done, CANCELLED, COMPLETED
- Both `ro_recommendations` and `articles` reference this VIEW for stock display

---

## Unified Stock Display Logic

### Challenge
Both tables need to show warehouse stock, but:
- `ro_recommendations` has its own `current_stock_warehouse` column
- `articles` doesn't store stock (must query warehouse_stock)

### Solution: Database VIEW

```sql
-- Create a unified stock view for easy querying

create view article_stock_summary as
select 
  ws.article_code,
  sum(ws.available_boxes) as total_available_boxes,
  sum(ws.total_boxes) as total_physical_boxes,
  json_agg(
    json_build_object(
      'warehouse_id', ws.warehouse_id,
      'location', ws.location_code,
      'available', ws.available_boxes
    )
  ) as warehouse_breakdown
from warehouse_stock ws
group by ws.article_code;
```

### Application Logic

#### For Auto-Generated List (from `ro_recommendations`):
```typescript
// API Response Structure
interface RORecommendationItem {
  // From ro_recommendations table
  article_code: string;
  article_name: string;              // JOIN with articles
  suggested_boxes: number;
  current_stock_store: number;
  priority: 'urgent' | 'normal' | 'low';
  
  // From warehouse_stock (via JOIN or cached in ro_recommendations)
  warehouse_stock: {
    total_available: number;
    ddd_available: number;
    ljbb_available: number;
  };
  
  // Calculated
  max_orderable: number;             // min(suggested_boxes, warehouse_stock.total_available)
}
```

#### For Manual Addition (from `articles`):
```typescript
// API Response Structure
interface ArticleCatalogItem {
  // From articles table
  code: string;
  name: string;
  series: string;
  gender: string;
  
  // From warehouse_stock (real-time query)
  warehouse_stock: {
    total_available: number;
    ddd_available: number;
    ljbb_available: number;
  };
  
  // UI State
  selected: boolean;
  quantity: number;
}
```

---

## Frontend Component Architecture

### State Management
```typescript
interface RORequestState {
  // Selected Store
  selectedStore: Store | null;
  
  // Auto-Generated Items (Source 1)
  autoGeneratedItems: RORecommendationItem[];
  autoGeneratedAccepted: boolean;     // User accepted all suggestions
  
  // Manual Items (Source 2)
  manualItems: ArticleCatalogItem[];
  
  // Combined Request List (what gets submitted)
  requestItems: RequestItem[];        // Merged auto + manual
  
  // UI State
  isLoadingRecommendations: boolean;
  showArticleSelector: boolean;
}
```

### Component Flow

```
RequestForm
├── StoreSelector
│   └── onSelectStore → fetchRecommendations(storeId)
├── AutoGeneratedSection (conditional)
│   ├── RecommendationList
│   │   └── RecommendationCard (shows warehouse stock)
│   │       ├── Article Info
│   │       ├── Suggested Quantity (editable)
│   │       └── Warehouse Stock Badge
│   └── ActionButtons
│       ├── [Accept All] → add all to requestItems
│       └── [Clear All] → remove all auto-generated
├── ManualAdditionSection
│   ├── [+ Add Article] Button
│   │   └── opens ArticleSelectorModal
│   └── ArticleSelectorModal
│       ├── Search/Filter
│       └── ArticleList
│           └── ArticleCard (shows warehouse stock)
│               └── [+] Button → add to manualItems
└── RequestSummary
    ├── Combined Item List
    │   └── RequestItemCard (auto + manual mixed)
    ├── Totals (Articles, Boxes, Pairs)
    └── [Submit RO] Button
```

---

## API Endpoints - IMPLEMENTED ✅

All API endpoints have been implemented and deployed to Vercel.

### Base URL
```
https://zuma-ro-pwa.vercel.app/api
```

---

### 1. Get Auto-Generated Recommendations ✅

**Endpoint:**
```http
GET /api/ro/recommendations?store_name={store_name}
```

**Query Parameters:**
- `store_name` (required): Name of the store (e.g., "Zuma Matos")

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "article_code": "M1AMV102",
      "article_name": "MEN AIRMOVE 2, INDIGO TAN",
      "suggested_boxes": 5,
      "total_recommendation": 13,
      "priority": "urgent",
      "tier": 1,
      "assay_status": "FULL",
      "stock_status": "AVAILABLE",
      "warehouse_stock": {
        "ddd_available": 30,
        "ljbb_available": 15,
        "total_available": 45
      }
    }
  ]
}
```

**Implementation Details:**
- **File:** `app/api/ro/recommendations/route.ts`
- **Schema:** `branch_super_app_clawdbot`
- **Tables:** `ro_recommendations` JOIN `ro_whs_readystock`
- **Priority Logic:** tier ≤ 2 = 'urgent', tier ≤ 4 = 'normal', else 'low'

**Example Usage:**
```bash
curl "https://zuma-ro-pwa.vercel.app/api/ro/recommendations?store_name=Zuma%20Matos"
```

---

### 2. Search Articles (Manual Addition) ✅

**Endpoint:**
```http
GET /api/articles?q={query}&gender={gender}
```

**Query Parameters:**
- `q` (optional): Search query for article code or name
- `gender` (optional): Filter by gender - 'MEN', 'WOMEN', 'KIDS', or 'ALL' (default)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "code": "M1AMV102",
      "name": "MEN AIRMOVE 2, INDIGO TAN",
      "series": "AIRMOVE",
      "gender": "MEN",
      "warehouse_stock": {
        "ddd_available": 30,
        "ljbb_available": 15,
        "total_available": 45
      }
    }
  ]
}
```

**Implementation Details:**
- **File:** `app/api/articles/route.ts`
- **Schema:** `branch_super_app_clawdbot`
- **Tables:** `ro_stockwhs` JOIN `ro_whs_readystock`
- **Gender Inference:** Extracted from article code (M=MEN, W=WOMEN, K=KIDS)
- **Series Extraction:** Parsed from article code pattern

**Example Usage:**
```bash
# Search all articles
curl "https://zuma-ro-pwa.vercel.app/api/articles"

# Search with query
curl "https://zuma-ro-pwa.vercel.app/api/articles?q=airmove"

# Filter by gender
curl "https://zuma-ro-pwa.vercel.app/api/articles?gender=MEN"
```

---

### 3. Submit RO Request ✅

**Endpoint:**
```http
POST /api/ro/submit
```

**Request Body:**
```json
{
  "store_name": "Zuma Matos",
  "articles": [
    {
      "code": "M1AMV102",
      "name": "MEN AIRMOVE 2, INDIGO TAN",
      "boxes": 5,
      "warehouse_stock": {
        "total_available": 45
      }
    }
  ],
  "notes": "Optional notes"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ro_id": "RO-2601-0001",
    "store_name": "Zuma Matos",
    "articles_count": 1,
    "total_boxes": 5,
    "status": "QUEUE"
  }
}
```

**Implementation Details:**
- **File:** `app/api/ro/submit/route.ts`
- **Schema:** `branch_super_app_clawdbot`
- **Table:** `ro_process`
- **Validation:** Checks stock availability before submission
- **RO ID Generation:** Auto-generated by database trigger (format: RO-YYMM-XXXX)
- **Initial Status:** All new ROs start with 'QUEUE' status

**Validation Rules:**
- Store name is required
- At least one article is required
- Requested boxes cannot exceed available stock
- Returns specific error message for each validation failure

**Example Usage:**
```bash
curl -X POST "https://zuma-ro-pwa.vercel.app/api/ro/submit" \
  -H "Content-Type: application/json" \
  -d '{
    "store_name": "Zuma Matos",
    "articles": [
      {
        "code": "M1AMV102",
        "name": "MEN AIRMOVE 2, INDIGO TAN",
        "boxes": 3,
        "warehouse_stock": {"total_available": 10}
      }
    ]
  }'
```

---

## Supabase Configuration

### Schema
All RO tables are in the `branch_super_app_clawdbot` schema.

### Client Configuration
**File:** `lib/supabase.ts`
```typescript
import { createClient } from '@supabase/supabase-js';

export const SCHEMA = 'branch_super_app_clawdbot';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: SCHEMA
  }
});
```

### Database Tables
- `ro_stockwhs` - Master warehouse stock (DDD/LJBB)
- `ro_process` - Active RO allocations
- `ro_recommendations` - Auto-generated recommendations
- `ro_whs_readystock` - VIEW for real-time available stock
- `ro_id_sequences` - RO ID sequence tracking

---

## Implementation Status

| Endpoint | Status | File |
|----------|--------|------|
| GET /api/ro/recommendations | ✅ Complete | `app/api/ro/recommendations/route.ts` |
| GET /api/articles | ✅ Complete | `app/api/articles/route.ts` |
| POST /api/ro/submit | ✅ Complete | `app/api/ro/submit/route.ts` |

**Last Updated:** 2026-01-29
**Commit:** `88aea31` - feat: Add API endpoints for RO recommendations, articles search, and RO submission
limit 50;
```

---

### 3. Submit RO Request
```http
POST /api/ro/submit
```

**Request Body**:
```json
{
  "store_id": "uuid",
  "delivery_date": "2026-02-05",
  "items": [
    {
      "article_code": "M1AMV102",
      "boxes": 5,
      "source": "auto"  // or "manual"
    },
    {
      "article_code": "W2ELSA01",
      "boxes": 3,
      "source": "manual"
    }
  ],
  "notes": "Optional notes"
}
```

---

## Supabase Implementation Plan

### Phase 1: Core Tables
1. ✅ `articles` - Master catalog (likely exists)
2. ✅ `warehouse_stock` - Master stock (likely exists)
3. ⬜ `ro_recommendations` - NEW: Auto-generated suggestions
4. ⬜ `article_stock_summary` VIEW - Unified stock query

### Phase 2: RO System Tables
5. ⬜ `ro_sessions` - RO headers (may exist)
6. ⬜ `ro_items` - RO line items (may exist)
7. ⬜ `stores` - Store master (likely exists)

### Phase 3: Business Logic
8. ⬜ Function: `generate_ro_recommendations(store_id)`
9. ⬜ Scheduled Job: Daily refresh of recommendations
10. ⬜ Trigger: Update recommendations on stock change

### Phase 4: API & Frontend
11. ⬜ API Routes for recommendations and article search
12. ⬜ Frontend components for dual-source selection

---

## Key Design Decisions

### 1. Stock Display Strategy
**✅ DECIDED**: Pull from Google Sheets regularly
- Algorithm is configured in Google Sheets formula
- Supabase pulls this table from GSheet regularly (sync job)
- No complex calculation needed in Supabase

**Stock Entity Column**: `warehouse_stock` table has `entity` column with values:
- `DDD` - DDD warehouse location
- `LJBB` - LJBB warehouse location
- Show both in UI with breakdown

### 2. Handling Stock Conflicts
**Scenario**: User selects 5 boxes, but warehouse only has 3 available

**Solution**:
- Show real-time stock badge (green/yellow/red)
- Validate on submit: "Only 3 boxes available for M1AMV102"
- Auto-adjust: "Would you like to order 3 instead?"

### 3. Auto-Generated vs Manual Mix
**Rule**: Both sources feed into the same `requestItems` array
- Auto-generated items can be edited/removed
- Manual items can be added even if auto-generated exists
- No duplicates: If manual adds an article already in auto-list, merge them

---

## Request Form Button Logic (Finalized)

### AUTO Button - REPLACE Mode

**Purpose**: Fetch system-generated recommendations and replace current list

**Behavior**:
1. **Truncate** - Clear `requestItems` array completely
2. **Fetch** - Query `ro_recommendations` WHERE store_id = selected_store
3. **Join** - With `ro_whs_readystock` VIEW for real-time stock levels
4. **Populate** - Fill `requestItems` with suggested quantities from algorithm

**User Actions**:
- Click once → Load recommendations
- Click again → Fresh fetch (replace again, no duplicates)
- Edit quantity → Update specific article boxes
- Remove article → Delete from list
- Clear All → Empty list completely

**Stock Display**:
- Shows `ddd_available`, `ljbb_available`, `total_available` from `ro_whs_readystock`
- Real-time calculation: Physical stock - Active RO allocations

---

### +Add Button - APPEND Mode

**Purpose**: Manually add articles from catalog to existing list

**Behavior**:
1. **Open** - Article selector modal
2. **Search** - Query `articles` table with text filter
3. **Join** - With `ro_whs_readystock` VIEW for stock display
4. **Filter** - Exclude already-added articles (both auto and manual)
5. **Append** - Add selected article to `requestItems` with default 1 box

**User Actions**:
- Search by code, name, or series
- Filter by gender (ALL/MEN/WOMEN/KIDS)
- Select article → Appends to list
- Can add multiple articles
- Modal stays open until "Done" clicked

**Stock Display**:
- Same as AUTO: Shows DDD/LJBB/Total from `ro_whs_readystock`
- Real-time available stock

---

### Stock Validation (BLOCK Strategy)

**Display Logic**:
- 🟢 **Green Badge**: `requested <= available` - OK to order
- 🟡 **Yellow Badge**: `requested > available` but `available > 0` - Warning
- 🔴 **Red Badge**: `available = 0` - Out of stock

**Validation Rules**:
1. **Real-time**: Show warning badge if requested > available
2. **On Submit**: ALLOW submission even if 0 stock (Status: QUEUE)
3. **On Approval**: BLOCK approval if any article has 0 qty
4. **Error Message**: "Cannot approve: Found items with 0 quantity..."
5. **Workflow**: Upload -> Queue (0 qty) -> User Edits/Deletes -> Approve

**Stock Source**:
- Both AUTO and +Add use `ro_whs_readystock` VIEW
- Formula: `ro_stockwhs - active_ro_process_allocations`
- Subtracts statuses: QUEUE, PROCESSING, DELIVERY, COMPLETE
- Does NOT subtract: DNPB done, CANCELLED, COMPLETED

---

### State Flow Diagram

```
Initial State:
  requestItems = []

AUTO Button Clicked:
  1. Clear requestItems (truncate)
  2. Fetch ro_recommendations for store
  3. Join with ro_whs_readystock
  4. requestItems = recommendations

+Add Button Clicked:
  1. Open article selector
  2. Search articles (exclude already added)
  3. Join with ro_whs_readystock for stock
  4. On select: requestItems.push(article with 1 box)

Submit Button Clicked:
  1. Validate: All items have requested <= available
  2. If invalid: Show error, block submission
  3. If valid: Insert to ro_process table
  4. Generate RO ID via Supabase function
```

---

## Key Differences Summary

| Feature | AUTO Button | +Add Button |
|---------|-------------|-------------|
| **Action** | REPLACE list | APPEND to list |
| **Source** | ro_recommendations | articles table |
| **Quantity** | Pre-calculated suggestion | Default 1 box |
| **Stock** | From ro_whs_readystock | From ro_whs_readystock |
| **Duplicates** | Fresh fetch (no dupes) | Filtered out (no dupes) |
| **Use Case** | System suggestions | User custom additions |

---

## Implementation Checklist

### Phase 1: Data Layer
- [ ] Verify ro_recommendations table exists and populated
- [ ] Verify ro_whs_readystock VIEW is working
- [ ] Create API: GET /api/ro/recommendations?store_id={id}
- [ ] Create API: GET /api/articles/search?q={query}
- [ ] Create API: POST /api/ro/submit

### Phase 2: Frontend State
- [ ] Update RequestForm state management
- [ ] Implement requestItems array
- [ ] Handle AUTO button (truncate + fetch)
- [ ] Handle +Add button (append + filter)

### Phase 3: Stock Display
- [ ] Show stock badges on all articles
- [ ] Color coding (green/yellow/red)
- [ ] Real-time validation

### Phase 4: Submit Validation
- [ ] Block if requested > available
- [ ] Show specific error messages
- [ ] Insert to ro_process on success

---

## Next Steps

1. **Verify Database Schema** - Check ro_recommendations, ro_whs_readystock VIEW
2. **Build API Endpoints** - Recommendations, search, submit
3. **Update RequestForm.tsx** - Implement button logic
4. **Test Stock Validation** - Ensure BLOCK strategy works
5. **Integration Testing** - Full flow from store selection to submission

Ready to build when you are!
