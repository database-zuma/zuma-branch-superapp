-- Migration: Add boxes_actual_* columns for dual plan/actual picking system
-- Date: 2026-03-11
-- Description: Adds actual quantity columns to ro_process for tracking real picked
--   quantities during PICKING and PICK_VERIFIED phases. Plan values (boxes_allocated_*)
--   remain read-only after upload/confirm. Actual values (boxes_actual_*) are editable
--   during PICKING and PICK_VERIFIED statuses.
--
-- NOTE: This migration was already executed manually on production via SSH.
--   It is kept here for documentation and future environment setup.

SET search_path TO branch_super_app_clawdbot;

-- Add actual quantity columns (default 0, copied from plan when status changes to PICKING)
ALTER TABLE ro_process ADD COLUMN IF NOT EXISTS boxes_actual_ddd INTEGER DEFAULT 0;
ALTER TABLE ro_process ADD COLUMN IF NOT EXISTS boxes_actual_ljbb INTEGER DEFAULT 0;
ALTER TABLE ro_process ADD COLUMN IF NOT EXISTS boxes_actual_mbb INTEGER DEFAULT 0;
ALTER TABLE ro_process ADD COLUMN IF NOT EXISTS boxes_actual_ubb INTEGER DEFAULT 0;

-- Update ro_arrive_detail view to use COALESCE(NULLIF(actual, 0), allocated, 0)
-- This ensures actual values take precedence when non-zero, falling back to plan values.
-- NULLIF is needed because actual defaults to 0 (not NULL), so plain COALESCE would
-- always return 0 instead of falling back to the plan value.
CREATE OR REPLACE VIEW ro_arrive_detail AS
SELECT
  rp.ro_id,
  rp.store_name,
  rp.current_status,
  rp.kode_artikel,
  rp.nama_artikel,
  COALESCE(NULLIF(rp.boxes_actual_ddd, 0), rp.boxes_allocated_ddd, 0) AS boxes_allocated_ddd,
  COALESCE(NULLIF(rp.boxes_actual_ljbb, 0), rp.boxes_allocated_ljbb, 0) AS boxes_allocated_ljbb,
  COALESCE(NULLIF(rp.boxes_actual_mbb, 0), rp.boxes_allocated_mbb, 0) AS boxes_allocated_mbb,
  COALESCE(NULLIF(rp.boxes_actual_ubb, 0), rp.boxes_allocated_ubb, 0) AS boxes_allocated_ubb,
  rp.created_at,
  rp.updated_at
FROM ro_process rp
WHERE rp.current_status IN ('ARRIVED', 'BANDING_SENT', 'COMPLETED');

-- Update sopb_backdata view with same COALESCE pattern
-- Output aliases remain boxes_allocated_* for backward compatibility with SOPB routes
CREATE OR REPLACE VIEW sopb_backdata AS
SELECT
  rp.ro_id,
  rp.store_name,
  rp.current_status,
  rp.kode_artikel,
  rp.nama_artikel,
  COALESCE(NULLIF(rp.boxes_actual_ddd, 0), rp.boxes_allocated_ddd, 0) AS boxes_allocated_ddd,
  COALESCE(NULLIF(rp.boxes_actual_ljbb, 0), rp.boxes_allocated_ljbb, 0) AS boxes_allocated_ljbb,
  COALESCE(NULLIF(rp.boxes_actual_mbb, 0), rp.boxes_allocated_mbb, 0) AS boxes_allocated_mbb,
  COALESCE(NULLIF(rp.boxes_actual_ubb, 0), rp.boxes_allocated_ubb, 0) AS boxes_allocated_ubb,
  rp.created_at,
  rp.updated_at
FROM ro_process rp
WHERE rp.current_status IN ('DNPB_PROCESS', 'READY_TO_SHIP');

-- Update master_mutasi_whs view: ro_totals CTE uses COALESCE for accurate stock tracking
-- (Full view definition omitted here as it was updated via SSH — see 010_add_article_metadata_to_master_mutasi_whs.sql for base structure)

COMMENT ON COLUMN ro_process.boxes_actual_ddd IS 'Actual picked qty for DDD entity. Copied from boxes_allocated_ddd on APPROVED→PICKING transition. Editable during PICKING and PICK_VERIFIED.';
COMMENT ON COLUMN ro_process.boxes_actual_ljbb IS 'Actual picked qty for LJBB entity. Copied from boxes_allocated_ljbb on APPROVED→PICKING transition. Editable during PICKING and PICK_VERIFIED.';
COMMENT ON COLUMN ro_process.boxes_actual_mbb IS 'Actual picked qty for MBB entity. Copied from boxes_allocated_mbb on APPROVED→PICKING transition. Editable during PICKING and PICK_VERIFIED.';
COMMENT ON COLUMN ro_process.boxes_actual_ubb IS 'Actual picked qty for UBB entity. Copied from boxes_allocated_ubb on APPROVED→PICKING transition. Editable during PICKING and PICK_VERIFIED.';
