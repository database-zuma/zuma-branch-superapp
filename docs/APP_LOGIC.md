# Application Logic & Flowcharts

> **AI Agent Reference:** Complete application logic, data flows, and decision trees  
> **Related:** [AI_REFERENCE.md](./AI_REFERENCE.md) | [DATABASE_LOGIC.md](./DATABASE_LOGIC.md) | [PROJECT_STATUS.md](./PROJECT_STATUS.md)

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [User Roles & Responsibilities](#user-roles--responsibilities)
3. [RO Lifecycle Flow](#ro-lifecycle-flow)
4. [Create RO Flow](#create-ro-flow)
5. [Process RO Flow](#process-ro-flow)
6. [DNPB Matching Flow](#dnpb-matching-flow)
7. [DNPB Error Resolution Flow](#dnpb-error-resolution-flow)
8. [Stock Calculation Flow](#stock-calculation-flow)
9. [Authentication Flow](#authentication-flow)
10. [Data Flow Diagrams](#data-flow-diagrams)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ZUMA RO PWA ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Next.js    │────▶│   Supabase   │────▶│  PostgreSQL  │
│  (React/TS)  │◄────│   API Routes │◄────│    Client    │◄────│   Database   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 5-Tab Layout │     │ 10+ API      │     │ Auth/Session │     │ 15+ Tables   │
│ - Home       │     │ Endpoints    │     │ Management   │     │ - ro_process │
│ - WH Stock   │     │              │     │              │     │ - ro_receipt │
│ - Action     │     │              │     │              │     │ - transaksi* │
│ - RO         │     │              │     │              │     │ - stockawal* │
│ - Settings   │     │              │     │              │     │ - views      │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

---

## User Roles & Responsibilities

### Role Overview

| Role | Code | App | Primary Actions | Views |
|------|------|-----|-----------------|-------|
| **Area Supervisor** | AS | zuma-ro-pwa | Create RO, Cancel RO | Own ROs, Dashboard |
| **WH Supervisor** | WH SPV | zuma-ro-pwa | Approve, Verify, DNPB, Banding | All ROs, DNPB Errors |
| **WH Admin** | WH Admin | zuma-ro-pwa | Ready to Ship, DNPB Input | Warehouse Operations |
| **WH Helper** | WH Helper | zuma-ro-pwa | Picking | Pick Lists |
| **SPG/B** | SPG/B | ro-arrive-app | Receive, Count, Input Fisik | Arrived ROs |

---

### Area Supervisor (AS) Flow

**App:** zuma-ro-pwa (this app)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AREA SUPERVISOR WORKFLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Login      │────▶│   Home Tab   │────▶│   RO Tab     │────▶│  RequestForm │
│  (AS role)   │     │  View Sales  │     │  Create RO   │     │  Select Store│
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
                                                                      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   RO Status  │◄────│   Dashboard  │◄────│   Submit RO  │◄────│  Auto-Gen    │
│   QUEUE      │     │   Track RO   │     │   (System)   │     │  Articles    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘

CAN DO:
✓ Create new RO (RequestForm)
✓ View own ROs (Dashboard)
✓ Cancel RO (if not COMPLETED)
✓ View WH Stock (read-only)

CANNOT DO:
✗ Advance RO status (WH SPV only)
✗ Input DNPB numbers (WH Admin only)
✗ Access DNPB Error tab (WH SPV only)
✗ Pick items (WH Helper only)
```

---

### WH Supervisor (WH SPV) Flow

**App:** zuma-ro-pwa (this app)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WH SUPERVISOR WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Login      │────▶│   RO Tab     │────▶│  ROProcess   │────▶│   Approve    │
│ (WH SPV)     │     │  All ROs     │     │   Detail     │     │  QUEUE→APPROVED│
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                      │
┌──────────────┐     ┌──────────────┐     ┌──────────────┐           │
│   DNPB Error │◄────│   Banding    │◄────│   Verify     │◄──────────┘
│   Tab        │     │   (Dispute)  │     │  PICK_VERIFIED│
│  (ARRIVED    │     │              │     │              │
│   issues)    │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘

CAN DO:
✓ View all ROs (not just own)
✓ Approve RO (QUEUE → APPROVED)
✓ Verify Picking (PICKING → PICK_VERIFIED)
✓ Access DNPB Error tab
✓ Send Banding notice (dispute discrepancy)
✓ Confirm discrepancy (accept and complete)
✓ Cancel any RO (if not COMPLETED)

CANNOT DO:
✗ Create RO (AS only)
✗ Pick items (WH Helper only)
✗ Input DNPB (WH Admin only)
```

---

### WH Admin Flow

**App:** zuma-ro-pwa (this app)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WH ADMIN WORKFLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Login      │────▶│   RO Tab     │────▶│  ROProcess   │────▶│  DNPB Input  │
│ (WH Admin)   │     │  DNPB_PROCESS│     │   Detail     │     │  DDD/LJBB #  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
                                                                      ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Mark Ready  │◄────│  Validate    │◄────│  Save DNPB   │◄────│  Match Check │
│  to Ship     │     │  Format      │     │              │     │  (System)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘

CAN DO:
✓ Input DNPB numbers (DNPB_PROCESS stage)
✓ Mark Ready to Ship (after DNPB)
✓ View WH Stock (all warehouses)

CANNOT DO:
✗ Approve/Verify (WH SPV only)
✗ Banding/Confirm (WH SPV only)
✗ Pick items (WH Helper only)
```

---

### WH Helper Flow

**App:** zuma-ro-pwa (this app)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WH HELPER WORKFLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Login      │────▶│   RO Tab     │────▶│  ROProcess   │────▶│   Picking    │
│ (WH Helper)  │     │  APPROVED    │     │   Detail     │     │  Items from  │
└──────────────┘     └──────────────┘     └──────────────┘     │  Warehouse   │
                                                               └──────┬───────┘
                                                                      │
                                                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Mark Complete (PICKING → PICK_VERIFIED)              │
└─────────────────────────────────────────────────────────────────────────────┘

CAN DO:
✓ View assigned ROs (APPROVED status)
✓ Pick items from warehouse
✓ Mark picking complete

CANNOT DO:
✗ Advance status beyond PICKING
✗ Edit quantities (read-only pick list)
✗ Access DNPB Error tab
```

---

### SPG/B (Store Staff) Flow

**App:** ro-arrive-app (separate app)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SPG/B WORKFLOW                                      │
│                    (ro-arrive-app - separate application)                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Login      │────▶│   Receive    │────▶│   Count      │────▶│  Input Fisik │
│  (SPG/B)     │     │   Delivery   │     │   Physical   │     │  (Actual Qty)│
└──────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                      │
                    ┌─────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   System     │────▶│   Discrepancy│────▶│   zuma-ro-pwa│
│   Compare    │     │   Detected?  │     │   Notified   │
│   (Shipped   │     │              │     │   (DNPB Error│
│   vs Fisik)  │     │              │     │   Tab)       │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
        ┌──────────┐               ┌──────────┐
        │   YES    │               │    NO    │
        │ Discrep  │               │  Match   │
        └────┬─────┘               └────┬─────┘
             │                          │
             ▼                          ▼
    ┌────────────────┐          ┌────────────────┐
    │ WH SPV sees    │          │ RO auto-       │
    │ DNPB Error tab │          │ completes to   │
    │ (Banding/      │          │ COMPLETED      │
    │  Confirmed)    │          │                │
    └────────────────┘          └────────────────┘

CAN DO:
✓ Receive deliveries (IN_DELIVERY → ARRIVED)
✓ Count physical stock (fisik)
✓ Input actual received quantities
✓ View Banding notices (re-check requests)
✓ Update fisik after Banding (re-count)

CANNOT DO (in zuma-ro-pwa):
✗ Create/Edit ROs
✗ Advance warehouse statuses
✗ Access WH Stock data
✗ Send Banding (only receive notices)
```

---

## RO Lifecycle Flow

### Complete RO Journey (All Roles)

```
┌─────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│  QUEUE  │──▶│ APPROVED  │──▶│  PICKING  │──▶│PICK_VERIFIED│──▶│DNPB_PROCESS│
└─────────┘   └───────────┘   └───────────┘   └───────────┘   └─────┬─────┘
   [AS]          [WH SPV]       [WH Helper]     [WH SPV]         [WH Admin]
     │                                                               │
     │         ┌─────────────────────────────────────────────────────┘
     │         │
     │         ▼
     │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌───────────┐
     │   │READY_TO_SHIP│──▶│ IN_DELIVERY │──▶│   ARRIVED   │──▶│ COMPLETED │
     │   └─────────────┘   └─────────────┘   └──────┬──────┘   └───────────┘
     │     [WH Admin]       [Logistics]      [SPG/B in      [System auto
     │                                              ro-arrive]   or WH SPV]
     │                                              │
     │                                       ┌──────┴──────┐
     │                                       ▼             ▼
     │                               ┌────────────┐  ┌────────────┐
     │                               │   Match    │  │ Discrepancy│
     │                               │  (No DNPB  │  │  (DNPB     │
     │                               │   Error)   │  │  Error)    │
     │                               └────────────┘  └─────┬──────┘
     │                                                     │
     │                                               ┌─────┴─────┐
     │                                               ▼           ▼
     │                                         ┌────────┐  ┌──────────┐
     │                                         │BANDING │  │CONFIRMED │
     │                                         │(Dispute│  │ (Accept  │
     │                                         │ Notice)│  │ Discrep) │
     │                                         └────┬───┘  └────┬─────┘
     │                                              │           │
     │                                              ▼           ▼
     │                                         ┌─────────────────────┐
     │                                         │ BANDING_SENT        │
     │                                         │ (Wait for SPG/B     │
     │                                         │  to re-check)       │
     │                                         └─────────────────────┘
     │
     ▼
┌───────────┐
│ CANCELLED │  (Can cancel from any status except COMPLETED)
└───────────┘
   [AS or WH SPV]
```

### Status Descriptions

| Status | Description | Who Updates | App |
|--------|-------------|-------------|-----|
| **QUEUE** | RO just created, waiting for approval | System (auto) | zuma-ro-pwa |
| **APPROVED** | RO approved by supervisor | WH SPV | zuma-ro-pwa |
| **PICKING** | Warehouse staff picking items | WH Helper | zuma-ro-pwa |
| **PICK_VERIFIED** | Picking verified by supervisor | WH SPV | zuma-ro-pwa |
| **DNPB_PROCESS** | Entering DNPB numbers | WH Admin | zuma-ro-pwa |
| **READY_TO_SHIP** | Packed and ready for delivery | WH Admin | zuma-ro-pwa |
| **IN_DELIVERY** | Items in transit to store | Logistics | External |
| **ARRIVED** | Items arrived at store | SPG/B | ro-arrive-app |
| **BANDING_SENT** | Re-check requested, waiting for SPG/B | WH SPV | zuma-ro-pwa |
| **COMPLETED** | RO fully processed | System/WH SPV | Both apps |
| **CANCELLED** | RO cancelled | AS/WH SPV | zuma-ro-pwa |

---

## Create RO Flow (Updated March 2026)

### Primary Method: XLSX Upload

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    XLSX UPLOAD FLOW (Primary)                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ AS receives │────▶│ Dashboard   │────▶│ Drag-drop   │────▶│ POST /api/  │
│ RO Request  │     │ Upload RO   │     │ XLSX file   │     │ ro/upload   │
│ XLSX        │     │ button      │     │             │     │ (parse)     │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                              │
                                                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Preview     │────▶│ Confirm     │────▶│ POST /api/  │────▶│ Success!    │
│ entity      │     │ button      │     │ ro/upload/  │     │ ROs in      │
│ breakdown   │     │             │     │ confirm     │     │ QUEUE       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘

Parse logic:
1. Sheet 3 "Daftar RO Box" → extract kode_mix + qty
2. Map kode_mix → article_code via portal.kodemix
3. Check ro_whs_readystock for entity availability (View clamps negative stock to 0)
4. Allocate: DDD → LJBB → MBB → UBB (waterfall)
5. **0 Qty Handling**: Articles with 0 stock/allocation are inserted with status 'QUEUE' (0 boxes)
   - They appear in RO Process list as warnings
   - Must be removed or edited before Approval

### Legacy Method: Manual GUI Submit

Still available via `/api/ro/submit` but XLSX upload is the primary flow.

### RO ID Generation Logic

```
Format: RO-YYMM-XXXX

Example: RO-2502-0001
         │  │  └── Sequential number (0001-9999)
         │  └───── Month (01-12)
         └──────── Year (25 = 2025)

Algorithm:
1. Get current year (last 2 digits)
2. Get current month (2 digits)
3. Query: SELECT MAX(ro_id) FROM ro_process WHERE ro_id LIKE 'RO-YYMM-%'
4. If found: increment sequence
5. If not found: start at 0001
```

---

## Process RO Flow

### ROProcess Component Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RO PROCESS FLOWCHART                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│ Load RO     │
│ List (API)  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Filter Tabs:    │
│ - ALL           │
│ - ONGOING       │
│ - SHIPPING      │
│ - COMPLETE      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Select RO       │
│ from List       │
└────────┬────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     RO DETAIL VIEW (3 Layers)                           │
└──────────────────────────────────────────────────────────────────────────┘

Layer 1: Timeline (Visual Status)
┌─────────────────────────────────────────────────────────────────────────┐
│ QUEUE → APPROVED → PICKING → PICK_VERIFIED → DNPB_PROCESS → ...        │
│  [✓]      [✓]        [✓]         [✓]            [CURRENT]               │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
Layer 2: Actions
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ "Next Step"     │   │ "Save Changes"  │   │ "Cancel RO"     │
│ Button          │   │ Button          │   │ (if editable)   │
│ (Advance Status)│   │ (Update Qty)    │   │                 │
└────────┬────────┘   └────────┬────────┘   └─────────────────┘
         │                     │
         │                     ▼
         │            ┌─────────────────┐
         │            │ Editable?       │
         │            │ (Status check)  │
         │            └────────┬────────┘
         │                     │
         │        ┌────────────┴────────────┐
         │        │                         │
         │        ▼                         ▼
         │   ┌─────────┐              ┌─────────┐
         │   │ YES:    │              │ NO:     │
         │   │ Input   │              │ Readonly│
         │   │ Fields  │              │ Display │
         │   └────┬────┘              └─────────┘
         │        │
         │        ▼
         │   ┌─────────────────┐
         │   │ PATCH /api/ro/  │
         │   │ articles/batch  │
         │   │ (Atomic update) │
         │   └─────────────────┘
         │
         ▼
Layer 3: Article Breakdown
┌─────────────────────────────────────────────────────────────────────────┐
│ Article Code | Name | Box | DDD | LJBB | Actions                        │
│ M1AMV102     | Air  | 12  | [2] | [1]  | [Save] [Download CSV] [Trash]  │
└─────────────────────────────────────────────────────────────────────────┘

Editable Statuses: QUEUE, APPROVED, PICKING, PICK_VERIFIED, DNPB_PROCESS
Readonly Statuses: READY_TO_SHIP, IN_DELIVERY, ARRIVED, COMPLETED

**Guardrails:**
- **Approval Block**: Cannot transition QUEUE → APPROVED if any item has 0 total boxes.
  - Error: "Cannot approve: Found items with 0 quantity..."
  - Fix: User must Edit Qty (>0) or Delete Item.
```

---

## DNPB Matching Flow

### Dual DNPB Validation (v1.2.6+)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DNPB MATCHING FLOWCHART                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│ RO reaches  │
│ DNPB_PROCESS│
│ status      │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Check Warehouse │
│ Allocation      │
└────────┬────────┘
         |
    ┌────┴────────┬────────────┐
    │             │            │
    ▼             ▼            ▼
┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐
│ DDD   │   │ LJBB  │   │ MBB   │   │ UBB   │
│Boxes? │   │Boxes? │   │Boxes? │   │Boxes? │
└───┬───┘   └───┬───┘   └───┬───┘   └───┬───┘
    │             │           │           │
    ▼             ▼           ▼           ▼
┌──────────────────────────────────────────────┐
│ Show DNPB Input Fields (per entity with     │
│ boxes > 0). MBB/UBB included since v2.0.0.  │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ User Enters DNPB Number per entity           │
│ ALL entities with boxes > 0 MUST have DNPB  │
│ numbers before advancing to READY_TO_SHIP    │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│ Per-entity validation against                │
│ supabase_transaksi[Entity] VIEW              │
│ → sets dnpb_match_[entity] = TRUE if found   │
└──────────────────────────────────────────────┘
┌───────┐ ┌───────┐                    ┌───────┐ ┌───────┐
│ YES   │ │ NO    │                    │ YES   │ │ NO    │
│ dnpb_ │ │ dnpb_ │                    │ dnpb_ │ │ dnpb_ │
│ match_│ │ match_│                    │ match_│ │ match_│
│ ddd = │ │ ddd = │                    │ ljbb =│ │ ljbb =│
│ TRUE  │ │ FALSE │                    │ TRUE  │ │ FALSE │
└───────┘ └───────┘                    └───────┘ └───────┘
         │                                      │
         └──────────────┬───────────────────────┘
                        │
                        ▼
               ┌─────────────────┐
               │ Save to DB      │
               │ ro_process:     │
               │ - dnpb_number_  │
               │   {warehouse}   │
               │ - dnpb_match_   │
               │   {warehouse}   │
               └─────────────────┘
```

### Stock Impact of DNPB Match

```
Without DNPB Match (Double Counting Risk):
┌─────────────────────────────────────────────────────────────┐
│ Stock Akhir = Stock Awal + IN - OUT - RO_ongoing           │
│                                                            │
│ Problem: If delivery recorded in BOTH transaksi AND ro_process│
│ → Stock deducted TWICE → WRONG!                            │
└─────────────────────────────────────────────────────────────┘

With DNPB Match (Correct):
┌─────────────────────────────────────────────────────────────┐
│ When dnpb_match = TRUE:                                     │
│ → RO excluded from ro_ongoing calculation                   │
│ → Stock only deducted once (in Transaksi OUT)               │
│ → CORRECT!                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## DNPB Error Resolution Flow

### ⚠️ CRITICAL: Dependency on ro-arrive-app

**zuma-ro-pwa CANNOT move RO to COMPLETED without action from ro-arrive-app!**

**ro-arrive-app** (used by SPG/B store staff) handles:
1. Physical stock counting at store arrival
2. Inputting "fisik" (actual received quantities)
3. Determining if discrepancy exists

**Flow:**
```
ro-arrive-app (SPG/B)              zuma-ro-pwa (AS/WH)
        │                                  │
        │  1. RO arrives at store          │
        │  2. Count physical stock         │
        │  3. Input fisik quantities       │
        │  4. Detect discrepancy?          │
        │─────────────────────────────────▶│
        │                                  │
        │                                  ▼
        │                         ┌──────────────┐
        │                         │ ARRIVED      │
        │                         │ status       │
        │                         └──────┬───────┘
        │                                │
        │◀────────Banding notice─────────│ (if dispute)
        │                                  │
        │                                  ▼
        │                         ┌──────────────┐
        │                         │ COMPLETED    │
        │                         │ (if confirmed)│
        │                         └──────────────┘
```

### Banding vs Confirmed Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 DNPB ERROR RESOLUTION FLOWCHART                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  ⚠️ BLOCKED: RO cannot move to COMPLETED until           │
│     ro-arrive-app user inputs fisik quantities           │
└──────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│ RO arrives  │
│ at store    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│ ro-arrive-app (SPG/B)               │
│ • Count physical stock              │
│ • Input fisik quantities            │
│ • Submit to zuma-ro-pwa             │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ Compare:        │
│ Shipped vs      │
│ Fisik           │
└────────┬────────┘
          │
     ┌────┴────┐
     │         │
     ▼         ▼
┌───────┐ ┌───────┐
│ Match │ │Differs│
└───┬───┘ └───┬───┘
    │         │
    ▼         ▼
┌─────────┐ ┌──────────────────────────────────────────────────────────────┐
│ No DNPB │ │                     DNPB ERROR TAB                          │
│ Error   │ │                                                                  │
│ Status: │ │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│COMPLETED│ │  │   Banding   │    │  Confirmed  │    │   View      │       │
└─────────┘  │  │   (Orange)  │    │   (Green)   │    │   Details   │       │
             │  └──────┬──────┘    └──────┬──────┘    └─────────────┘       │
             │         │                  │                                  │
             │         ▼                  ▼                                  │
             │  ┌─────────────┐    ┌─────────────┐                          │
              │  │ Create      │    │ Update      │                          │
              │  │ ro_banding_ │    │ ro_process  │                          │
              │  │ _notices    │    │ status =    │                          │
              │  │ record      │    │ COMPLETED   │                          │
              │  │ status:     │    │             │                          │
              │  │ PENDING     │    │ Update      │                          │
              │  │             │    │ ro_receipt  │                          │
              │  │ Send notice │    │ status:     │                          │
              │  │ to ro-      │    │ CONFIRMED_  │                          │
              │  │ arrive-app  │    │ DISCREPANCY │                          │
              │  │             │    │             │                          │
              │  │ RO Status:  │    │             │                          │
              │  │ BANDING_SENT│    │ Use fisik   │                          │
              │  │             │    │ quantities  │                          │
              │  │             │    │ as final    │                          │
              │  └─────────────┘    └─────────────┘                          │
             │                                                              │
             └──────────────────────────────────────────────────────────────┘
```

### Banding Notice Data Flow

```
User clicks BANDING
        │
        ▼
┌─────────────────┐
│ POST /api/ro/   │
│ banding         │
│ action: BANDING │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Insert into ro_banding_notices:                          │
│    - ro_id: RO-XXXX                                         │
│    - banding_by: user.id                                    │
│    - banding_at: NOW()                                      │
│    - status: PENDING                                        │
│    - message: "Warehouse confirmed correct quantities..."   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Update ro_process:                                       │
│    - status = BANDING_SENT                                  │
│    - updated_at = NOW()                                     │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ 3. Notify ro-   │
│ arrive-app      │
│ (future)        │
└─────────────────┘
```

### Confirmed Data Flow

```
User clicks CONFIRMED
        │
        ▼
┌─────────────────┐
│ POST /api/ro/   │
│ banding         │
│ action:CONFIRMED│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Fetch ro_receipt data (fisik quantities)                 │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Calculate new box allocations:                           │
│    fisikBoxes = ceil(fisik / pairs_per_box)                 │
│    dddBoxes = fisikBoxes * (original_ddd_ratio)             │
│    ljbbBoxes = fisikBoxes - dddBoxes                        │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Update ro_process:                                       │
│    - status = COMPLETED                                     │
│    - boxes_allocated_ddd = dddBoxes                         │
│    - boxes_allocated_ljbb = ljbbBoxes                       │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Update ro_receipt:                                       │
│    - status = CONFIRMED_DISCREPANCY                         │
│    - confirmed_by = user.id                                 │
│    - confirmed_at = NOW()                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Stock Calculation Flow

### master_mutasi_whs VIEW Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STOCK CALCULATION FLOWCHART                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ supabase_       │     │ supabase_       │     │ ro_process      │
│ stockawal{Ent}  │     │ transkasi{Ent}  │     │ (RO allocations)│
│ (Initial Stock) │     │ (Transactions)  │     │                 │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       │                       │ Filter:
         │                       │                       │ dnpb_match = FALSE
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         master_mutasi_whs VIEW                              │
└─────────────────────────────────────────────────────────────────────────────┘

Per Entity (DDD/LJBB/MBB/UBB):
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   Stock Awal [Entity]  ───────┐                                            │
│   (from stockawal table)      │                                            │
│                               │                                            │
│   + Transaksi IN              │                                            │
│   (sum of "Transaksi in")     │                                            │
│                               ├──────▶  Stock Akhir Calculation            │
│   - Transaksi OUT             │                                            │
│   (sum of "transaksi out")    │                                            │
│                               │                                            │
│   - ro_ongoing_[entity]       │                                            │
│   (from ro_process where      │                                            │
│    dnpb_match = FALSE)        │                                            │
│                               │                                            │
│   = Stock Akhir [Entity]  ◄───┘                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Example Calculation:
┌─────────────────────────────────────────────────────────────────────────────┐
│ Article: B2TS01 (BOYS TOY STORY 1)                                         │
│                                                                             │
│ DDD Entity:                                                                 │
│ - Stock Awal DDD: 100                                                      │
│ - DDD Transaksi IN: 50                                                     │
│ - DDD Transaksi OUT: 30                                                    │
│ - ro_ongoing_ddd: 5  (active ROs without DNPB match)                       │
│                                                                             │
│ Stock Akhir DDD = 100 + 50 - 30 - 5 = 115                                  │
│                                                                             │
│ If an RO gets dnpb_match = TRUE:                                           │
│ - Its allocation is excluded from ro_ongoing                               │
│ - Because the stock movement is already in Transaksi OUT                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### Login & Session Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOWCHART                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│ User visits │
│ any page    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐     ┌─────────────────┐
│ Middleware      │────▶│ Has Session?    │
│ (middleware.ts) │     │ (Cookie Check)  │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
            ┌─────────────┐           ┌─────────────┐
            │ YES         │           │ NO          │
            │ Continue to │           │ Redirect to │
            │ requested   │           │ /login      │
            │ page        │           │             │
            └─────────────┘           └──────┬──────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ Login Page      │
                                    │ (login/page.tsx)│
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ Enter Email/    │
                                    │ Password        │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ POST /auth/     │
                                    │ v1/token        │
                                    │ (Supabase)      │
                                    └────────┬────────┘
                                             │
                                    ┌────────┴────────┐
                                    │                 │
                                    ▼                 ▼
                            ┌─────────────┐   ┌─────────────┐
                            │ Success     │   │ Failure     │
                            │ Set Cookie  │   │ Show Error  │
                            │ Redirect to │   │             │
                            │ original URL│   │             │
                            └──────┬──────┘   └─────────────┘
                                   │
                                   ▼
                            ┌─────────────┐
                            │ All API     │
                            │ routes check│
                            │ auth via    │
                            │ createClient│
                            └─────────────┘
```

---

## Data Flow Diagrams

### API Endpoints Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API ENDPOINTS MAP                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Frontend Components                    API Routes (Next.js)
───────────────────                    ───────────────────

RequestForm.tsx
├─ Get Stores ───────────────────────▶ GET /api/stores
├─ Get Recommendations ──────────────▶ GET /api/ro/recommendations?store_name=X
├─ Search Articles ──────────────────▶ GET /api/articles?q=X&gender=Y
└─ Submit RO ────────────────────────▶ POST /api/ro/submit

ROPage.tsx (Dashboard)
├─ Get Dashboard Stats ──────────────▶ GET /api/ro/dashboard
└─ Get RO Detail ────────────────────▶ GET /api/ro/process?ro_id=X

ROProcess.tsx
├─ Get RO List ──────────────────────▶ GET /api/ro/process
├─ Update Status ────────────────────▶ PATCH /api/ro/status
├─ Update Articles ──────────────────▶ PATCH /api/ro/articles/batch
└─ Update DNPB ──────────────────────▶ PATCH /api/ro/dnpb

DNPBErrorContent.tsx
├─ Get DNPB Errors ──────────────────▶ GET /api/ro/dnpb-error
├─ Send Banding ─────────────────────▶ POST /api/ro/banding (action: BANDING)
└─ Confirm Discrepancy ──────────────▶ POST /api/ro/banding (action: CONFIRMED)

WHStockPage.tsx
└─ Get Dashboard Data ───────────────▶ GET /api/dashboard

SettingsPage.tsx
└─ Logout ───────────────────────────▶ POST /auth/v1/logout (Supabase)
```

### Database Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATABASE RELATIONSHIPS                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   auth.users    │◄────────┤  ro_process     │────────▶│ ro_recommendations│
│  (Supabase)     │  FK     │  (Main RO table)│         │  (Suggestions)  │
└─────────────────┘         └────────┬────────┘         └─────────────────┘
                                     │
                                     │ FK
                                     ▼
                            ┌─────────────────┐
                            │   ro_receipt    │
                            │ (Physical count │
                            │  at arrival)    │
                            └────────┬────────┘
                                     │
                                     │ FK
                                     ▼
                            ┌─────────────────┐
                            │ro_banding_notices│
                            │ (Dispute records)│
                            └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              STOCK TABLES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │supabase_stockawal│    │supabase_transkasi│    │  master_mutasi_ │         │
│  │   DDD/LJBB/MBB  │    │   DDD/LJBB/MBB   │    │     whs VIEW    │         │
│  │  (Initial Stock)│    │  (Transactions)  │    │ (Calculated Stock│         │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘         │
│                                                                             │
│  VIEW combines: stockawal + transaksi - ro_process allocations             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      COMPONENT HIERARCHY                                    │
└─────────────────────────────────────────────────────────────────────────────┘

layout.tsx
└── MainLayout.tsx
    ├── Header (Zuma branding)
    ├── BottomNavigation.tsx (5 tabs)
    │   ├── Home ────────▶ page.tsx (Sales Dashboard)
    │   ├── WH Stock ────▶ WHStockPage.tsx
    │   ├── Action ──────▶ (Placeholder)
    │   ├── RO ──────────▶ ROPage.tsx
    │   │   ├── DashboardContent.tsx (Tab 1)
    │   │   ├── RequestForm.tsx (Tab 2)
    │   │   ├── ROProcess.tsx (Tab 3)
    │   │   └── DNPBErrorContent.tsx (Tab 4)
    │   └── Settings ────▶ SettingsPage.tsx
    └── Toast notifications (sonner)

Modal Components:
- DNPBErrorDetailModal (in DNPBErrorContent.tsx)
- RO Detail Modal (in DashboardContent.tsx)
- Confirmation Dialogs (shadcn/ui)
```

---

## Decision Trees

### "Should I Allow This Action?" Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PERMISSION DECISION TREE                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Can User Edit RO Quantities?
┌─────────────────┐
│ RO Status Check │
└────────┬────────┘
         │
    ┌────┴────────────────────────────────────────┐
    ▼                                             ▼
┌─────────┐  ┌─────────┐  ┌─────────┐       ┌─────────┐
│ QUEUE   │  │APPROVED │  │PICKING  │  ...   │COMPLETED│
│ ✓ YES   │  │ ✓ YES   │  │ ✓ YES   │       │ ✗ NO    │
└─────────┘  └─────────┘  └─────────┘       └─────────┘
Editable: QUEUE, APPROVED, PICKING, PICK_VERIFIED, DNPB_PROCESS
Readonly: READY_TO_SHIP, IN_DELIVERY, ARRIVED, COMPLETED


Can User Cancel RO?
┌─────────────────┐
│ RO Status Check │
└────────┬────────┘
         │
    ┌────┴──────────────────────────────┐
    ▼                                    ▼
┌─────────┐  ┌─────────┐           ┌─────────┐
│ QUEUE   │  │APPROVED │  ...       │COMPLETED│
│ ✓ YES   │  │ ✓ YES   │           │ ✗ NO    │
└─────────┘  └─────────┘           └─────────┘
Can cancel from any status EXCEPT COMPLETED


Can User Input DNPB?
┌─────────────────┐
│ RO Status Check │
└────────┬────────┘
         │
    ┌────┴──────────┐
    ▼               ▼
┌─────────────┐ ┌─────────────┐
│DNPB_PROCESS │ │ Other       │
│ ✓ YES       │ │ ✗ NO        │
└─────────────┘ └─────────────┘
DNPB input only at DNPB_PROCESS stage


Should Show DNPB Input Field?
┌─────────────────┐
│ Check Warehouse │
│ Allocation      │
└────────┬────────┘
         │
    ┌────┴──────────────┐
    │                   │
    ▼                   ▼
┌─────────┐       ┌─────────┐
│Has DDD  │       │Has LJBB │
│Boxes?   │       │Boxes?   │
└────┬────┘       └────┬────┘
     │                 │
  ┌──┴──┐           ┌──┴──┐
  ▼     ▼           ▼     ▼
┌───┐ ┌───┐       ┌───┐ ┌───┐
│YES│ │NO │       │YES│ │NO │
│Show│ │Hide│       │Show│ │Hide│
│DDD│ │DDD│       │LJBB│ │LJBB│
└───┘ └───┘       └───┘ └───┘
```

---

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

API Error
    │
    ▼
┌─────────────────┐
│ Check Error Type│
└────────┬────────┘
         │
    ┌────┴────────────┬───────────────┬───────────────┐
    ▼                 ▼               ▼               ▼
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ 401     │     │ 400     │     │ 404     │     │ 500     │
│ Unauthorized│     │ Bad Req │     │ Not Found│     │ Server  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     ▼               ▼               ▼               ▼
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│Redirect │     │Show     │     │Show     │     │Show     │
│to Login │     │Validation│     │"Not Found"│     │"Error  │
│         │     │Errors   │     │Message  │     │ Occurred"│
└─────────┘     └─────────┘     └─────────┘     └─────────┘
```

---

*This document contains the complete application logic for Zuma RO PWA.*  
*For implementation details, see individual component files.*  
*For database schema, see [DATABASE_LOGIC.md](./DATABASE_LOGIC.md)*  
*For current status, see [PROJECT_STATUS.md](./PROJECT_STATUS.md)*

*Last Updated: 2026-02-05*  
*Version: v1.2.6*
