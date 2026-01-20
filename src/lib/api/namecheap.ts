/**
 * Namecheap API Client
 * Docs: https://www.namecheap.com/support/api/intro/
 * Note: Requires $50 account balance OR 20+ domains to access API
 * Also requires IP whitelisting in Namecheap dashboard
 */

import { parseStringPromise } from 'xml2js';

export interface NamecheapDomain {
  ID: string;
  Name: string;
  User: string;
  Created: string;
  Expires: string;
  IsExpired: boolean;
  IsLocked: boolean;
  AutoRenew: boolean;
  WhoisGuard: string;
  IsPremium: boolean;
  IsOurDNS: boolean;
}

interface NamecheapApiResponse {
  ApiResponse: {
    $: { Status: string };
    Errors?: { Error?: { _: string }[] }[];
    CommandResponse?: {
      DomainGetListResult?: { Domain?: NamecheapXmlDomain[] }[];
      Paging?: { TotalItems?: string[]; CurrentPage?: string[]; PageSize?: string[] }[];
    }[];
  };
}

interface NamecheapXmlDomain {
  $: {
    ID: string;
    Name: string;
    User: string;
    Created: string;
    Expires: string;
    IsExpired: string;
    IsLocked: string;
    AutoRenew: string;
    WhoisGuard: string;
    IsPremium: string;
    IsOurDNS: string;
  };
}

class NamecheapClient {
  private baseUrl = 'https://api.namecheap.com/xml.response';
  private apiUser: string;
  private apiKey: string;
  private clientIp: string;

  constructor() {
    this.apiUser = process.env.NAMECHEAP_API_USER || '';
    this.apiKey = process.env.NAMECHEAP_API_KEY || '';
    this.clientIp = process.env.NAMECHEAP_CLIENT_IP || '';
  }

  private buildUrl(command: string, params: Record<string, string> = {}): string {
    const urlParams = new URLSearchParams({
      ApiUser: this.apiUser,
      ApiKey: this.apiKey,
      UserName: this.apiUser,
      ClientIp: this.clientIp,
      Command: command,
      ...params,
    });

    return `${this.baseUrl}?${urlParams.toString()}`;
  }

  private async request<T>(command: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiUser || !this.apiKey || !this.clientIp) {
      throw new Error('NAMECHEAP_API_USER, NAMECHEAP_API_KEY, and NAMECHEAP_CLIENT_IP are not configured');
    }

    const url = this.buildUrl(command, params);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Namecheap API error: ${response.status}`);
    }

    const xml = await response.text();
    const parsed = await parseStringPromise(xml) as T;
    return parsed;
  }

  async listDomains(page: number = 1, pageSize: number = 100): Promise<NamecheapDomain[]> {
    try {
      const response = await this.request<NamecheapApiResponse>('namecheap.domains.getList', {
        Page: page.toString(),
        PageSize: pageSize.toString(),
      });

      if (response.ApiResponse.$.Status !== 'OK') {
        const errors = response.ApiResponse.Errors?.[0]?.Error?.map(e => e._).join(', ') || 'Unknown error';
        throw new Error(`Namecheap API error: ${errors}`);
      }

      const domains = response.ApiResponse.CommandResponse?.[0]?.DomainGetListResult?.[0]?.Domain || [];

      return domains.map((d: NamecheapXmlDomain) => ({
        ID: d.$.ID,
        Name: d.$.Name,
        User: d.$.User,
        Created: d.$.Created,
        Expires: d.$.Expires,
        IsExpired: d.$.IsExpired === 'true',
        IsLocked: d.$.IsLocked === 'true',
        AutoRenew: d.$.AutoRenew === 'true',
        WhoisGuard: d.$.WhoisGuard,
        IsPremium: d.$.IsPremium === 'true',
        IsOurDNS: d.$.IsOurDNS === 'true',
      }));
    } catch (error) {
      console.error('Failed to fetch Namecheap domains:', error);
      throw error;
    }
  }

  async getAllDomains(): Promise<NamecheapDomain[]> {
    const allDomains: NamecheapDomain[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const batch = await this.listDomains(page, pageSize);
      allDomains.push(...batch);

      if (batch.length < pageSize) {
        break;
      }
      page++;
    }

    return allDomains;
  }

  isConfigured(): boolean {
    return !!this.apiUser && !!this.apiKey && !!this.clientIp;
  }
}

export const namecheapClient = new NamecheapClient();
