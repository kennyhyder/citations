/**
 * Local Data Exchange (LDE) API Client
 * https://rapidapi.com/lde/api/local-data-exchange
 *
 * Tier 2 Aggregator - Single API for 130+ directories
 * Includes: Apple, Bing, TomTom, HERE, Yahoo, Uber, Navmii
 */

import {
  BaseCitationClient,
  CitationSubmitResult,
  CitationUpdateResult,
  CitationVerifyResult,
  NormalizedLocation,
} from './base';

interface LDELocation {
  id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string;
  website?: string;
  email?: string;
  description?: string;
  categories?: string[];
  hours?: {
    monday?: { open: string; close: string };
    tuesday?: { open: string; close: string };
    wednesday?: { open: string; close: string };
    thursday?: { open: string; close: string };
    friday?: { open: string; close: string };
    saturday?: { open: string; close: string };
    sunday?: { open: string; close: string };
  };
  logo_url?: string;
  photos?: string[];
  social?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
}

interface LDEResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface LDEListingStatus {
  directory: string;
  status: 'synced' | 'pending' | 'error';
  url?: string;
  last_updated?: string;
}

class LDEClient extends BaseCitationClient {
  readonly providerSlug = 'lde';
  readonly providerName = 'Local Data Exchange';
  readonly tier = 2;

  private baseUrl = 'https://local-data-exchange.p.rapidapi.com';

  private get apiKey(): string {
    return process.env.LDE_RAPIDAPI_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<LDEResponse<T>> {
    if (!this.isConfigured()) {
      throw new Error('LDE RapidAPI key is not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'local-data-exchange.p.rapidapi.com',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LDE API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Convert NormalizedLocation to LDE format
   */
  private toLDELocation(location: NormalizedLocation): LDELocation {
    return {
      name: location.businessName,
      address: location.street,
      city: location.city,
      state: location.state,
      postal_code: location.zip,
      country: location.country,
      phone: this.formatPhone(location.phone),
      website: location.website,
      email: location.email,
      description: location.description,
      categories: location.categories,
      hours: location.hours as LDELocation['hours'],
      logo_url: location.logoUrl,
      photos: location.imageUrls,
      social: location.socialLinks ? {
        facebook: location.socialLinks.facebook,
        twitter: location.socialLinks.twitter,
        instagram: location.socialLinks.instagram,
        linkedin: location.socialLinks.linkedin,
      } : undefined,
    };
  }

  /**
   * Submit a new location to LDE network
   */
  async submit(location: NormalizedLocation): Promise<CitationSubmitResult> {
    const validation = this.validateRequired(location);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.errors.join(', '),
      };
    }

    try {
      const ldeLocation = this.toLDELocation(location);

      const result = await this.request<{ id: string; directories: LDEListingStatus[] }>(
        '/locations',
        {
          method: 'POST',
          body: JSON.stringify(ldeLocation),
        }
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || result.message || 'Unknown error',
        };
      }

      return {
        success: true,
        externalId: result.data.id,
        message: `Submitted to ${result.data.directories?.length || 0} directories`,
        metadata: {
          directories: result.data.directories,
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
      const ldeLocation = this.toLDELocation(location);

      const result = await this.request<{ id: string }>(
        `/locations/${externalId}`,
        {
          method: 'PUT',
          body: JSON.stringify(ldeLocation),
        }
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || result.message || 'Unknown error',
        };
      }

      return {
        success: true,
        message: 'Location updated successfully',
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
      const result = await this.request<{
        id: string;
        directories: LDEListingStatus[];
      }>(`/locations/${externalId}/status`);

      if (!result.success || !result.data) {
        return {
          success: false,
          status: 'error',
          error: result.error || 'Could not get status',
        };
      }

      const directories = result.data.directories || [];
      const syncedCount = directories.filter((d) => d.status === 'synced').length;
      const pendingCount = directories.filter((d) => d.status === 'pending').length;

      let status: 'verified' | 'pending' | 'not_found' | 'error' = 'pending';
      if (syncedCount > 0 && pendingCount === 0) {
        status = 'verified';
      } else if (syncedCount === 0 && directories.length === 0) {
        status = 'not_found';
      }

      return {
        success: true,
        status,
        message: `${syncedCount} synced, ${pendingCount} pending across ${directories.length} directories`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('404')) {
        return {
          success: true,
          status: 'not_found',
          message: 'Location not found',
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
   * Get list of all directories in the LDE network
   */
  async getDirectories(): Promise<Array<{ name: string; category: string }>> {
    try {
      const result = await this.request<Array<{ name: string; category: string }>>(
        '/directories'
      );
      return result.data || [];
    } catch {
      return [];
    }
  }

  /**
   * Get detailed status for a location across all directories
   */
  async getDetailedStatus(externalId: string): Promise<LDEListingStatus[]> {
    try {
      const result = await this.request<{ directories: LDEListingStatus[] }>(
        `/locations/${externalId}/directories`
      );
      return result.data?.directories || [];
    } catch {
      return [];
    }
  }
}

export const ldeClient = new LDEClient();
