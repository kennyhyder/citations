import { NextRequest, NextResponse } from 'next/server';
import { db, type BrandInfo } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate domain exists
    const domain = await db.getDomain(id);
    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    // Validate required fields
    if (!body.business_name) {
      return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
    }

    // Build brand info object
    const brandInfo: Omit<BrandInfo, 'id' | 'created_at' | 'updated_at'> = {
      domain_id: id,
      business_name: body.business_name,
      street: body.street || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      country: body.country || 'US',
      phone: body.phone || null,
      email: body.email || null,
      website: body.website || null,
      categories: Array.isArray(body.categories) ? body.categories : null,
      description: body.description || null,
      hours: body.hours || null,
      social_links: body.social_links || null,
      logo_url: body.logo_url || null,
      image_urls: body.image_urls || null,
    };

    const saved = await db.upsertBrandInfo(brandInfo);

    // Also create a pending relate brand entry if it doesn't exist
    const existingRelateBrand = await db.getRelateBrand(id);
    if (!existingRelateBrand) {
      await db.upsertRelateBrand({
        domain_id: id,
        relate_brand_id: null,
        status: 'pending',
        directory_count: 0,
        last_synced_at: null,
        error_message: null,
      });
    }

    return NextResponse.json(saved);
  } catch (error) {
    console.error('Error saving brand info:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save brand info' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const brandInfo = await db.getBrandInfo(id);

    if (!brandInfo) {
      return NextResponse.json({ error: 'Brand info not found' }, { status: 404 });
    }

    return NextResponse.json(brandInfo);
  } catch (error) {
    console.error('Error fetching brand info:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch brand info' },
      { status: 500 }
    );
  }
}
