'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, StatusBadge } from '@/components';

interface Domain {
  id: string;
  domain: string;
  source: string;
  status: string;
  expires_at: string | null;
  brand_info: {
    business_name: string;
  } | null;
  relate_brand: {
    status: string;
  } | null;
  brightlocal_brand: {
    status: string;
  } | null;
}

interface DomainTableProps {
  domains: Domain[];
}

const sourceColors: Record<string, string> = {
  hostinger: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  godaddy: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  namecheap: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

type PushTarget = 'relate' | 'brightlocal';

export function DomainTable({ domains }: DomainTableProps) {
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [pushTarget, setPushTarget] = useState<PushTarget | null>(null);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);

  const toggleDomain = (id: string) => {
    const newSelected = new Set(selectedDomains);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDomains(newSelected);
  };

  const toggleAll = () => {
    if (selectedDomains.size === domains.length) {
      setSelectedDomains(new Set());
    } else {
      setSelectedDomains(new Set(domains.map(d => d.id)));
    }
  };

  const selectWithBrandInfo = () => {
    const withBrand = domains.filter(d => d.brand_info && (!d.relate_brand || d.relate_brand.status !== 'active'));
    setSelectedDomains(new Set(withBrand.map(d => d.id)));
  };

  const pushToService = async (target: PushTarget) => {
    if (selectedDomains.size === 0) return;

    setPushing(true);
    setPushTarget(target);
    setPushResult(null);

    const apiEndpoint = target === 'relate' ? '/api/automation' : '/api/brightlocal';
    const serviceName = target === 'relate' ? 'Relate' : 'BrightLocal';

    try {
      const results = await Promise.all(
        Array.from(selectedDomains).map(async (domainId) => {
          const res = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'push-domain', domainId }),
          });
          return res.json();
        })
      );

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      const errors = results.filter(r => !r.success).map(r => r.message).join('; ');

      setPushResult({
        success: failCount === 0,
        message: `Pushed ${successCount} domain(s) to ${serviceName}${failCount > 0 ? `. ${failCount} failed: ${errors}` : '.'}`,
      });

      // Clear selection after successful push
      if (failCount === 0) {
        setSelectedDomains(new Set());
      }
    } catch (error) {
      setPushResult({
        success: false,
        message: error instanceof Error ? error.message : `Failed to push domains to ${serviceName}`,
      });
    } finally {
      setPushing(false);
      setPushTarget(null);
    }
  };

  const eligibleCount = domains.filter(d => d.brand_info && (!d.relate_brand || d.relate_brand.status !== 'active')).length;

  return (
    <div>
      {/* Selection toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {selectedDomains.size} selected
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {selectedDomains.size === domains.length ? 'Deselect All' : 'Select All'}
          </Button>
          <Button variant="ghost" size="sm" onClick={selectWithBrandInfo}>
            Select Ready ({eligibleCount})
          </Button>
        </div>
        <div className="flex-1" />
        <div className="flex gap-2">
          <Button
            onClick={() => pushToService('relate')}
            disabled={selectedDomains.size === 0 || pushing}
            variant="primary"
          >
            {pushing && pushTarget === 'relate' ? 'Pushing...' : `Push to Relate (${selectedDomains.size})`}
          </Button>
          <Button
            onClick={() => pushToService('brightlocal')}
            disabled={selectedDomains.size === 0 || pushing}
            variant="secondary"
          >
            {pushing && pushTarget === 'brightlocal' ? 'Pushing...' : `Push to BrightLocal (${selectedDomains.size})`}
          </Button>
        </div>
      </div>

      {/* Result message */}
      {pushResult && (
        <div className={`mb-4 rounded-md p-4 ${pushResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <p className={`text-sm ${pushResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {pushResult.message}
          </p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedDomains.size === domains.length && domains.length > 0}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Domain
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Source
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Brand Info
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Relate
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                BrightLocal
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Expires
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {domains.map((domain) => (
              <tr
                key={domain.id}
                className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${selectedDomains.has(domain.id) ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              >
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selectedDomains.has(domain.id)}
                    onChange={() => toggleDomain(domain.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className="font-medium text-zinc-900 dark:text-white">{domain.domain}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sourceColors[domain.source]}`}>
                    {domain.source}
                  </span>
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
                    <span className="text-sm text-zinc-400">-</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-4">
                  {domain.brightlocal_brand ? (
                    <StatusBadge status={domain.brightlocal_brand.status} />
                  ) : (
                    <span className="text-sm text-zinc-400">-</span>
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
    </div>
  );
}
