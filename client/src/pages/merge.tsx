import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Merge, ArrowRight, Check, X, ChevronDown, ChevronUp,
  History, Eye, Users, AlertTriangle
} from 'lucide-react';

interface DuplicateContact {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  bio: string | null;
  seniority: string | null;
  warmth: string | null;
  org_id: number | null;
  relationship_status: string | null;
  assigned_to: string | null;
  crm_notes: string | null;
  profile_notes: string | null;
  source_type: string | null;
  gender: string | null;
  organizations: { id: number; name: string } | null;
  created_at: string;
}

interface MergeHistoryEntry {
  id: number;
  canonical_contact_id: number;
  merged_contact_id: number;
  merged_data: any;
  merge_note: string | null;
  merged_by: string | null;
  merged_at: string;
}

const MERGE_FIELDS = [
  { key: 'full_name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'relationship_status', label: 'Status' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'bio', label: 'Bio' },
  { key: 'crm_notes', label: 'CRM Notes' },
  { key: 'profile_notes', label: 'Profile Notes' },
  { key: 'gender', label: 'Gender' },
  { key: 'source_type', label: 'Source' },
] as const;

export default function MergePage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DuplicateContact[]>([]);
  const [searching, setSearching] = useState(false);

  // Merge selection
  const [selectedContacts, setSelectedContacts] = useState<DuplicateContact[]>([]);
  const [canonicalId, setCanonicalId] = useState<number | null>(null);
  const [mergedValues, setMergedValues] = useState<Record<string, string>>({});
  const [mergeNote, setMergeNote] = useState('');
  const [merging, setMerging] = useState(false);

  // Merge history
  const [history, setHistory] = useState<MergeHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  async function searchDuplicates() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const q = searchQuery.trim();

    // Search by name OR email
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, first_name, last_name, title, email, phone, linkedin_url, bio, seniority, warmth, org_id, relationship_status, assigned_to, crm_notes, profile_notes, source_type, gender, organizations(id, name), created_at')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
      .or('is_duplicate.is.null,is_duplicate.eq.false')
      .order('full_name')
      .limit(30);

    setSearchResults((data ?? []) as unknown as DuplicateContact[]);
    setSearching(false);
  }

  function toggleSelect(contact: DuplicateContact) {
    setSelectedContacts(prev => {
      const exists = prev.find(c => c.id === contact.id);
      if (exists) {
        const next = prev.filter(c => c.id !== contact.id);
        if (canonicalId === contact.id && next.length > 0) setCanonicalId(next[0].id);
        if (next.length === 0) setCanonicalId(null);
        return next;
      }
      const next = [...prev, contact];
      if (!canonicalId) setCanonicalId(contact.id);
      return next;
    });
  }

  function setCanonical(id: number) {
    setCanonicalId(id);
    // Pre-fill merged values from canonical
    const canonical = selectedContacts.find(c => c.id === id);
    if (canonical) {
      const values: Record<string, string> = {};
      for (const f of MERGE_FIELDS) {
        const val = (canonical as any)[f.key];
        values[f.key] = val ?? '';
      }
      setMergedValues(values);
    }
  }

  function pickValue(field: string, value: string) {
    setMergedValues(prev => ({ ...prev, [field]: value }));
  }

  async function executeMerge() {
    if (!canonicalId || selectedContacts.length < 2) return;
    setMerging(true);

    try {
      const canonical = selectedContacts.find(c => c.id === canonicalId)!;
      const mergedAway = selectedContacts.filter(c => c.id !== canonicalId);

      // 1. Collect ALL emails from all contacts into contact_emails
      const allEmails = new Set<string>();
      for (const c of selectedContacts) {
        if (c.email) allEmails.add(c.email.toLowerCase());
      }
      // Also fetch existing contact_emails for all contacts
      const contactIds = selectedContacts.map(c => c.id);
      const { data: existingEmails } = await supabase
        .from('contact_emails')
        .select('email, label, contact_id')
        .in('contact_id', contactIds);
      for (const e of (existingEmails ?? [])) {
        allEmails.add(e.email.toLowerCase());
      }

      // Insert all emails for canonical (if not already there)
      const { data: canonicalEmails } = await supabase
        .from('contact_emails')
        .select('email')
        .eq('contact_id', canonicalId);
      const existingCanonicalEmails = new Set((canonicalEmails ?? []).map(e => e.email.toLowerCase()));

      for (const email of allEmails) {
        if (!existingCanonicalEmails.has(email)) {
          await supabase.from('contact_emails').insert({
            contact_id: canonicalId,
            email,
            label: 'work',
            is_primary: false,
            source: 'merge',
          });
        }
      }

      // Set primary email if not set
      const { data: ceCheck } = await supabase
        .from('contact_emails')
        .select('id')
        .eq('contact_id', canonicalId)
        .eq('is_primary', true);
      if (!ceCheck || ceCheck.length === 0) {
        const primaryEmail = mergedValues.email || canonical.email;
        if (primaryEmail) {
          await supabase.from('contact_emails')
            .update({ is_primary: true })
            .eq('contact_id', canonicalId)
            .eq('email', primaryEmail.toLowerCase());
        }
      }

      // 2. For each merged-away contact, save full record to merge_history
      for (const merged of mergedAway) {
        await supabase.from('merge_history').insert({
          canonical_contact_id: canonicalId,
          merged_contact_id: merged.id,
          merged_data: merged,
          merge_note: mergeNote || null,
          merged_by: user?.email ?? 'dashboard',
        });
      }

      // 3. Combine all tags
      const { data: allTagData } = await supabase
        .from('contact_tags')
        .select('tag_id')
        .in('contact_id', contactIds);
      const uniqueTagIds = [...new Set((allTagData ?? []).map(t => t.tag_id))];
      for (const tagId of uniqueTagIds) {
        await supabase.from('contact_tags').upsert({
          contact_id: canonicalId,
          tag_id: tagId,
          tagged_by: 'merge',
        }, { onConflict: 'contact_id,tag_id' });
      }

      // 4. Repoint sightings and interactions
      for (const merged of mergedAway) {
        await supabase.from('sightings').update({ contact_id: canonicalId }).eq('contact_id', merged.id);
        await supabase.from('interactions').update({ contact_id: canonicalId }).eq('contact_id', merged.id);
        await supabase.from('emails').update({ contact_id: canonicalId }).eq('contact_id', merged.id);
      }

      // 5. Update canonical contact with merged values
      const updateData: any = { updated_at: new Date().toISOString() };
      for (const f of MERGE_FIELDS) {
        if (mergedValues[f.key]) {
          updateData[f.key] = mergedValues[f.key];
        }
      }
      // Set primary email on contact record
      if (mergedValues.email) updateData.email = mergedValues.email;
      await supabase.from('contacts').update(updateData).eq('id', canonicalId);

      // 6. Soft-delete merged contacts
      for (const merged of mergedAway) {
        // Clean up their contact_emails and contact_tags
        await supabase.from('contact_emails').delete().eq('contact_id', merged.id);
        await supabase.from('contact_tags').delete().eq('contact_id', merged.id);
        // Soft delete
        await supabase.from('contacts').update({
          is_duplicate: true,
          duplicate_of: canonicalId,
        }).eq('id', merged.id);
      }

      toast({ title: 'Merge complete', description: `${mergedAway.length} records merged into ${canonical.full_name}. All data preserved in merge history.` });

      // Reset
      setSelectedContacts([]);
      setCanonicalId(null);
      setMergedValues({});
      setMergeNote('');
      setSearchResults([]);
      setSearchQuery('');
      loadHistory();
    } catch (err: any) {
      toast({ title: 'Merge failed', description: err.message, variant: 'destructive' });
    } finally {
      setMerging(false);
    }
  }

  async function loadHistory() {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('merge_history')
      .select('*')
      .order('merged_at', { ascending: false })
      .limit(50);
    setHistory((data ?? []) as MergeHistoryEntry[]);
    setHistoryLoading(false);
  }

  const isSelected = (id: number) => selectedContacts.some(c => c.id === id);

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Merge Contacts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find and merge duplicate records. All data is preserved — nothing is lost.
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchDuplicates()}
                placeholder="Search by name or email to find duplicates..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Button size="sm" onClick={searchDuplicates} disabled={searching} className="h-9">
              {searching ? 'Searching...' : 'Find Duplicates'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Search Results ({searchResults.length}) — Click to select contacts to merge
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[400px] overflow-y-auto">
              {searchResults.map(c => (
                <button
                  key={c.id}
                  onClick={() => toggleSelect(c)}
                  className={`w-full text-left px-5 py-3 hover:bg-muted/50 transition-colors ${isSelected(c.id) ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">{c.full_name}</span>
                      {c.organizations && <span className="text-xs text-muted-foreground ml-2">at {(c.organizations as any).name}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                      {isSelected(c.id) && <Check className="w-4 h-4 text-primary" />}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[c.title, c.seniority, c.source_type].filter(Boolean).join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Merge Workspace */}
      {selectedContacts.length >= 2 && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Merge className="w-4 h-4 text-primary" />
              Merge {selectedContacts.length} Contacts
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Choose the primary record, then pick the best value for each field. All emails and data will be preserved.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Canonical selector */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase">Primary Record (keep this one)</label>
              <div className="flex flex-wrap gap-2">
                {selectedContacts.map(c => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant={canonicalId === c.id ? 'default' : 'outline'}
                    onClick={() => setCanonical(c.id)}
                    className="h-8 text-xs gap-1"
                  >
                    {canonicalId === c.id && <Check className="w-3 h-3" />}
                    {c.full_name}
                    <span className="text-muted-foreground ml-1">(#{c.id})</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Field comparison */}
            {canonicalId && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase">Field Values — Click to pick</label>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground w-32">Field</th>
                        {selectedContacts.map(c => (
                          <th key={c.id} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">
                            {c.full_name} {c.id === canonicalId && <Badge className="text-[9px] ml-1 bg-primary/10 text-primary border-0">Primary</Badge>}
                          </th>
                        ))}
                        <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Merged Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {MERGE_FIELDS.map(f => {
                        const values = selectedContacts.map(c => (c as any)[f.key] ?? '');
                        const uniqueValues = [...new Set(values.filter(Boolean))];
                        const hasConflict = uniqueValues.length > 1;

                        return (
                          <tr key={f.key} className={hasConflict ? 'bg-amber-50/50' : ''}>
                            <td className="px-4 py-2 text-xs font-medium text-muted-foreground">
                              {f.label}
                              {hasConflict && <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" />}
                            </td>
                            {selectedContacts.map(c => {
                              const val = (c as any)[f.key] ?? '';
                              return (
                                <td key={c.id} className="px-4 py-2">
                                  {val ? (
                                    <button
                                      onClick={() => pickValue(f.key, val)}
                                      className={`text-xs px-2 py-1 rounded transition-colors text-left ${
                                        mergedValues[f.key] === val
                                          ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                                          : 'hover:bg-muted'
                                      }`}
                                    >
                                      <span className="line-clamp-2">{val}</span>
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/30">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-2">
                              <Input
                                value={mergedValues[f.key] ?? ''}
                                onChange={e => pickValue(f.key, e.target.value)}
                                className="h-7 text-xs"
                                placeholder="Final value..."
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Merge Note */}
            {canonicalId && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Merge Note (optional)</label>
                <Textarea
                  value={mergeNote}
                  onChange={e => setMergeNote(e.target.value)}
                  placeholder="Why are these being merged?"
                  className="text-sm min-h-[60px]"
                />
              </div>
            )}

            {/* Execute */}
            {canonicalId && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>This will:</p>
                  <p>• Save full records of merged contacts to merge history</p>
                  <p>• Collect all {selectedContacts.length} email addresses into one record</p>
                  <p>• Combine all tags, sightings, and interactions</p>
                  <p>• Soft-delete {selectedContacts.length - 1} duplicate records</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="gap-1.5" disabled={merging}>
                      <Merge className="w-3.5 h-3.5" />
                      {merging ? 'Merging...' : `Merge ${selectedContacts.length} Records`}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Merge</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will merge {selectedContacts.length} contacts into "{selectedContacts.find(c => c.id === canonicalId)?.full_name}".
                        All data will be preserved in merge history. This can be reviewed later but is difficult to undo automatically.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={executeMerge}>Proceed with Merge</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Merge History */}
      <Card>
        <CardHeader className="pb-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full"
          >
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" /> Merge History ({history.length})
            </CardTitle>
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </CardHeader>
        {showHistory && (
          <CardContent className="p-0">
            {historyLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : history.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground text-center">No merges performed yet</p>
            ) : (
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {history.map(h => (
                  <div key={h.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">#{h.merged_contact_id}</Badge>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <Link href={`/contacts/${h.canonical_contact_id}`} className="text-sm font-medium text-primary hover:underline">
                          #{h.canonical_contact_id}
                        </Link>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {new Date(h.merged_at).toLocaleDateString()}
                      </span>
                    </div>
                    {h.merged_data?.full_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Merged: {h.merged_data.full_name} {h.merged_data.email && `(${h.merged_data.email})`}
                      </p>
                    )}
                    {h.merge_note && <p className="text-xs text-muted-foreground mt-0.5 italic">{h.merge_note}</p>}
                    {h.merged_by && <p className="text-[10px] text-muted-foreground mt-0.5">by {h.merged_by}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
