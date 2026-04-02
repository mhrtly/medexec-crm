import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Building2, Globe, MapPin, Users, ChevronRight, Edit2, Check, X, Plus
} from 'lucide-react';

interface Org {
  id: number;
  name: string;
  parent_org: string | null;
  hq_city: string | null;
  hq_state: string | null;
  website: string | null;
  product_category: string | null;
  revenue_estimate: string | null;
  headcount_estimate: string | null;
  public_or_private: string | null;
  ticker: string | null;
  description: string | null;
  org_relationship: string | null;
  sponsor_level: string | null;
  org_notes: string | null;
  is_medtech: boolean | null;
}

interface OrgContact {
  id: number;
  full_name: string;
  title: string | null;
  email: string | null;
  warmth: string | null;
  seniority: string | null;
}

export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [org, setOrg] = useState<Org | null>(null);
  const [contacts, setContacts] = useState<OrgContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => { if (id) loadAll(); }, [id]);

  async function loadAll() {
    setLoading(true);
    const [orgRes, contactsRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', parseInt(id!)).single(),
      supabase.from('contacts').select('id, full_name, title, email, warmth, seniority')
        .eq('org_id', parseInt(id!)).order('full_name').limit(200),
    ]);
    setOrg(orgRes.data as Org | null);
    setContacts((contactsRes.data ?? []) as OrgContact[]);
    setLoading(false);
  }

  async function saveField(field: string, value: string | boolean | null) {
    if (!org) return;
    const { error } = await supabase.from('organizations').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', org.id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved' });
      setOrg(prev => prev ? { ...prev, [field]: value } : prev);
    }
    setEditingField(null);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Organization not found</p>
        <Link href="/organizations" className="text-primary text-sm hover:underline mt-2 inline-block">Back to organizations</Link>
      </div>
    );
  }

  const warmthColor: Record<string, string> = {
    hot: 'bg-red-100 text-red-700', warm: 'bg-orange-100 text-orange-700',
    cool: 'bg-sky-100 text-sky-700', cold: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/organizations" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Organizations
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{org.name}</span>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <InlineEdit value={org.name} onSave={val => saveField('name', val)} className="text-xl font-semibold" />
                <div className="flex items-center gap-2 mt-1">
                  {org.is_medtech && <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">MedTech</Badge>}
                  {org.public_or_private && <Badge variant="outline" className="text-xs">{org.public_or_private}</Badge>}
                  {org.ticker && <Badge variant="outline" className="text-xs">{org.ticker}</Badge>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">MedTech</label>
              <Switch checked={org.is_medtech === true} onCheckedChange={val => saveField('is_medtech', val)} />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
            <DetailField label="City" value={org.hq_city} onSave={val => saveField('hq_city', val)} />
            <DetailField label="State" value={org.hq_state} onSave={val => saveField('hq_state', val)} />
            <DetailField label="Category" value={org.product_category} onSave={val => saveField('product_category', val)} />
            <DetailField label="Revenue" value={org.revenue_estimate} onSave={val => saveField('revenue_estimate', val)} />
            <DetailField label="Headcount" value={org.headcount_estimate} onSave={val => saveField('headcount_estimate', val)} />
            <DetailField label="Sponsor Level" value={org.sponsor_level} onSave={val => saveField('sponsor_level', val)} />
            <DetailField label="Relationship" value={org.org_relationship} onSave={val => saveField('org_relationship', val)} />
            <DetailField label="Parent Org" value={org.parent_org} onSave={val => saveField('parent_org', val)} />
          </div>

          {org.website && (
            <div className="mt-4 pt-4 border-t flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{org.website}</a>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Notes */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Notes</CardTitle></CardHeader>
          <CardContent>
            <EditableTextarea value={org.org_notes ?? ''} onSave={val => saveField('org_notes', val)} placeholder="Add notes..." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Description</CardTitle></CardHeader>
          <CardContent>
            <EditableTextarea value={org.description ?? ''} onSave={val => saveField('description', val)} placeholder="Add description..." />
          </CardContent>
        </Card>
      </div>

      {/* Contacts at this org */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" /> Contacts ({contacts.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {contacts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground text-center">No contacts linked to this organization</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Title</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase hidden lg:table-cell">Email</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase">Warmth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {contacts.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/contacts/${c.id}`} className="font-medium hover:text-primary transition-colors">{c.full_name}</Link>
                        {c.seniority && <p className="text-[10px] text-muted-foreground">{c.seniority}</p>}
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">{c.title ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{c.email ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c.warmth ? (
                          <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${warmthColor[c.warmth] ?? ''}`}>{c.warmth}</Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Helper Components ── */

function InlineEdit({ value, onSave, className }: { value: string; onSave: (val: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input autoFocus value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(text); setEditing(false); } if (e.key === 'Escape') { setText(value); setEditing(false); } }}
          className="h-8 text-sm" />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { onSave(text); setEditing(false); }}>
          <Check className="w-3.5 h-3.5 text-green-600" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setText(value); setEditing(false); }}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1 cursor-pointer" onClick={() => setEditing(true)}>
      <span className={className}>{value}</span>
      <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function DetailField({ label, value, onSave }: { label: string; value: string | null; onSave: (val: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? '');

  if (editing) {
    return (
      <div className="space-y-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase">{label}</span>
        <div className="flex items-center gap-1">
          <Input autoFocus value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onSave(text); setEditing(false); } if (e.key === 'Escape') { setText(value ?? ''); setEditing(false); } }}
            className="h-7 text-sm" />
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { onSave(text); setEditing(false); }}>
            <Check className="w-3 h-3 text-green-600" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 group cursor-pointer" onClick={() => { setText(value ?? ''); setEditing(true); }}>
      <span className="text-[10px] font-medium text-muted-foreground uppercase">{label}</span>
      <div className="flex items-center gap-1">
        <span className={`text-sm ${value ? '' : 'text-muted-foreground/50 italic'}`}>{value || 'Add...'}</span>
        <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

function EditableTextarea({ value, onSave, placeholder }: { value: string; onSave: (val: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => { setText(value); }, [value]);

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea value={text} onChange={e => setText(e.target.value)} className="text-sm min-h-[80px]" autoFocus />
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditing(false); setText(value); }}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => { onSave(text); setEditing(false); }}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group cursor-pointer" onClick={() => setEditing(true)}>
      {value ? <p className="text-sm whitespace-pre-wrap">{value}</p> : <p className="text-sm text-muted-foreground/50 italic">{placeholder}</p>}
      <p className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1">Click to edit</p>
    </div>
  );
}
