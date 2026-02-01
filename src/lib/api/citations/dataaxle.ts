/**
 * Data Axle API Client
 * https://developer.data-axle.com/
 *
 * Tier 1 Direct API - Covers ~95% of search traffic
 * Feeds: Google, Yelp, Facebook, Yahoo, Bing
 */

import {
  BaseCitationClient,
  CitationSubmitResult,
  CitationUpdateResult,
  CitationVerifyResult,
  NormalizedLocation,
} from './base';
import { getCredential } from './credentials';

interface DataAxleLocation {
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
  };
  phone?: string;
  website?: string;
  email?: string;
  description?: string;
  categories?: string[];
  hours_of_operation?: {
    [day: string]: { open: string; close: string };
  };
  social_profiles?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
  };
  logo_url?: string;
  photos?: string[];
}

interface DataAxleResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface DataAxleListing {
  id: string;
  status: 'active' | 'pending' | 'rejected';
  created_at: string;
  updated_at: string;
  verification_status: 'verified' | 'unverified' | 'pending';
  distribution_status: {
    directory: string;
    status: 'synced' | 'pending' | 'error';
    url?: string;
  }[];
}

class DataAxleClient extends BaseCitationClient {
  readonly providerSlug = 'data-axle';
  readonly providerName = 'Data Axle';
  readonly tier = 1;

  private baseUrl = 'https://api.data-axle.com/v1';
  private cachedApiKey: string | null = null;

  private async getApiKey(): Promise<string | null> {
    if (this.cachedApiKey) return this.cachedApiKey;
    this.cachedApiKey = await getCredential('data-axle', 'api_key', 'DATA_AXLE_API_KEY');
    return this.cachedApiKey;
  }

  isConfigured(): boolean {
    return !!process.env.DATA_AXLE_API_KEY;
  }

  async isConfiguredAsync(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return !!apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<DataAxleResponse<T>> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Data Axle API key is not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Data Axle API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Convert NormalizedLocation to Data Axle format
   */
  private toDataAxleLocation(location: NormalizedLocation): DataAxleLocation {
    return {
      name: location.businessName,
      address: {
        street: location.street,
        city: location.city,
        state: location.state,
        postal_code: location.zip,
        country_code: location.country,
      },
      phone: this.formatPhone(location.phone),
      website: location.website,
      email: location.email,
      description: location.description,
      categories: location.categories,
      hours_of_operation: location.hours,
      social_profiles: location.socialLinks ? {
        facebook: location.socialLinks.facebook,
        twitter: location.socialLinks.twitter,
        instagram: location.socialLinks.instagram,
        linkedin: location.socialLinks.linkedin,
        youtube: location.socialLinks.youtube,
      } : undefined,
      logo_url: location.logoUrl,
      photos: location.imageUrls,
    };
  }

  /**
   * Search for existing listings
   */
  async search(name: string, city: string, state: string): Promise<DataAxleListing[]> {
    const params = new URLSearchParams({
      name,
      city,
      state,
    });

    const result = await this.request<DataAxleListing[]>(
      `/listings/search?${params.toString()}`
    );

    return result.data || [];
  }

  async submit(location: NormalizedLocation): Promise<CitationSubmitResult> {
    const validation = this.validateRequired(location);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    try {
      // Check for existing listing first
      const existing = await this.search(
        location.businessName,
        location.city,
        location.state
      );

      if (existing.length > 0) {
        const match = existing[0];
        return {
          success: true,
          externalId: match.id,
          message: 'Existing listing found - use update to modify',
          metadata: { matched: true, status: match.status },
        };
      }

      // Create new listing
      const daLocation = this.toDataAxleLocation(location);

      const result = await this.request<DataAxleListing>('/listings', {
        method: 'POST',
        body: JSON.stringify(daLocation),
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error?.message || 'Unknown error',
        };
      }

      return {
        success: true,
        externalId: result.data.id,
        message: 'Listing created successfully',
        metadata: {
          status: result.data.status,
          verification_status: result.data.verification_status,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async update(externalId: string, location: NormalizedLocation): Promise<CitationUpdateResult> {
    try {
      const daLocation = this.toDataAxleLocation(location);

      const result = await this.request<DataAxleListing>(
        `/listings/${externalId}`,
        {
          method: 'PUT',
          body: JSON.stringify(daLocation),
        }
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error?.message || 'Unknown error',
        };
      }

      return {
        success: true,
        message: 'Listing updated successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async verify(externalId: string): Promise<CitationVerifyResult> {
    try {
      const result = await this.request<DataAxleListing>(
        `/listings/${externalId}`
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          status: 'error',
          error: result.error?.message || 'Could not get listing',
        };
      }

      const listing = result.data;
      let status: 'verified' | 'pending' | 'not_found' | 'error' = 'pending';

      if (listing.verification_status === 'verified' && listing.status === 'active') {
        status = 'verified';
      } else if (listing.status === 'rejected') {
        status = 'error';
      }

      return {
        success: true,
        status,
        lastUpdated: listing.updated_at,
        message: `Status: ${listing.status}, Verification: ${listing.verification_status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('404')) {
        return {
          success: true,
          status: 'not_found',
          message: 'Listing not found',
        };
      }
      return {
        success: false,
        status: 'error',
        error: message,
      };
    }
  }

  /**
   * Get distribution status across all partner directories
   */
  async getDistributionStatus(externalId: string): Promise<DataAxleListing['distribution_status']> {
    try {
      const result = await this.request<DataAxleListing>(
        `/listings/${externalId}`
      );
      return result.data?.distribution_status || [];
    } catch {
      return [];
    }
  }
}

export const dataAxleClient = new DataAxleClient();
