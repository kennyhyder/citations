import Link from 'next/link';
import { Card, StatCard, Button, StatusBadge } from '@/components';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let stats = {
    totalDomains: 0,
    bySource: {} as Record<string, number>,
    inRelate: 0,
    pendingSync: 0,
    withBrandInfo: 0,
  };
  let recentLogs: Awaited<ReturnType<typeof db.getRecentSyncLogs>> = [];
  let error: string | null = null;

  try {
    [stats, recentLogs] = await Promise.all([
      db.getDashboardStats(),
      db.getRecentSyncLogs(5),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load dashboard data';
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Overview of your domain and citation sync status
          </p>
        </div>
        <Link href="/sync">
          <Button>Run Sync</Button>
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">
            Error loading data: {error}. Make sure your database is configured and the schema is created.
          </p>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Domains" value={stats.totalDomains} description="Across all providers" />
        <StatCard title="In Relate" value={stats.inRelate} description="Active in RelateLocal" />
        <StatCard title="Pending Sync" value={stats.pendingSync} description="Waiting to be pushed" />
        <StatCard title="With Brand Info" value={stats.withBrandInfo} description="Complete profiles" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Domains by Source" description="Distribution across providers">
          {Object.keys(stats.bySource).length > 0 ? (
            <div className="space-y-4">
              {Object.entries(stats.bySource).map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize text-zinc-700 dark:text-zinc-300">
                    {source}
                  </span>
                  <div className="flex items-center space-x-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                      <div
                        className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                        style={{ width: `${(count / stats.totalDomains) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No domains synced yet. <Link href="/sync" className="text-zinc-900 underline dark:text-white">Run a sync</Link> to get started.
            </p>
          )}
        </Card>

        <Card title="Recent Sync Activity" description="Last 5 sync operations">
          {recentLogs.length > 0 ? (
            <div className="space-y-3">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between rounded-md border border-zinc-100 p-3 dark:border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {log.sync_type === 'full' ? 'Full Sync' : log.sync_type === 'domains' ? 'Domain Sync' : 'Relate Sync'}
                      {log.source && ` (${log.source})`}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(log.started_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {log.domains_added > 0 && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        +{log.domains_added} domains
                      </span>
                    )}
                    <StatusBadge status={log.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No sync history yet. <Link href="/sync" className="text-zinc-900 underline dark:text-white">Run your first sync</Link>.
            </p>
          )}
        </Card>
      </div>

      <div className="mt-8">
        <Card title="Quick Actions">
          <div className="flex flex-wrap gap-3">
            <Link href="/domains">
              <Button variant="secondary">View All Domains</Button>
            </Link>
            <Link href="/sync">
              <Button variant="secondary">Sync Settings</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
