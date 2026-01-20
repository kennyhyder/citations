/**
 * Namecheap RelateLocal API Client
 * RelateLocal is a Yext-like service that syncs business NAP data across 40+ directories
 *
 * Note: API documentation to be provided by client
 * This is a preliminary implementation based on typical Yext-like APIs
 */

export interface BrandInfo {
  id?: string;
  domain: string;
  businessName: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  phone: string;
  website?: string;
  email?: string;
  categories: string[];
  description?: string;
  hours?: {
    monday?: { open: string; close: string };
    tuesday?: { open: string; close: string };
    wednesday?: { open: string; close: string };
    thursday?: { open: string; close: string };
    friday?: { open: string; close: string };
    saturday?: { open: string; close: string };
    sunday?: { open: string; close: string };
  };
  socialLinks?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
  };
  logo?: string;
  images?: string[];
}

export interface RelateBrand {
  id: string;
  domain: string;
  status: 'active' | 'pending' | 'syncing' | 'error';
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
  directoryCount?: number;
  brandInfo?: BrandInfo;
}

export interface RelateApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    pageSize: number;
  };
}

class RelateClient {
  // Base URL TBD - will be updated when client provides API docs
  private baseUrl = process.env.RELATE_API_URL || 'https://api.relatelocal.com';
  private apiToken: string;
  private useAutomation: boolean;

  constructor() {
    this.apiToken = process.env.RELATE_API_TOKEN || '';
    // Use automation if API token is not configured but Namecheap credentials are
    this.useAutomation = !this.apiToken && !!(process.env.NAMECHEAP_USERNAME && process.env.NAMECHEAP_PASSWORD);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<RelateApiResponse<T>> {
    if (!this.apiToken) {
      throw new Error('RELATE_API_TOKEN is not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Relate API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async listBrands(page: number = 1, pageSize: number = 50): Promise<RelateBrand[]> {
    try {
      const response = await this.request<RelateBrand[]>(
        `/v1/brands?page=${page}&pageSize=${pageSize}`
      );
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch Relate brands:', error);
      throw error;
    }
  }

  async getAllBrands(): Promise<RelateBrand[]> {
    const allBrands: RelateBrand[] = [];
    let page = 1;
    const pageSize = 50;

    while (true) {
      const batch = await this.listBrands(page, pageSize);
      allBrands.push(...batch);

      if (batch.length < pageSize) {
        break;
      }
      page++;
    }

    return allBrands;
  }

  async getBrand(brandId: string): Promise<RelateBrand> {
    const response = await this.request<RelateBrand>(`/v1/brands/${brandId}`);
    if (!response.data) {
      throw new Error(`Brand not found: ${brandId}`);
    }
    return response.data;
  }

  async createBrand(brandInfo: BrandInfo): Promise<RelateBrand> {
    const response = await this.request<RelateBrand>('/v1/brands', {
      method: 'POST',
      body: JSON.stringify(brandInfo),
    });
    if (!response.data) {
      throw new Error(`Failed to create brand: ${response.error}`);
    }
    return response.data;
  }

  async updateBrand(brandId: string, brandInfo: Partial<BrandInfo>): Promise<RelateBrand> {
    const response = await this.request<RelateBrand>(`/v1/brands/${brandId}`, {
      method: 'PATCH',
      body: JSON.stringify(brandInfo),
    });
    if (!response.data) {
      throw new Error(`Failed to update brand: ${response.error}`);
    }
    return response.data;
  }

  async deleteBrand(brandId: string): Promise<void> {
    await this.request(`/v1/brands/${brandId}`, {
      method: 'DELETE',
    });
  }

  async syncBrand(brandId: string): Promise<RelateBrand> {
    const response = await this.request<RelateBrand>(`/v1/brands/${brandId}/sync`, {
      method: 'POST',
    });
    if (!response.data) {
      throw new Error(`Failed to sync brand: ${response.error}`);
    }
    return response.data;
  }

  async getBrandSyncStatus(brandId: string): Promise<{
    status: 'syncing' | 'complete' | 'error';
    progress: number;
    directories: { name: string; status: string }[];
  }> {
    const response = await this.request<{
      status: 'syncing' | 'complete' | 'error';
      progress: number;
      directories: { name: string; status: string }[];
    }>(`/v1/brands/${brandId}/sync/status`);
    return response.data!;
  }

  isConfigured(): boolean {
    return !!this.apiToken || this.useAutomation;
  }

  isUsingAutomation(): boolean {
    return this.useAutomation;
  }
}

export const relateClient = new RelateClient();
