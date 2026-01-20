'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, StatusBadge } from '@/components';

interface BrandFormData {
  business_name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  categories: string;
  description: string;
  hours: {
    monday: { open: string; close: string };
    tuesday: { open: string; close: string };
    wednesday: { open: string; close: string };
    thursday: { open: string; close: string };
    friday: { open: string; close: string };
    saturday: { open: string; close: string };
    sunday: { open: string; close: string };
  };
  social_links: {
    facebook: string;
    twitter: string;
    instagram: string;
    linkedin: string;
    youtube: string;
  };
  logo_url: string;
}

interface DomainData {
  id: string;
  domain: string;
  source: string;
  status: string;
  brand_info: BrandFormData | null;
  relate_brand: { status: string } | null;
  brightlocal_brand: { status: string } | null;
}

const defaultHours = {
  monday: { open: '09:00', close: '17:00' },
  tuesday: { open: '09:00', close: '17:00' },
  wednesday: { open: '09:00', close: '17:00' },
  thursday: { open: '09:00', close: '17:00' },
  friday: { open: '09:00', close: '17:00' },
  saturday: { open: '', close: '' },
  sunday: { open: '', close: '' },
};

const defaultSocialLinks = {
  facebook: '',
  twitter: '',
  instagram: '',
  linkedin: '',
  youtube: '',
};

const defaultFormData: BrandFormData = {
  business_name: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
  phone: '',
  email: '',
  website: '',
  categories: '',
  description: '',
  hours: defaultHours,
  social_links: defaultSocialLinks,
  logo_url: '',
};

export default function BrandEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domain, setDomain] = useState<DomainData | null>(null);
  const [formData, setFormData] = useState<BrandFormData>(defaultFormData);

  useEffect(() => {
    fetchDomain();
  }, [resolvedParams.id]);

  const fetchDomain = async () => {
    try {
      const response = await fetch(`/api/domains/${resolvedParams.id}`);
      if (!response.ok) throw new Error('Domain not found');
      const data = await response.json();
      setDomain(data);

      if (data.brand_info) {
        setFormData({
          ...defaultFormData,
          ...data.brand_info,
          categories: Array.isArray(data.brand_info.categories)
            ? data.brand_info.categories.join(', ')
            : data.brand_info.categories || '',
          hours: data.brand_info.hours || defaultHours,
          social_links: data.brand_info.social_links || defaultSocialLinks,
        });
      } else {
        setFormData({
          ...defaultFormData,
          website: `https://${data.domain}`,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load domain');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/domains/${resolvedParams.id}/brand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          categories: formData.categories.split(',').map((c) => c.trim()).filter(Boolean),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }

      router.push('/domains');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save brand info');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof BrandFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateHours = (day: string, field: 'open' | 'close', value: string) => {
    setFormData((prev) => ({
      ...prev,
      hours: {
        ...prev.hours,
        [day]: { ...prev.hours[day as keyof typeof prev.hours], [field]: value },
      },
    }));
  };

  const updateSocialLink = (platform: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      social_links: { ...prev.social_links, [platform]: value },
    }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Card>
          <p className="text-center text-red-600 dark:text-red-400">Domain not found</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{domain.domain}</h1>
          <StatusBadge status={domain.source} />
          {domain.relate_brand && (
            <span className="text-xs text-zinc-500">Relate: <StatusBadge status={domain.relate_brand.status} /></span>
          )}
          {domain.brightlocal_brand && (
            <span className="text-xs text-zinc-500">BrightLocal: <StatusBadge status={domain.brightlocal_brand.status} /></span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Edit business information for citation building
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card title="Business Information">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Business Name *
              </label>
              <input
                type="text"
                value={formData.business_name}
                onChange={(e) => updateField('business_name', e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Street Address
              </label>
              <input
                type="text"
                value={formData.street}
                onChange={(e) => updateField('street', e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => updateField('city', e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => updateField('state', e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">ZIP</label>
                <input
                  type="text"
                  value={formData.zip}
                  onChange={(e) => updateField('zip', e.target.value)}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="(555) 123-4567"
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Website</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => updateField('website', e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Categories (comma-separated)
              </label>
              <input
                type="text"
                value={formData.categories}
                onChange={(e) => updateField('categories', e.target.value)}
                placeholder="Plumber, Home Services, Emergency Repair"
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Business Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>
          </div>
        </Card>

        <Card title="Hours of Operation">
          <div className="space-y-3">
            {Object.entries(formData.hours).map(([day, hours]) => (
              <div key={day} className="flex items-center space-x-4">
                <span className="w-24 text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">
                  {day}
                </span>
                <input
                  type="time"
                  value={hours.open}
                  onChange={(e) => updateHours(day, 'open', e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <span className="text-zinc-500">to</span>
                <input
                  type="time"
                  value={hours.close}
                  onChange={(e) => updateHours(day, 'close', e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Social Links">
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(formData.social_links).map(([platform, url]) => (
              <div key={platform}>
                <label className="block text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">
                  {platform}
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => updateSocialLink(platform, e.target.value)}
                  placeholder={`https://${platform}.com/...`}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Media">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Logo URL</label>
            <input
              type="url"
              value={formData.logo_url}
              onChange={(e) => updateField('logo_url', e.target.value)}
              placeholder="https://example.com/logo.png"
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </div>
        </Card>

        <div className="flex justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={() => router.push('/domains')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? 'Saving...' : 'Save Brand Info'}
          </Button>
        </div>
      </form>
    </div>
  );
}
