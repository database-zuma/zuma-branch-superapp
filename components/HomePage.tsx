'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import { cn } from '@/lib/utils';
import { Search, X, SlidersHorizontal } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

// ─── Brand colors (branch-superapp palette) ─────────────────────────────────
const ZUMA_GREEN = '#00D084';
const ZUMA_DARK  = '#0D3B2E';
const PIE_PALETTE = [
  '#00D084', '#0D3B2E', '#4A4A4A', '#8C8C8C', '#C4C4C4',
  '#00A368', '#1A5C3A', '#D4D4D4', '#006B3A', '#3D3D3D',
];

// ─── Types ──────────────────────────────────────────────────────────────────
interface DashboardData {
  kpis: { revenue: number; pairs: number; transactions: number; atu: number; asp: number; atv: number };
  lastUpdate: string | null;
  timeSeries: { period: string; revenue: number; pairs: number }[];
  stores: { toko: string; branch: string; pairs: number; revenue: number; transactions: number; atu: number; asp: number; atv: number }[];
  bySeries: { series: string; pairs: number }[];
  byGender: { gender: string; pairs: number }[];
  byTier: { tier: string; pairs: number }[];
  byTipe: { tipe: string; pairs: number }[];
  bySize: { size: string; pairs: number }[];
  byPrice: { label: string; pairs: number }[];
  rankByArticle: { article: string; kode_mix: string; gender: string; series: string; color: string; pairs: number; revenue: number }[];
}

interface FilterOptions {
  stores: string[];
  genders: string[];
  series: string[];
  colors: string[];
  tiers: string[];
  tipes: string[];
  versions: string[];
}

interface Filters {
  from: string;
  to: string;
  store: string;
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
function fmtNum(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${Math.round(n).toLocaleString('en-US')}`;
}
function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.store) p.set('store', f.store);
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
  const from = `${y}-${m}-01`;
  const to = now.toISOString().substring(0, 10);
  return { from, to, store: '', gender: '', series: '', color: '', tier: '', tipe: '', version: '', excludeNonSku: false, q: '' };
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, children, filterLabel, onClearFilter, actions }: {
  title: string;
  children: React.ReactNode;
  filterLabel?: string;
  onClearFilter?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
        <h3 className="text-[10px] font-bold text-gray-700 uppercase tracking-[0.15em]">{title}</h3>
        {actions}
      </div>
      {filterLabel && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-md bg-[#00D084]/10 text-[#0D3B2E] border border-[#00D084]/30 font-medium">
            🔍 {filterLabel}
            {onClearFilter && (
              <button type="button" onClick={onClearFilter} className="ml-0.5 hover:text-red-600 transition-colors">✕</button>
            )}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-52 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-[#00D084] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Pie chart ───────────────────────────────────────────────────────────────
function PieChart({ labels, values, title, activeValue, onSegmentClick }: {
  labels: string[]; values: number[]; title: string;
  activeValue?: string; onSegmentClick?: (label: string) => void;
}) {
  const total = values.reduce((s, v) => s + v, 0);
  const activeIdx = activeValue ? labels.indexOf(activeValue) : -1;
  const bgColors = PIE_PALETTE.slice(0, labels.length).map((c, i) =>
    activeIdx >= 0 && i !== activeIdx ? hexToRgba(c, 0.4) : c
  );
  const chartData = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: bgColors,
      borderWidth: labels.map((_, i) => (activeIdx >= 0 && i === activeIdx ? 3 : 1)),
      borderColor: labels.map((_, i) => (activeIdx >= 0 && i === activeIdx ? ZUMA_DARK : '#fff')),
    }],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    onClick: onSegmentClick
      ? (_e: unknown, els: { index: number }[]) => { if (els.length > 0) onSegmentClick(labels[els[0].index]); }
      : undefined,
    plugins: {
      legend: { position: 'right' as const, labels: { font: { size: 9 }, usePointStyle: true, pointStyle: 'rect' as const, padding: 10 } },
      tooltip: { callbacks: { label: (ctx: { label: string; parsed: number }) => {
        const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
        return `${ctx.label}: ${fmtNum(ctx.parsed)} prs (${pct}%)`;
      }}},
    },
  };
  return (
    <ChartCard title={title} filterLabel={activeIdx >= 0 ? activeValue : undefined}
      onClearFilter={activeIdx >= 0 && onSegmentClick ? () => onSegmentClick(activeValue!) : undefined}>
      <div className={cn('h-52 flex items-center justify-center', onSegmentClick && 'cursor-pointer')}>
        <div className="h-full w-full max-w-[300px]"><Pie data={chartData} options={options} /></div>
      </div>
    </ChartCard>
  );
}

// ─── Bar chart ───────────────────────────────────────────────────────────────
function BarChart({ labels, values, title, horizontal, activeValue, onSegmentClick }: {
  labels: string[]; values: number[]; title: string;
  horizontal?: boolean; activeValue?: string; onSegmentClick?: (label: string) => void;
}) {
  const activeIdx = activeValue ? labels.indexOf(activeValue) : -1;
  const bgColors = activeIdx >= 0
    ? labels.map((_, i) => i === activeIdx ? ZUMA_DARK : hexToRgba(ZUMA_GREEN, 0.4))
    : ZUMA_GREEN;
  const chartData = { labels, datasets: [{ data: values, backgroundColor: bgColors, borderRadius: 1 }] };
  const handleClick = onSegmentClick
    ? (_e: unknown, els: { index: number }[]) => { if (els.length > 0) onSegmentClick(labels[els[0].index]); }
    : undefined;
  const baseOpts = { responsive: true, maintainAspectRatio: false, onClick: handleClick,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: horizontal
        ? (ctx: { parsed: { x: number | null } }) => `${fmtNum(ctx.parsed.x ?? 0)} pairs`
        : (ctx: { parsed: { y: number | null } }) => `${fmtNum(ctx.parsed.y ?? 0)} pairs`,
    }}},
  };
  const options = horizontal
    ? { ...baseOpts, indexAxis: 'y' as const,
        scales: { x: { ticks: { font: { size: 9 }, callback: (v: number | string) => fmtNum(Number(v)) }, grid: { color: 'rgba(0,0,0,0.04)' } },
                  y: { ticks: { font: { size: 9 } }, grid: { display: false } } } }
    : { ...baseOpts,
        scales: { x: { ticks: { font: { size: 9 } }, grid: { display: false } },
                  y: { ticks: { font: { size: 9 }, callback: (v: number | string) => fmtNum(Number(v)) }, grid: { color: 'rgba(0,0,0,0.04)' } } } };
  return (
    <ChartCard title={title} filterLabel={activeIdx >= 0 ? activeValue : undefined}
      onClearFilter={activeIdx >= 0 && onSegmentClick ? () => onSegmentClick(activeValue!) : undefined}>
      <div className={cn('h-52', onSegmentClick && 'cursor-pointer')}>
        <Bar data={chartData} options={options} />
      </div>
    </ChartCard>
  );
}

// ─── Rank table ──────────────────────────────────────────────────────────────
function RankTable({ rows }: {
  rows: { article: string; kode_mix: string; gender: string; series: string; color: string; pairs: number; revenue: number }[];
}) {
  const totQty = rows.reduce((s, r) => s + r.pairs, 0);
  const totRev = rows.reduce((s, r) => s + r.revenue, 0);
  return (
    <ChartCard title="Rank by Article">
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100">
              {['#', 'Kode Mix', 'Gender', 'Series', 'Color', 'Qty', 'Revenue', 'ASP'].map((h, i) => (
                <th key={h} className={cn('px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider',
                  i === 0 ? 'w-10 text-left' : i >= 5 ? 'text-right' : 'text-left')}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const asp = r.pairs > 0 ? r.revenue / r.pairs : 0;
              return (
                <tr key={r.kode_mix || `rank-${String(idx)}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2 text-gray-400 tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2 font-medium text-gray-900 max-w-[180px] truncate">{r.kode_mix || r.article || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.gender || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.series || '—'}</td>
                  <td className="px-3 py-2 text-gray-500">{r.color || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.pairs)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtRp(r.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-400">{fmtRp(asp)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">No data</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0">
              <tr className="border-t-2 border-[#00D084]/40 bg-white">
                <td className="px-3 py-2 text-[9px] font-bold text-gray-700" colSpan={5}>TOTAL</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{fmtNum(totQty)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">{fmtRp(totRev)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-400">{fmtRp(totQty > 0 ? totRev / totQty : 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ChartCard>
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

  const activeCount = [filters.store, filters.gender, filters.series, filters.color, filters.tier, filters.tipe, filters.version]
    .filter(Boolean).length + (filters.excludeNonSku ? 1 : 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
      {/* Row 1: date + search + toggle */}
      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" value={filters.from} onChange={e => onChange({ from: e.target.value })}
          className={inputClass} />
        <span className="text-gray-300 text-xs">–</span>
        <input type="date" value={filters.to} onChange={e => onChange({ to: e.target.value })}
          className={inputClass} />
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

      {/* Row 2: advanced filters */}
      {showAll && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          <select value={filters.store} onChange={e => onChange({ store: e.target.value })} className={selectClass}>
            <option value="">All Stores</option>
            {options.stores.map(s => <option key={s} value={s}>{s}</option>)}
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
            <button type="button" onClick={() => onChange({ store: '', gender: '', series: '', color: '', tier: '', tipe: '', version: '', excludeNonSku: false })}
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
export default function HomePage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<FilterOptions>({ stores: [], genders: [], series: [], colors: [], tiers: [], tipes: [], versions: [] });
  const abortRef = useRef<AbortController | null>(null);

  // Load filter options once
  useEffect(() => {
    fetch('/api/home/filter-options')
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
      const res = await fetch(`/api/home/dashboard${qs ? `?${qs}` : ''}`, { signal: ctrl.signal });
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(filters);
  }, [filters, fetchData]);

  const handleFilterChange = useCallback((updates: Partial<Filters>) => {
    setFilters(f => ({ ...f, ...updates }));
  }, []);

  const handleChartFilter = useCallback((param: string, value: string) => {
    setFilters(f => {
      const current = f[param as keyof Filters] as string;
      return { ...f, [param]: current === value ? '' : value };
    });
  }, []);

  const activeTipe   = filters.tipe || undefined;
  const activeGender = filters.gender || undefined;
  const activeSeries = filters.series || undefined;
  const activeTier   = filters.tier ? `T${filters.tier}` : undefined;

  return (
    <div className="space-y-3 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0D3B2E]">iSeller Sales</h2>
          <p className="text-xs text-gray-400">Jatim Branch · {data?.lastUpdate ?? '—'}</p>
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

      {/* Charts: Row 1 — Pie charts */}
      {loading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1,2,3].map(k => <div key={k} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"><Spinner /></div>)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[4,5,6].map(k => <div key={k} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"><Spinner /></div>)}
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"><Spinner /></div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <PieChart title="Qty by Tipe" labels={(data?.byTipe ?? []).filter(d => d.tipe).map(d => d.tipe)}
              values={(data?.byTipe ?? []).filter(d => d.tipe).map(d => d.pairs)}
              activeValue={activeTipe}
              onSegmentClick={label => handleChartFilter('tipe', label)} />
            <PieChart title="Qty by Gender" labels={(data?.byGender ?? []).filter(d => d.gender).map(d => d.gender)}
              values={(data?.byGender ?? []).filter(d => d.gender).map(d => d.pairs)}
              activeValue={activeGender}
              onSegmentClick={label => handleChartFilter('gender', label)} />
            <PieChart title="Qty by Series" labels={(data?.bySeries ?? []).filter(d => d.series).map(d => d.series)}
              values={(data?.bySeries ?? []).filter(d => d.series).map(d => d.pairs)}
              activeValue={activeSeries}
              onSegmentClick={label => handleChartFilter('series', label)} />
          </div>

          {/* Row 2 — Bar charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BarChart title="Qty by Size"
              labels={(data?.bySize ?? []).filter(d => d.size).map(d => d.size)}
              values={(data?.bySize ?? []).filter(d => d.size).map(d => d.pairs)} />
            <BarChart title="Qty by Price Range (RSP)"
              labels={data?.byPrice.map(d => d.label) ?? []}
              values={data?.byPrice.map(d => d.pairs) ?? []} />
            <BarChart title="Qty by Tier"
              labels={(data?.byTier ?? []).filter(d => d.tier).map(d => `T${d.tier}`)}
              values={(data?.byTier ?? []).filter(d => d.tier).map(d => d.pairs)}
              activeValue={activeTier}
              onSegmentClick={label => handleChartFilter('tier', label.replace('T', ''))} />
          </div>

          {/* Row 3 — Rank table */}
          <RankTable rows={data?.rankByArticle ?? []} />
        </>
      )}
    </div>
  );
}
