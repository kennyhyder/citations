import { NextRequest, NextResponse } from 'next/server';
import { brightLocalClient } from '@/lib/api';
import { db } from '@/lib/db';

export async function GET() {
  if (!brightLocalClient.isConfigured()) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'BRIGHTLOCAL_API_KEY must be set',
    });
  }

  try {
    // Connect and get available tools
    await brightLocalClient.connect();
    const tools = brightLocalClient.getAvailableTools();

    // Try to list locations
    const locations = await brightLocalClient.listLocations();

    return NextResponse.json({
      status: 'connected',
      availableTools: tools,
      locationsCount: locations.length,
      locations: locations.slice(0, 10), // Return first 10
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!brightLocalClient.isConfigured()) {
    return NextResponse.json({
      success: false,
      message: 'BRIGHTLOCAL_API_KEY must be set',
    }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { action, domainId, locationId } = body;

    switch (action) {
      case 'list-locations': {
        await brightLocalClient.connect();
        const locations = await brightLocalClient.listLocations();
        return NextResponse.json({ success: true, locations });
      }

      case 'push-domain': {
        if (!domainId) {
          return NextResponse.json({ success: false, message: 'domainId required' }, { status: 400 });
        }

        // Get domain with brand info from database
        const domains = await db.getDomainsWithBrands();
        const domain = domains.find(d => d.id === domainId);

        if (!domain) {
          return NextResponse.json({ success: false, message: 'Domain not found' }, { status: 404 });
        }

        if (!domain.brand_info) {
          return NextResponse.json({ success: false, message: 'Domain has no brand info' }, { status: 400 });
        }

        // Create location in BrightLocal
        await brightLocalClient.connect();
        const location = await brightLocalClient.createLocation({
          name: domain.brand_info.business_name,
          address: domain.brand_info.street || '',
          city: domain.brand_info.city || '',
          state: domain.brand_info.state || '',
          postcode: domain.brand_info.zip || '',
          country: domain.brand_info.country || 'US',
          telephone: domain.brand_info.phone || '',
          website: domain.brand_info.website || `https://${domain.domain}`,
          email: domain.brand_info.email || undefined,
          description: domain.brand_info.description || undefined,
          categories: domain.brand_info.categories || undefined,
        });

        // Update database with BrightLocal location ID
        await db.updateBrightLocalStatus(domain.id, {
          brightlocal_location_id: location.id,
          brightlocal_status: 'active',
          brightlocal_synced_at: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          message: `Created location in BrightLocal: ${location.name}`,
          locationId: location.id,
        });
      }

      case 'create-citation-campaign': {
        if (!locationId) {
          return NextResponse.json({ success: false, message: 'locationId required' }, { status: 400 });
        }

        await brightLocalClient.connect();
        const campaign = await brightLocalClient.createCitationCampaign(locationId);

        return NextResponse.json({
          success: true,
          message: 'Citation campaign created',
          campaign,
        });
      }

      case 'get-tools': {
        await brightLocalClient.connect();
        const tools = brightLocalClient.getAvailableTools();
        return NextResponse.json({ success: true, tools });
      }

      default:
        return NextResponse.json({
          success: false,
          message: `Unknown action: ${action}`,
          availableActions: ['list-locations', 'push-domain', 'create-citation-campaign', 'get-tools'],
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
