import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, Filter, X } from 'lucide-react';
import { Link } from 'wouter';

interface Contact {
  id: number;
  full_name: string;
  title: string | null;
  seniority: string | null;
  email: string | null;
  warmth: string | null;
  relationship_status: string | null;
  gender: string | null;
  is_verified: boolean;
  organizations: { name: string } | null;
}

const warmthColor: Record<string, string> = {
  hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  warm: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const statusColor: Record<string, string> = {
  prospect: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  engaged: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  speaker: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  sponsor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  vip: 'bg-primary/10 text-primary',
};

const PAGE_SIZE = 50;

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('full_name');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterWarmth, setFilterWarmth] = useState<string>('all');
  const [filterSeniority, setFilterSeniority] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('contacts')
      .select('id, full_name, title, seniority, email, warmth, relationship_status, gender, is_verified, organizations(name)', { count: 'exact' });

    if (debouncedSearch) {
      query = query.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,title.ilike.%${debouncedSearch}%`);
    }
    if (filterGender !== 'all') query = query.eq('gender', filterGender);
    if (filterWarmth !== 'all') query = query.eq('warmth', filterWarmth);
    if (filterSeniority !== 'all') query = query.eq('seniority', filterSeniority);

    query = query.order(sortBy, { ascending: sortAsc });
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, count: total } = await query;
    setContacts((data ?? []) as unknown as Contact[]);
    setCount(total ?? 0);
    setLoading(false);
  }, [debouncedSearch, page, sortBy, sortAsc, filterGender, filterWarmth, filterSeniority]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Reset page on filter/search change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, filterGender, filterWarmth, filterSeniority]);

  const totalPages = Math.ceil(count / PAGE_SIZE);
  const hasActiveFilters = filterGender !== 'all' || filterWarmth !== 'all' || filterSeniority !== 'all';

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(true); }
  };

  const SortHeader = ({ col, label, className = '' }: { col: string; label: string; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">{count.toLocaleString()} contacts</p>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, email, or title..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-contacts"
          />
        </div>
        <Button
          variant={hasActiveFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-4 h-4 mr-1.5" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1.5 bg-primary-foreground/20 text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {[filterGender, filterWarmth, filterSeniority].filter(f => f !== 'all').length}
            </span>
          )}
        </Button>
      </div>

      {/* Filter row */}
      {showFilters && (
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterGender} onValueChange={setFilterGender}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-gender">
              <SelectValue placeholder="Gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genders</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterWarmth} onValueChange={setFilterWarmth}>
            <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-warmth">
              <SelectValue placeholder="Warmth" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All warmth</SelectItem>
              <SelectItem value="hot">Hot</SelectItem>
              <SelectItem value="warm">Warm</SelectItem>
              <SelectItem value="cold">Cold</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSeniority} onValueChange={setFilterSeniority}>
            <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-seniority">
              <SelectValue placeholder="Seniority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All seniority</SelectItem>
              <SelectItem value="C-Suite">C-Suite</SelectItem>
              <SelectItem value="VP">VP</SelectItem>
              <SelectItem value="Director">Director</SelectItem>
              <SelectItem value="Manager">Manager</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setFilterGender('all'); setFilterWarmth('all'); setFilterSeniority('all'); }}
              data-testid="button-clear-filters"
            >
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <SortHeader col="full_name" label="Name" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization</th>
                <SortHeader col="seniority" label="Seniority" />
                <SortHeader col="warmth" label="Warmth" />
                <SortHeader col="relationship_status" label="Status" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-4 bg-muted rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No contacts found
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-contact-${c.id}`}>
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="hover:underline">
                        <p className="text-sm font-medium">{c.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.title}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {c.organizations ? (c.organizations as any).name : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">{c.seniority ?? '—'}</td>
                    <td className="px-4 py-3">
                      {c.warmth && (
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${warmthColor[c.warmth] ?? ''}`}>
                          {c.warmth}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.relationship_status && (
                        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${statusColor[c.relationship_status] ?? ''}`}>
                          {c.relationship_status}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono truncate max-w-[180px]">{c.email ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground tabular-nums">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)} data-testid="button-prev-page">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums px-2">
                {page + 1} / {totalPages}
              </span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} data-testid="button-next-page">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
