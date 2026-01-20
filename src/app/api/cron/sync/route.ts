import { NextRequest, NextResponse } from 'next/server';
import { runSync } from '@/lib/sync/engine';

// Vercel cron job endpoint
// Scheduled to run daily at 6 AM UTC (see vercel.json)
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (in production)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Run full sync: domains from all sources, then push to Relate
    const result = await runSync({ type: 'full', source: 'all' });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString(),
      details: {
        domainsFound: result.domainsFound,
        domainsAdded: result.domainsAdded,
        domainsUpdated: result.domainsUpdated,
        brandsPushed: result.brandsPushed,
      },
    });
  } catch (error) {
    console.error('Cron sync error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Cron sync failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
