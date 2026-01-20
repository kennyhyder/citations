import { NextRequest, NextResponse } from 'next/server';
import { runSync, type SyncOptions } from '@/lib/sync/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type = 'domains', source = 'all' } = body as SyncOptions;

    // Validate type
    if (!['domains', 'relate', 'full'].includes(type)) {
      return NextResponse.json(
        { success: false, message: 'Invalid sync type. Must be: domains, relate, or full' },
        { status: 400 }
      );
    }

    // Validate source
    if (!['all', 'hostinger', 'godaddy', 'namecheap'].includes(source)) {
      return NextResponse.json(
        { success: false, message: 'Invalid source. Must be: all, hostinger, godaddy, or namecheap' },
        { status: 400 }
      );
    }

    const result = await runSync({ type, source });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

// GET endpoint to check sync status (useful for cron monitoring)
export async function GET() {
  return NextResponse.json({
    status: 'ready',
    endpoints: {
      'POST /api/sync': {
        description: 'Run a sync operation',
        body: {
          type: 'domains | relate | full',
          source: 'all | hostinger | godaddy | namecheap (only for domains type)',
        },
      },
    },
  });
}
