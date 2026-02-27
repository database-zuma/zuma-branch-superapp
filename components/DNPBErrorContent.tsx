"use client"

import { useState, useEffect } from "react"
import { Package, ChevronRight, AlertTriangle, CheckCircle2, RefreshCw, X, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface DNPBErrorDetail {
  article_code: string
  article_name: string
  sku_code: string
  size: string
  pairs_per_box: number
  pairs_shipped: number
  fisik: number
  selisih: number | string
  notes: string | null
}

export interface DNPBErrorRO {
  ro_id: string
  store_name: string
  dnpb_number_ddd: string | null
  dnpb_number_ljbb: string | null
  total_items: number
  total_selisih: number
  confirmed_at: string
  details?: DNPBErrorDetail[]
}

interface DNPBErrorContentProps {
  onSelectRO?: (ro: DNPBErrorRO) => void
}

export function DNPBErrorContent({ onSelectRO }: DNPBErrorContentProps) {
  const [items, setItems] = useState<DNPBErrorRO[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = async () => {
    try {
      setRefreshing(true)
      const response = await fetch("/api/ro/dnpb-error")
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch")
      }

      setItems(result.data || [])
    } catch (err) {
      console.error("Error fetching DNPB errors:", err)
      toast.error("Failed to load DNPB errors")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <RefreshCw className="w-8 h-8 animate-spin text-[#00D084]" />
        <p className="text-gray-400 mt-4">Loading...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-gray-300" />
        </div>
        <p className="text-center">No DNPB errors found</p>
        <p className="text-sm text-gray-300 mt-1">All ROs match the shipped quantities</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} RO with discrepancies</p>
        <button
          onClick={fetchData}
          disabled={refreshing}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4 text-gray-500", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="space-y-3">
        {items.map((ro) => (
          <button
            key={ro.ro_id}
            onClick={() => onSelectRO?.(ro)}
            className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left hover:shadow-md transition-shadow active:scale-[0.99]"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900 font-mono">{ro.ro_id}</span>
                  <span className="text-xs px-2 py-0.5 bg-[#00D084]/10 text-[#0D3B2E] rounded-full font-medium">
                    {ro.total_items} items
                  </span>
                </div>
                
                {(ro.dnpb_number_ddd || ro.dnpb_number_ljbb) && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ro.dnpb_number_ddd && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                        DDD: {ro.dnpb_number_ddd}
                      </span>
                    )}
                    {ro.dnpb_number_ljbb && (
                      <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-medium">
                        LJBB: {ro.dnpb_number_ljbb}
                      </span>
                    )}
                  </div>
                )}

                <p className="text-sm text-gray-600 truncate mt-1">
                  {ro.store_name}
                </p>

                {ro.total_selisih > 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <AlertTriangle className="w-3 h-3 text-orange-500" />
                    <p className="text-xs text-orange-600 font-medium">
                      Discrepancy: {ro.total_selisih} pairs
                    </p>
                  </div>
                )}

                {ro.total_selisih === 0 && (
                  <div className="flex items-center gap-1 mt-2">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <p className="text-xs text-green-600 font-medium">
                      Match (no discrepancy)
                    </p>
                  </div>
                )}
              </div>

              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2 mt-1" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

interface DNPBErrorDetailModalProps {
  ro: DNPBErrorRO | null
  onClose: () => void
  onBanding?: (roId: string) => void
  onConfirmed?: (roId: string) => void
}

export function DNPBErrorDetailModal({ ro, onClose, onBanding, onConfirmed }: DNPBErrorDetailModalProps) {
  const [showBandingConfirm, setShowBandingConfirm] = useState(false)
  const [showConfirmedConfirm, setShowConfirmedConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!ro) return null

  const selisihItems = ro.details?.filter((item) => Number(item.selisih) !== 0) || []

  const handleBanding = async () => {
    if (!onBanding) return
    setIsSubmitting(true)
    try {
      await onBanding(ro.ro_id)
      setShowBandingConfirm(false)
      onClose()
    } catch (err) {
      console.error("Banding failed:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmed = async () => {
    if (!onConfirmed) return
    setIsSubmitting(true)
    try {
      await onConfirmed(ro.ro_id)
      setShowConfirmedConfirm(false)
      onClose()
    } catch (err) {
      console.error("Confirmed failed:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getSelisihBadge = (selisih: number | string) => {
    const num = Number(selisih)
    if (num === 0) {
      return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">0</span>
    }
    if (num > 0) {
      return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">+{num}</span>
    }
    return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">{num}</span>
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-gray-50 w-full max-w-3xl max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
        <div className="bg-[#0D3B2E] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{ro.ro_id}</h2>
              <p className="text-sm text-white/70 truncate max-w-[200px]">
                {ro.store_name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {(ro.dnpb_number_ddd || ro.dnpb_number_ljbb) && (
            <div className="mb-4 space-y-2">
              {ro.dnpb_number_ddd && (
                <div className="bg-blue-50 rounded-xl border border-blue-100 p-3">
                  <p className="text-xs text-blue-600 mb-1">DNPB DDD</p>
                  <p className="text-sm text-gray-900 font-medium">{ro.dnpb_number_ddd}</p>
                </div>
              )}
              {ro.dnpb_number_ljbb && (
                <div className="bg-purple-50 rounded-xl border border-purple-100 p-3">
                  <p className="text-xs text-purple-600 mb-1">DNPB LJBB</p>
                  <p className="text-sm text-gray-900 font-medium">{ro.dnpb_number_ljbb}</p>
                </div>
              )}
            </div>
          )}

          {selisihItems.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Discrepancy</h3>
              <p className="text-sm text-gray-500">All items match the shipped quantities.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-800">
                    {selisihItems.length} articles with discrepancy
                  </p>
                  <p className="text-xs text-orange-600">
                    Total discrepancy: {ro.total_selisih} pairs
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-3 px-3 font-medium text-gray-600 min-w-[180px]">Article</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-600 w-16">Asst</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-600 min-w-[120px]">SKU Code</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-600 w-12">Shipped</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-600 w-14">Physical</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-600 w-14">Diff</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-600 min-w-[100px]">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selisihItems.map((item) => (
                        <tr key={item.sku_code} className="border-b border-gray-100 last:border-0">
                          <td className="py-3 px-3 min-w-[180px]">
                            <div className="font-semibold text-gray-900 text-xs whitespace-normal">
                              {item.article_code}
                            </div>
                            <div className="text-[10px] text-gray-500 whitespace-normal leading-tight">
                              {item.article_name}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center w-16 text-gray-600 text-xs">
                            {item.pairs_per_box}
                          </td>
                          <td className="py-3 px-2 min-w-[120px]">
                            <div className="text-[10px] text-gray-600 whitespace-normal font-mono">
                              {item.sku_code}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center w-12 text-gray-900 font-medium text-sm">
                            {item.pairs_shipped}
                          </td>
                          <td className="py-3 px-2 text-center w-14 text-gray-900 font-medium text-sm">
                            {item.fisik}
                          </td>
                          <td className="py-3 px-2 text-center w-14">
                            {getSelisihBadge(item.selisih)}
                          </td>
                          <td className="py-3 px-2 min-w-[100px]">
                            <span className="text-xs text-gray-600">
                              {item.notes || "-"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white shrink-0 space-y-3">
          {selisihItems.length > 0 && (
            <>
              <button
                onClick={() => setShowBandingConfirm(true)}
                disabled={isSubmitting}
                className="w-full py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-5 h-5" />
                {isSubmitting ? "Processing..." : "Banding"}
              </button>
              <button
                onClick={() => setShowConfirmedConfirm(true)}
                disabled={isSubmitting}
                className="w-full py-3 bg-[#00D084] hover:bg-[#00B874] disabled:bg-green-400 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                {isSubmitting ? "Processing..." : "Confirmed"}
              </button>
            </>
          )}
        </div>
      </div>

      {showBandingConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Banding Confirmation</h3>
            </div>
            
            <div className="space-y-3 text-sm text-gray-600 mb-6">
              <p>
                This will send a notice to <strong>ro-arrive-app</strong> that:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Warehouse sent the correct RO quantities</li>
                <li>SPG/B must re-check the arrived stock</li>
                <li>Possible miscount or fraud indication</li>
              </ul>
              <p className="text-orange-600 font-medium">
                Are you sure you want to proceed?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBandingConfirm(false)}
                className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBanding}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold rounded-xl transition-colors"
              >
                {isSubmitting ? "Processing..." : "Confirm Banding"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmedConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Confirmed</h3>
            </div>
            
            <div className="space-y-3 text-sm text-gray-600 mb-6">
              <p>
                This will mark the discrepancy as <strong>confirmed/accepted</strong>:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Warehouse acknowledges the discrepancy</li>
                <li>Stock adjustment will be processed</li>
                <li>RO will be marked as resolved</li>
              </ul>
              <p className="text-green-600 font-medium">
                Are you sure you want to confirm?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmedConfirm(false)}
                className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmed}
                disabled={isSubmitting}
                className="flex-1 py-3 bg-[#00D084] hover:bg-[#00B874] disabled:bg-green-400 text-white font-bold rounded-xl transition-colors"
              >
                {isSubmitting ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
