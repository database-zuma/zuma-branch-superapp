'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EntitySummary {
  totalBoxes: number;
  totalPairs: number;
  articleCount: number;
}

interface SKUItem {
  articleCode: string;
  kodeBesar: string;
  namaVariant: string;
  qtyDdd: number;
  qtyLjbb: number;
  qtyMbb: number;
  qtyUbb: number;
}

interface SOPBRoItem {
  roId: string;
  storeName: string;
  sopbNumberDdd: string | null;
  sopbNumberLjbb: string | null;
  sopbNumberMbb: string | null;
  sopbNumberUbb: string | null;
  sopbTanggalDiminta: string | null;
  entities: Record<string, EntitySummary>;
  skus: SKUItem[];
}

type EntityKey = 'ddd' | 'ljbb' | 'mbb' | 'ubb';
const ENTITIES: { key: EntityKey; label: string }[] = [
  { key: 'ddd', label: 'DDD' },
  { key: 'ljbb', label: 'LJBB' },
  { key: 'mbb', label: 'MBB' },
  { key: 'ubb', label: 'UBB' },
];

interface InputState {
  sopb: Record<EntityKey, string>;
  tanggalDiminta: string;
}

export default function SOPBGenerator() {
  const [roData, setRoData] = useState<SOPBRoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRO, setExpandedRO] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, InputState>>({});
  const [downloadingEntity, setDownloadingEntity] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ro/sopb');
      const result = await res.json();
      if (result.success) {
        setRoData(result.data);
        // Initialize inputs from server data
        const newInputs: Record<string, InputState> = {};
        for (const ro of result.data) {
          newInputs[ro.roId] = {
            sopb: {
              ddd: ro.sopbNumberDdd || '',
              ljbb: ro.sopbNumberLjbb || '',
              mbb: ro.sopbNumberMbb || '',
              ubb: ro.sopbNumberUbb || '',
            },
            tanggalDiminta: ro.sopbTanggalDiminta || '',
          };
        }
        setInputs(newInputs);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error('Failed to fetch SOPB data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateSopb = (roId: string, entity: EntityKey, value: string) => {
    setInputs(prev => ({
      ...prev,
      [roId]: {
        ...prev[roId],
        sopb: { ...prev[roId].sopb, [entity]: value },
      },
    }));
  };

  const updateDate = (roId: string, value: string) => {
    setInputs(prev => ({
      ...prev,
      [roId]: { ...prev[roId], tanggalDiminta: value },
    }));
  };

  const handleDownload = async (roId: string, entity: EntityKey) => {
    const inp = inputs[roId];
    if (!inp.sopb[entity]) {
      toast.warning(`Masukkan No Permintaan (SOPB) untuk ${entity.toUpperCase()} terlebih dahulu`);
      return;
    }
    if (!inp.tanggalDiminta) {
      toast.warning('Masukkan Tanggal Diminta terlebih dahulu');
      return;
    }

    const dlKey = `${roId}_${entity}`;
    setDownloadingEntity(dlKey);
    try {
      const res = await fetch('/api/ro/sopb/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roId,
          entity: entity.toUpperCase(),
          sopbNumber: inp.sopb[entity],
          tanggalDiminta: inp.tanggalDiminta,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Download failed');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${roId}_${entity.toUpperCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`XLSX ${entity.toUpperCase()} berhasil di-download`);
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloadingEntity(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading SOPB data...</span>
      </div>
    );
  }

  if (roData.length === 0) {
    return (
      <div className="text-center py-20">
        <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-lg">Tidak ada RO di tahap DNPB Process</p>
        <p className="text-gray-400 text-sm mt-1">RO yang mencapai DNPB Process akan otomatis muncul di sini</p>
        <button onClick={fetchData} className="mt-4 text-sm text-blue-500 hover:underline flex items-center justify-center gap-1 mx-auto">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-800">SOPB Generator</h2>
        <button onClick={fetchData} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {roData.map((ro) => {
        const inp = inputs[ro.roId];
        if (!inp) return null;
        const isExpanded = expandedRO === ro.roId;
        const activeEntities = ENTITIES.filter(e => ro.entities[e.key].totalBoxes > 0);

        return (
          <div key={ro.roId} className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* Card Header */}
            <div className="px-4 py-3 border-b bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono font-semibold text-sm text-gray-800">{ro.roId}</span>
                  <span className="ml-2 text-sm text-gray-500">— {ro.storeName}</span>
                </div>
                <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full font-medium">
                  DNPB Process
                </span>
              </div>
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                {activeEntities.map(({ key, label }) => (
                  <span key={key}>
                    {label}: {ro.entities[key].totalBoxes} box / {ro.entities[key].totalPairs} pairs
                  </span>
                ))}
              </div>
            </div>

            {/* Tanggal Diminta — shared across entities */}
            <div className="px-4 pt-3">
              <label className="text-xs font-medium text-gray-600 block mb-1">Tanggal Diminta</label>
              <input
                type="date"
                value={inp.tanggalDiminta}
                onChange={(e) => updateDate(ro.roId, e.target.value)}
                className="w-full sm:w-48 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              />
            </div>

            {/* Per-entity sections */}
            <div className="px-4 py-3 space-y-3">
              {activeEntities.map(({ key, label }) => {
                const ent = ro.entities[key];
                const dlKey = `${ro.roId}_${key}`;

                return (
                  <div key={key} className="border rounded-lg p-3 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700">
                        {label}
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {ent.articleCount} artikel · {ent.totalBoxes} box · {ent.totalPairs} pairs
                        </span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* SOPB Number Input */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">No Permintaan (SOPB)</label>
                        <input
                          type="text"
                          placeholder={`SOPB/${label}/WHS/2026/III/001`}
                          value={inp.sopb[key]}
                          onChange={(e) => updateSopb(ro.roId, key, e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none font-mono"
                        />
                      </div>

                      {/* Download Button */}
                      <div className="flex items-end">
                        <button
                          onClick={() => handleDownload(ro.roId, key)}
                          disabled={downloadingEntity === dlKey || !inp.sopb[key] || !inp.tanggalDiminta}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors",
                            inp.sopb[key] && inp.tanggalDiminta
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          )}
                        >
                          {downloadingEntity === dlKey ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          Download XLSX
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* SKU Detail Toggle */}
            <div className="px-4 pb-1">
              <button
                onClick={() => setExpandedRO(isExpanded ? null : ro.roId)}
                className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
              >
                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {isExpanded ? 'Sembunyikan' : 'Lihat'} detail SKU ({ro.skus.length} items)
              </button>
            </div>

            {isExpanded && (
              <div className="px-4 pb-3">
                <div className="max-h-60 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Kode Besar</th>
                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Nama Variant</th>
                        {activeEntities.map(e => (
                          <th key={e.key} className="px-2 py-1.5 text-right font-medium text-gray-600">{e.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ro.skus.map((sku, i) => {
                        const qtyMap: Record<EntityKey, number> = { ddd: sku.qtyDdd, ljbb: sku.qtyLjbb, mbb: sku.qtyMbb, ubb: sku.qtyUbb };
                        const hasAny = activeEntities.some(e => qtyMap[e.key] > 0);
                        if (!hasAny) return null;
                        return (
                          <tr key={i} className="hover:bg-blue-50/30">
                            <td className="px-2 py-1 font-mono text-gray-700">{sku.kodeBesar}</td>
                            <td className="px-2 py-1 text-gray-600 truncate max-w-[200px]">{sku.namaVariant}</td>
                            {activeEntities.map(e => (
                              <td key={e.key} className="px-2 py-1 text-right tabular-nums text-gray-700">
                                {qtyMap[e.key] > 0 ? qtyMap[e.key] : '-'}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="px-4 py-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">
                Download XLSX per entity, lalu upload ke Accurate untuk mendapatkan nomor DNPB.
                Input DNPB di halaman RO Process.
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
