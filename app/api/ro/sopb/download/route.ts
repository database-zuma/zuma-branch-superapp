import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';
import ExcelJS from 'exceljs';

// Accurate "Permintaan Barang" import template headers
const HEADER_LEVEL = [
  '', 'No Permintaan', 'Tgl Permintaan', 'Keterangan', 'Nama Cabang', 'Tipe Permintaan', 'Nama Gudang',
  ...Array.from({ length: 10 }, (_, i) => `Kustom Karakter ${i + 1}`),
  ...Array.from({ length: 10 }, (_, i) => `Kustom Angka ${i + 1}`),
  'Kustom Tanggal 1', 'Kustom Tanggal 2',
];

const ITEM_LEVEL = [
  '', 'Kode Barang', 'Nama Barang', 'Kuantitas', 'Satuan', 'Tgl Diminta', 'Catatan Barang',
  'Nama Dept Barang', 'No Proyek Barang',
  ...Array.from({ length: 15 }, (_, i) => `Kustom Karakter ${i + 1}`),
  'Kustom Angka1', // Accurate quirk: no space before 1
  ...Array.from({ length: 9 }, (_, i) => `Kustom Angka ${i + 2}`),
  'Kustom Tanggal 1', 'Kustom Tanggal 2',
  ...Array.from({ length: 10 }, (_, i) => `Kategori Keuangan ${i + 1}`),
  'Harga Estimasi',
];

const ENTITY_LABELS: Record<string, string> = {
  ddd: 'DDD',
  ljbb: 'LJBB',
  mbb: 'MBB',
  ubb: 'UBB',
};

function formatDateDDMMYYYY(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { roId, entity, sopbNumber, tanggalDiminta } = await request.json();

    if (!roId || !entity || !sopbNumber || !tanggalDiminta) {
      return NextResponse.json(
        { success: false, error: 'roId, entity, sopbNumber, and tanggalDiminta are required' },
        { status: 400 }
      );
    }

    const entityLower = entity.toLowerCase();
    if (!['ddd', 'ljbb', 'mbb', 'ubb'].includes(entityLower)) {
      return NextResponse.json({ success: false, error: 'Invalid entity' }, { status: 400 });
    }

    const qtyCol = `qty_${entityLower}`;
    const boxCol = `boxes_allocated_${entityLower}`;

    // Query SKU data for this RO + entity from sopb_backdata
    const { rows } = await pool.query(
      `SELECT ro_id, store_name, article_code, kode_besar, nama_variant, 
              ${qtyCol} as qty, ${boxCol} as boxes
       FROM ${SCHEMA}.sopb_backdata 
       WHERE ro_id = $1 AND ${qtyCol} > 0
       ORDER BY kode_besar`,
      [roId]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `No ${ENTITY_LABELS[entityLower]} data found for ${roId}` },
        { status: 404 }
      );
    }

    const storeName = rows[0].store_name as string;
    const totalPairs = rows.reduce((sum: number, r: Record<string, unknown>) => sum + (r.qty as number), 0);
    const keterangan = `Protol kirim ke ${storeName} ${totalPairs} pairs`;
    const formattedDate = formatDateDDMMYYYY(tanggalDiminta);

    // Save SOPB number + date to ro_process
    const sopbCol = `sopb_number_${entityLower}`;
    await pool.query(
      `UPDATE ${SCHEMA}.ro_process 
       SET ${sopbCol} = $1, sopb_tanggal_diminta = $2, updated_at = NOW() 
       WHERE ro_id = $3`,
      [sopbNumber, tanggalDiminta, roId]
    );

    // Generate XLSX
    const workbook = new ExcelJS.Workbook();
    const sheetName = `${roId}_${ENTITY_LABELS[entityLower]}`;
    const ws = workbook.addWorksheet(sheetName);

    // Row 1: Header-level column names
    const row1 = ws.addRow(HEADER_LEVEL);
    row1.font = { bold: true, size: 10 };
    row1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

    // Row 2: Item-level column names
    const row2 = ws.addRow(ITEM_LEVEL);
    row2.font = { bold: true, size: 10 };
    row2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

    // Row 3: HEADER row
    const headerData = new Array(Math.max(HEADER_LEVEL.length, ITEM_LEVEL.length)).fill('');
    headerData[0] = 'HEADER';
    headerData[1] = sopbNumber;
    headerData[2] = ''; // Tgl Permintaan
    headerData[3] = keterangan;
    headerData[4] = ''; // Nama Cabang
    headerData[5] = 'Kirim Barang';
    headerData[6] = ''; // Nama Gudang
    const row3 = ws.addRow(headerData);
    row3.font = { bold: true, size: 10 };
    row3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF93C47D' } };

    // Row 4+: ITEM rows
    for (const sku of rows) {
      const itemData = new Array(ITEM_LEVEL.length).fill('');
      itemData[0] = 'ITEM';
      itemData[1] = sku.kode_besar || sku.article_code;
      itemData[2] = sku.nama_variant || sku.article_code;
      itemData[3] = sku.qty as number;
      itemData[4] = ''; // Satuan
      itemData[5] = formattedDate;
      itemData[6] = ''; // Catatan
      const itemRow = ws.addRow(itemData);
      itemRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCFE2F3' } };
    }

    // Column widths for key columns
    ws.getColumn(1).width = 10;  // A: HEADER/ITEM
    ws.getColumn(2).width = 25;  // B: No Permintaan / Kode Barang
    ws.getColumn(3).width = 45;  // C: Tgl Permintaan / Nama Barang
    ws.getColumn(4).width = 40;  // D: Keterangan / Kuantitas
    ws.getColumn(5).width = 12;  // E: Nama Cabang / Satuan
    ws.getColumn(6).width = 18;  // F: Tipe Permintaan / Tgl Diminta
    ws.getColumn(7).width = 18;  // G: Nama Gudang / Catatan

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${sheetName}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error generating SOPB XLSX:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
