import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ExternalLink, Save, Users } from 'lucide-react';

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
  created_at: string;
}

interface OrgContact {
  id: number;
  full_name: string;
  title: string | null;
  seniority: string | null;
  warmth: string | null;
  email: string | null;
}

export default function OrgDetailPage() {
  const [, params] = useRoute('/organizations/:id');
  const orgId = params?.id ? parseInt(params.id) : null;
  const { toast } = useToast();

  const [org, setOrg] = useState<Org | null>(null);
  const [contacts, setContacts] = useState<OrgContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orgRelationship, setOrgRelationship] = useState('prospect');
  const [sponsorLevel, setSponsorLevel] = useState('');
  const [orgNotes, setOrgNotes] = useState('');

  useEffect(() => {
    if (orgId) loadOrg();
  }, [orgId]);

  async function loadOrg() {
    setLoading(true);
    const [{ data: orgData }, { data: contactsData }] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId!).single(),
      supabase.from('contacts').select('id, full_name, title, seniority, warmth, email').eq('org_id', orgId!).order('full_name'),
    ]);

    if (orgData) {
      const o = orgData as Org;
      setOrg(o);
      setOrgRelationship(o.org_relationship ?? 'prospect');
      setSponsorLevel(o.sponsor_level ?? '');
      setOrgNotes(o.org_notes ?? '');
    }
    setContacts((contactsData ?? []) as OrgContact[]);
    setLoading(false);
  }

  async function saveOrg() {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase.from('organizations').update({
      org_relationship: orgRelationship,
      sponsor_level: sponsorLevel || null,
      org_notes: orgNotes || null,
    }).eq('id', orgId);
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else toast({ title: 'Saved', description: 'Organization updated.' });
  }

  if (loading) return <div className="p-6"><Skeleton className="h-64 w-full max-w-4xl" /></div>;
  if (!org) return <div className="p-6"><p className="text-muted-foreground">Organization not found.</p></div>;

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <Link href="/organizations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" /> Organizations
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{org.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {[org.hq_city, org.hq_state].filter(Boolean).join(', ')}
              {org.product_category && ` · ${org.product_category}`}
            </p>
          </div>
          {org.website && (
            <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              Website <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Org info */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Company Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-xs">
              {org.revenue_estimate && <div><span className="text-muted-foreground">Revenue</span><p className="font-medium mt-0.5">{org.revenue_estimate}</p></div>}
              {org.headcount_estimate && <div><span className="text-muted-foreground">Headcount</span><p className="font-medium mt-0.5">{org.headcount_estimate}</p></div>}
              {org.public_or_private && <div><span className="text-muted-foreground">Type</span><p className="font-medium mt-0.5">{org.public_or_private}{org.ticker ? ` (${org.ticker})` : ''}</p></div>}
              {org.parent_org && <div><span className="text-muted-foreground">Parent Org</span><p className="font-medium mt-0.5">{org.parent_org}</p></div>}
              {org.description && <div className="col-span-2 pt-2 border-t"><p className="text-muted-foreground leading-relaxed">{org.description}</p></div>}
            </CardContent>
          </Card>

          {/* Contacts at this org */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Contacts ({contacts.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {contacts.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">No contacts at this organization</p>
              ) : (
                <div className="divide-y divide-border">
                  {contacts.map((c) => (
                    <Link key={c.id} href={`/contacts/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors" data-testid={`org-contact-${c.id}`}>
                      <div>
                        <p className="text-sm font-medium">{c.full_name}</p>
                        <p className="text-xs text-muted-foreground">{c.title} {c.seniority ? `· ${c.seniority}` : ''}</p>
                      </div>
                      {c.email && <span className="text-[10px] text-muted-foreground font-mono">{c.email}</span>}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* CRM sidebar */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">CRM Status</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Relationship</label>
              <Select value={orgRelationship} onValueChange={setOrgRelationship}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                  <SelectItem value="sponsor">Sponsor</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Sponsor Level</label>
              <Input value={sponsorLevel} onChange={(e) => setSponsorLevel(e.target.value)} placeholder="Gold, Silver, etc." className="h-8 text-xs" data-testid="input-sponsor-level" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <Textarea value={orgNotes} onChange={(e) => setOrgNotes(e.target.value)} placeholder="Notes about this organization..." className="text-xs min-h-[80px]" data-testid="input-org-notes" />
            </div>
            <Button onClick={saveOrg} disabled={saving} className="w-full h-8 text-xs" data-testid="button-save-org">
              <Save className="w-3 h-3 mr-1.5" /> {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
