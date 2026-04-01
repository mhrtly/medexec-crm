import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';

interface Org {
  id: number;
  name: string;
  hq_city: string | null;
  hq_state: string | null;
  website: string | null;
  product_category: string | null;
  org_relationship: string | null;
  sponsor_level: string | null;
  headcount_estimate: string | null;
  contact_count: number;
}

const relColor: Record<string, string> = {
  prospect: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  partner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  sponsor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  client: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const PAGE_SIZE = 50;

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('organizations')
      .select('id, name, hq_city, hq_state, website, product_category, org_relationship, sponsor_level, headcount_estimate, contacts(count)', { count: 'exact' });

    if (debouncedSearch) {
      query = query.or(`name.ilike.%${debouncedSearch}%,product_category.ilike.%${debouncedSearch}%,hq_state.ilike.%${debouncedSearch}%`);
    }

    query = query.order(sortBy, { ascending: sortAsc });
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, count: total } = await query;

    const mapped = (data ?? []).map((o: any) => ({
      ...o,
      contact_count: o.contacts?.[0]?.count ?? 0,
    }));

    setOrgs(mapped as Org[]);
    setCount(total ?? 0);
    setLoading(false);
  }, [debouncedSearch, page, sortBy, sortAsc]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  useEffect(() => { setPage(0); }, [debouncedSearch]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(true); }
  };

  const SortHeader = ({ col, label }: { col: string; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors"
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortBy === col && <ArrowUpDown className="w-3 h-3" />}
      </span>
    </th>
  );

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">{count.toLocaleString()} organizations</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name, category, or state..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-orgs"
        />
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <SortHeader col="name" label="Organization" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                <SortHeader col="org_relationship" label="Relationship" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contacts</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Website</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
                ))
              ) : orgs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">No organizations found</td></tr>
              ) : (
                orgs.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-org-${o.id}`}>
                    <td className="px-4 py-3">
                      <Link href={`/organizations/${o.id}`} className="text-sm font-medium hover:underline">{o.name}</Link>
                      {o.sponsor_level && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{o.sponsor_level}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {[o.hq_city, o.hq_state].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{o.product_category ?? '—'}</td>
                    <td className="px-4 py-3">
                      {o.org_relationship && (
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${relColor[o.org_relationship] ?? ''}`}>
                          {o.org_relationship}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums">{o.contact_count}</td>
                    <td className="px-4 py-3">
                      {o.website && (
                        <a href={o.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                          Visit <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground tabular-nums">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <span className="text-xs text-muted-foreground tabular-nums px-2">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
