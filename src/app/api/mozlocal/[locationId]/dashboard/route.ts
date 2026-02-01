import { NextRequest, NextResponse } from 'next/server';
import { mozLocalClient } from '@/lib/api/mozlocal';

/**
 * GET /api/mozlocal/[locationId]/dashboard
 * Get dashboard data for a specific location
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locationId: string }> }
) {
  try {
    if (!mozLocalClient.isConfigured()) {
      return NextResponse.json(
        { error: 'Moz Local credentials not configured' },
        { status: 503 }
      );
    }

    const { locationId } = await params;
    const { searchParams } = new URL(request.url);

    // Check if requesting visibility history
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (startDate && endDate) {
      // Get visibility history
      const history = await mozLocalClient.getVisibilityHistory(
        locationId,
        startDate,
        endDate
      );
      return NextResponse.json({
        success: true,
        visibilityHistory: history,
      });
    }

    // Get dashboard data
    const dashboard = await mozLocalClient.getLocationDashboard(locationId);

    return NextResponse.json({
      success: true,
      dashboard,
    });
  } catch (error) {
    console.error('Error fetching Moz Local dashboard:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch dashboard' },
      { status: 500 }
    );
  }
}
