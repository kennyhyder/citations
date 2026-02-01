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
    // Test connection and list locations
    const connectionTest = await brightLocalClient.testConnection();

    if (!connectionTest.success) {
      return NextResponse.json({
        status: 'error',
        message: connectionTest.message,
      }, { status: 500 });
    }

    const locations = await brightLocalClient.listLocations();
    const clients = await brightLocalClient.listClients();

    return NextResponse.json({
      status: 'connected',
      message: connectionTest.message,
      clientsCount: clients.length,
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
        const locations = await brightLocalClient.listLocations();
        return NextResponse.json({ success: true, locations });
      }

      case 'list-clients': {
        const clients = await brightLocalClient.listClients();
        return NextResponse.json({ success: true, clients });
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

        // Get or create the default client for this app
        const { clientId } = await brightLocalClient.getOrCreateDefaultClient();

        // Create location in BrightLocal
        const result = await brightLocalClient.createLocation({
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
          clientId: String(clientId),
        });

        // Update database with BrightLocal location ID
        await db.updateBrightLocalStatus(domain.id, {
          brightlocal_location_id: String(result.locationId),
          brightlocal_status: 'active',
          brightlocal_synced_at: new Date().toISOString(),
        });

        return NextResponse.json({
          success: true,
          message: `Created location in BrightLocal: ${domain.brand_info.business_name}`,
          locationId: result.locationId,
          note: 'Location created successfully. To order citations, create a Citation Builder campaign in the BrightLocal dashboard.',
        });
      }

      case 'create-citation-campaign': {
        if (!locationId) {
          return NextResponse.json({ success: false, message: 'locationId required' }, { status: 400 });
        }

        try {
          const campaign = await brightLocalClient.createCitationCampaign(locationId);
          return NextResponse.json({
            success: true,
            message: 'Citation campaign created',
            campaign,
          });
        } catch (error) {
          // Return the helpful error message about Citation Builder setup
          return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Failed to create citation campaign',
            note: 'Citation Builder API may require additional setup. The location has been created and you can order citations through the BrightLocal dashboard.',
          }, { status: 400 });
        }
      }

      case 'test-connection': {
        const result = await brightLocalClient.testConnection();
        return NextResponse.json({
          success: result.success,
          message: result.message,
        });
      }

      default:
        return NextResponse.json({
          success: false,
          message: `Unknown action: ${action}`,
          availableActions: ['list-locations', 'list-clients', 'push-domain', 'create-citation-campaign', 'test-connection'],
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
