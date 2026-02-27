-- =============================================================================
-- VPS Migration Phase 1: Schema + Tables + Views + Functions
-- Target: openclaw_ops @ 76.13.194.120
-- Schema: branch_super_app_clawdbot (matching Supabase original)
-- Date: 2026-02-27
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. Create schema
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS branch_super_app_clawdbot;
GRANT USAGE ON SCHEMA branch_super_app_clawdbot TO openclaw_app;

-- =============================================================================
-- 1. External source tables (were Google Sheets imports in Supabase)
--    Empty shells — will be populated separately
-- =============================================================================

-- Stock Awal tables (DDD, LJBB, MBB)
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot."supabase_stockawalDDD" (
    "Kode Artikel" VARCHAR(50),
    "Nama Artikel" VARCHAR(255),
    "Tier" INTEGER,
    "S. AWAL" INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot."supabase_stockawalLJBB" (
    "Kode Artikel" VARCHAR(50),
    "Nama Artikel" VARCHAR(255),
    "Tier" INTEGER,
    "S. AWAL" INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot."supabase_stockawalMBB" (
    "Kode Artikel" VARCHAR(50),
    "Nama Artikel" VARCHAR(255),
    "Tier" INTEGER,
    "S. AWAL" INTEGER DEFAULT 0
);

-- Transaksi tables (DDD, LJBB, MBB, UBB)
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot."supabase_transkasiDDD" (
    "Artikel" VARCHAR(50),
    "Transaksi in" INTEGER DEFAULT 0,
    "transaksi out" INTEGER DEFAULT 0,
    "DNPB" VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot."supabase_transkasiLJBB" (
    "Artikel" VARCHAR(50),
    "Transaksi in" INTEGER DEFAULT 0,
    "transaksi out" INTEGER DEFAULT 0,
    "DNPB" VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot."supabase_transkasiMBB" (
    "Artikel" VARCHAR(50),
    "Transaksi in" INTEGER DEFAULT 0,
    "transaksi out" INTEGER DEFAULT 0,
    "DNPB" VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot."supabase_transkasiUBB" (
    "Artikel" VARCHAR(50),
    "Transaksi in" INTEGER DEFAULT 0,
    "transaksi out" INTEGER DEFAULT 0,
    "DNPB" VARCHAR(100)
);

-- portal_kodemix: Use existing portal.kodemix via a view alias
-- (migration 010 references public.portal_kodemix, we point to portal.kodemix)
CREATE OR REPLACE VIEW public.portal_kodemix AS
SELECT
    kode,
    tipe,
    gender,
    series
FROM portal.kodemix;

-- =============================================================================
-- 2. Core tables (from migration 006)
-- =============================================================================

-- ro_stockwhs - Master warehouse stock
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot.ro_stockwhs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_code VARCHAR(50) NOT NULL UNIQUE,
    article_name VARCHAR(255),
    ddd_stock INTEGER DEFAULT 0,
    ljbb_stock INTEGER DEFAULT 0,
    total_stock INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sync_source VARCHAR(100) DEFAULT 'google_sheets',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_stockwhs_article_code ON branch_super_app_clawdbot.ro_stockwhs(article_code);
CREATE INDEX IF NOT EXISTS idx_ro_stockwhs_last_updated ON branch_super_app_clawdbot.ro_stockwhs(last_updated);

-- Trigger: auto-calculate total_stock
CREATE OR REPLACE FUNCTION branch_super_app_clawdbot.calculate_total_stock()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_stock = COALESCE(NEW.ddd_stock, 0) + COALESCE(NEW.ljbb_stock, 0);
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_total_stock ON branch_super_app_clawdbot.ro_stockwhs;
CREATE TRIGGER trigger_calculate_total_stock
    BEFORE INSERT OR UPDATE ON branch_super_app_clawdbot.ro_stockwhs
    FOR EACH ROW
    EXECUTE FUNCTION branch_super_app_clawdbot.calculate_total_stock();

-- ro_process - Active RO allocations (with all columns from 007, 014, 015)
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot.ro_process (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ro_id VARCHAR(50) NOT NULL,
    article_code VARCHAR(50) NOT NULL,
    article_name VARCHAR(255),
    boxes_requested INTEGER DEFAULT 0,
    boxes_allocated_ddd INTEGER DEFAULT 0,
    boxes_allocated_ljbb INTEGER DEFAULT 0,
    boxes_allocated_mbb INTEGER DEFAULT 0,
    boxes_allocated_ubb INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'QUEUE',
    store_id UUID,
    store_name VARCHAR(255),
    notes TEXT,
    dnpb_number_ddd VARCHAR(100),
    dnpb_number_ljbb VARCHAR(100),
    dnpb_match BOOLEAN DEFAULT FALSE,
    dnpb_match_ddd BOOLEAN DEFAULT FALSE,
    dnpb_match_ljbb BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_process_ro_id ON branch_super_app_clawdbot.ro_process(ro_id);
CREATE INDEX IF NOT EXISTS idx_ro_process_article_code ON branch_super_app_clawdbot.ro_process(article_code);
CREATE INDEX IF NOT EXISTS idx_ro_process_status ON branch_super_app_clawdbot.ro_process(status);
CREATE INDEX IF NOT EXISTS idx_ro_process_article_status ON branch_super_app_clawdbot.ro_process(article_code, status);
CREATE INDEX IF NOT EXISTS idx_ro_process_dnpb_ddd ON branch_super_app_clawdbot.ro_process(dnpb_number_ddd);
CREATE INDEX IF NOT EXISTS idx_ro_process_dnpb_ljbb ON branch_super_app_clawdbot.ro_process(dnpb_number_ljbb);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION branch_super_app_clawdbot.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_ro_process_updated_at ON branch_super_app_clawdbot.ro_process;
CREATE TRIGGER trigger_update_ro_process_updated_at
    BEFORE UPDATE ON branch_super_app_clawdbot.ro_process
    FOR EACH ROW
    EXECUTE FUNCTION branch_super_app_clawdbot.update_updated_at_column();

-- ro_recommendations - Auto-generated suggestions
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot.ro_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_name TEXT,
    article_mix TEXT,
    gender TEXT,
    series TEXT,
    article TEXT,
    tier INTEGER,
    total_recommendation INTEGER DEFAULT 0,
    recommendation_box INTEGER DEFAULT 0,
    kode_kecil INTEGER DEFAULT 0,
    assay_status TEXT,
    broken_sizes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_recommendations_store_name ON branch_super_app_clawdbot.ro_recommendations(store_name);
CREATE INDEX IF NOT EXISTS idx_ro_recommendations_article_mix ON branch_super_app_clawdbot.ro_recommendations(article_mix);

-- ro_id_sequences - For RO ID auto-generation
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot.ro_id_sequences (
    year_month VARCHAR(4) PRIMARY KEY,
    last_sequence INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ro_receipt - Receipt tracking
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot.ro_receipt (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ro_id VARCHAR(50),
    store_name VARCHAR(255),
    dnpb_number VARCHAR(100),
    article_code VARCHAR(50),
    article_name TEXT,
    sku_code VARCHAR(50),
    size VARCHAR(20),
    pairs_per_box INTEGER,
    pairs_shipped INTEGER,
    fisik INTEGER,
    selisih INTEGER,
    notes TEXT,
    status VARCHAR(50),
    confirmed_by UUID,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    is_confirmed BOOLEAN DEFAULT FALSE,
    boxes_ddd INTEGER DEFAULT 0,
    boxes_ljbb INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_receipt_ro_id ON branch_super_app_clawdbot.ro_receipt(ro_id);

-- ro_banding_notices - Banding notices (FK to auth.users removed for VPS)
CREATE TABLE IF NOT EXISTS branch_super_app_clawdbot.ro_banding_notices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ro_id VARCHAR(50) NOT NULL,
    banding_by UUID,
    banding_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'PENDING',
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ro_banding_notices_ro_id ON branch_super_app_clawdbot.ro_banding_notices(ro_id);
CREATE INDEX IF NOT EXISTS idx_ro_banding_notices_status ON branch_super_app_clawdbot.ro_banding_notices(status);

-- =============================================================================
-- 3. Functions
-- =============================================================================

-- generate_ro_id: RO-YYMM-XXXX format
CREATE OR REPLACE FUNCTION branch_super_app_clawdbot.generate_ro_id()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year_month VARCHAR(4);
    v_next_seq INTEGER;
    v_ro_id VARCHAR(50);
BEGIN
    v_year_month := TO_CHAR(NOW(), 'YYMM');
    INSERT INTO branch_super_app_clawdbot.ro_id_sequences (year_month, last_sequence)
    VALUES (v_year_month, 1)
    ON CONFLICT (year_month)
    DO UPDATE SET
        last_sequence = branch_super_app_clawdbot.ro_id_sequences.last_sequence + 1,
        updated_at = NOW()
    RETURNING last_sequence INTO v_next_seq;
    v_ro_id := 'RO-' || v_year_month || '-' || LPAD(v_next_seq::TEXT, 4, '0');
    RETURN v_ro_id;
END;
$$ LANGUAGE plpgsql;

-- auto_generate_ro_id: Trigger for ro_process
CREATE OR REPLACE FUNCTION branch_super_app_clawdbot.auto_generate_ro_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ro_id IS NULL OR NEW.ro_id = '' THEN
        NEW.ro_id := branch_super_app_clawdbot.generate_ro_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_ro_id ON branch_super_app_clawdbot.ro_process;
CREATE TRIGGER trigger_auto_generate_ro_id
    BEFORE INSERT ON branch_super_app_clawdbot.ro_process
    FOR EACH ROW
    EXECUTE FUNCTION branch_super_app_clawdbot.auto_generate_ro_id();

-- get_dnpb_error_ro_list
CREATE OR REPLACE FUNCTION branch_super_app_clawdbot.get_dnpb_error_ro_list()
RETURNS TABLE (
    ro_id VARCHAR,
    store_name VARCHAR,
    dnpb_number VARCHAR,
    total_items BIGINT,
    total_selisih BIGINT,
    confirmed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.ro_id,
        r.store_name,
        r.dnpb_number,
        COUNT(DISTINCT r.article_code)::BIGINT as total_items,
        COALESCE(SUM(r.selisih), 0)::BIGINT as total_selisih,
        MAX(r.received_at) as confirmed_at
    FROM branch_super_app_clawdbot.ro_receipt r
    WHERE r.is_confirmed = true
    GROUP BY r.ro_id, r.store_name, r.dnpb_number
    ORDER BY MAX(r.received_at) DESC;
END;
$$ LANGUAGE plpgsql;

-- get_confirmed_ro_list (public schema, used by dnpb-error route)
CREATE OR REPLACE FUNCTION public.get_confirmed_ro_list()
RETURNS TABLE(
    ro_id character varying,
    store_name character varying,
    dnpb_number character varying,
    article_code character varying,
    article_name text,
    total_items bigint,
    total_selisih bigint,
    confirmed_at timestamp with time zone
)
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT
    r.ro_id,
    r.store_name,
    r.dnpb_number,
    MAX(r.article_code) as article_code,
    MAX(r.article_name) as article_name,
    COUNT(*) as total_items,
    SUM(r.selisih) as total_selisih,
    MAX(r.received_at) as confirmed_at
  FROM branch_super_app_clawdbot.ro_receipt r
  WHERE r.received_at IS NOT NULL
  GROUP BY r.ro_id, r.store_name, r.dnpb_number
  ORDER BY MAX(r.received_at) DESC;
$function$;

-- =============================================================================
-- 4. Views
-- =============================================================================

-- ro_whs_readystock (VIEW, not table — migration 007_convert)
CREATE OR REPLACE VIEW branch_super_app_clawdbot.ro_whs_readystock AS
SELECT
    s.article_code,
    s.article_name,
    GREATEST(0,
        COALESCE(s.ddd_stock, 0) -
        COALESCE(SUM(CASE
            WHEN p.status IN ('QUEUE', 'PROCESSING', 'DELIVERY', 'COMPLETE')
            THEN p.boxes_allocated_ddd
            ELSE 0
        END), 0)
    ) AS ddd_available,
    GREATEST(0,
        COALESCE(s.ljbb_stock, 0) -
        COALESCE(SUM(CASE
            WHEN p.status IN ('QUEUE', 'PROCESSING', 'DELIVERY', 'COMPLETE')
            THEN p.boxes_allocated_ljbb
            ELSE 0
        END), 0)
    ) AS ljbb_available,
    GREATEST(0,
        COALESCE(s.total_stock, 0) -
        COALESCE(SUM(CASE
            WHEN p.status IN ('QUEUE', 'PROCESSING', 'DELIVERY', 'COMPLETE')
            THEN (p.boxes_allocated_ddd + p.boxes_allocated_ljbb)
            ELSE 0
        END), 0)
    ) AS total_available,
    NOW() AS last_calculated
FROM branch_super_app_clawdbot.ro_stockwhs s
LEFT JOIN branch_super_app_clawdbot.ro_process p ON s.article_code = p.article_code
GROUP BY
    s.article_code,
    s.article_name,
    s.ddd_stock,
    s.ljbb_stock,
    s.total_stock;

-- master_mutasi_whs (latest version from migration 010 with article metadata)
CREATE OR REPLACE VIEW branch_super_app_clawdbot.master_mutasi_whs AS
WITH ddd_manual AS (
    SELECT "Artikel",
        sum(COALESCE("Transaksi in", 0)) AS in_qty,
        sum(COALESCE("transaksi out", 0)) AS out_qty
    FROM branch_super_app_clawdbot."supabase_transkasiDDD"
    GROUP BY "Artikel"
), ljbb_manual AS (
    SELECT "Artikel",
        sum(COALESCE("Transaksi in", 0)) AS in_qty,
        sum(COALESCE("transaksi out", 0)) AS out_qty
    FROM branch_super_app_clawdbot."supabase_transkasiLJBB"
    GROUP BY "Artikel"
), mbb_manual AS (
    SELECT "Artikel",
        sum(COALESCE("Transaksi in", 0)) AS in_qty,
        sum(COALESCE("transaksi out", 0)) AS out_qty
    FROM branch_super_app_clawdbot."supabase_transkasiMBB"
    GROUP BY "Artikel"
), ro_totals AS (
    SELECT article_code,
        sum(CASE WHEN COALESCE(dnpb_match, FALSE) = FALSE THEN COALESCE(boxes_allocated_ddd, 0) ELSE 0 END) AS ro_ongoing_ddd,
        sum(CASE WHEN COALESCE(dnpb_match, FALSE) = FALSE THEN COALESCE(boxes_allocated_ljbb, 0) ELSE 0 END) AS ro_ongoing_ljbb,
        sum(CASE WHEN COALESCE(dnpb_match, FALSE) = FALSE THEN COALESCE(boxes_allocated_mbb, 0) ELSE 0 END) AS ro_ongoing_mbb,
        sum(CASE WHEN COALESCE(dnpb_match, FALSE) = FALSE THEN COALESCE(boxes_allocated_ubb, 0) ELSE 0 END) AS ro_ongoing_ubb
    FROM branch_super_app_clawdbot.ro_process
    GROUP BY article_code
), master_base AS (
    SELECT 'DDD'::text AS "Entitas", "Kode Artikel", "Nama Artikel", "Tier", "S. AWAL"
    FROM branch_super_app_clawdbot."supabase_stockawalDDD"
    UNION ALL
    SELECT 'LJBB'::text AS "Entitas", "Kode Artikel", "Nama Artikel", "Tier", "S. AWAL"
    FROM branch_super_app_clawdbot."supabase_stockawalLJBB"
    UNION ALL
    SELECT 'MBB'::text AS "Entitas", "Kode Artikel", "Nama Artikel", "Tier", "S. AWAL"
    FROM branch_super_app_clawdbot."supabase_stockawalMBB"
)
SELECT b."Entitas",
    b."Kode Artikel",
    b."Nama Artikel",
    b."Tier",
    pk.tipe,
    pk.gender,
    pk.series,
    CASE WHEN b."Entitas" = 'DDD' THEN b."S. AWAL" ELSE 0 END AS "Stock Awal DDD",
    CASE WHEN b."Entitas" = 'LJBB' THEN b."S. AWAL" ELSE 0 END AS "Stock Awal LJBB",
    CASE WHEN b."Entitas" = 'MBB' THEN b."S. AWAL" ELSE 0 END AS "Stock Awal MBB",
    0 AS "Stock Awal UBB",
    CASE WHEN b."Entitas" = 'DDD' THEN COALESCE(dt.in_qty, 0) ELSE 0 END AS "DDD Transaksi IN",
    CASE WHEN b."Entitas" = 'DDD' THEN COALESCE(dt.out_qty, 0) ELSE 0 END AS "DDD Transaksi OUT",
    CASE WHEN b."Entitas" = 'DDD' THEN COALESCE(ro.ro_ongoing_ddd, 0) ELSE 0 END AS "ro_ongoing_ddd",
    CASE WHEN b."Entitas" = 'LJBB' THEN COALESCE(lt.in_qty, 0) ELSE 0 END AS "LJBB Transaksi IN",
    CASE WHEN b."Entitas" = 'LJBB' THEN COALESCE(lt.out_qty, 0) ELSE 0 END AS "LJBB Transaksi OUT",
    CASE WHEN b."Entitas" = 'LJBB' THEN COALESCE(ro.ro_ongoing_ljbb, 0) ELSE 0 END AS "ro_ongoing_ljbb",
    CASE WHEN b."Entitas" = 'MBB' THEN COALESCE(mt.in_qty, 0) ELSE 0 END AS "MBB Transaksi IN",
    CASE WHEN b."Entitas" = 'MBB' THEN COALESCE(mt.out_qty, 0) ELSE 0 END AS "MBB Transaksi OUT",
    CASE WHEN b."Entitas" = 'MBB' THEN COALESCE(ro.ro_ongoing_mbb, 0) ELSE 0 END AS "ro_ongoing_mbb",
    0 AS "UBB Transaksi IN",
    0 AS "UBB Transaksi OUT",
    COALESCE(ro.ro_ongoing_ubb, 0) AS "ro_ongoing_ubb",
    CASE WHEN b."Entitas" = 'DDD' THEN COALESCE(dt.in_qty, 0) - COALESCE(dt.out_qty, 0) - COALESCE(ro.ro_ongoing_ddd, 0) ELSE 0 END AS "Stock Akhir DDD",
    CASE WHEN b."Entitas" = 'LJBB' THEN COALESCE(lt.in_qty, 0) - COALESCE(lt.out_qty, 0) - COALESCE(ro.ro_ongoing_ljbb, 0) ELSE 0 END AS "Stock Akhir LJBB",
    CASE WHEN b."Entitas" = 'MBB' THEN COALESCE(mt.in_qty, 0) - COALESCE(mt.out_qty, 0) - COALESCE(ro.ro_ongoing_mbb, 0) ELSE 0 END AS "Stock Akhir MBB",
    0 - COALESCE(ro.ro_ongoing_ubb, 0) AS "Stock Akhir UBB",
    b."S. AWAL" AS "Stock Awal Total",
    CASE WHEN b."Entitas" = 'DDD' THEN COALESCE(dt.in_qty, 0)
         WHEN b."Entitas" = 'LJBB' THEN COALESCE(lt.in_qty, 0)
         WHEN b."Entitas" = 'MBB' THEN COALESCE(mt.in_qty, 0)
         ELSE 0 END AS "Transaksi IN Total",
    CASE WHEN b."Entitas" = 'DDD' THEN COALESCE(dt.out_qty, 0)
         WHEN b."Entitas" = 'LJBB' THEN COALESCE(lt.out_qty, 0)
         WHEN b."Entitas" = 'MBB' THEN COALESCE(mt.out_qty, 0)
         ELSE 0 END AS "Transaksi OUT Total",
    COALESCE(ro.ro_ongoing_ddd, 0) + COALESCE(ro.ro_ongoing_ljbb, 0) + COALESCE(ro.ro_ongoing_mbb, 0) + COALESCE(ro.ro_ongoing_ubb, 0) AS "ro_ongoing_total",
    CASE WHEN b."Entitas" = 'DDD' THEN COALESCE(dt.in_qty, 0) - COALESCE(dt.out_qty, 0) - COALESCE(ro.ro_ongoing_ddd, 0)
         WHEN b."Entitas" = 'LJBB' THEN COALESCE(lt.in_qty, 0) - COALESCE(lt.out_qty, 0) - COALESCE(ro.ro_ongoing_ljbb, 0)
         WHEN b."Entitas" = 'MBB' THEN COALESCE(mt.in_qty, 0) - COALESCE(mt.out_qty, 0) - COALESCE(ro.ro_ongoing_mbb, 0)
         ELSE 0 - COALESCE(ro.ro_ongoing_ubb, 0) END AS "Stock Akhir Total"
FROM master_base b
LEFT JOIN ddd_manual dt ON b."Kode Artikel"::text = dt."Artikel"::text AND b."Entitas" = 'DDD'
LEFT JOIN ljbb_manual lt ON b."Kode Artikel"::text = lt."Artikel"::text AND b."Entitas" = 'LJBB'
LEFT JOIN mbb_manual mt ON b."Kode Artikel"::text = mt."Artikel"::text AND b."Entitas" = 'MBB'
LEFT JOIN ro_totals ro ON b."Kode Artikel"::text = ro.article_code::text
LEFT JOIN (
    SELECT DISTINCT ON (kode) kode, tipe, gender, series
    FROM public.portal_kodemix
    ORDER BY kode
) pk ON b."Kode Artikel"::text = pk.kode::text;

-- =============================================================================
-- 5. Comments
-- =============================================================================
COMMENT ON SCHEMA branch_super_app_clawdbot IS 'Zuma RO PWA - warehouse RO management (migrated from Supabase 2026-02-27)';
COMMENT ON TABLE branch_super_app_clawdbot.ro_stockwhs IS 'Master warehouse stock data (DDD/LJBB)';
COMMENT ON TABLE branch_super_app_clawdbot.ro_process IS 'Active RO allocations with status tracking';
COMMENT ON TABLE branch_super_app_clawdbot.ro_recommendations IS 'Auto-generated RO recommendations per store';
COMMENT ON TABLE branch_super_app_clawdbot.ro_id_sequences IS 'Tracks RO ID sequences per month (YYMM)';
COMMENT ON TABLE branch_super_app_clawdbot.ro_receipt IS 'Receipt tracking with discrepancy (selisih) records';
COMMENT ON TABLE branch_super_app_clawdbot.ro_banding_notices IS 'Banding notices for disputed receipts';
COMMENT ON VIEW branch_super_app_clawdbot.ro_whs_readystock IS 'Dynamic VIEW: available stock = ro_stockwhs - active ro_process allocations';
COMMENT ON VIEW branch_super_app_clawdbot.master_mutasi_whs IS 'Master warehouse stock view with RO ongoing allocations and article metadata';

-- =============================================================================
-- 6. Permissions
-- =============================================================================
GRANT ALL ON ALL TABLES IN SCHEMA branch_super_app_clawdbot TO openclaw_app;
GRANT ALL ON ALL SEQUENCES IN SCHEMA branch_super_app_clawdbot TO openclaw_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA branch_super_app_clawdbot TO openclaw_app;

COMMIT;
