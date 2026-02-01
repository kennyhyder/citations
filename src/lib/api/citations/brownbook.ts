/**
 * Brownbook.net API Client
 * https://www.brownbook.net/api/
 *
 * Tier 1 Direct API - Global business directory
 */

import {
  BaseCitationClient,
  CitationSubmitResult,
  CitationUpdateResult,
  CitationVerifyResult,
  NormalizedLocation,
} from './base';

interface BrownbookBusiness {
  id?: string;
  name: string;
  address: string;
  city: string;
  region?: string; // state/province
  postcode?: string;
  country: string;
  phone?: string;
  website?: string;
  email?: string;
  description?: string;
  categories?: string[];
  opening_hours?: string; // Free-form text
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  logo_url?: string;
  images?: string[];
  url?: string; // Brownbook listing URL
  status?: 'active' | 'pending' | 'rejected';
  created_at?: string;
  updated_at?: string;
}

interface BrownbookResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class BrownbookClient extends BaseCitationClient {
  readonly providerSlug = 'brownbook';
  readonly providerName = 'Brownbook.net';
  readonly tier = 1;

  private baseUrl = 'https://api.brownbook.net/v1';

  private get apiKey(): string {
    return process.env.BROWNBOOK_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<BrownbookResponse<T>> {
    if (!this.isConfigured()) {
      throw new Error('Brownbook API key is not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brownbook API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Convert hours to Brownbook's free-form text format
   */
  private formatHoursText(hours: Record<string, { open: string; close: string }> | undefined): string | undefined {
    if (!hours) return undefined;

    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const shortDays: Record<string, string> = {
      monday: 'Mon',
      tuesday: 'Tue',
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun',
    };

    const lines = dayOrder
      .filter((day) => hours[day])
      .map((day) => `${shortDays[day]}: ${hours[day].open} - ${hours[day].close}`);

    return lines.join(', ');
  }

  /**
   * Convert NormalizedLocation to Brownbook format
   */
  private toBrownbookBusiness(location: NormalizedLocation): Omit<BrownbookBusiness, 'id' | 'url' | 'status' | 'created_at' | 'updated_at'> {
    return {
      name: location.businessName,
      address: location.street,
      city: location.city,
      region: location.state,
      postcode: location.zip,
      country: location.country,
      phone: this.formatPhone(location.phone),
      website: location.website,
      email: location.email,
      description: location.description,
      categories: location.categories,
      opening_hours: this.formatHoursText(location.hours),
      facebook: location.socialLinks?.facebook,
      twitter: location.socialLinks?.twitter,
      instagram: location.socialLinks?.instagram,
      linkedin: location.socialLinks?.linkedin,
      logo_url: location.logoUrl,
      images: location.imageUrls,
    };
  }

  /**
   * Search for existing businesses
   */
  async search(name: string, city: string): Promise<BrownbookBusiness[]> {
    const params = new URLSearchParams({ name, city });
    const result = await this.request<BrownbookBusiness[]>(
      `/businesses/search?${params.toString()}`
    );
    return result.data || [];
  }

  /**
   * Get a business by ID
   */
  async getBusiness(id: string): Promise<BrownbookBusiness | null> {
    try {
      const result = await this.request<BrownbookBusiness>(`/businesses/${id}`);
      return result.data || null;
    } catch {
      return null;
    }
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
      // Search for existing listing
      const existing = await this.search(location.businessName, location.city);
      const match = existing.find(
        (b) => b.name.toLowerCase() === location.businessName.toLowerCase()
      );

      if (match && match.id) {
        return {
          success: true,
          externalId: match.id,
          externalUrl: match.url || `https://www.brownbook.net/business/${match.id}`,
          message: 'Existing listing found',
          metadata: { matched: true, status: match.status },
        };
      }

      // Create new listing
      const business = this.toBrownbookBusiness(location);

      const result = await this.request<BrownbookBusiness>('/businesses', {
        method: 'POST',
        body: JSON.stringify(business),
      });

      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || result.message || 'Unknown error',
        };
      }

      return {
        success: true,
        externalId: result.data.id,
        externalUrl: result.data.url || `https://www.brownbook.net/business/${result.data.id}`,
        message: 'Listing created successfully',
        metadata: { status: result.data.status },
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
      const business = this.toBrownbookBusiness(location);

      const result = await this.request<BrownbookBusiness>(
        `/businesses/${externalId}`,
        {
          method: 'PUT',
          body: JSON.stringify(business),
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
      const business = await this.getBusiness(externalId);

      if (!business) {
        return {
          success: true,
          status: 'not_found',
          message: 'Listing not found',
        };
      }

      let status: 'verified' | 'pending' | 'not_found' | 'error' = 'pending';
      if (business.status === 'active') {
        status = 'verified';
      } else if (business.status === 'rejected') {
        status = 'error';
      }

      return {
        success: true,
        status,
        externalUrl: business.url || `https://www.brownbook.net/business/${business.id}`,
        lastUpdated: business.updated_at,
        message: `Status: ${business.status}`,
      };
    } catch (error) {
      return {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async delete(externalId: string): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
      const result = await this.request<{ deleted: boolean }>(
        `/businesses/${externalId}`,
        { method: 'DELETE' }
      );

      return {
        success: result.success,
        message: result.success ? 'Listing deleted successfully' : result.message,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const brownbookClient = new BrownbookClient();
