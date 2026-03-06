import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { pool, SCHEMA } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { rows: data } = await pool.query(
      `SELECT * FROM ${SCHEMA}.ro_process ORDER BY created_at DESC`
    );

    const roMap = new Map<string, {
      id: string;
      store: string;
      totalBoxes: number;
      status: string;
      createdAt: string;
    }>();

    let totalBoxes = 0;
    let queuedCount = 0;

    (data || []).forEach((row: Record<string, unknown>) => {
      const boxes = (row.boxes_requested as number) || 0;
      totalBoxes += boxes;

      if (!roMap.has(row.ro_id as string)) {
        roMap.set(row.ro_id as string, {
          id: row.ro_id as string,
          store: (row.store_name as string) || 'Unknown',
          totalBoxes: 0,
          status: (row.status as string) || 'QUEUE',
          createdAt: row.created_at as string,
        });

        if (row.status === 'QUEUE') {
          queuedCount++;
        }
      }

      const ro = roMap.get(row.ro_id as string)!;
      ro.totalBoxes += boxes;
    });

    const roList = Array.from(roMap.values());
    const totalRO = roList.length;
    const totalPairs = totalBoxes * 12; // 1 box = 12 pairs (business rule) — TODO: compute from actual pairs_per_box when available

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalRO,
          queued: queuedCount,
          totalBoxes,
          totalPairs,
        },
        roList: roList.map(ro => ({
          id: ro.id,
          store: ro.store,
          box: ro.totalBoxes,
          status: ro.status.toLowerCase(),
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
