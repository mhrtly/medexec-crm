import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Tag, Users, Search, Plus, X, Trash2
} from 'lucide-react';

const PAGE_SIZE = 50;

interface TagInfo {
  id: number;
  name: string;
  category: string | null;
}

interface Contact {
  id: number;
  full_name: string;
  title: string | null;
  email: string | null;
  warmth: string | null;
  seniority: string | null;
  organizations: { id: number; name: string } | null;
}

const warmthColor: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cool: 'bg-sky-100 text-sky-700',
  cold: 'bg-blue-100 text-blue-700',
};

export default function TagDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [tag, setTag] = useState<TagInfo | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // Add contact to tag
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<{ id: number; full_name: string; email: string | null }[]>([]);

  // Edit tag
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (id) loadTag();
  }, [id]);

  async function loadTag() {
    const { data } = await supabase.from('tags').select('id, name, category').eq('id', parseInt(id!)).single();
    if (data) {
      setTag(data as TagInfo);
      setEditName(data.name);
    }
  }

  const loadContacts = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const tagId = parseInt(id);

    // Get contact IDs with this tag
    const { data: taggedData, count: taggedCount } = await supabase
      .from('contact_tags')
      .select('contact_id', { count: 'exact' })
      .eq('tag_id', tagId);

    const allIds = (taggedData ?? []).map(r => r.contact_id);
    setTotalCount(taggedCount ?? 0);

    if (allIds.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch contacts with pagination
    let query = supabase
      .from('contacts')
      .select('id, full_name, title, email, warmth, seniority, organizations(id, name)')
      .in('id', allIds)
      .order('full_name');

    if (searchDebounced) {
      query = query.or(`full_name.ilike.%${searchDebounced}%,email.ilike.%${searchDebounced}%,title.ilike.%${searchDebounced}%`);
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, error } = await query;
    if (!error) setContacts((data ?? []) as unknown as Contact[]);
    setLoading(false);
  }, [id, page, searchDebounced]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  async function removeFromTag(contactId: number) {
    if (!id) return;
    await supabase.from('contact_tags').delete().eq('contact_id', contactId).eq('tag_id', parseInt(id));
    toast({ title: 'Removed from tag' });
    loadContacts();
  }

  async function searchContactsToAdd(q: string) {
    setAddSearch(q);
    if (q.length < 2) { setAddResults([]); return; }
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, email')
      .ilike('full_name', `%${q}%`)
      .limit(10);
    setAddResults((data ?? []) as { id: number; full_name: string; email: string | null }[]);
  }

  async function addContactToTag(contactId: number) {
    if (!id) return;
    const { error } = await supabase.from('contact_tags').insert({
      contact_id: contactId,
      tag_id: parseInt(id),
      tagged_by: 'dashboard',
    });
    if (error && error.code === '23505') {
      toast({ title: 'Already tagged' });
    } else if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contact added to tag' });
    }
    setAddOpen(false);
    setAddSearch('');
    setAddResults([]);
    loadContacts();
  }

  async function saveTagName() {
    if (!tag || !editName.trim()) return;
    const { error } = await supabase.from('tags').update({ name: editName.trim() }).eq('id', tag.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tag updated' });
      setTag(prev => prev ? { ...prev, name: editName.trim() } : prev);
    }
    setEditing(false);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (!tag && !loading) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Tag not found</p>
        <Link href="/tags" className="text-primary text-sm hover:underline mt-2 inline-block">Back to tags</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/tags" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Tags
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{tag?.name ?? '...'}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tag className="w-5 h-5 text-primary" />
          </div>
          <div>
            {editing ? (
              <div className="flex items-center gap-2">
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm w-48"
                  onKeyDown={e => { if (e.key === 'Enter') saveTagName(); if (e.key === 'Escape') setEditing(false); }} autoFocus />
                <Button size="sm" variant="ghost" className="h-7" onClick={saveTagName}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            ) : (
              <h1 className="text-xl font-semibold tracking-tight cursor-pointer hover:text-primary transition-colors" onClick={() => setEditing(true)}>
                {tag?.name}
              </h1>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              {tag?.category && <Badge variant="secondary" className="text-[10px]">{tag.category}</Badge>}
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {totalCount.toLocaleString()} contacts
              </span>
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Contact
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts in this tag..." className="pl-9 h-9 text-sm" />
      </div>

      {/* Contacts Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No contacts with this tag</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Title</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">Organization</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hidden xl:table-cell">Email</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Warmth</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {contacts.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-2.5">
                        <Link href={`/contacts/${c.id}`} className="font-medium hover:text-primary transition-colors">
                          {c.full_name}
                        </Link>
                        {c.seniority && <p className="text-[10px] text-muted-foreground">{c.seniority}</p>}
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground line-clamp-1">{c.title ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        {c.organizations ? (
                          <Link href={`/organizations/${(c.organizations as any).id}`} className="text-xs text-muted-foreground hover:text-primary">
                            {(c.organizations as any).name}
                          </Link>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5 hidden xl:table-cell">
                        <span className="text-xs text-muted-foreground truncate block max-w-[180px]">{c.email ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c.warmth ? (
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${warmthColor[c.warmth] ?? ''}`}>{c.warmth}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => removeFromTag(c.id)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
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

      {/* Add Contact Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle className="text-base">Add Contact to "{tag?.name}"</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={addSearch} onChange={e => searchContactsToAdd(e.target.value)} placeholder="Search contacts by name..." className="h-9 text-sm" autoFocus />
            <div className="max-h-[250px] overflow-y-auto space-y-1">
              {addResults.map(c => (
                <button key={c.id} onClick={() => addContactToTag(c.id)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors">
                  <p className="text-sm font-medium">{c.full_name}</p>
                  {c.email && <p className="text-[10px] text-muted-foreground">{c.email}</p>}
                </button>
              ))}
              {addSearch.length >= 2 && addResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No contacts found</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
