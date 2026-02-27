'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Minus, Trash2, Package, Store, Send, Search, X, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ArticleItem {
  id: string;
  code: string;
  name: string;
  boxes_ddd: number;
  boxes_ljbb: number;
  boxes_mbb: number;
  boxes_ubb: number;
  warehouse_stock: {
    ddd_available: number;
    ljbb_available: number;
    mbb_available: number;
    ubb_available: number;
    total_available: number;
  };
}

interface AvailableArticle {
  code: string;
  name: string;
  warehouse_stock: {
    ddd_available: number;
    ljbb_available: number;
    mbb_available: number;
    ubb_available: number;
    total_available: number;
  };
}

interface RecommendationItem {
  article_code: string;
  article_name: string;
  suggested_boxes: number;
  priority: 'urgent' | 'normal' | 'low';
  warehouse_stock: {
    ddd_available: number;
    ljbb_available: number;
    mbb_available: number;
    ubb_available: number;
    total_available: number;
  };
}

export default function RequestForm() {
  const [selectedStore, setSelectedStore] = useState('');
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [tempArticles, setTempArticles] = useState<ArticleItem[]>([]);
  const [notes, setNotes] = useState('');
  const [showArticleSelector, setShowArticleSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingStores, setIsLoadingStores] = useState(true);
  
  const [pendingEdits, setPendingEdits] = useState<Record<string, { ddd: number; ljbb: number }>>({});
  
  const [availableArticles, setAvailableArticles] = useState<AvailableArticle[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stores, setStores] = useState<string[]>([]);

  const specialStores = [
    'Other Need',
    'Wholesale',
    'Consignment',
  ];

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const response = await fetch('/api/stores');
        const result = await response.json();
        if (result.success) {
          setStores(result.data.regular);
        }
      } catch (error) {
        console.error('Error fetching stores:', error);
      } finally {
        setIsLoadingStores(false);
      }
    };
    fetchStores();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    
    if (showArticleSelector) {
      fetchArticles(abortController.signal);
    }
    
    return () => abortController.abort();
  }, [showArticleSelector, searchQuery]);

  const fetchArticles = async (signal?: AbortSignal) => {
    setIsLoadingArticles(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      
      const response = await fetch(`/api/articles?${params.toString()}`, { signal });
      const result = await response.json();
      
      if (result.success) {
        setAvailableArticles(result.data);
      } else {
        console.error('Error fetching articles:', result.error);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('Error fetching articles:', error);
    } finally {
      setIsLoadingArticles(false);
    }
  };

  // Fetch recommendations when AUTO button clicked
  const fetchRecommendations = async () => {
    if (!selectedStore || specialStores.includes(selectedStore)) return;
    
    setIsLoadingRecommendations(true);
    try {
      const params = new URLSearchParams();
      params.append('store_name', selectedStore);
      
      const response = await fetch(`/api/ro/recommendations?${params.toString()}`);
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        // Helper to auto-allocate boxes across warehouses
        const allocateBoxes = (suggested: number, dddAvail: number, ljbbAvail: number) => {
          const ddd = Math.min(suggested, dddAvail);
          const remaining = suggested - ddd;
          const ljbb = Math.min(remaining, ljbbAvail);
          return { ddd, ljbb };
        };

        // Convert recommendations to article items
        const recommendationItems: ArticleItem[] = result.data.map((rec: RecommendationItem) => {
          const { ddd, ljbb } = allocateBoxes(
            rec.suggested_boxes,
            rec.warehouse_stock.ddd_available,
            rec.warehouse_stock.ljbb_available
          );
          return {
            id: `${rec.article_code}-${Date.now()}-${Math.random()}`,
            code: rec.article_code,
            name: rec.article_name,
            boxes_ddd: ddd,
            boxes_ljbb: ljbb,
            boxes_mbb: 0,
            boxes_ubb: 0,
            warehouse_stock: rec.warehouse_stock,
          };
        });
        
        // Replace current articles with recommendations
        setArticles(recommendationItems);
      } else {
        toast.info(`No recommendations found for ${selectedStore}`);
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      toast.error('Error fetching recommendations. Please try again.');
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const filteredArticles = useMemo(() => {
    return availableArticles.filter(article => {
      const notAdded = !articles.some(a => a.code === article.code);
      return notAdded;
    });
  }, [availableArticles, articles]);

  const addArticle = useCallback((article: AvailableArticle) => {
    const newItem: ArticleItem = {
      id: `${article.code}-${Date.now()}`,
      code: article.code,
      name: article.name,
      boxes_ddd: 1,
      boxes_ljbb: 0,
      boxes_mbb: 0,
      boxes_ubb: 0,
      warehouse_stock: article.warehouse_stock,
    };
    setArticles(prev => [...prev, newItem]);
    setSearchQuery('');
  }, []);

  const removeArticle = useCallback((id: string) => {
    if (!confirm('Remove this article from the order?')) return;
    setArticles(prev => prev.filter((item) => item.id !== id));
  }, []);

  const clearAllArticles = useCallback(() => {
    if (articles.length === 0) return;
    if (!confirm(`Clear all ${articles.length} articles from the order?`)) return;
    setArticles([]);
    toast.info('All articles cleared');
  }, [articles.length]);

  const initPendingEdit = useCallback((article: ArticleItem) => {
    if (!pendingEdits[article.id]) {
      setPendingEdits(prev => ({
        ...prev,
        [article.id]: { ddd: article.boxes_ddd, ljbb: article.boxes_ljbb }
      }));
    }
  }, [pendingEdits]);

  const updatePendingQty = useCallback((id: string, warehouse: 'ddd' | 'ljbb', value: number) => {
    const sanitizedValue = Math.max(0, Math.floor(value) || 0);
    setPendingEdits(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [warehouse]: sanitizedValue
      }
    }));
  }, []);

  const applyPendingEdit = useCallback((id: string) => {
    const pending = pendingEdits[id];
    if (!pending) return;
    
    setArticles(prev => prev.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        boxes_ddd: pending.ddd,
        boxes_ljbb: pending.ljbb,
      };
    }));
    
    setPendingEdits(prev => {
      const newEdits = { ...prev };
      delete newEdits[id];
      return newEdits;
    });
    
    toast.success('Quantity updated');
  }, [pendingEdits]);

  const hasPendingChanges = useCallback((article: ArticleItem) => {
    const pending = pendingEdits[article.id];
    if (!pending) return false;
    return pending.ddd !== article.boxes_ddd || pending.ljbb !== article.boxes_ljbb;
  }, [pendingEdits]);

  const getPendingValue = useCallback((article: ArticleItem, warehouse: 'ddd' | 'ljbb') => {
    const pending = pendingEdits[article.id];
    if (pending) return pending[warehouse];
    return warehouse === 'ddd' ? article.boxes_ddd : article.boxes_ljbb;
  }, [pendingEdits]);

  const { totalBoxes, totalPairs } = useMemo(() => {
    const boxes = articles.reduce((sum, item) => 
      sum + item.boxes_ddd + item.boxes_ljbb + item.boxes_mbb + item.boxes_ubb, 0);
    return { totalBoxes: boxes, totalPairs: boxes * 12 };
  }, [articles]);

  // Get stock status color
  const getStockStatusColor = (requested: number, available: number) => {
    if (available === 0) return 'red';
    if (requested > available) return 'yellow';
    return 'green';
  };



  const handleSubmit = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/ro/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          store_name: selectedStore,
          articles: articles.map(a => ({
            code: a.code,
            name: a.name,
            boxes_ddd: a.boxes_ddd,
            boxes_ljbb: a.boxes_ljbb,
            boxes_mbb: a.boxes_mbb,
            boxes_ubb: a.boxes_ubb,
            warehouse_stock: a.warehouse_stock,
          })),
          notes: notes,
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success('RO Submitted Successfully!', {
          description: `${result.data.ro_id} • ${result.data.store_name} • ${result.data.articles_count} articles • ${result.data.total_boxes} boxes`,
        });
        
        // Reset form after submission
        setSelectedStore('');
        setArticles([]);
        setNotes('');
      } else {
        setSubmitError(result.error || 'Failed to submit RO');
        toast.error(result.error || 'Failed to submit RO');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit RO';
      console.error('Error submitting RO:', error);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header Info */}
      <div className="bg-gradient-to-r from-[#0D3B2E] to-[#1a5a48] rounded-xl p-4 text-white">
        <div className="flex items-center gap-2 mb-2">
          <Package className="w-5 h-5" />
          <span className="font-semibold">New Replenishment Order</span>
        </div>
        <p className="text-sm opacity-80">Weekly stock request for your stores</p>
        <p className="text-xs opacity-60 mt-1">RO ID will be auto-generated on submit (Format: RO-YYMM-XXXX)</p>
      </div>

      {/* Store Selection */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          <Store className="w-4 h-4 text-[#0D3B2E]" />
          Destination Store
        </label>
        <div className="relative">
          {/* Searchable Input */}
          <div className="relative">
            <input
              type="text"
              value={storeSearchQuery}
              onChange={(e) => {
                setStoreSearchQuery(e.target.value);
                setShowStoreDropdown(true);
              }}
              onFocus={() => setShowStoreDropdown(true)}
              placeholder={selectedStore || "Search or select store..."}
              className="w-full p-3 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D084] focus:border-transparent"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          
          {/* Dropdown */}
          {showStoreDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {/* Regular Stores Section */}
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0">
                Regular Stores
              </div>
              {stores
                .filter(store => store.toLowerCase().includes(storeSearchQuery.toLowerCase()))
                .map((store) => (
                  <button
                    key={store}
                    onClick={() => {
                      setSelectedStore(store);
                      setStoreSearchQuery('');
                      setShowStoreDropdown(false);
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors ${
                      selectedStore === store ? 'bg-[#00D084]/10 text-[#0D3B2E] font-medium' : 'text-gray-700'
                    }`}
                  >
                    {store}
                  </button>
                ))}
              
              {/* Special Options Section */}
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 sticky top-0 border-t">
                Special Options
              </div>
              {specialStores
                .filter(store => store.toLowerCase().includes(storeSearchQuery.toLowerCase()))
                .map((store) => (
                  <button
                    key={store}
                    onClick={() => {
                      setSelectedStore(store);
                      setStoreSearchQuery('');
                      setShowStoreDropdown(false);
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors ${
                      selectedStore === store ? 'bg-[#00D084]/10 text-[#0D3B2E] font-medium' : 'text-gray-700'
                    }`}
                  >
                    {store}
                  </button>
                ))}
              
              {/* No results */}
              {[...stores, ...specialStores].filter(store => 
                store.toLowerCase().includes(storeSearchQuery.toLowerCase())
              ).length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No stores found
                </div>
              )}
            </div>
          )}
          
          {/* Click outside to close */}
          {showStoreDropdown && (
            <div 
              className="fixed inset-0 z-40"
              onClick={() => setShowStoreDropdown(false)}
            />
          )}
        </div>
        
        {/* Selected Store Display */}
        {selectedStore && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-gray-600">Selected:</span>
            <span className="text-sm font-medium text-[#0D3B2E] bg-[#00D084]/10 px-2 py-1 rounded">
              {selectedStore}
            </span>
            <button
              onClick={() => {
                setSelectedStore('');
                setStoreSearchQuery('');
              }}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Articles List */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Articles</h3>
            <p className="text-xs text-gray-500">Minimum 1 box per article (12 pairs)</p>
          </div>
          <div className="flex gap-2">
            {/* Auto Generate Button - Only for regular stores */}
            <button
              onClick={() => {
                if (!selectedStore) {
                  toast.warning('Please select a destination store first!');
                  return;
                }
                if (specialStores.includes(selectedStore)) {
                  toast.info('Auto-generate is only available for regular stores');
                  return;
                }
                fetchRecommendations();
              }}
              disabled={!selectedStore || specialStores.includes(selectedStore) || isLoadingRecommendations}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-[#00D084] bg-white text-[#00D084] font-medium text-sm hover:bg-[#00D084]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoadingRecommendations ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/>
                  <path d="M20 2v4"/>
                  <path d="M22 4h-4"/>
                  <circle cx="4" cy="20" r="2"/>
                </svg>
              )}
              {isLoadingRecommendations ? 'Loading...' : 'AUTO'}
            </button>
            
            <Button
              onClick={() => {
                if (!selectedStore) {
                  toast.warning('Please select a destination store first!');
                  return;
                }
                setTempArticles([...articles]);
                setShowArticleSelector(true);
              }}
              className="bg-[#00D084] hover:bg-[#00B874] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              size="sm"
              disabled={!selectedStore}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm mb-2">No articles selected</p>
            <p className="text-gray-400 text-xs">Click AUTO for recommendations or + Add to select articles</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex justify-end">
              <button
                onClick={clearAllArticles}
                className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
            </div>
            <div className="divide-y divide-gray-100">
            {articles.map((article) => {
              const retailAvailable = (article.warehouse_stock?.ddd_available || 0) + (article.warehouse_stock?.ljbb_available || 0);
               const totalRequested = article.boxes_ddd + article.boxes_ljbb;
               const stockStatus = getStockStatusColor(totalRequested, retailAvailable);
               const stockBadgeColor = stockStatus === 'green' ? 'bg-green-100 text-green-700' :
                                       stockStatus === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                                       'bg-red-100 text-red-700';

               return (
                 <div key={article.id} className="p-4">
                   <div className="flex items-start justify-between mb-2">
                     <div className="flex-1">
                       <div className="flex items-center gap-2">
                         <p className="text-xs text-gray-500 font-mono">{article.code}</p>
                         <span className={`text-[10px] px-2 py-0.5 rounded-full ${stockBadgeColor}`}>
                           {retailAvailable} available
                         </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{article.name}</p>
                    </div>
                    <button
                      onClick={() => removeArticle(article.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

<div className="grid grid-cols-2 gap-2 text-xs">
                     <div className="flex items-center justify-between bg-blue-50 rounded px-2 py-2">
                       <span className="text-blue-700 font-medium">DDD:</span>
                       <div className="flex items-center gap-1">
                         <button
                           onClick={() => {
                             initPendingEdit(article);
                             updatePendingQty(article.id, 'ddd', getPendingValue(article, 'ddd') - 1);
                           }}
                           disabled={getPendingValue(article, 'ddd') <= 0}
                           className="w-6 h-6 rounded bg-blue-200 text-blue-800 hover:bg-blue-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold transition-colors"
                         >
                           -
                         </button>
                         <input
                           type="number"
                           min="0"
                           value={getPendingValue(article, 'ddd')}
                           onChange={(e) => {
                             initPendingEdit(article);
                             updatePendingQty(article.id, 'ddd', parseInt(e.target.value) || 0);
                           }}
                           onFocus={() => initPendingEdit(article)}
                           className="w-12 h-6 text-center font-bold text-sm bg-white border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                         />
                         <button
                           onClick={() => {
                             initPendingEdit(article);
                             updatePendingQty(article.id, 'ddd', getPendingValue(article, 'ddd') + 1);
                           }}
                           className="w-6 h-6 rounded bg-blue-200 text-blue-800 hover:bg-blue-300 flex items-center justify-center text-sm font-bold transition-colors"
                         >
                           +
                         </button>
                       </div>
                     </div>
                     <div className="flex items-center justify-between bg-purple-50 rounded px-2 py-2">
                       <span className="text-purple-700 font-medium">LJBB:</span>
                       <div className="flex items-center gap-1">
                         <button
                           onClick={() => {
                             initPendingEdit(article);
                             updatePendingQty(article.id, 'ljbb', getPendingValue(article, 'ljbb') - 1);
                           }}
                           disabled={getPendingValue(article, 'ljbb') <= 0}
                           className="w-6 h-6 rounded bg-purple-200 text-purple-800 hover:bg-purple-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold transition-colors"
                         >
                           -
                         </button>
                         <input
                           type="number"
                           min="0"
                           value={getPendingValue(article, 'ljbb')}
                           onChange={(e) => {
                             initPendingEdit(article);
                             updatePendingQty(article.id, 'ljbb', parseInt(e.target.value) || 0);
                           }}
                           onFocus={() => initPendingEdit(article)}
                           className="w-12 h-6 text-center font-bold text-sm bg-white border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                         />
                         <button
                           onClick={() => {
                             initPendingEdit(article);
                             updatePendingQty(article.id, 'ljbb', getPendingValue(article, 'ljbb') + 1);
                           }}
                           className="w-6 h-6 rounded bg-purple-200 text-purple-800 hover:bg-purple-300 flex items-center justify-center text-sm font-bold transition-colors"
                         >
                           +
                         </button>
                       </div>
                     </div>
                   </div>
                   
                   {hasPendingChanges(article) && (
                     <div className="mt-2 flex items-center justify-end gap-2">
                       <span className="text-xs text-orange-600">Unsaved changes</span>
                       <button
                         onClick={() => applyPendingEdit(article.id)}
                         className="flex items-center gap-1 px-3 py-1 bg-[#00D084] hover:bg-[#00B874] text-white text-xs font-medium rounded-lg transition-colors"
                       >
                         <Check className="w-3 h-3" />
                         Apply
                       </button>
                     </div>
                   )}
                    <div className="text-xs text-gray-400 mt-1">
                      <span className="text-blue-500">Stock DDD: {article.warehouse_stock?.ddd_available || 0}</span>
                      <span className="mx-1">|</span>
                      <span className="text-purple-500">Stock LJBB: {article.warehouse_stock?.ljbb_available || 0}</span>
                    </div>
                </div>
              );
            })}
          </div>
        </>
        )}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <label className="text-sm font-medium text-gray-700 mb-2 block">Notes (Optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any special instructions..."
          rows={3}
          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D084] focus:border-transparent resize-none"
        />
      </div>

      {/* Summary */}
      <div className="bg-[#0D3B2E] rounded-xl p-4 text-white">
        <h3 className="font-semibold mb-3">Order Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="opacity-80">Total Articles:</span>
            <span className="font-semibold">{articles.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-80">Total Boxes:</span>
            <span className="font-semibold">{totalBoxes}</span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-80">Total Pairs:</span>
            <span className="font-semibold">{totalPairs}</span>
          </div>
          <div className="border-t border-white/20 pt-2 mt-2">
            <div className="flex justify-between">
              <span className="opacity-80">Destination:</span>
              <span className="font-semibold text-right">{selectedStore || 'Not selected'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Article Selector Modal */}
      {showArticleSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-[#0D3B2E] text-white">
              <div>
                <h3 className="font-semibold">Select Articles</h3>
                <p className="text-xs opacity-80">
                  {isLoadingArticles ? 'Loading...' : `${filteredArticles.length} available`}
                </p>
              </div>
              <button
                onClick={() => {
                  setArticles(tempArticles);
                  setShowArticleSelector(false);
                  setSearchQuery('');
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search article name or code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00D084] focus:border-transparent"
                  autoFocus
                />
              </div>
            </div>

            {/* Article List */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingArticles ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[#00D084]" />
                  <p className="text-gray-500">Loading articles...</p>
                </div>
              ) : filteredArticles.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-500">No articles found</p>
                  <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredArticles.map((article) => {
                    const stockStatus = article.warehouse_stock?.total_available > 0 ? 'green' : 'red';
                    const stockBadgeColor = stockStatus === 'green' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
                    
                    return (
                      <button
                        key={article.code}
                        onClick={() => addArticle(article)}
                        className="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between group"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-gray-500">{article.code}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${stockBadgeColor}`}>
                              {article.warehouse_stock?.total_available || 0} box
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900">{article.name}</p>
                          <p className="text-[10px] text-gray-400 mt-1">
                            DDD: {article.warehouse_stock?.ddd_available || 0} | LJBB: {article.warehouse_stock?.ljbb_available || 0}
                          </p>
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors bg-gray-100 group-hover:bg-[#00D084] group-hover:text-white">
                          <Plus className="w-4 h-4" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer with Done Button */}
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-[#0D3B2E]">{articles.length}</span> article(s) selected
                </div>
                <button
                  onClick={() => {
                    setTempArticles([]);
                    setShowArticleSelector(false);
                    setSearchQuery('');
                  }}
                  className="px-6 py-2 bg-[#00D084] hover:bg-[#00B874] text-white font-medium rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={!selectedStore || articles.length === 0 || isSubmitting}
        className="w-full bg-[#00D084] hover:bg-[#00B874] text-white py-6 text-lg font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="w-5 h-5 mr-2" />
            Submit RO Request
          </>
        )}
      </Button>

      {/* Error Display */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
          <p className="text-sm font-medium">Error: {submitError}</p>
        </div>
      )}
    </div>
  );
}
