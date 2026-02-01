/**
 * Citation Provider Credentials Helper
 * Retrieves credentials from database with environment variable fallback
 */

import { createClient } from '@supabase/supabase-js';

// Cache credentials to avoid repeated database queries
let credentialsCache: Map<string, string | null> = new Map();
let cacheTimestamp: number = 0;
const CACHE_TTL = 60 * 1000; // 1 minute cache

/**
 * Get a credential value from the database or environment variable
 */
export async function getCredential(
  providerSlug: string,
  credentialKey: string,
  envVarName: string
): Promise<string | null> {
  // Check environment variable first (takes precedence for local dev)
  const envValue = process.env[envVarName];
  if (envValue) {
    return envValue;
  }

  // Check cache
  const cacheKey = `${providerSlug}:${credentialKey}`;
  const now = Date.now();

  if (now - cacheTimestamp < CACHE_TTL && credentialsCache.has(cacheKey)) {
    return credentialsCache.get(cacheKey) || null;
  }

  // Fetch from database
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('provider_credentials')
      .select('credential_value')
      .eq('provider_slug', providerSlug)
      .eq('credential_key', credentialKey)
      .eq('is_configured', true)
      .single();

    if (error || !data?.credential_value) {
      credentialsCache.set(cacheKey, null);
      cacheTimestamp = now;
      return null;
    }

    credentialsCache.set(cacheKey, data.credential_value);
    cacheTimestamp = now;
    return data.credential_value;
  } catch {
    return null;
  }
}

/**
 * Check if a provider has all required credentials configured
 */
export async function isProviderConfigured(
  providerSlug: string,
  requiredCredentials: { key: string; envVar: string }[]
): Promise<boolean> {
  for (const cred of requiredCredentials) {
    const value = await getCredential(providerSlug, cred.key, cred.envVar);
    if (!value) {
      return false;
    }
  }
  return true;
}

/**
 * Clear the credentials cache (call after saving new credentials)
 */
export function clearCredentialsCache(): void {
  credentialsCache.clear();
  cacheTimestamp = 0;
}

/**
 * Get all credentials for a provider (for checking configuration status)
 */
export async function getProviderCredentials(
  providerSlug: string,
  credentialMappings: { key: string; envVar: string }[]
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};

  for (const mapping of credentialMappings) {
    result[mapping.envVar] = await getCredential(providerSlug, mapping.key, mapping.envVar);
  }

  return result;
}
