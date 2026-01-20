'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components';

interface SettingItem {
  id: string;
  key: string;
  value: string;
  hasValue: boolean;
  description: string | null;
  category: string;
}

type SettingsData = Record<string, SettingItem[]>;

const categoryLabels: Record<string, string> = {
  domains: 'Domain Registrars',
  relate: 'Namecheap Relate',
  brightlocal: 'BrightLocal',
  general: 'General',
};

const categoryDescriptions: Record<string, string> = {
  domains: 'API credentials for syncing domains from your registrars',
  relate: 'Namecheap account credentials for Relate automation',
  brightlocal: 'BrightLocal API credentials for citation building',
  general: 'General application settings',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        // Initialize form data with current values
        const initialData: Record<string, string> = {};
        Object.values(data.settings as SettingsData).flat().forEach((s: SettingItem) => {
          initialData[s.key] = s.value || '';
        });
        setFormData(initialData);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: formData }),
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        // Reload to get updated masked values
        await loadSettings();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const getInputType = (key: string): string => {
    if (key.includes('password') || key.includes('secret') || key.includes('key')) {
      return 'password';
    }
    return 'text';
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-zinc-200 rounded mb-4" />
          <div className="h-64 bg-zinc-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure API credentials for domain registrars and citation services
        </p>
      </div>

      {message && (
        <div className={`mb-6 rounded-md p-4 ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <p className={`text-sm ${message.type === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {message.text}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(settings).map(([category, categorySettings]) => (
          <Card key={category}>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-1">
                {categoryLabels[category] || category}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                {categoryDescriptions[category] || ''}
              </p>

              <div className="space-y-4">
                {categorySettings.map((setting: SettingItem) => (
                  <div key={setting.key}>
                    <label
                      htmlFor={setting.key}
                      className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
                    >
                      {setting.description || setting.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      {setting.hasValue && (
                        <span className="ml-2 text-xs text-green-600 dark:text-green-400">(configured)</span>
                      )}
                    </label>
                    <input
                      type={getInputType(setting.key)}
                      id={setting.key}
                      value={formData[setting.key] || ''}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                      placeholder={setting.hasValue ? '••••••••' : 'Enter value...'}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={loadSettings} disabled={saving}>
          Reset
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <Card className="mt-8">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
            Environment Variables (Fallback)
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Settings saved here take precedence over environment variables. If a setting is empty,
            the corresponding environment variable will be used as a fallback.
          </p>
          <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 p-3 rounded">
            <div>HOSTINGER_API_KEY</div>
            <div>GODADDY_API_KEY / GODADDY_API_SECRET</div>
            <div>NAMECHEAP_API_USER / NAMECHEAP_API_KEY / NAMECHEAP_CLIENT_IP</div>
            <div>NAMECHEAP_USERNAME / NAMECHEAP_PASSWORD</div>
            <div>BRIGHTLOCAL_API_KEY</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
