"use client";

// hooks/useAccountsPayable.ts
// Fetches ALL AP records from the Directus-backed BFF route, then
// derives KPIs/charts client-side. Filtering by date/supplier/status
// is handled in the consuming module.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { transformAPRows } from '../utils';
import type { APRecord, RawAPRow } from '../types';

interface UseAPResult {
  loading: boolean;
  error:   string | null;
  records: APRecord[];
}

export function useAccountsPayable(): UseAPResult {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [records, setRecords] = useState<APRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const toastId = toast.loading('Loading accounts payable data...');

    async function fetchData() {
      try {
        // Wide window — the route filters by date_created when these are present.
        // Sending 2020-01-01..today ensures we get the full population.
        const params = new URLSearchParams({
          startDate: '2020-01-01',
          endDate:   new Date().toISOString().split('T')[0],
        });

        const res = await fetch(
          `/api/manufacturing/financial-management/accounts-payable?${params}`,
          { credentials: 'include', signal: controller.signal }
        );
        if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);

        const contentType = res.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          throw new Error('Backend did not return JSON');
        }

        const result = await res.json();

        // Defensive normalization — the BFF may return a few shapes:
        //   1. { ok, rows: [...] }            — current Directus-backed shape
        //   2. [...]                           — legacy / Spring Boot shape
        //   3. { data | content | transactions: [...] }
        const rows: RawAPRow[] = Array.isArray(result)
          ? result
          : (result.rows ?? result.data ?? result.content ?? result.transactions ?? []);

        if (cancelled) return;

        setRecords(transformAPRows(rows));
        setError(null);
        toast.success('Data loaded successfully', { id: toastId });
      } catch (e: unknown) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
        toast.error(`Failed to load data: ${msg}`, { id: toastId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
      controller.abort();
      toast.dismiss(toastId);
    };
  }, []);

  return { loading, error, records };
}
