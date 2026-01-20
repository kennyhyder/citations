import Link from 'next/link';
import { Button, DomainTable } from '@/components';
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Domains</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            All domains from Hostinger, GoDaddy, and Namecheap. Select domains to push to Relate.
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

      {domains.length > 0 ? (
        <DomainTable domains={domains} />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white py-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No domains found. <Link href="/sync" className="text-zinc-900 underline dark:text-white">Sync your domains</Link> to get started.
          </p>
        </div>
      )}
    </div>
  );
}
