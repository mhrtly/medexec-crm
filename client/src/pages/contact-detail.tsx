import { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Mail, Phone, Linkedin, Building2, Save,
  ExternalLink, Clock, Eye, MessageSquare, Plus
} from 'lucide-react';
import { format } from 'date-fns';

interface Contact {
  id: number;
  full_name: string;
  first_name: string;
  last_name: string;
  title: string | null;
  seniority: string | null;
  org_id: number | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  bio: string | null;
  profile_notes: string | null;
  gender: string | null;
  relationship_status: string | null;
  warmth: string | null;
  last_contacted: string | null;
  next_action: string | null;
  crm_notes: string | null;
  assigned_to: string | null;
  source_type: string | null;
  confidence: string | null;
  is_verified: boolean;
  created_at: string;
  organizations: { id: number; name: string; website: string | null } | null;
}

interface Sighting {
  id: number;
  source_type: string;
  source_name: string | null;
  source_url: string | null;
  context: string | null;
  detail_type: string | null;
  detail_value: string | null;
  found_at: string;
}

interface Interaction {
  id: number;
  interaction_type: string;
  subject: string | null;
  body: string | null;
  logged_by: string | null;
  occurred_at: string;
}

export default function ContactDetailPage() {
  const [, params] = useRoute('/contacts/:id');
  const contactId = params?.id ? parseInt(params.id) : null;
  const { user } = useAuth();
  const { toast } = useToast();

  const [contact, setContact] = useState<Contact | null>(null);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable CRM fields
  const [warmth, setWarmth] = useState('');
  const [relationshipStatus, setRelationshipStatus] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [crmNotes, setCrmNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  // New interaction form
  const [showNewInteraction, setShowNewInteraction] = useState(false);
  const [newInteractionType, setNewInteractionType] = useState('email');
  const [newInteractionSubject, setNewInteractionSubject] = useState('');
  const [newInteractionBody, setNewInteractionBody] = useState('');

  useEffect(() => {
    if (contactId) loadContact();
  }, [contactId]);

  async function loadContact() {
    setLoading(true);
    const [{ data: contactData }, { data: sightingsData }, { data: interactionsData }] = await Promise.all([
      supabase.from('contacts')
        .select('*, organizations(id, name, website)')
        .eq('id', contactId!)
        .single(),
      supabase.from('sightings')
        .select('*')
        .eq('contact_id', contactId!)
        .order('found_at', { ascending: false })
        .limit(20),
      supabase.from('interactions')
        .select('*')
        .eq('contact_id', contactId!)
        .order('occurred_at', { ascending: false })
        .limit(20),
    ]);

    if (contactData) {
      const c = contactData as unknown as Contact;
      setContact(c);
      setWarmth(c.warmth ?? 'cold');
      setRelationshipStatus(c.relationship_status ?? 'prospect');
      setNextAction(c.next_action ?? '');
      setCrmNotes(c.crm_notes ?? '');
      setAssignedTo(c.assigned_to ?? '');
    }
    setSightings((sightingsData ?? []) as Sighting[]);
    setInteractions((interactionsData ?? []) as Interaction[]);
    setLoading(false);
  }

  async function saveContact() {
    if (!contactId) return;
    setSaving(true);
    const { error } = await supabase.from('contacts').update({
      warmth,
      relationship_status: relationshipStatus,
      next_action: nextAction || null,
      crm_notes: crmNotes || null,
      assigned_to: assignedTo || null,
      last_contacted: new Date().toISOString(),
    }).eq('id', contactId);

    setSaving(false);
    if (error) {
      toast({ title: 'Error saving', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Contact updated successfully.' });
    }
  }

  async function addInteraction() {
    if (!contactId || !newInteractionSubject.trim()) return;
    const { error } = await supabase.from('interactions').insert({
      contact_id: contactId,
      interaction_type: newInteractionType,
      subject: newInteractionSubject,
      body: newInteractionBody || null,
      logged_by: user?.email ?? 'unknown',
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Interaction logged' });
      setShowNewInteraction(false);
      setNewInteractionSubject('');
      setNewInteractionBody('');
      loadContact();
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Contact not found.</p>
        <Link href="/contacts" className="text-primary hover:underline text-sm mt-2 inline-block">Back to contacts</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Back + header */}
      <div>
        <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3" data-testid="link-back">
          <ArrowLeft className="w-4 h-4" /> Contacts
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{contact.full_name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {contact.title}
              {contact.organizations && (
                <> at <Link href={`/organizations/${(contact.organizations as any).id}`} className="text-primary hover:underline">{(contact.organizations as any).name}</Link></>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {contact.is_verified && (
              <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">Verified</Badge>
            )}
            {contact.gender && (
              <Badge variant="outline" className="text-[10px]">{contact.gender}</Badge>
            )}
            {contact.seniority && (
              <Badge variant="outline" className="text-[10px]">{contact.seniority}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column — contact info + sightings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contact.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline font-mono text-xs">{contact.email}</a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs">{contact.phone}</span>
                </div>
              )}
              {contact.linkedin_url && (
                <div className="flex items-center gap-3 text-sm">
                  <Linkedin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate flex items-center gap-1">
                    LinkedIn <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {contact.organizations && (contact.organizations as any).website && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={(contact.organizations as any).website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs truncate flex items-center gap-1">
                    {(contact.organizations as any).website} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {contact.bio && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground leading-relaxed">{contact.bio}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sightings */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Sightings ({sightings.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {sightings.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">No sightings yet</p>
              ) : (
                <div className="divide-y divide-border">
                  {sightings.map((s) => (
                    <div key={s.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.source_type}</Badge>
                          <span className="text-sm font-medium">{s.source_name ?? s.source_type}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {format(new Date(s.found_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {s.detail_type && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="font-medium">{s.detail_type}:</span> {s.detail_value}
                        </p>
                      )}
                      {s.context && <p className="text-xs text-muted-foreground mt-0.5">{s.context}</p>}
                      {s.source_url && (
                        <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline mt-0.5 inline-flex items-center gap-0.5">
                          Source <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Interactions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">Interactions ({interactions.length})</CardTitle>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowNewInteraction(!showNewInteraction)} data-testid="button-new-interaction">
                  <Plus className="w-3 h-3 mr-1" /> Log
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {showNewInteraction && (
                <div className="px-5 py-4 border-b bg-muted/30 space-y-3">
                  <div className="flex gap-3">
                    <Select value={newInteractionType} onValueChange={setNewInteractionType}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="linkedin">LinkedIn</SelectItem>
                        <SelectItem value="note">Note</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Subject" value={newInteractionSubject} onChange={(e) => setNewInteractionSubject(e.target.value)} className="h-8 text-xs" data-testid="input-interaction-subject" />
                  </div>
                  <Textarea placeholder="Details (optional)" value={newInteractionBody} onChange={(e) => setNewInteractionBody(e.target.value)} className="text-xs min-h-[60px]" data-testid="input-interaction-body" />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowNewInteraction(false)}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs" onClick={addInteraction} data-testid="button-save-interaction">Save</Button>
                  </div>
                </div>
              )}
              {interactions.length === 0 && !showNewInteraction ? (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">No interactions logged yet</p>
              ) : (
                <div className="divide-y divide-border">
                  {interactions.map((i) => (
                    <div key={i.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{i.interaction_type}</Badge>
                          <span className="text-sm font-medium">{i.subject}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {format(new Date(i.occurred_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {i.body && <p className="text-xs text-muted-foreground mt-1">{i.body}</p>}
                      {i.logged_by && <p className="text-[10px] text-muted-foreground mt-0.5">by {i.logged_by}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — CRM controls */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">CRM Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Warmth</label>
                <Select value={warmth} onValueChange={setWarmth}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-warmth"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold">Cold</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="hot">Hot</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Relationship</label>
                <Select value={relationshipStatus} onValueChange={setRelationshipStatus}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-relationship"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="engaged">Engaged</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="speaker">Speaker</SelectItem>
                    <SelectItem value="sponsor">Sponsor</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Assigned to</label>
                <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Team member" className="h-8 text-xs" data-testid="input-assigned" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Next action</label>
                <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Follow up, send invite..." className="h-8 text-xs" data-testid="input-next-action" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">CRM Notes</label>
                <Textarea value={crmNotes} onChange={(e) => setCrmNotes(e.target.value)} placeholder="Notes about this contact..." className="text-xs min-h-[80px]" data-testid="input-crm-notes" />
              </div>

              <Button onClick={saveContact} disabled={saving} className="w-full h-8 text-xs" data-testid="button-save-contact">
                <Save className="w-3 h-3 mr-1.5" /> {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source</span>
                <span>{contact.source_type ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confidence</span>
                <span>{contact.confidence ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Added</span>
                <span className="tabular-nums">{format(new Date(contact.created_at), 'MMM d, yyyy')}</span>
              </div>
              {contact.last_contacted && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last contacted</span>
                  <span className="tabular-nums">{format(new Date(contact.last_contacted), 'MMM d, yyyy')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
