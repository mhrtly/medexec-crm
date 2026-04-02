import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Link, useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Plus, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Filter, X, Tag, UserPlus, Users
} from 'lucide-react';

const PAGE_SIZE = 50;

interface Contact {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  warmth: string | null;
  seniority: string | null;
  gender: string | null;
  relationship_status: string | null;
  org_id: number | null;
  organizations: { id: number; name: string } | null;
}

interface TagOption {
  id: number;
  name: string;
  category: string | null;
}

const warmthColor: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cool: 'bg-sky-100 text-sky-700',
  cold: 'bg-blue-100 text-blue-700',
};

export default function ContactsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [sortField, setSortField] = useState<string>('full_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Filters
  const [filterWarmth, setFilterWarmth] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [filterSeniority, setFilterSeniority] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterHasEmail, setFilterHasEmail] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Tags for filter dropdown
  const [allTags, setAllTags] = useState<TagOption[]>([]);

  // Contact tags for display
  const [contactTagsMap, setContactTagsMap] = useState<Map<number, string[]>>(new Map());

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTagDialogOpen, setBulkTagDialogOpen] = useState(false);
  const [bulkTagId, setBulkTagId] = useState<string>('');

  // Add contact dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newContact, setNewContact] = useState({ first_name: '', last_name: '', email: '', title: '' });
  const [addingSaving, setAddingSaving] = useState(false);

  // Seniority options
  const seniorityOptions = ['C-Suite', 'VP', 'SVP', 'EVP', 'Director', 'Manager', 'Individual Contributor'];

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load tags
  useEffect(() => {
    supabase.from('tags').select('id, name, category').order('name').then(({ data }) => {
      setAllTags(data ?? []);
    });
  }, []);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [filterWarmth, filterGender, filterSeniority, filterTag, filterHasEmail]);

  // Load contacts
  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, title, email, warmth, seniority, gender, relationship_status, org_id, organizations(id, name)', { count: 'exact' });

      // Search
      if (searchDebounced) {
        query = query.or(`full_name.ilike.%${searchDebounced}%,email.ilike.%${searchDebounced}%,title.ilike.%${searchDebounced}%`);
      }

      // Filters
      if (filterWarmth !== 'all') query = query.eq('warmth', filterWarmth);
      if (filterGender !== 'all') query = query.eq('gender', filterGender);
      if (filterSeniority !== 'all') query = query.eq('seniority', filterSeniority);
      if (filterHasEmail === 'yes') query = query.not('email', 'is', null);
      if (filterHasEmail === 'no') query = query.is('email', null);

      // Tag filter: need to get contact_ids first
      if (filterTag !== 'all') {
        const { data: taggedIds } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .eq('tag_id', parseInt(filterTag));
        const ids = (taggedIds ?? []).map(t => t.contact_id);
        if (ids.length === 0) {
          setContacts([]);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        query = query.in('id', ids);
      }

      // Don't show duplicates, and exclude contacts with no name
      query = query.or('is_duplicate.is.null,is_duplicate.eq.false');
      query = query.neq('full_name', '').not('full_name', 'is', null);

      // Sort (can't sort by related table directly, fall back to full_name)
      const sortColumn = sortField === 'org_name' ? 'full_name' : sortField;
      query = query.order(sortColumn, { ascending: sortDir === 'asc', nullsFirst: false });

      // Pagination
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      setContacts((data ?? []) as unknown as Contact[]);
      setTotalCount(count ?? 0);

      // Load tags for these contacts
      const contactIds = (data ?? []).map((c: any) => c.id);
      if (contactIds.length > 0) {
        const { data: tagData } = await supabase
          .from('contact_tags')
          .select('contact_id, tags(name)')
          .in('contact_id', contactIds);
        const tagMap = new Map<number, string[]>();
        for (const row of (tagData ?? [])) {
          const existing = tagMap.get(row.contact_id) || [];
          existing.push((row.tags as any)?.name ?? '');
          tagMap.set(row.contact_id, existing);
        }
        setContactTagsMap(tagMap);
      }
    } catch (err) {
      console.error('Load contacts error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, searchDebounced, sortField, sortDir, filterWarmth, filterGender, filterSeniority, filterTag, filterHasEmail]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const activeFilters = [filterWarmth, filterGender, filterSeniority, filterTag, filterHasEmail].filter(f => f !== 'all').length;

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map(c => c.id)));
    }
  }

  async function handleBulkAddTag() {
    if (!bulkTagId || selected.size === 0) return;
    const rows = Array.from(selected).map(contact_id => ({
      contact_id,
      tag_id: parseInt(bulkTagId),
      tagged_by: 'dashboard',
    }));
    const { error } = await supabase.from('contact_tags').upsert(rows, { onConflict: 'contact_id,tag_id' });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tags added', description: `Added tag to ${selected.size} contacts` });
      setSelected(new Set());
      setBulkTagDialogOpen(false);
      setBulkTagId('');
      loadContacts();
    }
  }

  async function handleAddContact() {
    if (!newContact.first_name.trim() || !newContact.last_name.trim()) {
      toast({ title: 'Required', description: 'First and last name are required', variant: 'destructive' });
      return;
    }
    setAddingSaving(true);
    const { data, error } = await supabase.from('contacts').insert({
      first_name: newContact.first_name.trim(),
      last_name: newContact.last_name.trim(),
      full_name: `${newContact.first_name.trim()} ${newContact.last_name.trim()}`,
      email: newContact.email.trim() || null,
      title: newContact.title.trim() || null,
    }).select('id').single();
    setAddingSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contact created', description: `${newContact.first_name} ${newContact.last_name} added` });
      setAddDialogOpen(false);
      setNewContact({ first_name: '', last_name: '', email: '', title: '' });
      if (data) navigate(`/contacts/${data.id}`);
    }
  }

  function clearFilters() {
    setFilterWarmth('all');
    setFilterGender('all');
    setFilterSeniority('all');
    setFilterTag('all');
    setFilterHasEmail('all');
  }

  return (
    <div className="p-6 max-w-7xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">{totalCount.toLocaleString()} contacts total</p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Contact
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, or title..."
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <Button
          variant={showFilters ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5 h-9"
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {activeFilters > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 bg-primary/10 text-primary">{activeFilters}</Badge>
          )}
        </Button>
      </div>

      {/* Filter Row */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Warmth</label>
                <Select value={filterWarmth} onValueChange={setFilterWarmth}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="cool">Cool</SelectItem>
                    <SelectItem value="cold">Cold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Gender</label>
                <Select value={filterGender} onValueChange={setFilterGender}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Seniority</label>
                <Select value={filterSeniority} onValueChange={setFilterSeniority}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {seniorityOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Tag</label>
                <Select value={filterTag} onValueChange={setFilterTag}>
                  <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tags</SelectItem>
                    {allTags.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Has Email</label>
                <Select value={filterHasEmail} onValueChange={setFilterHasEmail}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {activeFilters > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs text-muted-foreground">
                  <X className="w-3 h-3 mr-1" /> Clear all
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setBulkTagDialogOpen(true)}>
            <Tag className="w-3 h-3" /> Add Tag
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No contacts found</p>
              {(searchDebounced || activeFilters > 0) && (
                <Button variant="link" size="sm" onClick={() => { setSearch(''); clearFilters(); }} className="mt-2 text-xs">
                  Clear search & filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="w-10 px-3 py-3">
                      <Checkbox
                        checked={selected.size === contacts.length && contacts.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort('full_name')}>
                      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase">
                        Name <SortIcon field="full_name" />
                      </div>
                    </th>
                    <th className="text-left px-3 py-3 cursor-pointer select-none hidden md:table-cell" onClick={() => toggleSort('title')}>
                      <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase">
                        Title <SortIcon field="title" />
                      </div>
                    </th>
                    <th className="text-left px-3 py-3 hidden lg:table-cell">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Organization</div>
                    </th>
                    <th className="text-left px-3 py-3 hidden xl:table-cell">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Email</div>
                    </th>
                    <th className="text-center px-3 py-3 cursor-pointer select-none" onClick={() => toggleSort('warmth')}>
                      <div className="flex items-center justify-center gap-1 text-xs font-semibold text-muted-foreground uppercase">
                        Warmth <SortIcon field="warmth" />
                      </div>
                    </th>
                    <th className="text-left px-3 py-3 hidden lg:table-cell">
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Tags</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {contacts.map(c => {
                    const tags = contactTagsMap.get(c.id) ?? [];
                    return (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors group">
                        <td className="w-10 px-3 py-2.5" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={`/contacts/${c.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                            {c.full_name}
                          </Link>
                          {c.seniority && <p className="text-[10px] text-muted-foreground">{c.seniority}</p>}
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground line-clamp-1">{c.title ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          {c.organizations ? (
                            <Link href={`/organizations/${(c.organizations as any).id}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                              {(c.organizations as any).name}
                            </Link>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden xl:table-cell">
                          <span className="text-xs text-muted-foreground truncate block max-w-[200px]">{c.email ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {c.warmth ? (
                            <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${warmthColor[c.warmth] ?? ''}`}>{c.warmth}</Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((t, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0">{t}</Badge>
                            ))}
                            {tags.length > 3 && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0">+{tags.length - 3}</Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-8 gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {page + 1} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-8 gap-1">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Add Contact Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="w-4 h-4" /> New Contact
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input value={newContact.first_name} onChange={e => setNewContact(p => ({ ...p, first_name: e.target.value }))} className="h-8 text-sm" placeholder="Jane" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input value={newContact.last_name} onChange={e => setNewContact(p => ({ ...p, last_name: e.target.value }))} className="h-8 text-sm" placeholder="Doe" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} className="h-8 text-sm" placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={newContact.title} onChange={e => setNewContact(p => ({ ...p, title: e.target.value }))} className="h-8 text-sm" placeholder="VP of Marketing" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddContact} disabled={addingSaving}>
              {addingSaving ? 'Creating...' : 'Create Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Tag Dialog */}
      <Dialog open={bulkTagDialogOpen} onOpenChange={setBulkTagDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-base">Add Tag to {selected.size} Contacts</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Select value={bulkTagId} onValueChange={setBulkTagId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a tag..." /></SelectTrigger>
              <SelectContent>
                {allTags.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setBulkTagDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleBulkAddTag} disabled={!bulkTagId}>Apply Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
