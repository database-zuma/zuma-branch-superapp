'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  Package,
  Truck,
  Home,
  ChevronRight,
  RefreshCw,
  Database,
  Download,
  Trash2,
  AlertTriangle,
  Plus,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ROArticle {
  kodeArtikel: string;
  namaArtikel: string;
  boxesRequested: number;
  dddBoxes: number;
  ljbbBoxes: number;
  mbbBoxes: number;
  ubbBoxes: number;
}

interface ROItem {
  id: string;
  store: string;
  createdAt: string;
  currentStatus: ROStatus;
  dnpbNumberDDD: string | null;
  dnpbNumberLJBB: string | null;
  dnpbNumberMBB: string | null;
  dnpbNumberUBB: string | null;
  totalBoxes: number;
  totalArticles: number;
  dddBoxes: number;
  ljbbBoxes: number;
  mbbBoxes: number;
  ubbBoxes: number;
  articles: ROArticle[];
}

type ROStatus = 'QUEUE' | 'APPROVED' | 'PICKING' | 'PICK_VERIFIED' | 'DNPB_PROCESS' | 'READY_TO_SHIP' | 'IN_DELIVERY' | 'ARRIVED' | 'BANDING_SENT' | 'COMPLETED';

const statusFlow: { id: ROStatus; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'QUEUE', label: 'Queue', icon: Clock, description: 'Awaiting approval' },
  { id: 'APPROVED', label: 'Approved', icon: CheckCircle2, description: 'WH Supervisor approved' },
  { id: 'PICKING', label: 'Picking', icon: Package, description: 'Being picked from warehouse' },
  { id: 'PICK_VERIFIED', label: 'Verified', icon: CheckCircle2, description: 'Pick quantities verified' },
  { id: 'DNPB_PROCESS', label: 'DNPB', icon: Database, description: 'Delivery note processing' },
  { id: 'READY_TO_SHIP', label: 'Ready', icon: Package, description: 'Ready for dispatch' },
  { id: 'IN_DELIVERY', label: 'Delivery', icon: Truck, description: 'Out for delivery' },
  { id: 'ARRIVED', label: 'Arrived', icon: Home, description: 'Received at store' },
  { id: 'BANDING_SENT', label: 'Banding', icon: RefreshCw, description: 'Re-check requested' },
  { id: 'COMPLETED', label: 'Completed', icon: CheckCircle2, description: 'Order closed' },
];

export default function ROProcess() {
  const [selectedRO, setSelectedRO] = useState<ROItem | null>(null);
  const [viewArticles, setViewArticles] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ONGOING' | 'SHIPPING' | 'COMPLETE'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [roData, setRoData] = useState<ROItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dnpbInputs, setDnpbInputs] = useState<{ ddd: string; ljbb: string; mbb: string; ubb: string }>({ ddd: '', ljbb: '', mbb: '', ubb: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [editedArticles, setEditedArticles] = useState<Record<string, { ddd: number; ljbb: number }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showAddArticle, setShowAddArticle] = useState(false);
  const [newArticle, setNewArticle] = useState({ kodeArtikel: '', namaArtikel: '', dddBoxes: 0, ljbbBoxes: 0 });

  useEffect(() => {
    fetchROData();
  }, []);

  useEffect(() => {
    if (selectedRO) {
      setDnpbInputs({
        ddd: selectedRO.dnpbNumberDDD || '',
        ljbb: selectedRO.dnpbNumberLJBB || '',
        mbb: selectedRO.dnpbNumberMBB || '',
        ubb: selectedRO.dnpbNumberUBB || '',
      });
    } else {
      setDnpbInputs({ ddd: '', ljbb: '', mbb: '', ubb: '' });
    }
  }, [selectedRO?.id]);

  const fetchROData = async (): Promise<ROItem[]> => {
    setIsLoadingData(true);
    try {
      const response = await fetch('/api/ro/process');
      const result = await response.json();
      if (result.success) {
        setRoData(result.data);
        return result.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching RO data:', error);
      return [];
    } finally {
      setIsLoadingData(false);
    }
  };

  const filteredROList = useMemo(() => {
    const ONGOING_STATUSES: ROStatus[] = ['QUEUE', 'APPROVED', 'PICKING', 'PICK_VERIFIED', 'DNPB_PROCESS'];
    const SHIPPING_STATUSES: ROStatus[] = ['READY_TO_SHIP', 'IN_DELIVERY', 'ARRIVED'];
    
    return roData.filter(ro => {
      let matchesStatus = false;
      if (filterStatus === 'ALL') matchesStatus = true;
      else if (filterStatus === 'ONGOING') matchesStatus = ONGOING_STATUSES.includes(ro.currentStatus);
      else if (filterStatus === 'SHIPPING') matchesStatus = SHIPPING_STATUSES.includes(ro.currentStatus);
      else if (filterStatus === 'COMPLETE') matchesStatus = ro.currentStatus === 'COMPLETED';
      
      const matchesSearch = searchQuery === '' || 
        ro.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ro.store.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [roData, filterStatus, searchQuery]);

  const getStatusColor = (status: ROStatus) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'IN_DELIVERY':
        return 'bg-blue-100 text-blue-700';
      case 'DNPB_PROCESS':
        return 'bg-yellow-100 text-yellow-700';
      case 'BANDING_SENT':
        return 'bg-orange-100 text-orange-700';
      case 'QUEUE':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-[#0D3B2E]/10 text-[#0D3B2E]';
    }
  };

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    await fetchROData();
    setIsLoading(false);
  }, []);

  const handleDeleteRO = async () => {
    if (!selectedRO) return;
    
    if (!confirm(`Are you sure you want to delete RO ${selectedRO.id}? This action cannot be undone.`)) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/ro/process/delete?roId=${selectedRO.id}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        toast.success(`RO ${selectedRO.id} deleted successfully`);
        setSelectedRO(null);
        setViewArticles(false);
        fetchROData();
      } else {
        toast.error(result.error || 'Failed to delete RO');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete RO');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (articleCode: string) => {
    if (!selectedRO) return;
    
    if (!confirm(`Remove article ${articleCode} from this RO?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/ro/articles/delete?roId=${selectedRO.id}&articleCode=${articleCode}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        toast.success(`Article ${articleCode} removed`);
        // Refresh local state without full reload if possible, or just fetchROData
        const freshData = await fetchROData();
        const updatedRO = freshData.find(r => r.id === selectedRO.id);
        if (updatedRO) setSelectedRO(updatedRO);
      } else {
        toast.error(result.error || 'Failed to remove article');
      }
    } catch (error) {
      console.error('Delete item error:', error);
      toast.error('Failed to remove article');
    }
  };
  const handleAddArticle = async () => {
    if (!selectedRO) return;
    if (!newArticle.kodeArtikel) {
      toast.error('Article code is required');
      return;
    }
    try {
      const response = await fetch('/api/ro/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId: selectedRO.id, articleCode: newArticle.kodeArtikel, namaArtikel: newArticle.namaArtikel, dddBoxes: newArticle.dddBoxes, ljbbBoxes: newArticle.ljbbBoxes })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        toast.success(`Article ${newArticle.kodeArtikel} added`);
        setShowAddArticle(false);
        setNewArticle({ kodeArtikel: '', namaArtikel: '', dddBoxes: 0, ljbbBoxes: 0 });
        const freshData = await fetchROData();
        const updatedRO = freshData.find(r => r.id === selectedRO.id);
        if (updatedRO) setSelectedRO(updatedRO);
      } else {
        toast.error(result.error || 'Failed to add article');
      }
    } catch (error) {
      console.error('Add article error:', error);
      toast.error('Failed to add article');
    }
  };

  const renderROList = () => (
    <div className="space-y-3">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[#0D3B2E]" />
          <span className="text-sm font-medium text-gray-700">Live Data</span>
        </div>
        <button 
          onClick={refreshData}
          className={cn("p-2 hover:bg-gray-100 rounded-lg transition-colors", isLoading && "animate-spin")}
        >
          <RefreshCw className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search RO ID or Store..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 pl-10 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00D084] focus:border-transparent"
        />
        <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {[
          { key: 'ONGOING', label: 'Ongoing' },
          { key: 'SHIPPING', label: 'Shipping' },
          { key: 'COMPLETE', label: 'Complete' },
          { key: 'ALL', label: 'All' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key as 'ALL' | 'ONGOING' | 'SHIPPING' | 'COMPLETE')}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              filterStatus === key 
                ? "bg-[#0D3B2E] text-white" 
                : "bg-gray-100 text-gray-600"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* RO Cards */}
      {isLoadingData ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : filteredROList.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No RO requests found</p>
          <p className="text-gray-400 text-sm">Submit an RO from the Request tab</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredROList.map((ro) => (
          <button
            key={ro.id}
            onClick={() => setSelectedRO(ro)}
            className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left hover:border-[#00D084] transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs text-gray-500 font-mono">{ro.id}</p>
                <p className="font-semibold text-gray-900">{ro.store}</p>
              </div>
              <span className={cn("px-2 py-1 rounded-full text-xs font-medium", getStatusColor(ro.currentStatus))}>
                {ro.currentStatus}
              </span>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>{ro.totalArticles} articles</span>
              <span>•</span>
              <span>{ro.totalBoxes} boxes</span>
              <span>•</span>
              <span>{ro.createdAt}</span>
            </div>
            
            <div className="mt-2 flex gap-2 text-xs">
              {ro.dddBoxes > 0 && (
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">DDD: {ro.dddBoxes}</span>
              )}
              {ro.ljbbBoxes > 0 && (
                <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded">LJBB: {ro.ljbbBoxes}</span>
              )}
            </div>
          </button>
        ))}
        </div>
      )}
    </div>
  );

  const renderRODetail = () => {
    if (!selectedRO) return null;

    const currentStatusIndex = statusFlow.findIndex(s => s.id === selectedRO.currentStatus);

    return (
      <div className="space-y-4">
        {/* Back Button */}
        <button
          onClick={() => {
            const hasUnsavedDDD = selectedRO.dddBoxes > 0 && dnpbInputs.ddd && dnpbInputs.ddd !== selectedRO.dnpbNumberDDD;
            const hasUnsavedLJBB = selectedRO.ljbbBoxes > 0 && dnpbInputs.ljbb && dnpbInputs.ljbb !== selectedRO.dnpbNumberLJBB;
            const hasUnsavedMBB = selectedRO.mbbBoxes > 0 && dnpbInputs.mbb && dnpbInputs.mbb !== selectedRO.dnpbNumberMBB;
            const hasUnsavedUBB = selectedRO.ubbBoxes > 0 && dnpbInputs.ubb && dnpbInputs.ubb !== selectedRO.dnpbNumberUBB;
            if ((hasUnsavedDDD || hasUnsavedLJBB || hasUnsavedMBB || hasUnsavedUBB) && !confirm('You have unsaved DNPB. Discard it?')) return;
            setSelectedRO(null);
            setViewArticles(false);
          }}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to List
        </button>

        {/* RO Header */}
        <div className="bg-[#0D3B2E] rounded-xl p-4 text-white">
          <p className="text-xs opacity-80 font-mono">{selectedRO.id}</p>
          <p className="font-semibold">{selectedRO.store}</p>
          <div className="flex items-center gap-4 mt-2 text-sm opacity-80">
            <span>{selectedRO.totalArticles} articles</span>
            <span>•</span>
            <span>{selectedRO.totalBoxes} boxes</span>
          </div>
          <div className="mt-2 flex gap-2">
            {selectedRO.dddBoxes > 0 && (
              <span className="px-2 py-1 bg-white/20 rounded text-xs">DDD: {selectedRO.dddBoxes} boxes</span>
            )}
            {selectedRO.ljbbBoxes > 0 && (
              <span className="px-2 py-1 bg-white/20 rounded text-xs">LJBB: {selectedRO.ljbbBoxes} boxes</span>
            )}
            {selectedRO.mbbBoxes > 0 && (
              <span className="px-2 py-1 bg-white/20 rounded text-xs">MBB: {selectedRO.mbbBoxes} boxes</span>
            )}
            {selectedRO.ubbBoxes > 0 && (
              <span className="px-2 py-1 bg-white/20 rounded text-xs">UBB: {selectedRO.ubbBoxes} boxes</span>
            )}
          </div>
          {/* Delete RO Button */}
          {isEditable && (
            <button
              onClick={handleDeleteRO}
              className="mt-3 w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-100 rounded-lg text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Delete this RO
            </button>
          )}
        </div>

        {selectedRO.currentStatus === 'DNPB_PROCESS' && (
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 space-y-4">
            <p className="text-sm font-medium text-yellow-800">
              📝 DNPB Numbers (Required)
            </p>
            
            {selectedRO.dddBoxes > 0 && (
              <div>
                <label className="block text-xs font-medium text-yellow-700 mb-1">
                  DNPB DDD
                </label>
                <input
                  type="text"
                  placeholder="DNPB/DDD/WHS/2026/I/001"
                  value={dnpbInputs.ddd}
                  onChange={(e) => setDnpbInputs({ ...dnpbInputs, ddd: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white"
                />
                {selectedRO.dnpbNumberDDD && (
                  <p className="mt-1 text-xs text-yellow-600">Current: {selectedRO.dnpbNumberDDD}</p>
                )}
              </div>
            )}
            
            {selectedRO.ljbbBoxes > 0 && (
              <div>
                <label className="block text-xs font-medium text-yellow-700 mb-1">
                  DNPB LJBB
                </label>
                <input
                  type="text"
                  placeholder="DNPB/LJBB/WHS/2026/I/001"
                  value={dnpbInputs.ljbb}
                  onChange={(e) => setDnpbInputs({ ...dnpbInputs, ljbb: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white"
                />
                {selectedRO.dnpbNumberLJBB && (
                  <p className="mt-1 text-xs text-yellow-600">Current: {selectedRO.dnpbNumberLJBB}</p>
                )}
              </div>
            )}

            {selectedRO.mbbBoxes > 0 && (
              <div>
                <label className="block text-xs font-medium text-yellow-700 mb-1">
                  DNPB MBB
                </label>
                <input
                  type="text"
                  placeholder="DNPB/MBB/WHS/2026/I/001"
                  value={dnpbInputs.mbb}
                  onChange={(e) => setDnpbInputs({ ...dnpbInputs, mbb: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white"
                />
                {selectedRO.dnpbNumberMBB && (
                  <p className="mt-1 text-xs text-yellow-600">Current: {selectedRO.dnpbNumberMBB}</p>
                )}
              </div>
            )}

            {selectedRO.ubbBoxes > 0 && (
              <div>
                <label className="block text-xs font-medium text-yellow-700 mb-1">
                  DNPB UBB
                </label>
                <input
                  type="text"
                  placeholder="DNPB/UBB/WHS/2026/I/001"
                  value={dnpbInputs.ubb}
                  onChange={(e) => setDnpbInputs({ ...dnpbInputs, ubb: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white"
                />
                {selectedRO.dnpbNumberUBB && (
                  <p className="mt-1 text-xs text-yellow-600">Current: {selectedRO.dnpbNumberUBB}</p>
                )}
              </div>
            )}
            
            <p className="text-xs text-yellow-600 italic">
              Format: DNPB/WAREHOUSE/WHS/YEAR/ROMAN/NUMBER
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="font-semibold text-gray-900 mb-4">Order Progress</h3>
          
          <div className="space-y-0">
            {statusFlow.map((status, index) => {
              const Icon = status.icon;
              const isCompleted = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;
              
              return (
                <div key={status.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div 
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                        isCompleted 
                          ? isCurrent 
                            ? "bg-[#00D084] text-white" 
                            : "bg-[#0D3B2E] text-white"
                          : "bg-gray-100 text-gray-400"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    {index < statusFlow.length - 1 && (
                      <div 
                        className={cn(
                          "w-0.5 h-8 my-1",
                          index < currentStatusIndex ? "bg-[#0D3B2E]" : "bg-gray-200"
                        )}
                      />
                    )}
                  </div>
                  
                  <div className={cn("pb-6", index === statusFlow.length - 1 && "pb-0")}>
                    <p 
                      className={cn(
                        "font-medium",
                        isCompleted ? "text-gray-900" : "text-gray-400"
                      )}
                    >
                      {status.label}
                    </p>
                    <p className="text-xs text-gray-500">{status.description}</p>
                    
                    {isCurrent && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-[#00D084]/10 text-[#00D084] text-xs rounded-full font-medium">
                        Current Status
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button 
            onClick={() => setViewArticles(true)}
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <Package className="w-4 h-4" /> View Articles
          </button>
          {selectedRO.currentStatus === 'IN_DELIVERY' && (
            <button
              onClick={async () => {
                if (!confirm('Mark this RO as arrived at store?')) return;
                
                setIsLoading(true);
                try {
                  const res = await fetch('/api/ro/status', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roId: selectedRO.id, status: 'ARRIVED' })
                  });
                  
                  const result = await res.json();
                  
                  if (result.success) {
                    setSelectedRO({
                      ...selectedRO,
                      currentStatus: 'ARRIVED'
                    });
                    fetchROData();
                    toast.success('RO marked as arrived');
                  } else {
                    toast.error(result.error || 'Failed to mark as arrived');
                  }
                } catch (error) {
                  toast.error('Failed to mark as arrived');
                  console.error(error);
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="flex-1 bg-green-500 text-white py-3 rounded-xl font-medium hover:bg-green-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Truck className="w-4 h-4" /> Mark Arrived
                </>
              )}
            </button>
          )}
          <button
            onClick={async () => {
              const currentIndex = statusFlow.findIndex(s => s.id === selectedRO.currentStatus);
              if (currentIndex >= statusFlow.length - 1) {
                toast.info('Order already completed');
                return;
              }
              
              const nextStatus = statusFlow[currentIndex + 1];
              if (!confirm(`Advance status to "${nextStatus.label}"?`)) return;
              
              if (selectedRO.currentStatus === 'DNPB_PROCESS') {
                const dnpbToSaveDDD = dnpbInputs.ddd || selectedRO.dnpbNumberDDD;
                const dnpbToSaveLJBB = dnpbInputs.ljbb || selectedRO.dnpbNumberLJBB;
                const dnpbToSaveMBB = dnpbInputs.mbb || selectedRO.dnpbNumberMBB;
                const dnpbToSaveUBB = dnpbInputs.ubb || selectedRO.dnpbNumberUBB;
                
                if (selectedRO.dddBoxes > 0 && !dnpbToSaveDDD) {
                  toast.warning('DNPB Number for DDD is required before proceeding');
                  return;
                }
                
                if (selectedRO.ljbbBoxes > 0 && !dnpbToSaveLJBB) {
                  toast.warning('DNPB Number for LJBB is required before proceeding');
                  return;
                }

                if (selectedRO.mbbBoxes > 0 && !dnpbToSaveMBB) {
                  toast.warning('DNPB Number for MBB is required before proceeding');
                  return;
                }

                if (selectedRO.ubbBoxes > 0 && !dnpbToSaveUBB) {
                  toast.warning('DNPB Number for UBB is required before proceeding');
                  return;
                }
                
                setIsLoading(true);
                try {
                  const dnpbRes = await fetch('/api/ro/dnpb', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      roId: selectedRO.id, 
                      dnpbNumberDDD: dnpbToSaveDDD,
                      dnpbNumberLJBB: dnpbToSaveLJBB,
                      dnpbNumberMBB: dnpbToSaveMBB,
                      dnpbNumberUBB: dnpbToSaveUBB,
                    })
                  });
                  const dnpbResult = await dnpbRes.json();
                  if (!dnpbResult.success) {
                    toast.error(`DNPB Error: ${dnpbResult.error}`);
                    setIsLoading(false);
                    return;
                  }
                } catch (error) {
                  toast.error('Failed to save DNPB number');
                  setIsLoading(false);
                  return;
                }
              }
              
              setIsLoading(true);
              
              try {
                const res = await fetch('/api/ro/status', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roId: selectedRO.id, status: nextStatus.id })
                });
                
                const result = await res.json();
                
                if (result.success) {
                  setSelectedRO({ 
                    ...selectedRO, 
                    currentStatus: nextStatus.id, 
                    dnpbNumberDDD: dnpbInputs.ddd || selectedRO.dnpbNumberDDD,
                    dnpbNumberLJBB: dnpbInputs.ljbb || selectedRO.dnpbNumberLJBB,
                    dnpbNumberMBB: dnpbInputs.mbb || selectedRO.dnpbNumberMBB,
                    dnpbNumberUBB: dnpbInputs.ubb || selectedRO.dnpbNumberUBB,
                  });
                  setDnpbInputs({ ddd: '', ljbb: '', mbb: '', ubb: '' });
                  fetchROData();
                  toast.success(`Status updated to ${nextStatus.label}`);
                } else {
                  toast.error(result.error);
                }
              } catch (error) {
                toast.error('Failed to update status');
                console.error(error);
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading || statusFlow.findIndex(s => s.id === selectedRO.currentStatus) >= statusFlow.length - 1}
            className="flex-1 bg-[#00D084] text-white py-3 rounded-xl font-medium hover:bg-[#00B874] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>Next Stage <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    );
  };

  const getArticleValues = useCallback((article: ROArticle) => {
    const edited = editedArticles[article.kodeArtikel];
    return {
      ddd: edited?.ddd ?? article.dddBoxes,
      ljbb: edited?.ljbb ?? article.ljbbBoxes,
    };
  }, [editedArticles]);

  const updateArticleQty = useCallback((articleCode: string, field: 'ddd' | 'ljbb', delta: number) => {
    if (!selectedRO) return;
    const article = selectedRO.articles.find(a => a.kodeArtikel === articleCode);
    if (!article) return;
    
    const edited = editedArticles[article.kodeArtikel];
    const current = {
      ddd: edited?.ddd ?? article.dddBoxes,
      ljbb: edited?.ljbb ?? article.ljbbBoxes,
    };
    const newValue = Math.max(0, current[field] + delta);
    
    setEditedArticles(prev => ({
      ...prev,
      [articleCode]: {
        ...current,
        [field]: newValue,
      }
    }));
  }, [selectedRO, editedArticles]);

  const setArticleQty = useCallback((articleCode: string, field: 'ddd' | 'ljbb', value: number) => {
    if (!selectedRO) return;
    const article = selectedRO.articles.find(a => a.kodeArtikel === articleCode);
    if (!article) return;
    
    const edited = editedArticles[article.kodeArtikel];
    const current = {
      ddd: edited?.ddd ?? article.dddBoxes,
      ljbb: edited?.ljbb ?? article.ljbbBoxes,
    };
    const sanitizedValue = Math.max(0, Math.floor(value) || 0);
    
    setEditedArticles(prev => ({
      ...prev,
      [articleCode]: {
        ...current,
        [field]: sanitizedValue,
      }
    }));
  }, [selectedRO, editedArticles]);

  const saveArticleChanges = async () => {
    if (!selectedRO || Object.keys(editedArticles).length === 0) return;

    setIsSaving(true);
    try {
      const updates = Object.entries(editedArticles).map(([articleCode, values]) => ({
        articleCode,
        dddBoxes: values.ddd,
        ljbbBoxes: values.ljbb,
      }));

      const res = await fetch('/api/ro/articles/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roId: selectedRO.id,
          updates,
        })
      });

      const result = await res.json();

      if (!result.success) {
        const failedCodes = result.failedUpdates?.map((e: { articleCode: string }) => e.articleCode).join(', ') || 'unknown';
        toast.error(`Failed to update: ${failedCodes}`);
        return;
      }

      setEditedArticles({});
      const freshData = await fetchROData();

      toast.success('Changes saved successfully');
      if (freshData.length > 0) {
        const updatedRO = freshData.find(ro => ro.id === selectedRO.id);
        if (updatedRO) {
          setSelectedRO(updatedRO);
        }
      }
    } catch (error) {
      toast.error('Failed to save changes');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = Object.keys(editedArticles).length > 0;

  const isEditable = selectedRO ? !['READY_TO_SHIP', 'IN_DELIVERY', 'ARRIVED', 'COMPLETED'].includes(selectedRO.currentStatus) : false;

  const downloadCSV = () => {
    if (!selectedRO) return;

    const csvRows = [
      ['RO_ID', 'Store', 'Status', 'Created_Date', 'DNPB_DDD', 'DNPB_LJBB', 'DNPB_MBB', 'DNPB_UBB', 'Article_Code', 'Article_Name', 'Box', 'DDD', 'LJBB', 'MBB', 'UBB'],
      ...selectedRO.articles.map(article => [
        selectedRO.id,
        selectedRO.store,
        selectedRO.currentStatus,
        selectedRO.createdAt,
        selectedRO.dnpbNumberDDD || '-',
        selectedRO.dnpbNumberLJBB || '-',
        selectedRO.dnpbNumberMBB || '-',
        selectedRO.dnpbNumberUBB || '-',
        article.kodeArtikel,
        article.namaArtikel,
        (article.dddBoxes + article.ljbbBoxes + article.mbbBoxes + article.ubbBoxes).toString(),
        article.dddBoxes.toString(),
        article.ljbbBoxes.toString(),
        article.mbbBoxes.toString(),
        article.ubbBoxes.toString()
      ])
    ];

    const csvContent = csvRows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RO-${selectedRO.id}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded successfully');
  };

  const renderArticlesView = () => {
    if (!selectedRO) return null;

    return (
      <div className="space-y-4">
        <button
          onClick={() => {
            if (hasChanges && !confirm('You have unsaved changes. Discard them?')) return;
            setViewArticles(false);
            setEditedArticles({});
          }}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to RO Detail
        </button>

        <div className="bg-[#0D3B2E] rounded-xl p-4 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs opacity-80 font-mono">{selectedRO.id}</p>
              <p className="font-semibold">{selectedRO.store}</p>
            </div>
            <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-medium">
              {selectedRO.currentStatus}
            </span>
          </div>
          <p className="text-sm opacity-80 mt-2">{selectedRO.totalArticles} articles • {selectedRO.totalBoxes} boxes</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Article Breakdown</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={downloadCSV}
                className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                title="Download CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">CSV</span>
              </button>
              {isEditable && hasChanges && (
                <button
                  onClick={saveArticleChanges}
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-[#00D084] text-white text-sm font-medium rounded-lg hover:bg-[#00B874] disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                  Save Changes
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto" style={{ overflowY: 'hidden' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                  <th className="py-3 px-3 font-medium">Article</th>
                  <th className="py-3 px-2 font-medium text-center">Box</th>
                  <th className="py-3 px-2 font-medium text-center text-blue-600">DDD</th>
                  <th className="py-3 px-2 font-medium text-center text-purple-600">LJBB</th>
                  <th className="py-3 px-2 font-medium text-center text-orange-600">MBB</th>
                  <th className="py-3 px-2 font-medium text-center text-teal-600">UBB</th>
                  <th className="py-3 px-2 font-medium text-center w-20">
                    <button onClick={() => setShowAddArticle(true)} className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-xs font-medium">
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedRO.articles.map((article, idx) => {
                  const values = getArticleValues(article);
                  const isEdited = !!editedArticles[article.kodeArtikel];
                  return (
                    <tr key={idx} className={cn("border-b border-gray-50 last:border-0", isEdited && "bg-yellow-50")}>
                      <td className="py-3 px-3">
                        <p className="font-mono text-xs text-gray-500">{article.kodeArtikel}</p>
                        <p className="text-gray-900 text-xs truncate max-w-[150px]">{article.namaArtikel}</p>
                      </td>
                      <td className="py-3 px-2 text-center font-medium text-gray-900">{values.ddd + values.ljbb + article.mbbBoxes + article.ubbBoxes}</td>
                      <td className="py-2 px-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEditable ? (
                            <>
                              <button onClick={() => updateArticleQty(article.kodeArtikel, 'ddd', -1)} disabled={values.ddd <= 0} className="w-6 h-6 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold">-</button>
                              <input
                                type="number"
                                min="0"
                                value={values.ddd}
                                onChange={(e) => setArticleQty(article.kodeArtikel, 'ddd', parseInt(e.target.value) || 0)}
                                className="w-10 h-6 text-center text-blue-700 font-medium text-xs bg-white border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button onClick={() => updateArticleQty(article.kodeArtikel, 'ddd', 1)} className="w-6 h-6 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-xs font-bold">+</button>
                            </>
                          ) : (
                            <span className="w-10 h-6 text-center text-blue-700 font-medium text-xs bg-gray-100 border border-gray-200 rounded flex items-center justify-center">{values.ddd}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEditable ? (
                            <>
                              <button onClick={() => updateArticleQty(article.kodeArtikel, 'ljbb', -1)} disabled={values.ljbb <= 0} className="w-6 h-6 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold">-</button>
                              <input
                                type="number"
                                min="0"
                                value={values.ljbb}
                                onChange={(e) => setArticleQty(article.kodeArtikel, 'ljbb', parseInt(e.target.value) || 0)}
                                className="w-10 h-6 text-center text-purple-700 font-medium text-xs bg-white border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button onClick={() => updateArticleQty(article.kodeArtikel, 'ljbb', 1)} className="w-6 h-6 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-xs font-bold">+</button>
                            </>
                          ) : (
                            <span className="w-10 h-6 text-center text-purple-700 font-medium text-xs bg-gray-100 border border-gray-200 rounded flex items-center justify-center">{values.ljbb}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span className="w-10 h-6 text-center text-orange-700 font-medium text-xs bg-orange-50 border border-orange-200 rounded flex items-center justify-center mx-auto">{article.mbbBoxes}</span>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span className="w-10 h-6 text-center text-teal-700 font-medium text-xs bg-teal-50 border border-teal-200 rounded flex items-center justify-center mx-auto">{article.ubbBoxes}</span>
                      </td>
                      <td className="py-2 px-1 text-center">
                        <button
                          onClick={() => handleDeleteItem(article.kodeArtikel)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const totals = selectedRO.articles.reduce((acc, article) => {
                    const values = getArticleValues(article);
                    return { ddd: acc.ddd + values.ddd, ljbb: acc.ljbb + values.ljbb, mbb: acc.mbb + article.mbbBoxes, ubb: acc.ubb + article.ubbBoxes };
                  }, { ddd: 0, ljbb: 0, mbb: 0, ubb: 0 });
                  return (
                    <tr className="bg-gray-50 font-medium">
                      <td className="py-3 px-3 text-gray-700">Total</td>
                      <td className="py-3 px-2 text-center text-gray-900">{totals.ddd + totals.ljbb + totals.mbb + totals.ubb}</td>
                      <td className="py-3 px-2 text-center text-blue-700">{totals.ddd}</td>
                      <td className="py-3 px-2 text-center text-purple-700">{totals.ljbb}</td>
                      <td className="py-3 px-2 text-center text-orange-700">{totals.mbb}</td>
                      <td className="py-3 px-2 text-center text-teal-700">{totals.ubb}</td>
                      <td className="py-3 px-2"></td>
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Add Article Modal
  if (showAddArticle) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold text-gray-900">Add Article</h3>
            <button onClick={() => setShowAddArticle(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Article Code *</label>
              <input type="text" value={newArticle.kodeArtikel} onChange={(e) => setNewArticle({ ...newArticle, kodeArtikel: e.target.value })} placeholder="e.g., ZUMA-001" className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Article Name</label>
              <input type="text" value={newArticle.namaArtikel} onChange={(e) => setNewArticle({ ...newArticle, namaArtikel: e.target.value })} placeholder="e.g., Sandal Zuma Hitam" className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">DDD Boxes</label>
                <input type="number" min="0" value={newArticle.dddBoxes} onChange={(e) => setNewArticle({ ...newArticle, dddBoxes: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LJBB Boxes</label>
                <input type="number" min="0" value={newArticle.ljbbBoxes} onChange={(e) => setNewArticle({ ...newArticle, ljbbBoxes: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddArticle(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddArticle} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Add Article</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {viewArticles ? renderArticlesView() : (selectedRO ? renderRODetail() : renderROList())}
    </div>
  );
}
