import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// WH Stock page = Accurate dashboard, HARDCODED to 3 warehouse stores

const WH_STORES = ['Warehouse Pusat', 'Warehouse Pusat Protol', 'Warehouse Pusat Reject'];
const WH_COND = `d.toko IN ('Warehouse Pusat', 'Warehouse Pusat Protol', 'Warehouse Pusat Reject')`;
const WH_TXN_COND = `t.toko IN ('Warehouse Pusat', 'Warehouse Pusat Protol', 'Warehouse Pusat Reject')`;

function parseMulti(sp: URLSearchParams, key: string): string[] {
  const val = sp.get(key);
  if (!val) return [];
  return val.split(',').map((v) => v.trim()).filter(Boolean);
}

function buildMvFilters(
  sp: URLSearchParams,
  vals: unknown[],
  startIdx: number,
  prefix = 'd'
): { conds: string[]; nextIdx: number } {
  const conds: string[] = [];
  let i = startIdx;
  const p = `${prefix}.`;

  // Hardcoded WH filter — always applied first (store param is excluded from user filters)
  conds.push(WH_COND);

  const from = sp.get('from');
  const to = sp.get('to');
  if (from) { conds.push(`${p}sale_date >= $${i++}`); vals.push(from); }
  if (to)   { conds.push(`${p}sale_date <= $${i++}`); vals.push(to); }

  for (const [param, col] of [
    ['branch',   'branch'],
    ['channel',  'store_category'],
    ['series',   'series'],
    ['gender',   'gender'],
    ['tier',     'tier'],
    ['color',    'color'],
    ['tipe',     'tipe'],
    ['version',  'version'],
    ['entity',   'source_entity'],
    ['customer', 'customer'],
  ] as [string, string][]) {
    const fv = parseMulti(sp, param);
    if (!fv.length) continue;
    const phs = fv.map(() => `$${i++}`).join(', ');
    conds.push(`${p}${col} IN (${phs})`);
    vals.push(...fv);
  }

  if (sp.get('excludeNonSku') === '1') {
    conds.push(`${p}is_non_sku = FALSE`);
  }

  const q = sp.get('q');
  if (q) {
    conds.push(`(${p}kode ILIKE $${i} OR ${p}kode_mix ILIKE $${i} OR ${p}kode_besar ILIKE $${i} OR ${p}article ILIKE $${i})`);
    vals.push(`%${q}%`);
    i++;
  }

  return { conds, nextIdx: i };
}

function buildTxnFilters(
  sp: URLSearchParams,
  vals: unknown[],
  startIdx: number,
  prefix = 't'
): { conds: string[]; nextIdx: number } {
  const conds: string[] = [];
  let i = startIdx;
  const p = `${prefix}.`;

  // Hardcoded WH filter
  conds.push(WH_TXN_COND);

  const from = sp.get('from');
  const to = sp.get('to');
  if (from) { conds.push(`${p}sale_date >= $${i++}`); vals.push(from); }
  if (to)   { conds.push(`${p}sale_date <= $${i++}`); vals.push(to); }

  const branch = parseMulti(sp, 'branch');
  if (branch.length) {
    const phs = branch.map(() => `$${i++}`).join(', ');
    conds.push(`${p}branch IN (${phs})`);
    vals.push(...branch);
  }

  const entity = parseMulti(sp, 'entity');
  if (entity.length) {
    const phs = entity.map(() => `$${i++}`).join(', ');
    conds.push(`${p}source_entity IN (${phs})`);
    vals.push(...entity);
  }

  const customer = parseMulti(sp, 'customer');
  if (customer.length) {
    const phs = customer.map(() => `$${i++}`).join(', ');
    conds.push(`${p}customer IN (${phs})`);
    vals.push(...customer);
  }

  return { conds, nextIdx: i };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  try {
    const vals: unknown[] = [];
    const { conds } = buildMvFilters(sp, vals, 1, 'd');
    const where = `WHERE ${conds.join(' AND ')}`;

    const txnVals: unknown[] = [];
    const { conds: txnConds } = buildTxnFilters(sp, txnVals, 1, 't');
    const txnWhere = `WHERE ${txnConds.join(' AND ')}`;

    // Store-level query (hardcoded to WH stores only)
    const storeVals: unknown[] = [];
    const storeD: string[] = [WH_COND];
    const storeT: string[] = [WH_TXN_COND];
    let si = 1;

    const from = sp.get('from');
    const to = sp.get('to');
    if (from) { storeD.push(`d.sale_date >= $${si}`); storeT.push(`t.sale_date >= $${si}`); storeVals.push(from); si++; }
    if (to)   { storeD.push(`d.sale_date <= $${si}`); storeT.push(`t.sale_date <= $${si}`); storeVals.push(to);   si++; }

    const branch = parseMulti(sp, 'branch');
    if (branch.length) {
      const phs = branch.map(() => `$${si++}`).join(', ');
      storeD.push(`d.branch IN (${phs})`); storeT.push(`t.branch IN (${phs})`);
      storeVals.push(...branch);
    }

    const entity = parseMulti(sp, 'entity');
    if (entity.length) {
      const phs = entity.map(() => `$${si++}`).join(', ');
      storeD.push(`d.source_entity IN (${phs})`); storeT.push(`t.source_entity IN (${phs})`);
      storeVals.push(...entity);
    }

    const customer = parseMulti(sp, 'customer');
    if (customer.length) {
      const phs = customer.map(() => `$${si++}`).join(', ');
      storeD.push(`d.customer IN (${phs})`); storeT.push(`t.customer IN (${phs})`);
      storeVals.push(...customer);
    }

    for (const [param, col] of [['series','series'],['gender','gender'],['tier','tier'],['color','color'],['tipe','tipe'],['version','version'],['channel','store_category']] as [string,string][]) {
      const fv = parseMulti(sp, param);
      if (!fv.length) continue;
      const phs = fv.map(() => `$${si++}`).join(', ');
      storeD.push(`d.${col} IN (${phs})`);
      storeVals.push(...fv);
    }

    if (sp.get('excludeNonSku') === '1') {
      storeD.push(`d.is_non_sku = FALSE`);
    }

    const q = sp.get('q');
    if (q) {
      storeD.push(`(d.kode ILIKE $${si} OR d.kode_mix ILIKE $${si} OR d.kode_besar ILIKE $${si} OR d.article ILIKE $${si})`);
      storeVals.push(`%${q}%`);
      si++;
    }

    const storeDWhere = `WHERE ${storeD.join(' AND ')}`;
    const storeTWhere = `WHERE ${storeT.join(' AND ')}`;

    const [
      kpiRes, txnRes, lastUpdateRes, tsRes, storeRes,
      branchRes, seriesRes, genderRes, tierRes,
      tipeRes, sizeRes, priceRes, rankRes,
    ] = await Promise.all([
      pool.query(
        `SELECT SUM(d.revenue) AS revenue, SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}`,
        vals
      ),
      pool.query(
        `SELECT SUM(t.txn_count) AS transactions FROM mart.mv_accurate_txn_agg t ${txnWhere}`,
        txnVals
      ),
      pool.query(`SELECT MAX(sale_date)::TEXT AS last_date FROM mart.mv_accurate_summary WHERE toko IN ('${WH_STORES.join("','")}')`),
      pool.query(
        `SELECT d.sale_date AS period, SUM(d.revenue) AS revenue, SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY 1 ORDER BY 1`,
        vals
      ),
      pool.query(
        `WITH daily_agg AS (
          SELECT d.toko, SUM(d.pairs) AS pairs, SUM(d.revenue) AS revenue, COALESCE(NULLIF(MAX(d.branch), ''), 'Event') AS branch
          FROM mart.mv_accurate_summary d ${storeDWhere}
          GROUP BY d.toko
        ),
        txn_agg AS (
          SELECT t.toko, SUM(t.txn_count) AS transactions
          FROM mart.mv_accurate_txn_agg t ${storeTWhere}
          GROUP BY t.toko
        )
        SELECT a.toko, a.branch, a.pairs, a.revenue,
               COALESCE(x.transactions, 0) AS transactions,
               CASE WHEN COALESCE(x.transactions,0) > 0 THEN a.pairs / x.transactions ELSE 0 END AS atu,
               CASE WHEN a.pairs > 0 THEN a.revenue / a.pairs ELSE 0 END AS asp,
               CASE WHEN COALESCE(x.transactions,0) > 0 THEN a.revenue / x.transactions ELSE 0 END AS atv
        FROM daily_agg a LEFT JOIN txn_agg x ON a.toko = x.toko
        ORDER BY a.revenue DESC`,
        storeVals
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(d.branch, ''), 'Event') AS branch, SUM(d.revenue) AS revenue
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.branch ORDER BY revenue DESC NULLS LAST`,
        vals
      ),
      pool.query(
        `SELECT d.series, SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.series ORDER BY pairs DESC NULLS LAST`,
        vals
      ),
      pool.query(
        `SELECT d.gender, SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.gender ORDER BY pairs DESC NULLS LAST`,
        vals
      ),
      pool.query(
        `SELECT d.tier, SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.tier ORDER BY d.tier ASC NULLS LAST`,
        vals
      ),
      pool.query(
        `SELECT d.tipe, SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.tipe ORDER BY pairs DESC NULLS LAST`,
        vals
      ),
      pool.query(
        `SELECT d.size, SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.size ORDER BY pairs DESC NULLS LAST`,
        vals
      ),
      pool.query(
        `SELECT
           CASE WHEN SUM(d.pairs) > 0 THEN ROUND(SUM(d.revenue) / SUM(d.pairs))
             ELSE 0
           END AS price_bucket,
           SUM(d.pairs) AS pairs
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.kode
         HAVING SUM(d.pairs) > 0
         ORDER BY price_bucket ASC`,
        vals
      ),
      pool.query(
        `SELECT
           d.article,
           d.kode_mix,
           d.gender,
           d.series,
           d.color,
           SUM(d.pairs) AS pairs,
           SUM(d.revenue) AS revenue
         FROM mart.mv_accurate_summary d ${where}
         GROUP BY d.article, d.kode_mix, d.gender, d.series, d.color
         ORDER BY revenue DESC NULLS LAST
         LIMIT 100`,
        vals
      ),
    ]);

    const kpiRow = kpiRes.rows[0] ?? { revenue: 0, pairs: 0 };
    const txnRow = txnRes.rows[0] ?? { transactions: 0 };
    const revenue = Number(kpiRow.revenue || 0);
    const pairs = Number(kpiRow.pairs || 0);
    const transactions = Number(txnRow.transactions || 0);
    const lastUpdate = lastUpdateRes.rows[0]?.last_date || null;
    const kpis = {
      revenue,
      pairs,
      transactions,
      atu: transactions > 0 ? pairs / transactions : 0,
      asp: pairs > 0 ? revenue / pairs : 0,
      atv: transactions > 0 ? revenue / transactions : 0,
    };

    const timeSeries = tsRes.rows.map((r: Record<string, unknown>) => ({
      period: String(r.period).substring(0, 10),
      revenue: Number(r.revenue),
      pairs: Number(r.pairs),
    }));

    const stores = storeRes.rows.map((r: Record<string, unknown>) => ({
      toko: r.toko,
      branch: r.branch,
      pairs: Number(r.pairs),
      revenue: Number(r.revenue),
      transactions: Number(r.transactions),
      atu: Number(r.atu),
      asp: Number(r.asp),
      atv: Number(r.atv),
    }));

    const mapNum = (rows: Record<string, unknown>[], ...keys: string[]) =>
      rows.map((r) => {
        const obj = { ...r };
        for (const k of keys) obj[k] = Number(r[k]);
        return obj;
      });

    const priceBuckets: { label: string; pairs: number }[] = [];
    const bucketRanges = [
      [0, 50000, '0-50K'],
      [50001, 100000, '50-100K'],
      [100001, 150000, '100-150K'],
      [150001, 200000, '150-200K'],
      [200001, 300000, '200-300K'],
      [300001, 500000, '300-500K'],
      [500001, Infinity, '500K+'],
    ] as [number, number, string][];

    for (const [lo, hi, label] of bucketRanges) {
      let sum = 0;
      for (const r of priceRes.rows) {
        const pb = Number(r.price_bucket);
        const p = Number(r.pairs);
        if (pb >= lo && pb <= hi) sum += p;
      }
      if (sum > 0) priceBuckets.push({ label, pairs: sum });
    }

    const body = {
      kpis,
      lastUpdate,
      timeSeries,
      stores,
      byBranch:     mapNum(branchRes.rows, 'revenue'),
      bySeries:     mapNum(seriesRes.rows, 'pairs'),
      byGender:     mapNum(genderRes.rows, 'pairs'),
      byTier:       mapNum(tierRes.rows, 'pairs'),
      byTipe:       mapNum(tipeRes.rows, 'pairs'),
      bySize:       mapNum(sizeRes.rows, 'pairs'),
      byPrice:      priceBuckets,
      rankByArticle: mapNum(rankRes.rows, 'pairs', 'revenue'),
    };

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (e) {
    console.error('wh-stock dashboard error:', e);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
