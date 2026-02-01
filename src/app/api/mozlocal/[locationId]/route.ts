import { NextRequest, NextResponse } from 'next/server';
import { mozLocalClient } from '@/lib/api/mozlocal';

/**
 * GET /api/mozlocal/[locationId]
 * Get a specific location with listing statuses
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
    const location = await mozLocalClient.getLocation(locationId);

    return NextResponse.json({
      success: true,
      location,
    });
  } catch (error) {
    console.error('Error fetching Moz Local location:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch location' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/mozlocal/[locationId]
 * Update a specific location
 */
export async function PATCH(
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
    const updates = await request.json();

    const location = await mozLocalClient.updateLocation(locationId, updates);

    return NextResponse.json({
      success: true,
      location,
    });
  } catch (error) {
    console.error('Error updating Moz Local location:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update location' },
      { status: 500 }
    );
  }
}
