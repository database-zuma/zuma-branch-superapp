'use client';

import { useState, useEffect } from 'react';
import { ShoppingCart, RefreshCw, X, Download, Package, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import SOPBGenerator from './SOPBGenerator';
import ROProcess from './ROProcess';
import { DNPBErrorContent, DNPBErrorDetailModal, DNPBErrorRO } from './DNPBErrorContent';
import { toast } from 'sonner';
import ROUpload from './ROUpload';

interface DashboardStats {
  totalRO: number;
  queued: number;
  totalBoxes: number;
  totalPairs: number;
}

interface ROItem {
  id: string;
  store: string;
  box: number;
  status: string;
}

interface ROArticle {
  kodeArtikel: string;
  namaArtikel: string;
  boxesRequested: number;
  dddBoxes: number;
  ljbbBoxes: number;
}

interface RODetail {
  id: string;
  store: string;
  createdAt: string;
  currentStatus: string;
  dnpbNumber: string | null;
  totalBoxes: number;
  totalArticles: number;
  dddBoxes: number;
  ljbbBoxes: number;
  notes?: string;
  articles: ROArticle[];
}

type SubTab = 'dashboard' | 'process' | 'sopb' | 'dnpb-error';

export default function ROPage() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('dashboard');
  const [selectedDNPBErrorRO, setSelectedDNPBErrorRO] = useState<DNPBErrorRO | null>(null);

  const subTabs = [
    { id: 'dashboard' as SubTab, label: 'Dashboard' },
    { id: 'process' as SubTab, label: 'RO Process' },
    { id: 'sopb' as SubTab, label: 'SOPB Generator' },
    { id: 'dnpb-error' as SubTab, label: 'DNPB Error' },
  ];

  const renderSubContent = () => {
    switch (activeSubTab) {
      case 'dashboard':
        return <DashboardContent />;
      case 'sopb':
        return <SOPBGenerator />;
      case 'process':
        return <ROProcess />;
      case 'dnpb-error':
        return <DNPBErrorContent onSelectRO={setSelectedDNPBErrorRO} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full">
      {}
      <div className="bg-white px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-center">
          {subTabs.map((tab, index) => {
            const isActive = activeSubTab === tab.id;
            
            return (
              <div key={tab.id} className="flex items-center">
                <button
                  onClick={() => setActiveSubTab(tab.id)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium transition-colors duration-200",
                    isActive 
                      ? "text-gray-900" 
                      : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  {tab.label}
                </button>
                {index < subTabs.length - 1 && (
                  <div className="w-px h-4 bg-gray-300" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {}
      <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {renderSubContent()}
      </div>

      <DNPBErrorDetailModal
        ro={selectedDNPBErrorRO}
        onClose={() => setSelectedDNPBErrorRO(null)}
        onBanding={async (roId) => {
          try {
            const response = await fetch('/api/ro/banding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ro_id: roId, action: 'BANDING' })
            });
            const result = await response.json();
            if (result.success) {
              toast.success('Banding notice sent to ro-arrive-app');
            } else {
              toast.error(result.error || 'Failed to send banding notice');
            }
          } catch (err) {
            toast.error('Failed to send banding notice');
            throw err;
          }
        }}
        onConfirmed={async (roId) => {
          try {
            const response = await fetch('/api/ro/banding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ro_id: roId, action: 'CONFIRMED' })
            });
            const result = await response.json();
            if (result.success) {
              toast.success('Discrepancy confirmed and resolved');
            } else {
              toast.error(result.error || 'Failed to confirm');
            }
          } catch (err) {
            toast.error('Failed to confirm discrepancy');
            throw err;
          }
        }}
      />
    </div>
  );
}

function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats>({ totalRO: 0, queued: 0, totalBoxes: 0, totalPairs: 0 });
  const [roData, setRoData] = useState<ROItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedRO, setSelectedRO] = useState<RODetail | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/ro/dashboard');
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data.stats ?? { totalRO: 0, queued: 0, totalBoxes: 0, totalPairs: 0 });
        setRoData(json.data.roList ?? []);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRODetail = async (roId: string) => {
    console.log('Fetching RO detail for:', roId);
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/ro/process?roId=${roId}`);
      const json = await res.json();
      console.log('API response:', json);
      if (json.success && json.data && json.data.length > 0) {
        console.log('Setting selected RO:', json.data[0]);
        setSelectedRO(json.data[0]);
        setShowDetailModal(true);
      } else {
        toast.error('Failed to load RO detail');
      }
    } catch (error) {
      console.error('Error fetching RO detail:', error);
      toast.error('Failed to load RO detail');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const downloadCSV = (ro: RODetail) => {
    const csvRows = [
      ['RO_ID', 'Store', 'Status', 'Created_Date', 'DNPB', 'Notes', 'Article_Code', 'Article_Name', 'Box', 'DDD', 'LJBB'],
      ...ro.articles.map(article => [
        ro.id,
        ro.store,
        ro.currentStatus,
        ro.createdAt,
        ro.dnpbNumber || '-',
        ro.notes || '-',
        article.kodeArtikel,
        article.namaArtikel,
        article.boxesRequested.toString(),
        article.dddBoxes.toString(),
        article.ljbbBoxes.toString()
      ])
    ];

    const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RO-${ro.id}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded successfully');
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const statsCards = [
    { value: stats.totalRO.toString(), label: 'Total RO', bgColor: 'bg-[#0D3B2E]', icon: ShoppingCart },
    { value: stats.queued.toString(), label: 'Queued', bgColor: 'bg-[#0D3B2E]', icon: ShoppingCart },
    { value: stats.totalBoxes.toString(), label: 'Box', bgColor: 'bg-[#00D084]', icon: ShoppingCart },
    { value: stats.totalPairs.toString(), label: 'Pairs', bgColor: 'bg-[#00D084]', icon: ShoppingCart },
  ];

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'completed':
        return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">complete</span>;
      case 'in_delivery':
        return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">delivery</span>;
      case 'ready_to_ship':
        return <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">ready</span>;
      case 'picking':
      case 'pick_verified':
        return <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">picking</span>;
      case 'approved':
        return <span className="px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-medium">approved</span>;
      case 'queue':
        return <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">queue</span>;
      default:
        return <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <button
          onClick={() => setShowUpload(!showUpload)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
            showUpload
              ? "bg-[#0D3B2E] text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          <Upload className="w-4 h-4" />
          Upload RO
        </button>
        <button
          onClick={fetchDashboardData}
          disabled={isLoading}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
        </button>
      </div>

      {showUpload && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <ROUpload onUploadComplete={() => {
            fetchDashboardData();
            setShowUpload(false);
          }} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`${stat.bgColor} rounded-xl p-4 flex items-center justify-between`}
            >
              <div>
                <p className="text-2xl font-bold text-white">
                  {isLoading ? '-' : stat.value}
                </p>
                <p className="text-xs text-white/80">{stat.label}</p>
              </div>
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Icon className="w-5 h-5 text-white" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <h3 className="font-semibold text-gray-900 p-4 border-b border-gray-100">
          All Replenishment Orders
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="py-3 px-4 font-medium">RO ID</th>
                <th className="py-3 px-4 font-medium">Store</th>
                <th className="py-3 px-4 font-medium text-center">Box</th>
                <th className="py-3 px-4 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : roData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-400">No RO data yet</td>
                </tr>
              ) : (
                roData.map((ro) => (
                  <tr 
                    key={ro.id} 
                    onClick={() => fetchRODetail(ro.id)}
                    className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-gray-700 text-xs">{ro.id}</td>
                    <td className="py-3 px-4 text-gray-900">{ro.store}</td>
                    <td className="py-3 px-4 text-center text-gray-700">{ro.box}</td>
                    <td className="py-3 px-4 text-right">{getStatusBadge(ro.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {}
      {showDetailModal && selectedRO && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg max-h-[85vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
            {}
            <div className="bg-[#0D3B2E] p-4 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs opacity-80 font-mono">{selectedRO.id}</p>
                  <p className="font-semibold">{selectedRO.store}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadCSV(selectedRO)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-1 text-xs"
                    title="Download CSV"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">CSV</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      setSelectedRO(null);
                    }}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {}
            <div className="p-4 bg-gray-50 border-b border-gray-100 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Status:</span>{' '}
                  <span className="font-medium">{selectedRO.currentStatus}</span>
                </div>
                <div>
                  <span className="text-gray-500">Created:</span>{' '}
                  <span className="font-medium">{selectedRO.createdAt}</span>
                </div>
                <div>
                  <span className="text-gray-500">DNPB:</span>{' '}
                  <span className="font-medium">{selectedRO.dnpbNumber || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Articles:</span>{' '}
                  <span className="font-medium">{selectedRO.totalArticles} items</span>
                </div>
              </div>
              {selectedRO.notes && (
                <div className="text-sm">
                  <span className="text-gray-500">Notes:</span>{' '}
                  <span className="font-medium text-gray-700">{selectedRO.notes}</span>
                </div>
              )}
            </div>

            {}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-500" />
                  Articles ({selectedRO.articles.length})
                </h4>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                        <th className="py-2 font-medium">Article</th>
                        <th className="py-2 font-medium text-center w-14">Box</th>
                        <th className="py-2 font-medium text-center w-14 text-blue-600">DDD</th>
                        <th className="py-2 font-medium text-center w-14 text-purple-600">LJBB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRO.articles.map((article, idx) => (
                        <tr key={idx} className="border-b border-gray-100 last:border-0">
                          <td className="py-2">
                            <p className="font-mono text-xs text-gray-500">{article.kodeArtikel}</p>
                            <p className="text-gray-900 text-xs truncate max-w-[180px]">{article.namaArtikel}</p>
                          </td>
                          <td className="py-2 text-center font-medium">{article.boxesRequested}</td>
                          <td className="py-2 text-center text-blue-600 font-medium">{article.dddBoxes}</td>
                          <td className="py-2 text-center text-purple-600 font-medium">{article.ljbbBoxes}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-medium border-t-2 border-gray-200">
                        <td className="py-3 text-gray-700">TOTAL</td>
                        <td className="py-3 text-center text-gray-900">{selectedRO.totalBoxes}</td>
                        <td className="py-3 text-center text-blue-700">{selectedRO.dddBoxes}</td>
                        <td className="py-3 text-center text-purple-700">{selectedRO.ljbbBoxes}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="mt-3 text-xs text-gray-500 text-center">
                  Total: {selectedRO.totalBoxes} boxes = {selectedRO.totalBoxes * 12} pairs
                </div>
              </div>
            </div>

            {}
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedRO(null);
                }}
                className="w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      {isLoadingDetail && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-4 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin text-[#00D084]" />
            <span className="text-sm text-gray-600">Loading detail...</span>
          </div>
        </div>
      )}
    </div>
  );
}


