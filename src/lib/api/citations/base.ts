/**
 * Base Citation Client
 * Abstract class for all citation provider integrations
 */

import { BrandInfo } from '@/lib/db';
import * as crypto from 'crypto';

// Standard response from citation providers
export interface CitationSubmitResult {
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  message?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface CitationVerifyResult {
  success: boolean;
  status: 'verified' | 'pending' | 'not_found' | 'error';
  externalUrl?: string;
  lastUpdated?: string;
  message?: string;
  error?: string;
}

export interface CitationUpdateResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface CitationDeleteResult {
  success: boolean;
  message?: string;
  error?: string;
}

// Normalized location data for provider APIs
export interface NormalizedLocation {
  businessName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
  website?: string;
  description?: string;
  categories?: string[];
  hours?: Record<string, { open: string; close: string }>;
  socialLinks?: Record<string, string>;
  logoUrl?: string;
  imageUrls?: string[];
}

export abstract class BaseCitationClient {
  abstract readonly providerSlug: string;
  abstract readonly providerName: string;
  abstract readonly tier: number;

  /**
   * Check if the client has all required credentials configured
   */
  abstract isConfigured(): boolean;

  /**
   * Submit a new listing to the provider
   */
  abstract submit(location: NormalizedLocation): Promise<CitationSubmitResult>;

  /**
   * Update an existing listing
   */
  abstract update(externalId: string, location: NormalizedLocation): Promise<CitationUpdateResult>;

  /**
   * Verify if a listing exists and its current status
   */
  abstract verify(externalId: string): Promise<CitationVerifyResult>;

  /**
   * Delete a listing from the provider (if supported)
   */
  async delete(externalId: string): Promise<CitationDeleteResult> {
    return {
      success: false,
      error: `Delete not supported for ${this.providerName}`,
    };
  }

  /**
   * Convert BrandInfo to NormalizedLocation
   */
  normalizeBrandInfo(brandInfo: BrandInfo): NormalizedLocation {
    return {
      businessName: brandInfo.business_name,
      street: brandInfo.street || '',
      city: brandInfo.city || '',
      state: brandInfo.state || '',
      zip: brandInfo.zip || '',
      country: brandInfo.country || 'US',
      phone: brandInfo.phone || undefined,
      email: brandInfo.email || undefined,
      website: brandInfo.website || undefined,
      description: brandInfo.description || undefined,
      categories: brandInfo.categories || undefined,
      hours: brandInfo.hours || undefined,
      socialLinks: brandInfo.social_links || undefined,
      logoUrl: brandInfo.logo_url || undefined,
      imageUrls: brandInfo.image_urls || undefined,
    };
  }

  /**
   * Generate a hash of the brand info for change detection
   */
  hashBrandInfo(brandInfo: BrandInfo): string {
    const normalized = this.normalizeBrandInfo(brandInfo);
    const data = JSON.stringify(normalized, Object.keys(normalized).sort());
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Format phone number to E.164 format (US)
   */
  protected formatPhone(phone: string | null | undefined): string | undefined {
    if (!phone) return undefined;
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    return phone; // Return original if we can't normalize
  }

  /**
   * Format hours to standard format (varies by provider)
   */
  protected formatHours(hours: Record<string, { open: string; close: string }> | null | undefined): Record<string, { open: string; close: string }> | undefined {
    if (!hours) return undefined;
    return hours;
  }

  /**
   * Validate that required fields are present
   */
  protected validateRequired(location: NormalizedLocation): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!location.businessName) errors.push('Business name is required');
    if (!location.street) errors.push('Street address is required');
    if (!location.city) errors.push('City is required');
    if (!location.state) errors.push('State is required');
    if (!location.zip) errors.push('ZIP code is required');
    if (!location.country) errors.push('Country is required');

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
