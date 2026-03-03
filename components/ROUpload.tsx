'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, X, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ParsedArticle {
  rowNum: number;
  articleName: string;
  kodeKecil: string;
  tier: number;
  boxQty: number;
  whAvailable: string;
  articleCode: string | null;
  dddAvailable: number;
  ljbbAvailable: number;
  mbbAvailable: number;
  ubbAvailable: number;
  totalAvailable: number;
  boxesDdd: number;
  boxesLjbb: number;
  boxesMbb: number;
  boxesUbb: number;
  allocationNote: string;
  stockStatus: 'available' | 'insufficient' | 'no_stock' | 'not_found';
}

interface ParseResult {
  fileName: string;
  storeName: string;
  totalArticles: number;
  totalBoxes: number;
  warningCount: number;
  unmappedCount: number;
  noStockCount: number;
  articles: ParsedArticle[];
}

interface ROUploadProps {
  onUploadComplete?: () => void;
}

export default function ROUpload({ onUploadComplete }: ROUploadProps) {
  const [stage, setStage] = useState<'upload' | 'preview' | 'confirming' | 'done'>('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<{ roId: string; articlesInserted: number; totalBoxes: number } | null>(null);
  const [showWarningsOnly, setShowWarningsOnly] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Please upload an .xlsx file');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/ro/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || 'Failed to parse file');
        return;
      }

      setParseResult(json.data);
      setStage('preview');

      if (json.data.warningCount > 0) {
        toast.warning(`${json.data.warningCount} article(s) have allocation warnings`);
      } else {
        toast.success(`Parsed ${json.data.totalArticles} articles from ${json.data.fileName}`);
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleConfirm = async () => {
    if (!parseResult) return;

    setStage('confirming');
    try {
      const res = await fetch('/api/ro/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: parseResult.storeName,
          articles: parseResult.articles
            .filter(a => a.articleCode)
            .map(a => ({
              articleCode: a.articleCode,
              articleName: a.articleName,
              boxQty: a.boxQty,
              boxesDdd: a.boxesDdd,
              boxesLjbb: a.boxesLjbb,
              boxesMbb: a.boxesMbb,
              boxesUbb: a.boxesUbb,
            })),
          notes: `Uploaded from ${parseResult.fileName}`,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || 'Failed to confirm upload');
        setStage('preview');
        return;
      }

      setConfirmResult({
        roId: json.data.roId,
        articlesInserted: json.data.articlesInserted,
        totalBoxes: json.data.totalBoxes,
      });
      setStage('done');
      toast.success(`RO ${json.data.roId} created with ${json.data.articlesInserted} articles`);
      onUploadComplete?.();
    } catch (err) {
      console.error('Confirm error:', err);
      toast.error('Failed to confirm upload');
      setStage('preview');
    }
  };

  const handleReset = () => {
    setStage('upload');
    setParseResult(null);
    setConfirmResult(null);
    setShowWarningsOnly(false);
    setExpandedRows(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // --- Upload Stage ---
  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
            isUploading
              ? "border-gray-300 bg-gray-50"
              : "border-gray-300 hover:border-[#00D084] hover:bg-green-50/50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-[#00D084] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Parsing XLSX...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                <Upload className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Upload RO Request XLSX
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Drop file here or tap to browse
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Accepts skill-generated 5-sheet Excel</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">How it works:</p>
          <p>1. Upload the approved RO Request XLSX from the distribution skill</p>
          <p>2. App parses Sheet 3 &quot;Daftar RO Box&quot; for articles</p>
          <p>3. Auto-allocates entity (DDD/LJBB/MBB/UBB) from warehouse stock</p>
          <p>4. Review preview, then confirm to create RO in QUEUE status</p>
        </div>
      </div>
    );
  }

  // --- Preview Stage ---
  if (stage === 'preview' && parseResult) {
    const displayArticles = showWarningsOnly
      ? parseResult.articles.filter(a => a.allocationNote !== '')
      : parseResult.articles;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="bg-[#0D3B2E] rounded-xl p-4 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs opacity-80">{parseResult.fileName}</p>
              <p className="font-semibold text-lg">{parseResult.storeName}</p>
            </div>
            <button
              onClick={handleReset}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <p className="text-xl font-bold">{parseResult.totalArticles}</p>
              <p className="text-xs opacity-80">Articles</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <p className="text-xl font-bold">{parseResult.totalBoxes}</p>
              <p className="text-xs opacity-80">Boxes</p>
            </div>
            <div className={cn(
              "rounded-lg p-2 text-center",
              (parseResult.noStockCount ?? 0) > 0 ? "bg-red-500/30" : parseResult.warningCount > 0 ? "bg-yellow-500/30" : "bg-white/10"
            )}>
              <p className="text-xl font-bold">{parseResult.warningCount}</p>
              <p className="text-xs opacity-80">{(parseResult.noStockCount ?? 0) > 0 ? `${parseResult.noStockCount} No Stock` : 'Warnings'}</p>
            </div>
          </div>
        </div>

        {/* Warning filter toggle */}
        {parseResult.warningCount > 0 && (
          <button
            onClick={() => setShowWarningsOnly(!showWarningsOnly)}
            className={cn(
              "flex items-center gap-2 text-xs px-3 py-1.5 rounded-full transition-colors",
              showWarningsOnly
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            <AlertTriangle className="w-3 h-3" />
            {showWarningsOnly ? 'Showing warnings only' : 'Show warnings only'}
          </button>
        )}

        {/* Article list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {displayArticles.map((article, idx) => {
            const hasNoStock = article.stockStatus === 'no_stock' || article.stockStatus === 'not_found';
            const hasWarning = article.allocationNote !== '' && !hasNoStock;
            const isExpanded = expandedRows.has(idx);

            return (
              <div
                key={idx}
                className={cn(
                  "border rounded-lg overflow-hidden",
                  hasNoStock ? "border-red-200 bg-red-50/50" : hasWarning ? "border-yellow-200 bg-yellow-50/50" : "border-gray-100"
                )}
              >
                <div
                  onClick={() => toggleRow(idx)}
                  className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50/50"
                >
                  <span className="text-xs text-gray-400 w-5 text-center">{article.rowNum}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{article.articleName}</p>
                    <p className="text-xs text-gray-400 font-mono">{article.kodeKecil}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">T{article.tier}</span>
                    <span className="text-sm font-medium">{article.boxQty}box</span>
                    {hasNoStock && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                    {hasWarning && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div className="text-center">
                        <p className="text-gray-400">DDD</p>
                        <p className={cn("font-medium", article.boxesDdd > 0 ? "text-blue-600" : "text-gray-300")}>
                          {article.boxesDdd}
                        </p>
                        <p className="text-gray-300">(avl: {article.dddAvailable})</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-400">LJBB</p>
                        <p className={cn("font-medium", article.boxesLjbb > 0 ? "text-purple-600" : "text-gray-300")}>
                          {article.boxesLjbb}
                        </p>
                        <p className="text-gray-300">(avl: {article.ljbbAvailable})</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-400">MBB</p>
                        <p className={cn("font-medium", article.boxesMbb > 0 ? "text-green-600" : "text-gray-300")}>
                          {article.boxesMbb}
                        </p>
                        <p className="text-gray-300">(avl: {article.mbbAvailable})</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-400">UBB</p>
                        <p className={cn("font-medium", article.boxesUbb > 0 ? "text-orange-600" : "text-gray-300")}>
                          {article.boxesUbb}
                        </p>
                        <p className="text-gray-300">(avl: {article.ubbAvailable})</p>
                      </div>
                    </div>
                    {article.articleCode && (
                      <p className="text-xs text-gray-400">
                        Mapped to: <span className="font-mono">{article.articleCode}</span>
                      </p>
                    )}
                    {hasNoStock && (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {article.allocationNote}
                      </p>
                    )}
                    {hasWarning && (
                      <p className="text-xs text-yellow-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {article.allocationNote}
                      </p>
                    )}
                    {!article.articleCode && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <X className="w-3 h-3" />
                        Will be skipped (unmapped)
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Confirm / Cancel buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 bg-[#00D084] hover:bg-[#00B870] text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm Upload
          </button>
        </div>

        {parseResult.unmappedCount > 0 && (
          <p className="text-xs text-center text-gray-400">
            {parseResult.unmappedCount} unmapped article(s) will be skipped
          </p>
        )}
      </div>
    );
  }

  // --- Confirming Stage ---
  if (stage === 'confirming') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-12 h-12 border-2 border-[#00D084] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Creating RO...</p>
      </div>
    );
  }

  // --- Done Stage ---
  if (stage === 'done' && confirmResult) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h3 className="font-semibold text-green-800 text-lg">Upload Successful</h3>
          <p className="text-sm text-green-600 mt-1">
            RO <span className="font-mono font-bold">{confirmResult.roId}</span> created
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm text-green-700">
            <span className="flex items-center gap-1">
              <Package className="w-4 h-4" />
              {confirmResult.articlesInserted} articles
            </span>
            <span>{confirmResult.totalBoxes} boxes</span>
          </div>
          <p className="text-xs text-green-500 mt-2">Status: QUEUE</p>
        </div>

        <button
          onClick={handleReset}
          className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors text-sm"
        >
          Upload Another
        </button>
      </div>
    );
  }

  return null;
}
