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
import { Bar, Doughnut } from 'react-chartjs-2';
import { cn } from '@/lib/utils';
import { Package, Layers, AlertTriangle, DollarSign, Search, X, SlidersHorizontal } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

// ─── Brand colors ──────────────────────────────────────────────────────────
const ZUMA_GREEN = '#00D084';
const ZUMA_DARK = '#0D3B2E';

// ─── Types ─────────────────────────────────────────────────────────────────
interface KpiData {
  total_pairs: number;
  unique_articles: number;
  dead_stock_pairs: number;
  est_rsp_value: number;
  snapshot_date: string | null;
}

interface WarehouseRow { nama_gudang: string; gender_group: string; pairs: number }
interface TipeRow { tipe: string; pairs: number }
interface TierRow { tier: string; pairs: number; articles: number }
interface SizeRow { ukuran: string; pairs: number }
interface SeriesRow { series: string; pairs: number }
interface TopArticle { kode_besar: string; article: string; pairs: number }

interface DashboardData {
  kpis: KpiData;
  by_warehouse: WarehouseRow[];
  by_tipe: TipeRow[];
  by_tier: TierRow[];
  by_size: SizeRow[];
  by_series: SeriesRow[];
  top_articles: TopArticle[];
}

interface FilterOptions {
  genders: string[];
  series: string[];
  colors: string[];
  tiers: string[];
  tipes: string[];
  sizes: string[];
  entitas: string[];
  versions: string[];
}

interface Filters {
  gender: string;
  series: string;
  color: string;
  tier: string;
  tipe: string;
  size: string;
  entitas: string;
  v: string;
  q: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtNum(n: number) { return Math.round(n).toLocaleString('en-US'); }
function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${Math.round(n).toLocaleString('en-US')}`;
}

function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.gender) p.set('gender', f.gender);
  if (f.series) p.set('series', f.series);
  if (f.color) p.set('color', f.color);
  if (f.tier) p.set('tier', f.tier);
  if (f.tipe) p.set('tipe', f.tipe);
  if (f.size) p.set('size', f.size);
  if (f.entitas) p.set('entitas', f.entitas);
  if (f.v) p.set('v', f.v);
  if (f.q) p.set('q', f.q);
  return p.toString();
}

function defaultFilters(): Filters {
  return { gender: '', series: '', color: '', tier: '', tipe: '', size: '', entitas: '', v: '', q: '' };
}

// ─── KPI Cards (Stock) ────────────────────────────────────────────────────
function KpiCards({ kpis, loading }: { kpis?: KpiData; loading?: boolean }) {
  const cards = [
    { label: 'Total Pairs', value: kpis ? fmtNum(kpis.total_pairs) : '—', icon: Package, accent: ZUMA_GREEN },
    { label: 'Unique Articles', value: kpis ? fmtNum(kpis.unique_articles) : '—', icon: Layers, accent: ZUMA_DARK },
    { label: 'Dead Stock (T4+T5)', value: kpis ? fmtNum(kpis.dead_stock_pairs) : '—', icon: AlertTriangle, accent: '#EF4444' },
    { label: 'Est. RSP Value', value: kpis ? fmtRp(kpis.est_rsp_value) : '—', icon: DollarSign, accent: ZUMA_GREEN },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, accent }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {loading ? (
            <div className="space-y-2">
              <div className="h-3 w-20 bg-gray-100 animate-pulse rounded" />
              <div className="h-6 w-28 bg-gray-100 animate-pulse rounded" />
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
              </div>
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${accent}15` }}>
                <Icon className="w-4 h-4" style={{ color: accent }} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Chart card wrapper ─────────────────────────────────────────────────────
function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 shadow-sm p-5', className)}>
      <h3 className="text-[11px] font-bold text-gray-700 uppercase tracking-[0.12em] mb-4 pb-2 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div className="h-56 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-[#00D084] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Warehouse breakdown (horizontal stacked bar) ──────────────────────────
function WarehouseChart({ data }: { data: WarehouseRow[] }) {
  // Group by nama_gudang, then stack by gender_group
  const gudangs = [...new Set(data.map(d => d.nama_gudang))];
  const genders = [...new Set(data.map(d => d.gender_group))];

  const genderColors: Record<string, string> = {
    MEN: ZUMA_DARK,
    WOMEN: ZUMA_GREEN,
    UNISEX: '#8C8C8C',
    KIDS: '#C4C4C4',
  };

  const datasets = genders.map(g => ({
    label: g,
    data: gudangs.map(gu => {
      const row = data.find(d => d.nama_gudang === gu && d.gender_group === g);
      return row ? row.pairs : 0;
    }),
    backgroundColor: genderColors[g] || '#A0A0A0',
    borderRadius: 3,
    maxBarThickness: 28,
  }));

  return (
    <div style={{ position: 'relative', height: Math.max(160, gudangs.length * 50) }}>
      <Bar
        data={{ labels: gudangs.map(g => g.replace('Warehouse ', 'WH ')), datasets }}
        options={{
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'rect', padding: 14 } },
            tooltip: {
              backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)', borderWidth: 1,
              titleColor: '#1A1A18', bodyColor: '#1A1A18', padding: 10,
              callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtNum(Number(ctx.raw))} pairs` },
            },
          },
          scales: {
            x: {
              stacked: true,
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: { callback: (v) => { const n = Number(v); return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n); }, font: { size: 10 } },
            },
            y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
          },
        }}
      />
    </div>
  );
}

// ─── Tipe donut ──────────────────────────────────────────────────────────────
function TipeDonut({ data }: { data: TipeRow[] }) {
  const total = data.reduce((s, d) => s + d.pairs, 0);
  const tipeColors: Record<string, string> = { Fashion: ZUMA_GREEN, Jepit: ZUMA_DARK };

  return (
    <div className="relative flex flex-col items-center" style={{ height: 220 }}>
      <Doughnut
        data={{
          labels: data.map(d => d.tipe),
          datasets: [{
            data: data.map(d => d.pairs),
            backgroundColor: data.map(d => tipeColors[d.tipe] || '#999999'),
            borderWidth: 2,
            borderColor: '#ffffff',
            hoverOffset: 6,
          }],
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          cutout: '68%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } },
            tooltip: {
              backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)', borderWidth: 1,
              titleColor: '#1A1A18', bodyColor: '#1A1A18', padding: 10,
              callbacks: {
                label: (ctx) => {
                  const pct = total > 0 ? ((Number(ctx.raw) / total) * 100).toFixed(1) : '0';
                  return `${ctx.label}: ${fmtNum(Number(ctx.raw))} (${pct}%)`;
                },
              },
            },
          },
        }}
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[65%] text-center pointer-events-none">
        <p className="text-lg font-bold text-gray-900">{fmtNum(total)}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">pairs</p>
      </div>
    </div>
  );
}

// ─── Tier bar chart ──────────────────────────────────────────────────────────
function TierChart({ data }: { data: TierRow[] }) {
  const TIER_ORDER = ['1', '2', '3', '4', '5', '8'];
  const TIER_COLORS: Record<string, string> = {
    '1': '#00D084', '2': '#0D3B2E', '3': '#5D625A', '4': '#A9A69F', '5': '#E3E3DE', '8': '#F5F5F0',
  };
  const sorted = TIER_ORDER.map(t => data.find(d => d.tier === t) || { tier: t, pairs: 0, articles: 0 });
  const labels = sorted.map(d => `T${d.tier}`);

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <Bar
        data={{
          labels,
          datasets: [{
            data: sorted.map(d => d.pairs),
            backgroundColor: sorted.map(d => TIER_COLORS[d.tier] || '#999999'),
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 40,
          }],
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)', borderWidth: 1,
              titleColor: '#1A1A18', bodyColor: '#1A1A18', padding: 10,
              callbacks: {
                afterLabel: (ctx) => { const row = sorted[ctx.dataIndex]; return `${row.articles} articles`; },
                label: (ctx) => `${fmtNum(Number(ctx.raw))} pairs`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 12, weight: 'bold' as const } } },
            y: {
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: { callback: (v) => { const n = Number(v); return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n); } },
            },
          },
        }}
      />
    </div>
  );
}

// ─── Series bar chart (horizontal) ──────────────────────────────────────────
function SeriesChart({ data }: { data: SeriesRow[] }) {
  const reversed = [...data].reverse();
  const lastIdx = reversed.length - 1;

  return (
    <div style={{ position: 'relative', height: Math.max(350, data.length * 28) }}>
      <Bar
        data={{
          labels: reversed.map(d => d.series),
          datasets: [{
            data: reversed.map(d => d.pairs),
            backgroundColor: reversed.map((_, i) => {
              if (i === lastIdx) return ZUMA_GREEN;
              const grays = ['#E8E8E5', '#C5C5C0', '#A3A39E', '#818179', '#5F5F5A', '#3D3D39', '#1A1A18'];
              return grays[Math.min(lastIdx - i - 1, grays.length - 1)];
            }),
            borderRadius: 3,
            borderSkipped: false,
            maxBarThickness: 24,
          }],
        }}
        options={{
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)', borderWidth: 1,
              titleColor: '#1A1A18', bodyColor: '#1A1A18', padding: 10,
              callbacks: { label: (ctx) => `${fmtNum(Number(ctx.raw))} pairs` },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: { callback: (v) => { const n = Number(v); return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n); } },
            },
            y: { grid: { display: false }, ticks: { font: { size: 11 } } },
          },
        }}
      />
    </div>
  );
}

// ─── Size bar chart ────────────────────────────────────────────────────────
function SizeChart({ data }: { data: SizeRow[] }) {
  const filtered = data.filter(d => d.pairs > 0);
  return (
    <div style={{ position: 'relative', height: 240 }}>
      <Bar
        data={{
          labels: filtered.map(d => d.ukuran),
          datasets: [{
            data: filtered.map(d => d.pairs),
            backgroundColor: ZUMA_GREEN,
            borderRadius: 3,
            borderSkipped: false,
            maxBarThickness: 28,
          }],
        }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.08)', borderWidth: 1,
              titleColor: '#1A1A18', bodyColor: '#1A1A18', padding: 10,
              callbacks: { label: (ctx) => `${fmtNum(Number(ctx.raw))} pairs` },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
            y: {
              grid: { color: 'rgba(0,0,0,0.04)' },
              ticks: { callback: (v) => { const n = Number(v); return n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(n); } },
            },
          },
        }}
      />
    </div>
  );
}

// ─── Top articles table ────────────────────────────────────────────────────
function TopArticlesTable({ rows, loading }: { rows: TopArticle[]; loading?: boolean }) {
  return (
    <ChartCard title="Top Articles by Pairs">
      <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider w-10">#</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Article</th>
              <th className="text-left px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kode Besar</th>
              <th className="text-right px-4 py-2.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pairs</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`sk-${String(i)}`} className="border-b border-gray-50">
                  {Array.from({ length: 4 }, (_, j) => (
                    <td key={String(j)} className="px-4 py-3"><div className="h-3 bg-gray-100 animate-pulse rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : rows.length ? (
              rows.map((r, idx) => (
                <tr key={r.kode_besar} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 tabular-nums font-medium">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{r.article || r.kode_besar}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-[11px]">{r.kode_besar}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtNum(r.pairs)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

// ─── Filter bar ─────────────────────────────────────────────────────────────
function FilterBar({ filters, options, onChange }: {
  filters: Filters;
  options: FilterOptions;
  onChange: (updates: Partial<Filters>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const inputClass = 'border border-gray-200 rounded-lg text-xs px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#00D084] focus:border-[#00D084]';
  const selectClass = `${inputClass} min-w-[100px]`;

  const activeCount = [filters.gender, filters.series, filters.color, filters.tier, filters.tipe, filters.size, filters.entitas, filters.v]
    .filter(Boolean).length;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input placeholder="Search kode besar…" value={filters.q} onChange={e => onChange({ q: e.target.value })}
            className={cn(inputClass, 'pl-8 w-full')} />
          {filters.q && (
            <button type="button" onClick={() => onChange({ q: '' })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button type="button" onClick={() => setShowAll(v => !v)}
          className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg border text-xs font-medium transition-colors',
            showAll || activeCount > 0 ? 'bg-[#00D084] text-white border-[#00D084]' : 'bg-white text-gray-600 border-gray-200')}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
      </div>

      {showAll && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
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
          <select value={filters.size} onChange={e => onChange({ size: e.target.value })} className={selectClass}>
            <option value="">All Sizes</option>
            {options.sizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.entitas} onChange={e => onChange({ entitas: e.target.value })} className={selectClass}>
            <option value="">All Entitas</option>
            {options.entitas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filters.v} onChange={e => onChange({ v: e.target.value })} className={selectClass}>
            <option value="">All Versions</option>
            {options.versions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {activeCount > 0 && (
            <button type="button" onClick={() => onChange({ gender: '', series: '', color: '', tier: '', tipe: '', size: '', entitas: '', v: '' })}
              className="px-4 py-2 rounded-lg border border-red-200 text-red-600 bg-red-50 text-xs font-medium hover:bg-red-100 transition-colors">
              Clear All
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function WHStockPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<FilterOptions>({
    genders: [], series: [], colors: [], tiers: [], tipes: [], sizes: [], entitas: [], versions: [],
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

  const snapshotLabel = data?.kpis.snapshot_date
    ? new Date(data.kpis.snapshot_date as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#0D3B2E]">Warehouse Stock</h2>
          <p className="text-xs text-gray-400 mt-0.5">WH Pusat · Snapshot: {snapshotLabel}</p>
        </div>
        {data && (
          <div className="text-right">
            <p className="text-xs text-gray-400">Est. RSP Value</p>
            <p className="text-base font-bold text-[#0D3B2E]">{fmtRp(data.kpis.est_rsp_value)}</p>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} options={options} onChange={handleFilterChange} />

      {/* KPI Cards */}
      <KpiCards kpis={data?.kpis} loading={loading} />

      {loading ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"><Spinner /></div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"><Spinner /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"><Spinner /></div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"><Spinner /></div>
          </div>
        </>
      ) : (
        <>
          {/* Row 1: Warehouse breakdown + Tipe donut */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ChartCard title="Stock by Warehouse × Gender">
              <WarehouseChart data={data?.by_warehouse ?? []} />
            </ChartCard>
            <ChartCard title="Stock by Tipe">
              <TipeDonut data={data?.by_tipe ?? []} />
            </ChartCard>
          </div>

          {/* Row 2: Tier + Size */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ChartCard title="Stock by Tier">
              <TierChart data={data?.by_tier ?? []} />
            </ChartCard>
            <ChartCard title="Stock by Size">
              <SizeChart data={data?.by_size ?? []} />
            </ChartCard>
          </div>

          {/* Row 3: Series */}
          <ChartCard title="Stock by Series">
            <SeriesChart data={data?.by_series ?? []} />
          </ChartCard>

          {/* Row 4: Top articles */}
          <TopArticlesTable rows={data?.top_articles ?? []} loading={loading} />
        </>
      )}
    </div>
  );
}
