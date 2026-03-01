import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// WH Stock page = Stock dashboard (core.dashboard_cache)
// HARDCODED to 3 warehouse gudangs: Warehouse Pusat, Warehouse Pusat Protol, Warehouse Pusat Reject

const WH_GUDANGS = ['Warehouse Pusat', 'Warehouse Pusat Protol', 'Warehouse Pusat Reject'];

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(',').map((v) => v.trim()).filter(Boolean);
}

function buildWhere(sp: URLSearchParams): { clause: string; values: unknown[] } {
  const conds: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  // Exclude non-product items
  conds.push("kode_besar !~ '^(gwp|hanger|paperbag|shopbag)'");

  // Hardcoded WH gudang filter
  conds.push(`nama_gudang IN ('${WH_GUDANGS.join("','")}')`);

  const addFilter = (col: string, values: string[]) => {
    if (values.length === 0) return;
    if (values.length === 1) {
      conds.push(`${col} = $${i++}`);
      vals.push(values[0]);
    } else {
      const phs = values.map(() => `$${i++}`).join(', ');
      conds.push(`${col} IN (${phs})`);
      vals.push(...values);
    }
  };

  addFilter('gender_group', parseMulti(sp, 'gender'));
  addFilter('series',       parseMulti(sp, 'series'));
  addFilter('group_warna',  parseMulti(sp, 'color'));
  addFilter('tier',         parseMulti(sp, 'tier'));
  addFilter('ukuran',       parseMulti(sp, 'size'));
  addFilter('tipe',         parseMulti(sp, 'tipe'));
  addFilter('v',            parseMulti(sp, 'v'));
  addFilter('source_entity', parseMulti(sp, 'entitas'));

  const q = sp.get('q');
  if (q) {
    conds.push(`(kode_besar ILIKE $${i} OR kode ILIKE $${i})`);
    vals.push(`%${q}%`);
    i++;
  }

  return {
    clause: conds.length ? 'WHERE ' + conds.join(' AND ') : '',
    values: vals,
  };
}

export async function GET(req: NextRequest) {
  const { clause, values } = buildWhere(req.nextUrl.searchParams);

  const sql = `
    WITH base AS (SELECT * FROM core.dashboard_cache ${clause}),
    kpis AS (
      SELECT SUM(pairs)                                              AS total_pairs,
             COUNT(DISTINCT kode_mix)                              AS unique_articles,
             SUM(CASE WHEN tier IN ('4','5') THEN pairs ELSE 0 END) AS dead_stock_pairs,
             SUM(est_rsp)                                           AS est_rsp_value,
             MAX(snapshot_date)                                     AS snapshot_date
      FROM base
    ),
    by_warehouse AS (
      SELECT
        nama_gudang,
        gender_group,
        SUM(pairs) AS pairs
      FROM base
      GROUP BY nama_gudang, gender_group
    ),
    by_tipe AS (
      SELECT tipe, SUM(pairs) AS pairs
      FROM base WHERE tipe IS NOT NULL GROUP BY tipe
    ),
    by_tier AS (
      SELECT tier, SUM(pairs) AS pairs, COUNT(DISTINCT kode_mix) AS articles
      FROM base GROUP BY tier
    ),
    by_size AS (
      SELECT ukuran, SUM(pairs) AS pairs
      FROM base
      WHERE ukuran IS NOT NULL AND ukuran != ''
      GROUP BY ukuran
      ORDER BY
        CASE
          WHEN ukuran ~ '^[0-9]+$'       THEN ukuran::int
          WHEN ukuran ~ '^[0-9]+/[0-9]+$' THEN split_part(ukuran,'/',1)::int
          ELSE 999
        END ASC,
        ukuran ASC
    ),
    by_series AS (
      SELECT series, SUM(pairs) AS pairs
      FROM base WHERE series IS NOT NULL
      GROUP BY series ORDER BY pairs DESC
    ),
    top_articles AS (
      SELECT kode_besar, article, SUM(pairs) AS pairs
      FROM base
      GROUP BY kode_besar, article
      ORDER BY pairs DESC LIMIT 15
    )
    SELECT
      (SELECT row_to_json(k)         FROM kpis k)       AS kpis,
      (SELECT json_agg(w)            FROM by_warehouse w) AS by_warehouse,
      (SELECT json_agg(tp)           FROM by_tipe tp)    AS by_tipe,
      (SELECT json_agg(t)            FROM by_tier t)     AS by_tier,
      (SELECT json_agg(s ORDER BY
        CASE
          WHEN s.ukuran ~ '^[0-9]+$'        THEN s.ukuran::int
          WHEN s.ukuran ~ '^[0-9]+/[0-9]+$' THEN split_part(s.ukuran,'/',1)::int
          ELSE 999
        END ASC, s.ukuran ASC)
       FROM by_size s)                                   AS by_size,
      (SELECT json_agg(sr ORDER BY sr.pairs DESC)
       FROM by_series sr)                                 AS by_series,
      (SELECT json_agg(ta ORDER BY ta.pairs DESC)
       FROM top_articles ta)                              AS top_articles
  `;

  try {
    const { rows } = await pool.query(sql, values as string[]);
    const r = rows[0];
    const k = r.kpis as Record<string, unknown>;
    const body = {
      kpis: {
        total_pairs:      Number(k?.total_pairs)      || 0,
        unique_articles:  Number(k?.unique_articles)  || 0,
        dead_stock_pairs: Number(k?.dead_stock_pairs) || 0,
        est_rsp_value:    Number(k?.est_rsp_value)    || 0,
        snapshot_date:    k?.snapshot_date ?? null,
      },
      by_warehouse: (r.by_warehouse || []).map((b: Record<string, unknown>) => ({
        nama_gudang: b.nama_gudang, gender_group: b.gender_group, pairs: Number(b.pairs),
      })),
      by_tipe: (r.by_tipe || []).map((tp: Record<string, unknown>) => ({
        tipe: tp.tipe, pairs: Number(tp.pairs),
      })),
      by_tier: (r.by_tier || []).map((t: Record<string, unknown>) => ({
        tier: t.tier, pairs: Number(t.pairs), articles: Number(t.articles),
      })),
      by_size: (r.by_size || []).map((s: Record<string, unknown>) => ({
        ukuran: s.ukuran, pairs: Number(s.pairs),
      })),
      by_series: (r.by_series || []).map((s: Record<string, unknown>) => ({
        series: s.series, pairs: Number(s.pairs),
      })),
      top_articles: (r.top_articles || []).map((a: Record<string, unknown>) => ({
        kode_besar: a.kode_besar, article: a.article, pairs: Number(a.pairs),
      })),
    };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('wh-stock dashboard error:', e);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
