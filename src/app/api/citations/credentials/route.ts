/**
 * Citation Provider Credentials API
 * Save and retrieve API credentials for citation providers
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Mapping of credential keys to their provider slugs
const CREDENTIAL_MAPPING: Record<string, { provider: string; key: string }> = {
  'FOURSQUARE_API_KEY': { provider: 'foursquare', key: 'api_key' },
  'DATA_AXLE_API_KEY': { provider: 'data-axle', key: 'api_key' },
  'GOOGLE_BUSINESS_CLIENT_ID': { provider: 'google-business', key: 'client_id' },
  'GOOGLE_BUSINESS_CLIENT_SECRET': { provider: 'google-business', key: 'client_secret' },
  'GOOGLE_BUSINESS_REFRESH_TOKEN': { provider: 'google-business', key: 'refresh_token' },
  'FACEBOOK_APP_ID': { provider: 'facebook', key: 'app_id' },
  'FACEBOOK_APP_SECRET': { provider: 'facebook', key: 'app_secret' },
  'FACEBOOK_ACCESS_TOKEN': { provider: 'facebook', key: 'access_token' },
  'BROWNBOOK_API_KEY': { provider: 'brownbook', key: 'api_key' },
  'LDE_RAPIDAPI_KEY': { provider: 'lde', key: 'rapidapi_key' },
  'NEUSTAR_LOCALEZE_API_KEY': { provider: 'localeze', key: 'api_key' },
  'YEXT_API_KEY': { provider: 'yext', key: 'api_key' },
};

export async function GET() {
  try {
    // Get all credentials (masked values)
    const { data: credentials, error } = await supabase
      .from('provider_credentials')
      .select('provider_slug, credential_key, is_configured')
      .order('provider_slug');

    if (error) throw error;

    // Build response showing which credentials are configured
    const configured: Record<string, Record<string, boolean>> = {};
    for (const cred of credentials || []) {
      if (!configured[cred.provider_slug]) {
        configured[cred.provider_slug] = {};
      }
      configured[cred.provider_slug][cred.credential_key] = cred.is_configured;
    }

    return NextResponse.json({
      success: true,
      credentials: configured,
    });
  } catch (error) {
    console.error('Get credentials error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get credentials' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credentials } = body;

    if (!credentials || typeof credentials !== 'object') {
      return NextResponse.json(
        { error: 'credentials object is required' },
        { status: 400 }
      );
    }

    const results: { key: string; success: boolean; error?: string }[] = [];

    for (const [envKey, value] of Object.entries(credentials)) {
      const mapping = CREDENTIAL_MAPPING[envKey];
      if (!mapping) {
        results.push({ key: envKey, success: false, error: 'Unknown credential key' });
        continue;
      }

      if (typeof value !== 'string') {
        results.push({ key: envKey, success: false, error: 'Value must be a string' });
        continue;
      }

      // Skip empty values (don't overwrite existing)
      if (!value.trim()) {
        results.push({ key: envKey, success: true });
        continue;
      }

      try {
        // Upsert the credential
        const { error } = await supabase
          .from('provider_credentials')
          .upsert({
            provider_slug: mapping.provider,
            credential_key: mapping.key,
            credential_value: value.trim(),
            is_configured: true,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'provider_slug,credential_key',
          });

        if (error) throw error;
        results.push({ key: envKey, success: true });
      } catch (err) {
        results.push({
          key: envKey,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to save',
        });
      }
    }

    const allSuccess = results.every((r) => r.success);
    const savedCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: allSuccess,
      message: `Saved ${savedCount} of ${results.length} credentials`,
      results,
    });
  } catch (error) {
    console.error('Save credentials error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save credentials' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const providerSlug = searchParams.get('provider');
    const credentialKey = searchParams.get('key');

    if (!providerSlug) {
      return NextResponse.json(
        { error: 'provider query parameter is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('provider_credentials')
      .update({
        credential_value: null,
        is_configured: false,
        updated_at: new Date().toISOString(),
      })
      .eq('provider_slug', providerSlug);

    if (credentialKey) {
      query = query.eq('credential_key', credentialKey);
    }

    const { error } = await query;

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: credentialKey
        ? `Cleared ${credentialKey} for ${providerSlug}`
        : `Cleared all credentials for ${providerSlug}`,
    });
  } catch (error) {
    console.error('Delete credentials error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete credentials' },
      { status: 500 }
    );
  }
}
