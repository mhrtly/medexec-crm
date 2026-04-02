import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Building2, X, Users
} from 'lucide-react';

const PAGE_SIZE = 50;

interface Organization {
  id: number;
  name: string;
  hq_city: string | null;
  hq_state: string | null;
  product_category: string | null;
  is_medtech: boolean | null;
  website: string | null;
  public_or_private: string | null;
}

export default function OrganizationsPage() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sortField, setSortField] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [contactCounts, setContactCounts] = useState<Map<number, number>>(new Map());

  // Add org dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: '', hq_city: '', hq_state: '', website: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('organizations')
      .select('id, name, hq_city, hq_state, product_category, is_medtech, website, public_or_private', { count: 'exact' });

    if (searchDebounced) {
      query = query.or(`name.ilike.%${searchDebounced}%,hq_city.ilike.%${searchDebounced}%,hq_state.ilike.%${searchDebounced}%`);
    }

    query = query.order(sortField, { ascending: sortDir === 'asc' });
    const from = page * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (!error) {
      setOrgs((data ?? []) as Organization[]);
      setTotalCount(count ?? 0);

      // Get contact counts for these orgs
      const orgIds = (data ?? []).map((o: any) => o.id);
      if (orgIds.length > 0) {
        const { data: countData } = await supabase
          .from('contacts')
          .select('org_id')
          .in('org_id', orgIds);
        const cmap = new Map<number, number>();
        for (const row of (countData ?? [])) {
          if (row.org_id) cmap.set(row.org_id, (cmap.get(row.org_id) ?? 0) + 1);
        }
        setContactCounts(cmap);
      }
    }
    setLoading(false);
  }, [page, searchDebounced, sortField, sortDir]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  }

  async function handleAddOrg() {
    if (!newOrg.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('organizations').insert({
      name: newOrg.name.trim(),
      hq_city: newOrg.hq_city.trim() || null,
      hq_state: newOrg.hq_state.trim() || null,
      website: newOrg.website.trim() || null,
    }).select('id').single();
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Organization created' });
      setAddOpen(false);
      setNewOrg({ name: '', hq_city: '', hq_state: '', website: '' });
      loadOrgs();
    }
  }

  return (
    <div className="p-6 max-w-7xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground">{totalCount.toLocaleString()} organizations</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Organization
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, city, or state..." className="pl-9 h-9 text-sm" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : orgs.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No organizations found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase">
                        Name <SortIcon field="name" />
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 hidden md:table-cell cursor-pointer select-none" onClick={() => toggleSort('hq_city')}>
                      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase">
                        Location <SortIcon field="hq_city" />
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Category</div>
                    </th>
                    <th className="text-center px-4 py-3 hidden md:table-cell">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">MedTech</div>
                    </th>
                    <th className="text-center px-4 py-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Contacts</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {orgs.map(org => (
                    <tr key={org.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/organizations/${org.id}`} className="font-medium hover:text-primary transition-colors">
                          {org.name}
                        </Link>
                        {org.website && (
                          <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{org.website.replace(/^https?:\/\//, '')}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {[org.hq_city, org.hq_state].filter(Boolean).join(', ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{org.product_category ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center hidden md:table-cell">
                        {org.is_medtech === true ? (
                          <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary">Yes</Badge>
                        ) : org.is_medtech === false ? (
                          <span className="text-xs text-muted-foreground">No</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs tabular-nums">{contactCounts.get(org.id) ?? 0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-8">
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-8">
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Org Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader><DialogTitle className="text-base">New Organization</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={newOrg.name} onChange={e => setNewOrg(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" placeholder="Acme Corp" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">City</Label>
                <Input value={newOrg.hq_city} onChange={e => setNewOrg(p => ({ ...p, hq_city: e.target.value }))} className="h-8 text-sm" placeholder="Boston" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">State</Label>
                <Input value={newOrg.hq_state} onChange={e => setNewOrg(p => ({ ...p, hq_state: e.target.value }))} className="h-8 text-sm" placeholder="MA" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Website</Label>
              <Input value={newOrg.website} onChange={e => setNewOrg(p => ({ ...p, website: e.target.value }))} className="h-8 text-sm" placeholder="https://acme.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddOrg} disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
