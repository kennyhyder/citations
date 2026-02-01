import { NextRequest, NextResponse } from 'next/server';
import { mozLocalClient, type MozLocalLocation } from '@/lib/api/mozlocal';
import { db } from '@/lib/db';

/**
 * GET /api/mozlocal
 * Fetch locations from Moz Local
 */
export async function GET(request: NextRequest) {
  try {
    if (!mozLocalClient.isConfigured()) {
      return NextResponse.json(
        { error: 'Moz Local credentials not configured' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');
    const query = searchParams.get('query');

    if (locationId) {
      // Get specific location with listing statuses
      const location = await mozLocalClient.getLocation(locationId);
      return NextResponse.json({ success: true, location });
    }

    // Search or list locations
    const result = await mozLocalClient.findLocations({
      query: query || undefined,
      offset: parseInt(searchParams.get('offset') || '0'),
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error fetching from Moz Local:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch from Moz Local' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mozlocal
 * Push location(s) to Moz Local
 *
 * Body options:
 * 1. Push single location by domain ID:
 *    { "domainId": "uuid" }
 *
 * 2. Push multiple locations by domain IDs:
 *    { "domainIds": ["uuid1", "uuid2"] }
 *
 * 3. Push all domains with brand info:
 *    { "pushAll": true }
 *
 * 4. Push location data directly:
 *    { "location": { businessId, name, street, city, ... } }
 */
export async function POST(request: NextRequest) {
  try {
    if (!mozLocalClient.isConfigured()) {
      return NextResponse.json(
        { error: 'Moz Local credentials not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const results: {
      success: Array<{ domainId: string; mozLocalId: string; name: string }>;
      errors: Array<{ domainId: string; error: string }>;
    } = {
      success: [],
      errors: [],
    };

    // Get the business ID to use (first business in account)
    let businessId = body.businessId;
    if (!businessId) {
      const businesses = await mozLocalClient.getBusinesses();
      if (businesses.length === 0) {
        return NextResponse.json(
          { error: 'No businesses found in Moz Local account' },
          { status: 400 }
        );
      }
      businessId = businesses[0].id;
    }

    // Option 1: Push location data directly
    if (body.location) {
      const location = await mozLocalClient.createLocation({
        businessId,
        ...body.location,
      });
      return NextResponse.json({
        success: true,
        location,
      });
    }

    // Collect domain IDs to process
    let domainIds: string[] = [];

    if (body.domainId) {
      domainIds = [body.domainId];
    } else if (body.domainIds && Array.isArray(body.domainIds)) {
      domainIds = body.domainIds;
    } else if (body.pushAll) {
      // Get all domains with brand info
      const domains = await db.getDomainsWithBrands();
      domainIds = domains
        .filter((d: { brand_info: unknown }) => d.brand_info)
        .map((d: { id: string }) => d.id);
    }

    if (domainIds.length === 0) {
      return NextResponse.json(
        { error: 'No domains specified. Provide domainId, domainIds, or pushAll: true' },
        { status: 400 }
      );
    }

    // Process each domain
    for (const domainId of domainIds) {
      try {
        // Get brand info for this domain
        const brandInfo = await db.getBrandInfo(domainId);

        if (!brandInfo) {
          results.errors.push({
            domainId,
            error: 'No brand info found for this domain',
          });
          continue;
        }

        // Check if location already exists in Moz Local
        const mozLocalRecord = await db.getMozLocalRecord(domainId);

        let location: MozLocalLocation;

        if (mozLocalRecord?.moz_local_id) {
          // Update existing location
          location = await mozLocalClient.updateLocation(mozLocalRecord.moz_local_id, {
            name: brandInfo.business_name,
            street: brandInfo.street || undefined,
            city: brandInfo.city || undefined,
            province: brandInfo.state || undefined,
            zip: brandInfo.zip || undefined,
            country: brandInfo.country || 'US',
            phone: brandInfo.phone || undefined,
            website: brandInfo.website || undefined,
            email: brandInfo.email || undefined,
            categories: brandInfo.categories || undefined,
            openingHours: brandInfo.hours || undefined,
          });
        } else {
          // Create new location
          location = await mozLocalClient.createLocation({
            businessId,
            name: brandInfo.business_name,
            street: brandInfo.street || '',
            city: brandInfo.city || '',
            province: brandInfo.state || '',
            zip: brandInfo.zip || '',
            country: brandInfo.country || 'US',
            phone: brandInfo.phone || undefined,
            website: brandInfo.website || undefined,
            email: brandInfo.email || undefined,
            categories: brandInfo.categories || undefined,
            openingHours: brandInfo.hours || undefined,
          });

          // Save the Moz Local ID for future updates
          await db.upsertMozLocalRecord({
            domain_id: domainId,
            moz_local_id: location.id!,
            moz_business_id: businessId,
            status: 'active',
            visibility_index: location.visibilityIndex || null,
            last_synced_at: new Date().toISOString(),
            error_message: null,
          });
        }

        results.success.push({
          domainId,
          mozLocalId: location.id!,
          name: brandInfo.business_name,
        });
      } catch (error) {
        results.errors.push({
          domainId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: results.errors.length === 0,
      message: `Pushed ${results.success.length} locations, ${results.errors.length} errors`,
      results,
    });
  } catch (error) {
    console.error('Error pushing to Moz Local:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push to Moz Local' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/mozlocal
 * Update a location in Moz Local
 *
 * Body:
 * { "locationId": "moz-local-id", "updates": { name, street, city, ... } }
 */
export async function PATCH(request: NextRequest) {
  try {
    if (!mozLocalClient.isConfigured()) {
      return NextResponse.json(
        { error: 'Moz Local credentials not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { locationId, updates } = body;

    if (!locationId) {
      return NextResponse.json(
        { error: 'locationId is required' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'updates object is required' },
        { status: 400 }
      );
    }

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
