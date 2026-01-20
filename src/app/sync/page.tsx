'use client';

import { useState } from 'react';
import { Card, Button, StatusBadge } from '@/components';

type SyncSource = 'all' | 'hostinger' | 'godaddy' | 'namecheap';

interface SyncResult {
  success: boolean;
  message: string;
  domainsFound?: number;
  domainsAdded?: number;
  domainsUpdated?: number;
  brandsPushed?: number;
}

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncSource, setSyncSource] = useState<SyncSource>('all');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncRelate, setSyncRelate] = useState(false);

  const runSync = async (type: 'domains' | 'relate' | 'full') => {
    setSyncing(true);
    setResult(null);

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          source: type === 'domains' ? syncSource : undefined,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Sync failed',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Sync Manager</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Sync domains from providers and push to RelateLocal
        </p>
      </div>

      <div className="space-y-6">
        <Card title="Domain Sync" description="Fetch domains from Hostinger, GoDaddy, and Namecheap">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Source
              </label>
              <select
                value={syncSource}
                onChange={(e) => setSyncSource(e.target.value as SyncSource)}
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="all">All Sources</option>
                <option value="hostinger">Hostinger Only</option>
                <option value="godaddy">GoDaddy Only</option>
                <option value="namecheap">Namecheap Only</option>
              </select>
            </div>

            <Button onClick={() => runSync('domains')} loading={syncing} disabled={syncing}>
              {syncing ? 'Syncing...' : 'Sync Domains'}
            </Button>
          </div>
        </Card>

        <Card title="Relate Sync" description="Push domains with brand info to RelateLocal">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sync-relate"
                checked={syncRelate}
                onChange={(e) => setSyncRelate(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
              />
              <label htmlFor="sync-relate" className="text-sm text-zinc-700 dark:text-zinc-300">
                Push pending brands to Relate (requires brand info to be filled out)
              </label>
            </div>

            <Button
              onClick={() => runSync('relate')}
              loading={syncing}
              disabled={syncing || !syncRelate}
              variant="secondary"
            >
              {syncing ? 'Syncing...' : 'Sync to Relate'}
            </Button>
          </div>
        </Card>

        <Card title="Full Sync" description="Run domain sync and Relate sync in sequence">
          <Button onClick={() => runSync('full')} loading={syncing} disabled={syncing} variant="primary">
            {syncing ? 'Syncing...' : 'Run Full Sync'}
          </Button>
        </Card>

        {result && (
          <Card title="Sync Result">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <StatusBadge status={result.success ? 'completed' : 'failed'} size="md" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">{result.message}</span>
              </div>

              {result.success && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {result.domainsFound !== undefined && (
                    <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
                      <p className="text-2xl font-semibold text-zinc-900 dark:text-white">
                        {result.domainsFound}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Domains Found</p>
                    </div>
                  )}
                  {result.domainsAdded !== undefined && (
                    <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
                      <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
                        +{result.domainsAdded}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Domains Added</p>
                    </div>
                  )}
                  {result.domainsUpdated !== undefined && (
                    <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
                      <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                        {result.domainsUpdated}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Domains Updated</p>
                    </div>
                  )}
                  {result.brandsPushed !== undefined && (
                    <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-800">
                      <p className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
                        {result.brandsPushed}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">Brands Pushed</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card title="API Configuration Status">
          <div className="space-y-2">
            <ConfigStatus name="Hostinger" envVar="HOSTINGER_API_KEY" />
            <ConfigStatus name="GoDaddy" envVar="GODADDY_API_KEY" />
            <ConfigStatus name="Namecheap" envVar="NAMECHEAP_API_KEY" />
            <ConfigStatus name="Relate" envVar="RELATE_API_TOKEN" />
            <ConfigStatus name="Supabase" envVar="NEXT_PUBLIC_SUPABASE_URL" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ConfigStatus({ name, envVar }: { name: string; envVar: string }) {
  // Note: This is a simplified check - in production, you'd check via an API endpoint
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 p-3 dark:border-zinc-700">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{name}</span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        {envVar}
      </span>
    </div>
  );
}
