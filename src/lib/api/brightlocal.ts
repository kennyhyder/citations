/**
 * BrightLocal REST API Client
 * Uses direct REST API calls instead of MCP for write operations
 */

export interface BrightLocalLocation {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  telephone: string;
  website?: string;
  email?: string;
  description?: string;
  categories?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BrightLocalClient {
  id: string;
  name: string;
}

export interface BrightLocalCampaign {
  id: string;
  locationId: string;
  status: string;
  citationsOrdered: number;
  citationsCompleted: number;
  createdAt: string;
}

export interface CreateLocationParams {
  name: string;
  address: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  telephone: string;
  website?: string;
  email?: string;
  description?: string;
  categories?: string[];
  businessCategoryId?: number;
  clientId?: string;
}

interface APIResponse {
  success: boolean;
  errors?: Record<string, string> | string[];
  message?: string;
}

interface ClientCreateResponse extends APIResponse {
  'client-id'?: number;
}

interface LocationCreateResponse extends APIResponse {
  'location-id'?: number;
}

interface LocationListResponse extends APIResponse {
  locations?: Array<{
    'location-id': number;
    name: string;
    'location-reference': string;
    url?: string;
    'business-category-id'?: number;
    country: string;
    address1?: string;
    city?: string;
    region?: string;
    postcode?: string;
    telephone?: string;
  }>;
}

interface ClientListResponse extends APIResponse {
  clients?: Array<{
    'client-id': number;
    name: string;
    'client-reference': string;
    'created-at': string;
    'updated-at': string;
  }>;
}

class BrightLocalRestClient {
  private apiKey: string;
  private baseUrl = 'https://tools.brightlocal.com/seo-tools/api';

  constructor() {
    this.apiKey = process.env.BRIGHTLOCAL_API_KEY || '';
  }

  /**
   * Make a POST request to the BrightLocal API
   */
  private async post<T>(endpoint: string, data: Record<string, string | number | undefined>): Promise<T> {
    const formData = new URLSearchParams();
    formData.append('api-key', this.apiKey);

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && value !== '') {
        formData.append(key, String(value));
      }
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await response.json();

    if (!result.success && result.errors) {
      const errorMsg = typeof result.errors === 'object'
        ? Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join(', ')
        : JSON.stringify(result.errors);
      throw new Error(`BrightLocal API error: ${errorMsg}`);
    }

    return result as T;
  }

  /**
   * Make a GET request to the BrightLocal API
   */
  private async get<T>(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const searchParams = new URLSearchParams();
    searchParams.append('api-key', this.apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    }

    const response = await fetch(`${this.baseUrl}${endpoint}?${searchParams.toString()}`, {
      method: 'GET',
    });

    return await response.json() as T;
  }

  /**
   * Create a new client (business grouping)
   */
  async createClient(name: string, reference?: string, url?: string): Promise<{ clientId: number }> {
    const result = await this.post<ClientCreateResponse>('/v1/clients-and-locations/clients', {
      name,
      'client-reference': reference || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      'company-url': url || 'https://example.com', // Required field
    });

    if (!result['client-id']) {
      throw new Error('Failed to create client: No client ID returned');
    }

    return { clientId: result['client-id'] };
  }

  /**
   * List all clients
   */
  async listClients(): Promise<BrightLocalClient[]> {
    const result = await this.get<ClientListResponse>('/v1/clients-and-locations/clients');

    if (!result.clients) {
      return [];
    }

    return result.clients.map(c => ({
      id: String(c['client-id']),
      name: c.name,
    }));
  }

  /**
   * Create a new location (business listing)
   */
  async createLocation(params: CreateLocationParams): Promise<{ locationId: number }> {
    // Clean phone number - remove non-digits
    const cleanPhone = params.telephone.replace(/\D/g, '');

    const requestData = {
      name: params.name,
      'location-reference': params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now(),
      'client-id': params.clientId,
      url: params.website,
      'business-category-id': params.businessCategoryId || 1207, // Default to "Auto Glass" category
      country: params.country === 'US' ? 'USA' : params.country,
      address1: params.address,
      city: params.city,
      region: params.state,
      postcode: params.postcode,
      telephone: cleanPhone,
      description: params.description,
      email: params.email,
    };

    const result = await this.post<LocationCreateResponse>('/v2/clients-and-locations/locations/', requestData);

    if (!result['location-id']) {
      throw new Error('Failed to create location: No location ID returned');
    }

    return { locationId: result['location-id'] };
  }

  /**
   * List all locations
   */
  async listLocations(clientId?: string): Promise<BrightLocalLocation[]> {
    const result = await this.get<LocationListResponse>('/v2/clients-and-locations/locations/', {
      'client-id': clientId,
    });

    if (!result.locations) {
      return [];
    }

    return result.locations.map(loc => ({
      id: String(loc['location-id']),
      name: loc.name,
      address: loc.address1 || '',
      city: loc.city || '',
      state: loc.region || '',
      postcode: loc.postcode || '',
      country: loc.country,
      telephone: loc.telephone || '',
      website: loc.url,
    }));
  }

  /**
   * Get a specific location
   */
  async getLocation(locationId: string): Promise<BrightLocalLocation | null> {
    try {
      const result = await this.get<LocationListResponse>('/v2/clients-and-locations/locations/', {
        'location-id': locationId,
      });

      if (!result.locations || result.locations.length === 0) {
        return null;
      }

      const loc = result.locations[0];
      return {
        id: String(loc['location-id']),
        name: loc.name,
        address: loc.address1 || '',
        city: loc.city || '',
        state: loc.region || '',
        postcode: loc.postcode || '',
        country: loc.country,
        telephone: loc.telephone || '',
        website: loc.url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Create a citation campaign for a location
   * Note: This requires Citation Builder API access and credits
   */
  async createCitationCampaign(locationId: string, _packageType = 'cb15'): Promise<{ campaignId: number }> {
    // The Citation Builder API endpoint requires specific subscription access
    // Endpoint: POST /v2/cb/create
    // After creating, must call /v2/cb/confirm-and-pay to activate

    // For now, we'll document that this requires additional BrightLocal setup
    throw new Error(
      `Citation Builder campaigns require additional BrightLocal setup. ` +
      `Location ${locationId} has been created successfully. ` +
      `To order citations, please:\n` +
      `1. Ensure your BrightLocal account has Citation Builder API access enabled\n` +
      `2. Purchase citation credits in your BrightLocal dashboard\n` +
      `3. The Citation Builder API may require enterprise-level access`
    );
  }

  /**
   * Get or create the default client for this app
   */
  async getOrCreateDefaultClient(): Promise<{ clientId: number }> {
    // Try to find existing client
    const clients = await this.listClients();
    const existingClient = clients.find(c => c.name === 'Citations App');

    if (existingClient) {
      return { clientId: parseInt(existingClient.id) };
    }

    // Create new client
    return this.createClient('Citations App', 'citations-app');
  }

  /**
   * Check if client is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const clients = await this.listClients();
      return {
        success: true,
        message: `Connected successfully. Found ${clients.length} client(s).`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to connect to BrightLocal API',
      };
    }
  }
}

export const brightLocalClient = new BrightLocalRestClient();
