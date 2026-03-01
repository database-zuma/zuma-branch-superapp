import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

const dnpbPattern = /^DNPB\/([A-Z]+)\/WHS\/\d{4}\/[IVX]+\/\d+$/;

const transactionTableMap: Record<string, string> = {
  'DDD': 'supabase_transaksiDDD',
  'LJBB': 'supabase_transaksiLJBB',
  'MBB': 'supabase_transaksiMBB',
  'UBB': 'supabase_transaksiUBB',
};

async function validateDNPB(dnpbNumber: string): Promise<boolean> {
  const match = dnpbNumber.match(dnpbPattern);
  if (!match) return false;

  const warehouseCode = match[1];
  const transactionTable = transactionTableMap[warehouseCode];

  if (!transactionTable) return false;

  // Table name comes from our hardcoded map, safe to interpolate
  const { rows } = await pool.query(
    `SELECT "DNPB" FROM ${SCHEMA}."${transactionTable}" WHERE "DNPB" = $1 LIMIT 1`,
    [dnpbNumber]
  );

  return rows.length > 0;
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { roId, dnpbNumberDDD, dnpbNumberLJBB, dnpbNumberMBB, dnpbNumberUBB } = await request.json();

    if (!roId) {
      return NextResponse.json(
        { success: false, error: 'roId is required' },
        { status: 400 }
      );
    }

    let dnpbMatchDDD = false;
    let dnpbMatchLJBB = false;
    let dnpbMatchMBB = false;
    let dnpbMatchUBB = false;

    if (dnpbNumberDDD) {
      if (!dnpbNumberDDD.match(dnpbPattern)) {
        return NextResponse.json(
          { success: false, error: 'Invalid DNPB DDD format. Expected: DNPB/DDD/WHS/2026/I/001' },
          { status: 400 }
        );
      }
      dnpbMatchDDD = await validateDNPB(dnpbNumberDDD);
    }

    if (dnpbNumberLJBB) {
      if (!dnpbNumberLJBB.match(dnpbPattern)) {
        return NextResponse.json(
          { success: false, error: 'Invalid DNPB LJBB format. Expected: DNPB/LJBB/WHS/2026/I/001' },
          { status: 400 }
        );
      }
      dnpbMatchLJBB = await validateDNPB(dnpbNumberLJBB);
    }

    if (dnpbNumberMBB) {
      if (!dnpbNumberMBB.match(dnpbPattern)) {
        return NextResponse.json(
          { success: false, error: 'Invalid DNPB MBB format. Expected: DNPB/MBB/WHS/2026/I/001' },
          { status: 400 }
        );
      }
      dnpbMatchMBB = await validateDNPB(dnpbNumberMBB);
    }

    if (dnpbNumberUBB) {
      if (!dnpbNumberUBB.match(dnpbPattern)) {
        return NextResponse.json(
          { success: false, error: 'Invalid DNPB UBB format. Expected: DNPB/UBB/WHS/2026/I/001' },
          { status: 400 }
        );
      }
      dnpbMatchUBB = await validateDNPB(dnpbNumberUBB);
    }

    const setClauses: string[] = ['updated_at = $1'];
    const params: unknown[] = [new Date().toISOString()];
    let paramIndex = 2;

    if (dnpbNumberDDD !== undefined) {
      setClauses.push(`dnpb_number_ddd = $${paramIndex++}`);
      params.push(dnpbNumberDDD);
      setClauses.push(`dnpb_match_ddd = $${paramIndex++}`);
      params.push(dnpbMatchDDD);
    }

    if (dnpbNumberLJBB !== undefined) {
      setClauses.push(`dnpb_number_ljbb = $${paramIndex++}`);
      params.push(dnpbNumberLJBB);
      setClauses.push(`dnpb_match_ljbb = $${paramIndex++}`);
      params.push(dnpbMatchLJBB);
    }

    if (dnpbNumberMBB !== undefined) {
      setClauses.push(`dnpb_number_mbb = $${paramIndex++}`);
      params.push(dnpbNumberMBB);
      setClauses.push(`dnpb_match_mbb = $${paramIndex++}`);
      params.push(dnpbMatchMBB);
    }

    if (dnpbNumberUBB !== undefined) {
      setClauses.push(`dnpb_number_ubb = $${paramIndex++}`);
      params.push(dnpbNumberUBB);
      setClauses.push(`dnpb_match_ubb = $${paramIndex++}`);
      params.push(dnpbMatchUBB);
    }

    params.push(roId);
    const { rows: data } = await pool.query(
      `UPDATE ${SCHEMA}.ro_process SET ${setClauses.join(', ')} WHERE ro_id = $${paramIndex} RETURNING *`,
      params
    );

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: `RO ${roId} not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        roId,
        dnpbNumberDDD: dnpbNumberDDD || null,
        dnpbNumberLJBB: dnpbNumberLJBB || null,
        dnpbNumberMBB: dnpbNumberMBB || null,
        dnpbNumberUBB: dnpbNumberUBB || null,
        dnpbMatchDDD,
        dnpbMatchLJBB,
        dnpbMatchMBB,
        dnpbMatchUBB,
        updatedRows: data.length
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating DNPB number:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const roId = searchParams.get('roId');

    if (!roId) {
      return NextResponse.json(
        { success: false, error: 'roId is required' },
        { status: 400 }
      );
    }

    const { rows } = await pool.query(
    `SELECT dnpb_number_ddd, dnpb_number_ljbb, dnpb_number_mbb, dnpb_number_ubb FROM ${SCHEMA}.ro_process WHERE ro_id = $1 LIMIT 1`,
      [roId]
    );

    const data = rows.length > 0 ? rows[0] : null;

    return NextResponse.json({
      success: true,
      data: {
        roId,
        dnpbNumberDDD: data?.dnpb_number_ddd || null,
        dnpbNumberLJBB: data?.dnpb_number_ljbb || null,
        dnpbNumberMBB: data?.dnpb_number_mbb || null,
        dnpbNumberUBB: data?.dnpb_number_ubb || null,
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching DNPB number:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
