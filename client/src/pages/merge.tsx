import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  GitMerge, Search, ChevronRight, Check, ArrowRight, RefreshCw, AlertTriangle, Users
} from 'lucide-react';

interface DuplicateGroup {
  name: string;
  contacts: MergeContact[];
}

interface MergeContact {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  seniority: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  bio: string | null;
  gender: string | null;
  warmth: string | null;
  relationship_status: string | null;
  org_id: number | null;
  is_verified: boolean;
  source_type: string | null;
  crm_notes: string | null;
  created_at: string;
  org_name?: string;
}

type FieldKey = keyof MergeContact;

const MERGE_FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'full_name', label: 'Full Name' },
  { key: 'title', label: 'Title' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'bio', label: 'Bio' },
  { key: 'gender', label: 'Gender' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'relationship_status', label: 'Status' },
  { key: 'org_id', label: 'Organization' },
  { key: 'is_verified', label: 'Verified' },
  { key: 'crm_notes', label: 'CRM Notes' },
];

export default function MergePage() {
  const { toast } = useToast();
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [mergeSelections, setMergeSelections] = useState<Record<string, number>>({}); // field -> contact id
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    scanForDuplicates();
  }, []);

  const scanForDuplicates = useCallback(async () => {
    setScanning(true);
    setLoading(true);

    // Find duplicates by matching full_name (case insensitive)
    const { data: dupes } = await supabase.rpc('get_duplicate_contacts').select('*');

    // If RPC doesn't exist, fallback to client-side grouping
    if (!dupes) {
      // Fetch all contacts with key fields
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, title, seniority, email, phone, linkedin_url, bio, gender, warmth, relationship_status, org_id, is_verified, source_type, crm_notes, created_at, organizations(name)')
        .order('full_name');

      if (allContacts) {
        const groups = new Map<string, MergeContact[]>();

        for (const c of allContacts) {
          const key = (c.full_name ?? '').trim().toLowerCase();
          if (!key) continue;

          const contact: MergeContact = {
            ...(c as any),
            org_name: c.organizations ? (c.organizations as any).name : null,
          };

          if (!groups.has(key)) {
            groups.set(key, []);
          }
          groups.get(key)!.push(contact);
        }

        // Only keep groups with 2+ contacts
        const dupeGroups: DuplicateGroup[] = [];
        for (const [name, contacts] of groups) {
          if (contacts.length >= 2) {
            dupeGroups.push({
              name: contacts[0].full_name,
              contacts: contacts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
            });
          }
        }

        dupeGroups.sort((a, b) => b.contacts.length - a.contacts.length);
        setDuplicates(dupeGroups);
      }
    }

    setLoading(false);
    setScanning(false);
  }, []);

  function selectGroup(group: DuplicateGroup) {
    setSelectedGroup(group);
    setPrimaryId(group.contacts[0].id);

    // Auto-select best values: prefer non-null, most recently updated, verified
    const selections: Record<string, number> = {};
    for (const field of MERGE_FIELDS) {
      let bestId = group.contacts[0].id;
      let bestValue: any = group.contacts[0][field.key];

      for (const c of group.contacts) {
        const val = c[field.key];

        // Prefer non-null/non-empty over null
        if ((bestValue === null || bestValue === '' || bestValue === undefined) && val !== null && val !== '' && val !== undefined) {
          bestId = c.id;
          bestValue = val;
          continue;
        }

        // If both have values, prefer verified contact
        if (val !== null && val !== '' && val !== undefined && bestValue !== null && bestValue !== '') {
          if (c.is_verified && !group.contacts.find(x => x.id === bestId)?.is_verified) {
            bestId = c.id;
            bestValue = val;
          }
        }
      }

      selections[field.key] = bestId;
    }

    setMergeSelections(selections);
  }

  function selectField(fieldKey: string, contactId: number) {
    setMergeSelections(prev => ({ ...prev, [fieldKey]: contactId }));
  }

  async function executeMerge() {
    if (!selectedGroup || !primaryId) return;
    setMerging(true);

    // Build the merged contact data
    const mergedData: Record<string, any> = {};
    for (const field of MERGE_FIELDS) {
      const sourceId = mergeSelections[field.key];
      const source = selectedGroup.contacts.find(c => c.id === sourceId);
      if (source) {
        mergedData[field.key] = source[field.key];
      }
    }

    // Update the primary contact with merged data
    const { error: updateError } = await supabase
      .from('contacts')
      .update(mergedData)
      .eq('id', primaryId);

    if (updateError) {
      toast({ title: 'Merge failed', description: updateError.message, variant: 'destructive' });
      setMerging(false);
      return;
    }

    // Move sightings from duplicates to primary
    const dupeIds = selectedGroup.contacts.filter(c => c.id !== primaryId).map(c => c.id);

    await supabase
      .from('sightings')
      .update({ contact_id: primaryId })
      .in('contact_id', dupeIds);

    // Move interactions from duplicates to primary
    await supabase
      .from('interactions')
      .update({ contact_id: primaryId })
      .in('contact_id', dupeIds);

    // Move contact_tags from duplicates (avoid duplicates)
    const { data: existingTags } = await supabase
      .from('contact_tags')
      .select('tag_id')
      .eq('contact_id', primaryId);
    const existingTagIds = new Set((existingTags ?? []).map((t: any) => t.tag_id));

    const { data: dupeTags } = await supabase
      .from('contact_tags')
      .select('*')
      .in('contact_id', dupeIds);

    if (dupeTags) {
      for (const tag of dupeTags) {
        if (!existingTagIds.has(tag.tag_id)) {
          await supabase.from('contact_tags').insert({
            contact_id: primaryId,
            tag_id: tag.tag_id,
            tagged_by: tag.tagged_by,
          });
        }
      }
    }

    // Delete duplicate contact_tags
    await supabase.from('contact_tags').delete().in('contact_id', dupeIds);

    // Mark duplicates as merged (set is_duplicate and duplicate_of)
    for (const dupeId of dupeIds) {
      await supabase
        .from('contacts')
        .update({ is_duplicate: true, duplicate_of: primaryId })
        .eq('id', dupeId);
    }

    // Delete the duplicate contacts
    await supabase.from('contacts').delete().in('id', dupeIds);

    toast({
      title: 'Contacts merged',
      description: `Merged ${selectedGroup.contacts.length} contacts into one. ${dupeIds.length} duplicate(s) removed.`,
    });

    // Refresh
    setSelectedGroup(null);
    setMerging(false);
    setShowConfirm(false);
    scanForDuplicates();
  }

  const filteredDuplicates = search
    ? duplicates.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
    : duplicates;

  const totalDupes = duplicates.reduce((sum, g) => sum + g.contacts.length - 1, 0);

  if (selectedGroup) {
    return (
      <MergeDetail
        group={selectedGroup}
        mergeSelections={mergeSelections}
        primaryId={primaryId!}
        setPrimaryId={setPrimaryId}
        selectField={selectField}
        onBack={() => setSelectedGroup(null)}
        onMerge={() => setShowConfirm(true)}
        merging={merging}
        showConfirm={showConfirm}
        setShowConfirm={setShowConfirm}
        executeMerge={executeMerge}
      />
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contact Merge</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? 'Scanning...' : (
              <>
                {duplicates.length} duplicate groups found ({totalDupes} extra contacts)
              </>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={scanForDuplicates}
          disabled={scanning}
          data-testid="button-rescan"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${scanning ? 'animate-spin' : ''}`} />
          Re-scan
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search duplicates..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-dupes"
        />
      </div>

      {/* Duplicate groups */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredDuplicates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">
              {search ? 'No matching duplicates found' : 'No duplicates detected — your database is clean.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredDuplicates.map((group, i) => (
            <Card
              key={i}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => selectGroup(group)}
              data-testid={`dupe-group-${i}`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.contacts.length} duplicate records
                      {group.contacts.some(c => c.email) && (
                        <> — {[...new Set(group.contacts.map(c => c.email).filter(Boolean))].join(', ')}</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {group.contacts.length}
                  </Badge>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MergeDetail({
  group,
  mergeSelections,
  primaryId,
  setPrimaryId,
  selectField,
  onBack,
  onMerge,
  merging,
  showConfirm,
  setShowConfirm,
  executeMerge,
}: {
  group: DuplicateGroup;
  mergeSelections: Record<string, number>;
  primaryId: number;
  setPrimaryId: (id: number) => void;
  selectField: (field: string, id: number) => void;
  onBack: () => void;
  onMerge: () => void;
  merging: boolean;
  showConfirm: boolean;
  setShowConfirm: (v: boolean) => void;
  executeMerge: () => void;
}) {
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1"
            data-testid="button-back-merge"
          >
            ← Back to duplicates
          </button>
          <h1 className="text-xl font-semibold tracking-tight">
            Merge: {group.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {group.contacts.length} records — select the best value for each field
          </p>
        </div>
        <Button onClick={onMerge} disabled={merging} data-testid="button-execute-merge">
          <GitMerge className="w-4 h-4 mr-1.5" />
          {merging ? 'Merging...' : 'Merge Contacts'}
        </Button>
      </div>

      {/* Primary contact selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Primary Record</CardTitle>
          <p className="text-xs text-muted-foreground">The primary record will be kept. Other records will be merged into it and deleted.</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {group.contacts.map((c) => (
              <Button
                key={c.id}
                variant={primaryId === c.id ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => setPrimaryId(c.id)}
                data-testid={`primary-${c.id}`}
              >
                {primaryId === c.id && <Check className="w-3 h-3 mr-1" />}
                #{c.id} — {c.source_type ?? 'unknown'} — {new Date(c.created_at).toLocaleDateString()}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side comparison */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28 sticky left-0 bg-muted/50">Field</th>
                {group.contacts.map((c) => (
                  <th key={c.id} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[200px]">
                    <div className="flex items-center gap-1.5">
                      Contact #{c.id}
                      {c.id === primaryId && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-primary/10 text-primary">PRIMARY</Badge>
                      )}
                      {c.is_verified && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Verified</Badge>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[200px] bg-primary/5">
                  <div className="flex items-center gap-1.5">
                    <ArrowRight className="w-3 h-3" />
                    Merged Result
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {MERGE_FIELDS.map((field) => {
                const selectedId = mergeSelections[field.key];
                const mergedContact = group.contacts.find(c => c.id === selectedId);
                const mergedValue = mergedContact ? mergedContact[field.key] : null;

                return (
                  <tr key={field.key} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs font-medium text-muted-foreground sticky left-0 bg-card">
                      {field.label}
                    </td>
                    {group.contacts.map((c) => {
                      const val = c[field.key];
                      const isSelected = selectedId === c.id;
                      const displayVal = field.key === 'org_id'
                        ? (c.org_name ?? `Org #${val}`)
                        : field.key === 'is_verified'
                          ? (val ? 'Yes' : 'No')
                          : (val ?? '—');

                      return (
                        <td
                          key={c.id}
                          className={`px-4 py-3 text-xs cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => selectField(field.key, c.id)}
                          data-testid={`cell-${field.key}-${c.id}`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isSelected && <Check className="w-3 h-3 text-primary shrink-0" />}
                            <span className={`truncate max-w-[180px] ${val ? '' : 'text-muted-foreground/50'}`}>
                              {typeof displayVal === 'boolean' ? (displayVal ? 'Yes' : 'No') : (String(displayVal))}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-xs bg-primary/[0.03] font-medium">
                      {field.key === 'org_id'
                        ? (mergedContact?.org_name ?? `Org #${mergedValue}`)
                        : field.key === 'is_verified'
                          ? (mergedValue ? 'Yes' : 'No')
                          : (mergedValue !== null && mergedValue !== undefined ? String(mergedValue) : '—')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Merge</AlertDialogTitle>
            <AlertDialogDescription>
              This will merge {group.contacts.length} contacts into one record (#{primaryId}).
              The other {group.contacts.length - 1} record(s) will be permanently deleted.
              All sightings, interactions, and tags will be moved to the primary record.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeMerge} disabled={merging}>
              {merging ? 'Merging...' : 'Yes, merge contacts'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
