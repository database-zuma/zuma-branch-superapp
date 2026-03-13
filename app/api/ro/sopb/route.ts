import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

interface SopbRow {
  ro_id: string;
  store_name: string;
  article_code: string;
  article_name: string;
  boxes_allocated_ddd: number;
  boxes_allocated_ljbb: number;
  boxes_allocated_mbb: number;
  boxes_allocated_ubb: number;
  sopb_number_ddd: string | null;
  sopb_number_ljbb: string | null;
  sopb_number_mbb: string | null;
  sopb_number_ubb: string | null;
  sopb_tanggal_diminta: string | null;
  dnpb_number_ddd: string | null;
  dnpb_number_ljbb: string | null;
  dnpb_number_mbb: string | null;
  dnpb_number_ubb: string | null;
  kode_besar: string | null;
  nama_variant: string | null;
  count_by_assortment: number;
  qty_ddd: number;
  qty_ljbb: number;
  qty_mbb: number;
  qty_ubb: number;
}

interface EntitySummary {
  totalBoxes: number;
  totalPairs: number;
  articleCount: number;
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { rows } = await pool.query<SopbRow>(
      `SELECT * FROM ${SCHEMA}.sopb_backdata ORDER BY ro_id, kode_besar`
    );

    const roMap = new Map<string, {
      roId: string;
      storeName: string;
      sopbNumberDdd: string | null;
      sopbNumberLjbb: string | null;
      sopbNumberMbb: string | null;
      sopbNumberUbb: string | null;
      sopbTanggalDiminta: string | null;
      dnpbNumberDdd: string | null;
      dnpbNumberLjbb: string | null;
      dnpbNumberMbb: string | null;
      dnpbNumberUbb: string | null;
      entities: Record<string, EntitySummary & { _articles: Set<string>; _boxMap: Map<string, number> }>;
      skus: Array<{
        articleCode: string;
        kodeBesar: string | null;
        namaVariant: string | null;
        qtyDdd: number;
        qtyLjbb: number;
        qtyMbb: number;
        qtyUbb: number;
      }>;
    }>();

    for (const row of rows) {
      if (!roMap.has(row.ro_id)) {
        const makeEntity = () => ({ totalBoxes: 0, totalPairs: 0, articleCount: 0, _articles: new Set<string>(), _boxMap: new Map<string, number>() });
        roMap.set(row.ro_id, {
          roId: row.ro_id,
          storeName: row.store_name,
          sopbNumberDdd: row.sopb_number_ddd,
          sopbNumberLjbb: row.sopb_number_ljbb,
          sopbNumberMbb: row.sopb_number_mbb,
          sopbNumberUbb: row.sopb_number_ubb,
          sopbTanggalDiminta: row.sopb_tanggal_diminta,
          dnpbNumberDdd: row.dnpb_number_ddd,
          dnpbNumberLjbb: row.dnpb_number_ljbb,
          dnpbNumberMbb: row.dnpb_number_mbb,
          dnpbNumberUbb: row.dnpb_number_ubb,
          entities: { ddd: makeEntity(), ljbb: makeEntity(), mbb: makeEntity(), ubb: makeEntity() },
          skus: [],
        });
      }

      const ro = roMap.get(row.ro_id)!;

      ro.skus.push({
        articleCode: row.article_code,
        kodeBesar: row.kode_besar || row.article_code,
        namaVariant: row.nama_variant || row.article_name,
        qtyDdd: row.qty_ddd,
        qtyLjbb: row.qty_ljbb,
        qtyMbb: row.qty_mbb,
        qtyUbb: row.qty_ubb,
      });

      // Aggregate per entity — deduplicate boxes at article level
      const entityKeys = ['ddd', 'ljbb', 'mbb', 'ubb'] as const;
      const boxFields = {
        ddd: row.boxes_allocated_ddd,
        ljbb: row.boxes_allocated_ljbb,
        mbb: row.boxes_allocated_mbb,
        ubb: row.boxes_allocated_ubb,
      };
      const qtyFields = {
        ddd: row.qty_ddd,
        ljbb: row.qty_ljbb,
        mbb: row.qty_mbb,
        ubb: row.qty_ubb,
      };

      for (const key of entityKeys) {
        const boxes = boxFields[key];
        const qty = qtyFields[key];
        const entity = ro.entities[key];

        if (boxes > 0) {
          entity._articles.add(row.article_code);
          entity._boxMap.set(row.article_code, boxes);
        }
        if (qty > 0) {
          entity.totalPairs += qty;
        }
      }
    }

    // Finalize: convert Sets to counts, sum boxes from deduped map
    const data = Array.from(roMap.values()).map(ro => {
      const entities: Record<string, EntitySummary> = {};
      for (const [key, entity] of Object.entries(ro.entities)) {
        let totalBoxes = 0;
        entity._boxMap.forEach(b => { totalBoxes += b; });
        entities[key] = {
          totalBoxes,
          totalPairs: entity.totalPairs,
          articleCount: entity._articles.size,
        };
      }
      return { ...ro, entities, };
    });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching SOPB data:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { roId, sopbNumberDdd, sopbNumberLjbb, sopbNumberMbb, sopbNumberUbb, tanggalDiminta } = body;

    if (!roId) {
      return NextResponse.json({ success: false, error: 'roId is required' }, { status: 400 });
    }

    const setClauses: string[] = ['updated_at = $1'];
    const params: unknown[] = [new Date().toISOString()];
    let idx = 2;

    if (sopbNumberDdd !== undefined) { setClauses.push(`sopb_number_ddd = $${idx++}`); params.push(sopbNumberDdd); }
    if (sopbNumberLjbb !== undefined) { setClauses.push(`sopb_number_ljbb = $${idx++}`); params.push(sopbNumberLjbb); }
    if (sopbNumberMbb !== undefined) { setClauses.push(`sopb_number_mbb = $${idx++}`); params.push(sopbNumberMbb); }
    if (sopbNumberUbb !== undefined) { setClauses.push(`sopb_number_ubb = $${idx++}`); params.push(sopbNumberUbb); }
    if (tanggalDiminta !== undefined) { setClauses.push(`sopb_tanggal_diminta = $${idx++}`); params.push(tanggalDiminta); }

    params.push(roId);
    const { rowCount } = await pool.query(
      `UPDATE ${SCHEMA}.ro_process SET ${setClauses.join(', ')} WHERE ro_id = $${idx}`,
      params
    );

    return NextResponse.json({ success: true, updatedRows: rowCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error saving SOPB data:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
