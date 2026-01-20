/**
 * GoDaddy API Client
 * Docs: https://developer.godaddy.com/doc/endpoint/domains
 * Note: Requires API key + secret (available to accounts with 10+ domains)
 */

export interface GoDaddyDomain {
  domainId: number;
  domain: string;
  status: string;
  expires: string;
  createdAt: string;
  renewAuto: boolean;
  renewable: boolean;
  privacy: boolean;
  locked: boolean;
  nameServers: string[];
}

export interface GoDaddyPagination {
  first?: string;
  previous?: string;
  next?: string;
  last?: string;
  total: number;
}

class GoDaddyClient {
  private baseUrl = 'https://api.godaddy.com';
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    this.apiKey = process.env.GODADDY_API_KEY || '';
    this.apiSecret = process.env.GODADDY_API_SECRET || '';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('GODADDY_API_KEY and GODADDY_API_SECRET are not configured');
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `sso-key ${this.apiKey}:${this.apiSecret}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GoDaddy API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async listDomains(options?: { limit?: number; marker?: string; statuses?: string[] }): Promise<GoDaddyDomain[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.marker) params.set('marker', options.marker);
      if (options?.statuses) params.set('statuses', options.statuses.join(','));

      const queryString = params.toString();
      const endpoint = `/v1/domains${queryString ? `?${queryString}` : ''}`;

      const response = await this.request<GoDaddyDomain[]>(endpoint);
      return response || [];
    } catch (error) {
      console.error('Failed to fetch GoDaddy domains:', error);
      throw error;
    }
  }

  async getDomain(domain: string): Promise<GoDaddyDomain> {
    return this.request<GoDaddyDomain>(`/v1/domains/${domain}`);
  }

  async getAllDomains(): Promise<GoDaddyDomain[]> {
    const allDomains: GoDaddyDomain[] = [];
    let marker: string | undefined;
    const limit = 100;

    do {
      const batch = await this.listDomains({ limit, marker });
      allDomains.push(...batch);

      if (batch.length < limit) {
        break;
      }
      marker = batch[batch.length - 1]?.domain;
    } while (marker);

    return allDomains;
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.apiSecret;
  }
}

export const godaddyClient = new GoDaddyClient();
