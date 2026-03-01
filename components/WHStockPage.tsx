'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { cn } from '@/lib/utils';
import {
  TrendingUp, Users, ShoppingBag, Package,
  ArrowUpDown, ChevronLeft, ChevronRight, Search, X, SlidersHorizontal,
} from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// ─── Types ──────────────────────────────────────────────────────────────────
interface KpiData {
  revenue: number; pairs: number; transactions: number;
  atu: number; asp: number; atv: number;
}

interface StoreRow {
  toko: string; branch: string; pairs: number; revenue: number;
  transactions: number; atu: number; asp: number; atv: number;
}

interface TimePoint {
  period: string; revenue: number; pairs: number;
}

interface DashboardData {
  kpis: KpiData;
  lastUpdate: string | null;
  timeSeries: TimePoint[];
  stores: StoreRow[];
  byBranch: { branch: string; revenue: number }[];
  bySeries: { series: string; pairs: number }[];
  byGender: { gender: string; pairs: number }[];
  byTier: { tier: string; pairs: number }[];
  byTipe: { tipe: string; pairs: number }[];
  bySize: { size: string; pairs: number }[];
  byPrice: { label: string; pairs: number }[];
  rankByArticle: unknown[];
}

interface FilterOptions {
  branches: string[];
  channels: string[];
  genders: string[];
  series: string[];
  colors: string[];
  tiers: string[];
  tipes: string[];
  versions: string[];
  entities: string[];
  customers: string[];
}

interface Filters {
  from: string;
  to: string;
  branch: string;
  entity: string;
  customer: string;
  channel: string;
  gender: string;
  series: string;
  color: string;
  tier: string;
  tipe: string;
  version: string;
  excludeNonSku: boolean;
  q: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${Math.round(n).toLocaleString('en-US')}`;
}

function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.branch) p.set('branch', f.branch);
  if (f.entity) p.set('entity', f.entity);
  if (f.customer) p.set('customer', f.customer);
  if (f.channel) p.set('channel', f.channel);
  if (f.gender) p.set('gender', f.gender);
  if (f.series) p.set('series', f.series);
  if (f.color) p.set('color', f.color);
  if (f.tier) p.set('tier', f.tier);
  if (f.tipe) p.set('tipe', f.tipe);
  if (f.version) p.set('version', f.version);
  if (f.excludeNonSku) p.set('excludeNonSku', '1');
  if (f.q) p.set('q', f.q);
  return p.toString();
}

function defaultFilters(): Filters {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return {
    from: `${y}-${m}-01`,
    to: now.toISOString().substring(0, 10),
    branch: '', entity: '', customer: '', channel: '',
    gender: '', series: '', color: '', tier: '', tipe: '', version: '',
    excludeNonSku: false, q: '',
  };
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────
function KpiCards({ kpis, loading }: { kpis?: KpiData; loading?: boolean }) {
  const cards = [
    { label: 'Revenue', value: kpis ? fmtRp(kpis.revenue) : '—', icon: TrendingUp },
    { label: 'Pairs Sold', value: kpis ? Math.round(kpis.pairs).toLocaleString('en-US') : '—', icon: Package },
    { label: 'Transactions', value: kpis ? Math.round(kpis.transactions).toLocaleString('en-US') : '—', icon: ShoppingBag },
    { label: 'ATU', value: kpis ? kpis.atu.toFixed(1) : '—', icon: Users },
    { label: 'ASP', value: kpis ? fmtRp(kpis.asp) : '—', icon: TrendingUp },
    { label: 'ATV', value: kpis ? fmtRp(kpis.atv) : '—', icon: TrendingUp },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          {loading ? (
            <div className="space-y-1">
              <div className="h-3 w-16 bg-gray-100 animate-pulse rounded" />
              <div className="h-5 w-24 bg-gray-100 animate-pulse rounded" />
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{value}</p>
              </div>
              <div className="p-1.5 bg-[#00D084]/10 rounded-lg">
                <Icon className="w-3.5 h-3.5 text-[#0D3B2E]" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Period Chart ─────────────────────────────────────────────────────────────
function PeriodChart({ data, loading }: { data?: TimePoint[]; loading?: boolean }) {
  const labels = data?.map(d => d.period) ?? [];
  const chartData = {
    labels,
    datasets: [
      { label: 'Revenue (Rp juta)', data: data?.map(d => d.revenue / 1_000_000) ?? [],
        backgroundColor: '#00D084', borderRadius: 1, yAxisID: 'y' },
      { label: 'Pairs Sold', data: data?.map(d => d.pairs) ?? [],
        backgroundColor: '#0D3B2E', borderRadius: 1, yAxisID: 'y1' },
    ],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'rect' as const } },
      tooltip: { callbacks: { label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
        const y = ctx.parsed.y ?? 0;
        if (ctx.dataset.label?.includes('Revenue')) return `Revenue: Rp ${(y * 1_000_000).toLocaleString('en-US')}`;
        return `Pairs: ${y.toLocaleString('en-US')}`;
      }}},
    },
    scales: {
      x: { ticks: { font: { size: 9 } }, grid: { display: false } },
      y:  { type: 'linear' as const, position: 'left'  as const, ticks: { font: { size: 9 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
      y1: { type: 'linear' as const, position: 'right' as const, ticks: { font: { size: 9 } }, grid: { drawOnChartArea: false } },
    },
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-[10px] font-bold text-gray-700 uppercase tracking-[0.15em] mb-3">Sales Over Time</h3>
      <div className="h-52 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-[#00D084] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Bar data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}

// ─── Store Table ──────────────────────────────────────────────────────────────
const ROWS_PER_PAGE = 10;
type SortKey = keyof StoreRow;

function StoreTable({ stores, loading }: { stores?: StoreRow[]; loading?: boolean }) {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => { setPage(1); }, [stores]);

  const sorted = [...(stores ?? [])].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / ROWS_PER_PAGE);
  const current = sorted.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'toko' || key === 'branch' ? 'asc' : 'desc'); }
    setPage(1);
  };

  const thBase = 'px-3 py-2.5 text-[9px] font-bold text-gray-400 uppercase tracking-[0.12em] cursor-pointer select-none hover:text-gray-700 transition-colors';
  const si = (key: SortKey) => (
    <span className="ml-1">
      {key === sortKey
        ? <ArrowUpDown className={cn('inline w-3 h-3', sortDir === 'asc' ? 'text-[#00D084]' : 'text-[#0D3B2E]')} />
        : <ArrowUpDown className="inline w-3 h-3 opacity-20" />
      }
    </span>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-gray-700 uppercase tracking-[0.15em]">Warehouse Performance</h3>
        {!loading && sorted.length > 0 && (
          <span className="text-[10px] text-gray-400">{sorted.length} stores</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-center px-2 py-2.5 text-[9px] font-bold text-gray-400 uppercase w-8">#</th>
              <th className={`text-left ${thBase}`} onClick={() => handleSort('toko')}>Store{si('toko')}</th>
              <th className={`text-right ${thBase}`} onClick={() => handleSort('pairs')}>Qty{si('pairs')}</th>
              <th className={`text-right ${thBase}`} onClick={() => handleSort('revenue')}>Revenue{si('revenue')}</th>
              <th className={`text-right ${thBase}`} onClick={() => handleSort('transactions')}>Txn{si('transactions')}</th>
              <th className={`text-right ${thBase}`} onClick={() => handleSort('atu')}>ATU{si('atu')}</th>
              <th className={`text-right ${thBase}`} onClick={() => handleSort('asp')}>ASP{si('asp')}</th>
              <th className={`text-right ${thBase}`} onClick={() => handleSort('atv')}>ATV{si('atv')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }, (_, i) => (
                <tr key={`sk-${String(i)}`} className="border-b border-gray-50">
                  {Array.from({ length: 8 }, (_, j) => (
                    <td key={String(j)} className="px-3 py-2.5">
                      <div className="h-3 bg-gray-100 animate-pulse rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : current.length ? (
              current.map((s, idx) => {
                const rank = (page - 1) * ROWS_PER_PAGE + idx + 1;
                return (
                  <tr key={s.toko} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-2 py-2.5 text-center tabular-nums text-gray-400 font-medium">{rank}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[180px] truncate">{s.toko}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(s.pairs).toLocaleString('en-US')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtRp(s.revenue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{s.transactions.toLocaleString('en-US')}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{s.atu.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{fmtRp(s.asp)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">{fmtRp(s.atv)}</td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400 text-xs">No data</td></tr>
            )}
          </tbody>
          {!loading && stores && stores.length > 0 && (() => {
            const tQty = stores.reduce((s, r) => s + r.pairs, 0);
            const tRev = stores.reduce((s, r) => s + r.revenue, 0);
            const tTxn = stores.reduce((s, r) => s + r.transactions, 0);
            return (
              <tfoot>
                <tr className="border-t-2 border-[#00D084]/30 bg-gray-50">
                  <td className="px-2 py-2.5 text-center text-[9px] font-bold text-gray-700" colSpan={2}>TOTAL</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-gray-900">{Math.round(tQty).toLocaleString('en-US')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-gray-900">{fmtRp(tRev)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-gray-900">{tTxn.toLocaleString('en-US')}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-gray-400">{tTxn > 0 ? (tQty / tTxn).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-gray-400">{fmtRp(tQty > 0 ? tRev / tQty : 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs font-bold text-gray-400">{fmtRp(tTxn > 0 ? tRev / tTxn : 0)}</td>
                </tr>
              </tfoot>
            );
          })()}
        </table>
      </div>
      {totalPages > 1 && (
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
          <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft className="w-3 h-3" /> Prev
          </button>
          <span className="text-[10px] text-gray-400">Page {page} of {totalPages}</span>
          <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-semibold rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({ filters, options, onChange }: {
  filters: Filters;
  options: FilterOptions;
  onChange: (updates: Partial<Filters>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const inputClass = 'border border-gray-200 rounded-lg text-xs px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#00D084] focus:border-[#00D084]';
  const selectClass = `${inputClass} min-w-[90px]`;

  const activeCount = [filters.branch, filters.entity, filters.customer, filters.channel, filters.gender, filters.series, filters.color, filters.tier, filters.tipe, filters.version]
    .filter(Boolean).length + (filters.excludeNonSku ? 1 : 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" value={filters.from} onChange={e => onChange({ from: e.target.value })} className={inputClass} />
        <span className="text-gray-300 text-xs">–</span>
        <input type="date" value={filters.to} onChange={e => onChange({ to: e.target.value })} className={inputClass} />
        <div className="relative flex-1 min-w-[120px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input placeholder="Search SKU…" value={filters.q} onChange={e => onChange({ q: e.target.value })}
            className={cn(inputClass, 'pl-7 w-full')} />
          {filters.q && (
            <button type="button" onClick={() => onChange({ q: '' })} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <button type="button" onClick={() => setShowAll(v => !v)}
          className={cn('flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
            showAll || activeCount > 0 ? 'bg-[#00D084] text-white border-[#00D084]' : 'bg-white text-gray-600 border-gray-200')}>
          <SlidersHorizontal className="w-3 h-3" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>

      {showAll && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          <select value={filters.branch} onChange={e => onChange({ branch: e.target.value })} className={selectClass}>
            <option value="">All Branches</option>
            {options.branches.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.entity} onChange={e => onChange({ entity: e.target.value })} className={selectClass}>
            <option value="">All Entities</option>
            {options.entities.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.customer} onChange={e => onChange({ customer: e.target.value })} className={selectClass}>
            <option value="">All Customers</option>
            {options.customers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.channel} onChange={e => onChange({ channel: e.target.value })} className={selectClass}>
            <option value="">All Channels</option>
            {options.channels.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.gender} onChange={e => onChange({ gender: e.target.value })} className={selectClass}>
            <option value="">All Gender</option>
            {options.genders.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.series} onChange={e => onChange({ series: e.target.value })} className={selectClass}>
            <option value="">All Series</option>
            {options.series.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.color} onChange={e => onChange({ color: e.target.value })} className={selectClass}>
            <option value="">All Colors</option>
            {options.colors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.tier} onChange={e => onChange({ tier: e.target.value })} className={selectClass}>
            <option value="">All Tiers</option>
            {options.tiers.map(s => <option key={s} value={s}>T{s}</option>)}
          </select>
          <select value={filters.tipe} onChange={e => onChange({ tipe: e.target.value })} className={selectClass}>
            <option value="">All Tipe</option>
            {options.tipes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.version} onChange={e => onChange({ version: e.target.value })} className={selectClass}>
            <option value="">All Versions</option>
            {options.versions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => onChange({ excludeNonSku: !filters.excludeNonSku })}
            className={cn('px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              filters.excludeNonSku ? 'bg-[#00D084] text-white border-[#00D084]' : 'bg-white text-gray-600 border-gray-200')}>
            SKU Only
          </button>
          {activeCount > 0 && (
            <button type="button" onClick={() => onChange({ branch: '', entity: '', customer: '', channel: '', gender: '', series: '', color: '', tier: '', tipe: '', version: '', excludeNonSku: false })}
              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 text-xs font-medium hover:bg-red-100 transition-colors">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WHStockPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<FilterOptions>({
    branches: [], channels: [], genders: [], series: [], colors: [], tiers: [], tipes: [], versions: [], entities: [], customers: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/wh-stock/filter-options')
      .then(r => r.json())
      .then((d: FilterOptions) => setOptions(d))
      .catch(console.error);
  }, []);

  const fetchData = useCallback(async (f: Filters) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const qs = filtersToQuery(f);
      const res = await fetch(`/api/wh-stock/dashboard${qs ? `?${qs}` : ''}`, { signal: ctrl.signal });
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(filters); }, [filters, fetchData]);

  const handleFilterChange = useCallback((updates: Partial<Filters>) => {
    setFilters(f => ({ ...f, ...updates }));
  }, []);

  return (
    <div className="space-y-3 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0D3B2E]">Warehouse Stock</h2>
          <p className="text-xs text-gray-400">WH Pusat · {data?.lastUpdate ?? '—'}</p>
        </div>
        {data && (
          <div className="text-right">
            <p className="text-xs text-gray-400">Total Revenue</p>
            <p className="text-sm font-bold text-[#0D3B2E]">{fmtRp(data.kpis.revenue)}</p>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} options={options} onChange={handleFilterChange} />

      {/* KPI Cards */}
      <KpiCards kpis={data?.kpis} loading={loading} />

      {/* Period Chart */}
      <PeriodChart data={data?.timeSeries} loading={loading} />

      {/* Store Table */}
      <StoreTable stores={data?.stores} loading={loading} />
    </div>
  );
}
