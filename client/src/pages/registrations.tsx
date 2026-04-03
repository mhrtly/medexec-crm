import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Ticket, Users, UserCheck, Gift, RefreshCw, Loader2, CloudDownload,
} from 'lucide-react';

const PAGE_SIZE = 50;

interface Registration {
  id: number;
  contact_id: number | null;
  order_number: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  conference_year: number;
  ticket_type: string | null;
  promo_code: string | null;
  comp_type: string | null;
  is_paid: boolean;
  amount_paid: number;
  discount_amount: number;
  status: string;
  registered_at: string | null;
  contacts: { id: number; full_name: string; warmth: string | null } | null;
}

interface YearStats {
  year: number;
  total: number;
  paid: number;
  comped: number;
}

const compTypeColors: Record<string, string> = {
  speaker: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  board: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  past_board: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  in_kind: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  scholarship: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RegistrationsPage() {
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sortField, setSortField] = useState<string>('order_number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filters
  const [filterYear, setFilterYear] = useState<string>('2026');
  const [filterType, setFilterType] = useState<string>('all'); // all, paid, comped
  const [filterCompType, setFilterCompType] = useState<string>('all');

  // Stats
  const [yearStats, setYearStats] = useState<YearStats[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter/search change
  useEffect(() => { setPage(0); }, [searchDebounced, filterYear, filterType, filterCompType]);

  // Load last synced timestamp
  const loadLastSynced = useCallback(async () => {
    const { data } = await supabase
      .from('registrations')
      .select('updated_at')
      .eq('conference_year', 2026)
      .neq('comp_type', 'sponsor')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (data?.updated_at) setLastSynced(data.updated_at);
  }, []);

  // Sync from Squarespace
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Not authenticated', description: 'Please log in again.', variant: 'destructive' });
        return;
      }

      const resp = await supabase.functions.invoke('sync-squarespace', {
        body: { year: 2026 },
      });

      if (resp.error) throw resp.error;
      const result = resp.data;

      toast({
        title: 'Sync complete',
        description: `${result.synced} registrations synced (${result.matched} matched, ${result.unmatched} unmatched)`,
      });

      // Refresh everything
      await Promise.all([loadStats(), loadLastSynced()]);
      await loadRegistrations();
    } catch (err) {
      console.error('Sync error:', err);
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Load year stats — exclude sponsor registrations
  const loadStats = useCallback(async () => {
    const { data } = await supabase
      .from('registrations')
      .select('conference_year, is_paid, comp_type')
      .or('comp_type.is.null,comp_type.neq.sponsor');

    if (!data) return;

    const statsMap = new Map<number, YearStats>();
    for (const row of data) {
      const y = row.conference_year;
      if (!statsMap.has(y)) statsMap.set(y, { year: y, total: 0, paid: 0, comped: 0 });
      const s = statsMap.get(y)!;
      s.total++;
      if (row.is_paid) { s.paid++; } else { s.comped++; }
    }

    const stats = Array.from(statsMap.values()).sort((a, b) => b.year - a.year);
    setYearStats(stats);
    setAvailableYears(stats.map(s => s.year));
  }, []);

  // Load registrations — always exclude sponsor registrations
  const loadRegistrations = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('registrations')
      .select('*, contacts(id, full_name, warmth)', { count: 'exact' })
      .neq('comp_type', 'sponsor');

    // Year filter
    if (filterYear !== 'all') {
      query = query.eq('conference_year', parseInt(filterYear));
    }

    // Paid/comped filter
    if (filterType === 'paid') query = query.eq('is_paid', true);
    if (filterType === 'comped') query = query.eq('is_paid', false);

    // Comp type filter
    if (filterCompType !== 'all') {
      if (filterCompType === 'paid_only') {
        query = query.is('comp_type', null);
      } else {
        query = query.eq('comp_type', filterCompType);
      }
    }

    // Search
    if (searchDebounced) {
      query = query.or(
        `first_name.ilike.%${searchDebounced}%,last_name.ilike.%${searchDebounced}%,email.ilike.%${searchDebounced}%,company.ilike.%${searchDebounced}%,order_number.ilike.%${searchDebounced}%`
      );
    }

    // Sort
    const ascending = sortDir === 'asc';
    query = query.order(sortField, { ascending });

    // Paginate
    const from = page * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('Error loading registrations:', error);
      setRegistrations([]);
      setTotalCount(0);
    } else {
      setRegistrations(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [page, searchDebounced, sortField, sortDir, filterYear, filterType, filterCompType]);

  useEffect(() => { loadStats(); loadLastSynced(); }, [loadStats, loadLastSynced]);
  useEffect(() => { loadRegistrations(); }, [loadRegistrations]);

  // Sort handler
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'order_number' ? 'desc' : 'asc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3.5 h-3.5 text-primary" />
      : <ArrowDown className="w-3.5 h-3.5 text-primary" />;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Current year stats
  const currentStats = yearStats.find(s => s.year === parseInt(filterYear)) || null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registrations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conference ticket registrations synced from Squarespace
            {lastSynced && (
              <span className="ml-2 text-xs">
                · Last synced {new Date(lastSynced).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadStats(); loadLastSynced(); loadRegistrations(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {filterYear === '2026' && (
            <Button size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CloudDownload className="w-4 h-4 mr-2" />
              )}
              {syncing ? 'Syncing...' : 'Sync from Squarespace'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {currentStats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <Users className="w-3.5 h-3.5" /> Total Registrations
              </div>
              <p className="text-2xl font-bold">{currentStats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <Ticket className="w-3.5 h-3.5" /> Paid
              </div>
              <p className="text-2xl font-bold">{currentStats.paid}</p>
              {filterYear === '2026' && (
                <p className="text-xs text-muted-foreground mt-0.5">{currentStats.paid}/120 goal</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                <Gift className="w-3.5 h-3.5" /> Comped
              </div>
              <p className="text-2xl font-bold">{currentStats.comped}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Year Tabs + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Tabs value={filterYear} onValueChange={setFilterYear}>
          <TabsList>
            <TabsTrigger value="all">All Years</TabsTrigger>
            {availableYears.map(y => (
              <TabsTrigger key={y} value={String(y)}>{y}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 ml-auto">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="paid">Paid Only</SelectItem>
              <SelectItem value="comped">Comped Only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterCompType} onValueChange={setFilterCompType}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Comp Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid_only">Paid (no comp)</SelectItem>
              <SelectItem value="speaker">Speaker</SelectItem>
              <SelectItem value="board">Board</SelectItem>
              <SelectItem value="past_board">Past Board</SelectItem>
              <SelectItem value="in_kind">In-Kind</SelectItem>
              <SelectItem value="scholarship">Scholarship</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, company, or order #..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort('order_number')}>
                      Order # <SortIcon field="order_number" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort('last_name')}>
                      Name <SortIcon field="last_name" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Title</th>
                  <th className="text-left px-4 py-3 font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort('company')}>
                      Company <SortIcon field="company" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Promo</th>
                  <th className="text-left px-4 py-3 font-medium">
                    <button className="flex items-center gap-1" onClick={() => toggleSort('registered_at')}>
                      Date <SortIcon field="registered_at" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium hidden xl:table-cell">CRM Link</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : registrations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No registrations found
                    </td>
                  </tr>
                ) : (
                  registrations.map((reg) => (
                    <tr key={reg.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {reg.order_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {reg.first_name} {reg.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {reg.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs max-w-[200px] truncate">
                        {reg.title || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {reg.company || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {reg.is_paid ? (
                          <Badge variant="secondary" className="text-[10px] font-medium">
                            Paid
                          </Badge>
                        ) : (
                          <Badge className={`text-[10px] font-medium border-0 ${
                            compTypeColors[reg.comp_type || ''] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }`}>
                            {reg.comp_type ? reg.comp_type.replace('_', ' ') : 'Comp'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {reg.promo_code ? (
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                            {reg.promo_code}
                          </code>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(reg.registered_at)}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {reg.contact_id ? (
                          <Link
                            href={`/contacts/${reg.contact_id}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <UserCheck className="w-3 h-3" />
                            {reg.contacts?.full_name || `#${reg.contact_id}`}
                            {reg.contacts?.warmth && (
                              <span className={`inline-block w-2 h-2 rounded-full ml-1 ${
                                reg.contacts.warmth === 'hot' ? 'bg-red-500' :
                                reg.contacts.warmth === 'warm' ? 'bg-orange-500' :
                                reg.contacts.warmth === 'cool' ? 'bg-sky-500' : 'bg-blue-500'
                              }`} />
                            )}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">No match</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Multi-year summary */}
      {filterYear === 'all' && yearStats.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Year-over-Year Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-3 py-2 font-medium">Year</th>
                    <th className="text-right px-3 py-2 font-medium">Total</th>
                    <th className="text-right px-3 py-2 font-medium">Paid</th>
                    <th className="text-right px-3 py-2 font-medium">Comped</th>
                  </tr>
                </thead>
                <tbody>
                  {yearStats.map(s => (
                    <tr key={s.year} className="border-b hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{s.year}</td>
                      <td className="px-3 py-2 text-right">{s.total}</td>
                      <td className="px-3 py-2 text-right">{s.paid}</td>
                      <td className="px-3 py-2 text-right">{s.comped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
