'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ProviderConfig {
  slug: string;
  name: string;
  tier: number;
  isConfigured: boolean;
  isAggregator: boolean;
  coverage: string | null;
  envVars: { key: string; description: string; link?: string }[];
  setupSteps: string[];
  documentationUrl: string | null;
  priority: number;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    slug: 'foursquare',
    name: 'Foursquare',
    tier: 1,
    isConfigured: false,
    isAggregator: false,
    coverage: 'Feeds Snapchat, Uber, Samsung, Microsoft, Spotify + 50 navigation apps',
    priority: 90,
    documentationUrl: 'https://developer.foursquare.com/',
    envVars: [
      { key: 'FOURSQUARE_API_KEY', description: 'Foursquare API Key', link: 'https://developer.foursquare.com/docs/manage-api-keys' },
    ],
    setupSteps: [
      'Go to developer.foursquare.com and create an account',
      'Create a new project in the Foursquare Developer Console',
      'Generate an API key with Places API access',
      'Paste the API key below and save',
    ],
  },
  {
    slug: 'lde',
    name: 'Local Data Exchange (LDE)',
    tier: 2,
    isConfigured: false,
    isAggregator: true,
    coverage: '130+ directories: Apple Maps, Bing, TomTom, HERE, Yahoo, Uber, Navmii, MapQuest',
    priority: 95,
    documentationUrl: 'https://rapidapi.com/lde/api/local-data-exchange',
    envVars: [
      { key: 'LDE_RAPIDAPI_KEY', description: 'RapidAPI Key for LDE', link: 'https://rapidapi.com/lde/api/local-data-exchange' },
    ],
    setupSteps: [
      'Create a RapidAPI account at rapidapi.com',
      'Subscribe to the Local Data Exchange API',
      'Copy your RapidAPI key from the API dashboard',
      'Paste the key below and save',
    ],
  },
  {
    slug: 'data-axle',
    name: 'Data Axle',
    tier: 1,
    isConfigured: false,
    isAggregator: false,
    coverage: 'Covers ~95% of search traffic, feeds Google, Yelp, Facebook, Yahoo, Bing',
    priority: 85,
    documentationUrl: 'https://developer.data-axle.com/',
    envVars: [
      { key: 'DATA_AXLE_API_KEY', description: 'Data Axle API Key', link: 'https://developer.data-axle.com/' },
    ],
    setupSteps: [
      'Contact Data Axle for API access (enterprise service)',
      'Complete the onboarding process',
      'Receive your API credentials',
      'Paste the API key below and save',
    ],
  },
  {
    slug: 'localeze',
    name: 'Neustar Localeze',
    tier: 2,
    isConfigured: false,
    isAggregator: true,
    coverage: '200+ partners: Google, Apple, Bing, HERE, TomTom, Alexa, Facebook',
    priority: 80,
    documentationUrl: 'https://www.home.neustar/local/',
    envVars: [
      { key: 'NEUSTAR_LOCALEZE_API_KEY', description: 'Neustar Localeze API Key', link: 'https://www.home.neustar/local/' },
    ],
    setupSteps: [
      'Contact Neustar/TransUnion for Localeze API access',
      'Sign up for a Localeze business account',
      'Request API credentials from your account manager',
      'Paste the API key below and save',
    ],
  },
  {
    slug: 'google-business',
    name: 'Google Business Profile',
    tier: 1,
    isConfigured: false,
    isAggregator: false,
    coverage: 'Direct integration with Google Search and Google Maps',
    priority: 100,
    documentationUrl: 'https://developers.google.com/my-business',
    envVars: [
      { key: 'GOOGLE_BUSINESS_CLIENT_ID', description: 'Google OAuth2 Client ID', link: 'https://console.cloud.google.com/apis/credentials' },
      { key: 'GOOGLE_BUSINESS_CLIENT_SECRET', description: 'Google OAuth2 Client Secret', link: 'https://console.cloud.google.com/apis/credentials' },
      { key: 'GOOGLE_BUSINESS_REFRESH_TOKEN', description: 'OAuth2 Refresh Token', link: 'https://developers.google.com/oauthplayground/' },
    ],
    setupSteps: [
      'Go to Google Cloud Console and create a project',
      'Enable the "My Business Business Information API"',
      'Create OAuth2 credentials (Web Application type)',
      'Use OAuth Playground to get a refresh token with the my-business scope',
      'Enter all three values below and save',
    ],
  },
  {
    slug: 'facebook',
    name: 'Facebook/Meta',
    tier: 1,
    isConfigured: false,
    isAggregator: false,
    coverage: 'Facebook Places and Instagram Business locations',
    priority: 95,
    documentationUrl: 'https://developers.facebook.com/docs/pages-api/',
    envVars: [
      { key: 'FACEBOOK_APP_ID', description: 'Facebook App ID', link: 'https://developers.facebook.com/apps/' },
      { key: 'FACEBOOK_APP_SECRET', description: 'Facebook App Secret', link: 'https://developers.facebook.com/apps/' },
      { key: 'FACEBOOK_ACCESS_TOKEN', description: 'Page Access Token (long-lived)', link: 'https://developers.facebook.com/tools/explorer/' },
    ],
    setupSteps: [
      'Create a Facebook Developer account at developers.facebook.com',
      'Create a new app (Business type)',
      'Add the Pages API product to your app',
      'Generate a long-lived Page Access Token using the Graph API Explorer',
      'Submit for App Review to get pages_manage_posts permission',
      'Enter all credentials below and save',
    ],
  },
  {
    slug: 'brownbook',
    name: 'Brownbook.net',
    tier: 1,
    isConfigured: false,
    isAggregator: false,
    coverage: 'Global business directory with worldwide reach',
    priority: 40,
    documentationUrl: 'https://www.brownbook.net/api/',
    envVars: [
      { key: 'BROWNBOOK_API_KEY', description: 'Brownbook API Key', link: 'https://www.brownbook.net/api/' },
    ],
    setupSteps: [
      'Create a Brownbook business account',
      'Request API access from Brownbook support',
      'Receive your API key',
      'Paste the API key below and save',
    ],
  },
];

export default function CitationSettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>(PROVIDER_CONFIGS);
  const [loading, setLoading] = useState(true);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [credentialInputs, setCredentialInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ provider: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchProviderStatus();
  }, []);

  async function fetchProviderStatus() {
    try {
      // Fetch both API status and saved credentials
      const [statusRes, credentialsRes] = await Promise.all([
        fetch('/api/citations?action=status'),
        fetch('/api/citations/credentials'),
      ]);

      const statusData = await statusRes.json();
      const credentialsData = await credentialsRes.json();

      if (statusData.providers) {
        setProviders((prev) =>
          prev.map((p) => {
            const status = statusData.providers.find((s: { slug: string; configured: boolean }) => s.slug === p.slug);
            // Check if any credentials are configured in database
            const dbConfigured = credentialsData.credentials?.[p.slug];
            const hasDbCredentials = dbConfigured && Object.values(dbConfigured).some((v) => v === true);
            return status ? { ...p, isConfigured: status.configured || hasDbCredentials } : p;
          })
        );
      }
    } catch (error) {
      console.error('Failed to fetch provider status:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleCredentialChange(key: string, value: string) {
    setCredentialInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function saveCredentials(providerSlug: string, envVars: { key: string }[]) {
    setSaving(providerSlug);
    setSaveMessage(null);

    try {
      // Build credentials object from inputs
      const credentials: Record<string, string> = {};
      let hasValues = false;

      for (const envVar of envVars) {
        const value = credentialInputs[envVar.key];
        if (value && value.trim()) {
          credentials[envVar.key] = value.trim();
          hasValues = true;
        }
      }

      if (!hasValues) {
        setSaveMessage({
          provider: providerSlug,
          success: false,
          message: 'Please enter at least one credential value',
        });
        return;
      }

      const response = await fetch('/api/citations/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials }),
      });

      const data = await response.json();

      if (data.success) {
        setSaveMessage({
          provider: providerSlug,
          success: true,
          message: 'Credentials saved successfully!',
        });
        // Clear inputs after successful save
        setCredentialInputs((prev) => {
          const updated = { ...prev };
          for (const envVar of envVars) {
            delete updated[envVar.key];
          }
          return updated;
        });
        // Refresh status
        await fetchProviderStatus();
      } else {
        setSaveMessage({
          provider: providerSlug,
          success: false,
          message: data.message || 'Failed to save credentials',
        });
      }
    } catch (error) {
      setSaveMessage({
        provider: providerSlug,
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save',
      });
    } finally {
      setSaving(null);
    }
  }

  const configuredCount = providers.filter((p) => p.isConfigured).length;
  const tier1Configured = providers.filter((p) => p.tier === 1 && p.isConfigured).length;
  const tier2Configured = providers.filter((p) => p.tier === 2 && p.isConfigured).length;

  // Sort by priority (higher first), configured first
  const sortedProviders = [...providers].sort((a, b) => {
    if (a.isConfigured !== b.isConfigured) return a.isConfigured ? -1 : 1;
    return b.priority - a.priority;
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <Link href="/settings" className="text-blue-600 hover:text-blue-800 text-sm mb-4 inline-block">
            &larr; Back to Settings
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Citation Provider Setup</h1>
          <p className="mt-2 text-gray-600">
            Configure your citation providers to automatically distribute business listings to 150+ directories.
          </p>
        </div>

        {/* Progress Overview */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Setup Progress</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-3xl font-bold text-blue-600">{configuredCount}/{providers.length}</div>
              <div className="text-sm text-gray-600">Providers Configured</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-3xl font-bold text-green-600">{tier1Configured}/5</div>
              <div className="text-sm text-gray-600">Tier 1 (Direct APIs)</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-3xl font-bold text-purple-600">{tier2Configured}/2</div>
              <div className="text-sm text-gray-600">Tier 2 (Aggregators)</div>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(configuredCount / providers.length) * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {configuredCount === 0
              ? 'Get started by configuring your first provider below.'
              : configuredCount === providers.length
              ? "All providers configured! You're ready to submit citations."
              : `${providers.length - configuredCount} more providers to configure for full coverage.`}
          </p>
        </div>

        {/* Quick Start Recommendation */}
        {configuredCount === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Recommended Setup Order</h3>
            <p className="text-blue-800 mb-4">
              For maximum coverage with minimal effort, we recommend setting up providers in this order:
            </p>
            <ol className="list-decimal list-inside space-y-2 text-blue-800">
              <li><strong>Foursquare</strong> - Easy API key, feeds 50+ apps instantly</li>
              <li><strong>LDE (RapidAPI)</strong> - Single subscription covers 130+ directories</li>
              <li><strong>Data Axle</strong> - Covers 95% of search traffic</li>
              <li><strong>Google Business Profile</strong> - Direct Google/Maps presence</li>
            </ol>
            <p className="text-sm text-blue-700 mt-4">
              Just configuring Foursquare + LDE will give you coverage across 180+ directories!
            </p>
          </div>
        )}

        {/* Provider Cards */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading provider status...</div>
          ) : (
            sortedProviders.map((provider) => (
              <div
                key={provider.slug}
                className={`bg-white rounded-lg shadow-sm overflow-hidden border-2 transition-all ${
                  provider.isConfigured ? 'border-green-200' : 'border-transparent'
                }`}
              >
                {/* Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedProvider(expandedProvider === provider.slug ? null : provider.slug)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          provider.isConfigured ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {provider.isConfigured ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{provider.name}</h3>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              provider.tier === 1
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            Tier {provider.tier} {provider.isAggregator && '- Aggregator'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{provider.coverage}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {provider.isConfigured && (
                        <span className="text-sm text-green-600 font-medium">Configured</span>
                      )}
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedProvider === provider.slug ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedProvider === provider.slug && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50">
                    {/* Setup Steps */}
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-3">Setup Steps</h4>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                        {provider.setupSteps.map((step, index) => (
                          <li key={index}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    {/* Credential Inputs */}
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-3">Enter Credentials</h4>
                      <div className="space-y-3">
                        {provider.envVars.map((envVar) => (
                          <div key={envVar.key}>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-sm font-medium text-gray-700">
                                {envVar.description}
                              </label>
                              {envVar.link && (
                                <a
                                  href={envVar.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 text-xs"
                                >
                                  Get credentials &rarr;
                                </a>
                              )}
                            </div>
                            <input
                              type="password"
                              value={credentialInputs[envVar.key] || ''}
                              onChange={(e) => handleCredentialChange(envVar.key, e.target.value)}
                              placeholder={provider.isConfigured ? '********** (already configured)' : 'Enter value...'}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Save Message */}
                    {saveMessage && saveMessage.provider === provider.slug && (
                      <div
                        className={`mb-4 p-3 rounded-lg text-sm ${
                          saveMessage.success
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {saveMessage.message}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        {provider.documentationUrl && (
                          <a
                            href={provider.documentationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            View Documentation
                          </a>
                        )}
                        <button
                          onClick={() => saveCredentials(provider.slug, provider.envVars)}
                          disabled={saving === provider.slug}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {saving === provider.slug ? 'Saving...' : 'Save Credentials'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Tier 3 & 4 Info */}
        <div className="mt-8 bg-gray-100 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tier 3 & 4: Manual & Automatic Coverage</h3>
          <p className="text-gray-600 mb-4">
            Some directories don&apos;t offer APIs but are automatically covered by the aggregators above:
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Manual Only (Tier 3)</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>- Bing Places (API in transition)</li>
                <li>- Apple Business Connect (partner API only)</li>
                <li>- Yelp (no bulk API)</li>
                <li>- YellowPages (no bulk API)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Fed by Aggregators (Tier 4)</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>- 8Coupons, ABLocal, AroundMe</li>
                <li>- HERE, TomTom (via LDE)</li>
                <li>- Siri (via Apple/Localeze)</li>
                <li>- Snapchat, Uber (via Foursquare)</li>
                <li>- And 100+ more...</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        {configuredCount > 0 && (
          <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-green-900 mb-2">Ready to Submit Citations!</h3>
            <p className="text-green-800 mb-4">
              You have {configuredCount} provider(s) configured. You can now submit your business listings.
            </p>
            <div className="flex gap-4">
              <Link
                href="/domains"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Go to Domains
              </Link>
              <a
                href="/api/citations?action=status"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg hover:bg-green-50"
              >
                View API Status
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
