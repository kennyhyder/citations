import Link from 'next/link';
import { Card, Button, StatusBadge } from '@/components';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function DomainsPage() {
  let domains: Awaited<ReturnType<typeof db.getDomainsWithBrands>> = [];
  let error: string | null = null;

  try {
    domains = await db.getDomainsWithBrands();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load domains';
  }

  const sourceColors: Record<string, string> = {
    hostinger: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    godaddy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    namecheap: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Domains</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            All domains from Hostinger, GoDaddy, and Namecheap
          </p>
        </div>
        <Link href="/sync">
          <Button>Sync Domains</Button>
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">
            Error loading domains: {error}
          </p>
        </div>
      )}

      <Card>
        {domains.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Domain
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Source
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Brand Info
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Relate
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Expires
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {domains.map((domain) => (
                  <tr key={domain.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className="font-medium text-zinc-900 dark:text-white">{domain.domain}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sourceColors[domain.source]}`}>
                        {domain.source}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge status={domain.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {domain.brand_info ? (
                        <span className="text-sm text-green-600 dark:text-green-400">Complete</span>
                      ) : (
                        <span className="text-sm text-zinc-400">Missing</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {domain.relate_brand ? (
                        <StatusBadge status={domain.relate_brand.status} />
                      ) : (
                        <span className="text-sm text-zinc-400">Not synced</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                      {domain.expires_at
                        ? new Date(domain.expires_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right">
                      <Link href={`/brands/${domain.id}`}>
                        <Button variant="ghost" size="sm">
                          {domain.brand_info ? 'Edit' : 'Add Info'}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No domains found. <Link href="/sync" className="text-zinc-900 underline dark:text-white">Sync your domains</Link> to get started.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
