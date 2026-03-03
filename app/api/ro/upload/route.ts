import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';
import ExcelJS from 'exceljs';

interface ParsedArticle {
  rowNum: number;
  articleName: string;
  kodeKecil: string;
  tier: number;
  boxQty: number;
  whAvailable: string;
  // Resolved from DB
  articleCode: string | null;
  dddAvailable: number;
  ljbbAvailable: number;
  mbbAvailable: number;
  ubbAvailable: number;
  totalAvailable: number;
  // Auto-allocated
  boxesDdd: number;
  boxesLjbb: number;
  boxesMbb: number;
  boxesUbb: number;
  allocationNote: string;
}

/**
 * POST /api/ro/upload
 *
 * Accepts multipart form with XLSX file from RO Request skill output.
 * Parses Sheet 3 ("Daftar RO Box") and Sheet 1 ("RO Request") for store name.
 * Cross-references with ro_whs_readystock for per-entity availability.
 * Returns preview JSON for AS to confirm before inserting.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, error: 'File must be .xlsx or .xls format' },
        { status: 400 }
      );
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as ExcelJS.Buffer);

    // --- Parse Sheet 1: Store name ---
    const sheet1 = workbook.getWorksheet(1);
    if (!sheet1) {
      return NextResponse.json(
        { success: false, error: 'Sheet 1 (RO Request) not found' },
        { status: 400 }
      );
    }

    // Store name is on Row 3 (merged cell), column B
    let storeName = '';
    const row3 = sheet1.getRow(3);
    const storeCell = row3.getCell(2);
    if (storeCell.value) {
      storeName = String(storeCell.value).trim();
    }
    // Fallback: try column 1 if column 2 is empty
    if (!storeName) {
      const storeCell1 = row3.getCell(1);
      if (storeCell1.value) {
        storeName = String(storeCell1.value).trim();
      }
    }

    // --- Parse Sheet 3: Daftar RO Box ---
    // Sheet 3 might not exist if there are no RO Box requests
    const sheet3 = workbook.getWorksheet('Daftar RO Box') || workbook.getWorksheet(3);
    if (!sheet3) {
      return NextResponse.json(
        { success: false, error: 'Sheet "Daftar RO Box" not found. This XLSX may have no box requests.' },
        { status: 400 }
      );
    }

    // Find header row (contains "No", "Article (Kode Mix)", "Kode Kecil", "Tier", etc.)
    // Usually row 6, but search for it dynamically
    let headerRow = 0;
    sheet3.eachRow((row, rowNumber) => {
      if (headerRow > 0) return;
      const cellValues = [];
      for (let c = 1; c <= 8; c++) {
        cellValues.push(String(row.getCell(c).value || '').toLowerCase().trim());
      }
      if (cellValues.some(v => v === 'no') && cellValues.some(v => v.includes('article') || v.includes('artikel'))) {
        headerRow = rowNumber;
      }
    });

    if (headerRow === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not find header row in Sheet 3. Expected columns: No, Article (Kode Mix), Kode Kecil, Tier, Gender, Series, Box Qty, WH Available' },
        { status: 400 }
      );
    }

    // Parse data rows (starting from headerRow + 1)
    const rawArticles: { rowNum: number; articleName: string; kodeKecil: string; tier: number; boxQty: number; whAvailable: string }[] = [];

    for (let r = headerRow + 1; r <= sheet3.rowCount; r++) {
      const row = sheet3.getRow(r);
      const noVal = row.getCell(1).value;
      const articleVal = row.getCell(2).value;
      const kodeKecilVal = row.getCell(3).value;
      const tierVal = row.getCell(4).value;
      // col 5 = Gender (skip), col 6 = Series (skip)
      const boxQtyVal = row.getCell(7).value;
      const whAvailVal = row.getCell(8).value;

      // Skip total row or empty rows
      if (!noVal || !articleVal || !kodeKecilVal) continue;
      const noStr = String(noVal).trim().toLowerCase();
      if (noStr === 'total' || noStr.includes('total')) continue;

      const rowNum = parseInt(String(noVal), 10);
      if (isNaN(rowNum)) continue;

      rawArticles.push({
        rowNum,
        articleName: String(articleVal).trim(),
        kodeKecil: String(kodeKecilVal).trim(),
        tier: parseInt(String(tierVal), 10) || 0,
        boxQty: parseInt(String(boxQtyVal), 10) || 1,
        whAvailable: String(whAvailVal || '').trim().toUpperCase(),
      });
    }

    if (rawArticles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No articles found in Sheet 3 data rows' },
        { status: 400 }
      );
    }

    // --- Cross-reference with DB for warehouse stock ---
    const kodeKecilValues = rawArticles.map(a => a.kodeKecil);

    // kode_kecil IS the article code — look up stock directly (no portal.kodemix needed)
    const stockMap: Record<string, { ddd: number; ljbb: number; mbb: number; ubb: number; total: number }> = {};

    if (kodeKecilValues.length > 0) {
      const { rows: stockRows } = await pool.query(
        `SELECT article_code, ddd_available, ljbb_available, mbb_available, ubb_available, total_available
         FROM ${SCHEMA}.ro_whs_readystock
         WHERE article_code = ANY($1::text[])`,
        [kodeKecilValues]
      );

      for (const s of stockRows) {
        stockMap[s.article_code as string] = {
          ddd: Number(s.ddd_available) || 0,
          ljbb: Number(s.ljbb_available) || 0,
          mbb: Number(s.mbb_available) || 0,
          ubb: Number(s.ubb_available) || 0,
          total: Number(s.total_available) || 0,
        };
      }
    }

    // Build resolved articles with entity allocation
    const parsedArticles: ParsedArticle[] = rawArticles.map(raw => {
      // kode_kecil = article code directly
      const articleCode = raw.kodeKecil;
      const stock = stockMap[articleCode] || { ddd: 0, ljbb: 0, mbb: 0, ubb: 0, total: 0 };

      // Auto-allocate entity: DDD first, then LJBB, then MBB, then UBB
      let remaining = raw.boxQty;
      let boxesDdd = 0;
      let boxesLjbb = 0;
      let boxesMbb = 0;
      let boxesUbb = 0;
      let note = '';

      if (stock.total <= 0) {
        // No stock available — mark as unavailable but still allow upload
        note = 'NO STOCK in warehouse';
        boxesDdd = raw.boxQty; // Default to DDD for tracking
      } else {
        // Allocate DDD first
        const fromDdd = Math.min(remaining, stock.ddd);
        boxesDdd = fromDdd;
        remaining -= fromDdd;

        // Then LJBB
        if (remaining > 0) {
          const fromLjbb = Math.min(remaining, stock.ljbb);
          boxesLjbb = fromLjbb;
          remaining -= fromLjbb;
        }

        // Then MBB
        if (remaining > 0) {
          const fromMbb = Math.min(remaining, stock.mbb);
          boxesMbb = fromMbb;
          remaining -= fromMbb;
        }

        // Then UBB
        if (remaining > 0) {
          const fromUbb = Math.min(remaining, stock.ubb);
          boxesUbb = fromUbb;
          remaining -= fromUbb;
        }

        if (remaining > 0) {
          note = `Insufficient stock: need ${raw.boxQty}, available ${stock.total}`;
          // Allocate remainder to DDD for tracking
          boxesDdd += remaining;
        }
      }

      if (!stockMap[articleCode]) {
        note = 'Article code not found in warehouse stock';
      }

      return {
        rowNum: raw.rowNum,
        articleName: raw.articleName,
        kodeKecil: raw.kodeKecil,
        tier: raw.tier,
        boxQty: raw.boxQty,
        whAvailable: raw.whAvailable,
        articleCode,
        dddAvailable: stock.ddd,
        ljbbAvailable: stock.ljbb,
        mbbAvailable: stock.mbb,
        ubbAvailable: stock.ubb,
        totalAvailable: stock.total,
        boxesDdd,
        boxesLjbb,
        boxesMbb,
        boxesUbb,
        allocationNote: note,
      };
    });

    const totalBoxes = parsedArticles.reduce((sum, a) => sum + a.boxQty, 0);
    const withWarnings = parsedArticles.filter(a => a.allocationNote !== '');
    const unmapped = parsedArticles.filter(a => !a.articleCode);

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        storeName: storeName || 'Unknown Store',
        totalArticles: parsedArticles.length,
        totalBoxes,
        warningCount: withWarnings.length,
        unmappedCount: unmapped.length,
        articles: parsedArticles,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in upload parse API:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
