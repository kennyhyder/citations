'use client';

import { useState, useMemo } from 'react';
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
  relate_brand?: {
    status: string;
  } | null;
  brightlocal_brand?: {
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
  manual: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

type PushTarget = 'relate' | 'brightlocal';
type SortField = 'domain' | 'source' | 'brand_info' | 'relate' | 'brightlocal' | 'expires_at';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250];

export function DomainTable({ domains }: DomainTableProps) {
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [pushing, setPushing] = useState(false);
  const [pushTarget, setPushTarget] = useState<PushTarget | null>(null);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('domain');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter domains by search query
  const filteredDomains = useMemo(() => {
    if (!searchQuery.trim()) return domains;
    const query = searchQuery.toLowerCase().trim();
    return domains.filter(d =>
      d.domain.toLowerCase().includes(query) ||
      d.brand_info?.business_name?.toLowerCase().includes(query) ||
      d.source.toLowerCase().includes(query)
    );
  }, [domains, searchQuery]);

  // Sort filtered domains
  const sortedDomains = useMemo(() => {
    const sorted = [...filteredDomains].sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortField) {
        case 'domain':
          aVal = a.domain.toLowerCase();
          bVal = b.domain.toLowerCase();
          break;
        case 'source':
          aVal = a.source;
          bVal = b.source;
          break;
        case 'brand_info':
          aVal = a.brand_info ? 1 : 0;
          bVal = b.brand_info ? 1 : 0;
          break;
        case 'relate':
          aVal = a.relate_brand?.status || '';
          bVal = b.relate_brand?.status || '';
          break;
        case 'brightlocal':
          aVal = a.brightlocal_brand?.status || '';
          bVal = b.brightlocal_brand?.status || '';
          break;
        case 'expires_at':
          aVal = a.expires_at || '9999-12-31';
          bVal = b.expires_at || '9999-12-31';
          break;
      }

      if (aVal === null || bVal === null) return 0;
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredDomains, sortField, sortDirection]);

  const paginatedDomains = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedDomains.slice(start, start + pageSize);
  }, [sortedDomains, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredDomains.length / pageSize);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <span className="ml-1 text-zinc-300 dark:text-zinc-600">↕</span>;
    }
    return <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

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

  const togglePageDomains = () => {
    const pageIds = paginatedDomains.map(d => d.id);
    const allPageSelected = pageIds.every(id => selectedDomains.has(id));
    const newSelected = new Set(selectedDomains);
    if (allPageSelected) {
      pageIds.forEach(id => newSelected.delete(id));
    } else {
      pageIds.forEach(id => newSelected.add(id));
    }
    setSelectedDomains(newSelected);
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/domains/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      setUploadResult({
        success: result.success,
        message: result.message + (result.results?.errors?.length ? ` Errors: ${result.results.errors.join(', ')}` : ''),
      });

      // Reload page to show new domains
      if (result.success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      setUploadResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to upload CSV',
      });
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search domains, business names, or sources..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 pl-10 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-400"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
              className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Found {filteredDomains.length} of {domains.length} domains matching "{searchQuery}"
          </p>
        )}
      </div>

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
        <div className="flex items-center gap-2">
          <a
            href="/sample-domains.csv"
            download
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 underline"
          >
            Sample CSV
          </a>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <span className={`inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium ${
              uploading
                ? 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
                : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600 cursor-pointer'
            }`}>
              {uploading ? 'Uploading...' : 'Upload CSV'}
            </span>
          </label>
        </div>
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

      {/* Upload result message */}
      {uploadResult && (
        <div className={`mb-4 rounded-md p-4 ${uploadResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <p className={`text-sm ${uploadResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {uploadResult.message}
          </p>
        </div>
      )}

      {/* Push result message */}
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
                  checked={paginatedDomains.length > 0 && paginatedDomains.every(d => selectedDomains.has(d.id))}
                  onChange={togglePageDomains}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 dark:border-zinc-600"
                />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                onClick={() => handleSort('domain')}
              >
                Domain<SortIcon field="domain" />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                onClick={() => handleSort('source')}
              >
                Source<SortIcon field="source" />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                onClick={() => handleSort('brand_info')}
              >
                Brand Info<SortIcon field="brand_info" />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                onClick={() => handleSort('relate')}
              >
                Relate<SortIcon field="relate" />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                onClick={() => handleSort('brightlocal')}
              >
                BrightLocal<SortIcon field="brightlocal" />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                onClick={() => handleSort('expires_at')}
              >
                Expires<SortIcon field="expires_at" />
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {paginatedDomains.map((domain) => (
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

      {/* Pagination */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <span>per page</span>
          <span className="ml-4">
            Showing {filteredDomains.length > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}-{Math.min(currentPage * pageSize, filteredDomains.length)} of {filteredDomains.length} domains
            {searchQuery && ` (filtered from ${domains.length})`}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            First
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Prev
          </button>

          {/* Page numbers */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 5) {
              pageNum = i + 1;
            } else if (currentPage <= 3) {
              pageNum = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i;
            } else {
              pageNum = currentPage - 2 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`rounded-md px-3 py-1 text-sm ${
                  currentPage === pageNum
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Next
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
