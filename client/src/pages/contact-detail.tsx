import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { EmailComposeDialog } from '@/components/email-compose-dialog';
import { EmailHistory } from '@/components/email-history';
import {
  ArrowLeft, Building2, Mail, Phone, Linkedin, Globe, Edit2, Check, X,
  Tag, Plus, Trash2, MessageSquare, Send, Eye, Calendar, User, Briefcase,
  Star, MailPlus, ChevronRight
} from 'lucide-react';

interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
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
  is_verified: boolean;
  created_at: string;
  organizations: { id: number; name: string } | null;
}

interface ContactEmail {
  id: number;
  email: string;
  label: string;
  is_primary: boolean;
  source: string | null;
}

interface ContactTag {
  tag_id: number;
  tags: { id: number; name: string; category: string | null };
}

interface Interaction {
  id: number;
  interaction_type: string;
  subject: string | null;
  body: string | null;
  logged_by: string | null;
  occurred_at: string;
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

const warmthOptions = ['hot', 'warm', 'cool', 'cold'];
const seniorityOptions = ['C-Suite', 'VP', 'SVP', 'EVP', 'Director', 'Manager', 'Individual Contributor'];
const relationshipOptions = ['prospect', 'active', 'inactive', 'lost', 'do-not-contact'];
const warmthColor: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cool: 'bg-sky-100 text-sky-700',
  cold: 'bg-blue-100 text-blue-700',
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [contact, setContact] = useState<Contact | null>(null);
  const [emails, setEmails] = useState<ContactEmail[]>([]);
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [allTags, setAllTags] = useState<{ id: number; name: string; category: string | null }[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Email compose
  const [composeOpen, setComposeOpen] = useState(false);
  const [emailRefreshKey, setEmailRefreshKey] = useState(0);

  // Add email dialog
  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState({ email: '', label: 'work' });

  // Add interaction dialog
  const [addInteractionOpen, setAddInteractionOpen] = useState(false);
  const [newInteraction, setNewInteraction] = useState({ type: 'note', subject: '', body: '' });

  // Add tag
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState<string>('');

  // Org search
  const [orgSearchOpen, setOrgSearchOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgResults, setOrgResults] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  async function loadAll() {
    setLoading(true);
    const contactId = parseInt(id!);

    const [contactRes, emailsRes, tagsRes, allTagsRes, interactionsRes, sightingsRes] = await Promise.all([
      supabase.from('contacts').select('*, organizations(id, name)').eq('id', contactId).single(),
      supabase.from('contact_emails').select('id, email, label, is_primary, source').eq('contact_id', contactId).order('is_primary', { ascending: false }),
      supabase.from('contact_tags').select('tag_id, tags(id, name, category)').eq('contact_id', contactId),
      supabase.from('tags').select('id, name, category').order('name'),
      supabase.from('interactions').select('*').eq('contact_id', contactId).order('occurred_at', { ascending: false }).limit(50),
      supabase.from('sightings').select('*').eq('contact_id', contactId).order('found_at', { ascending: false }).limit(50),
    ]);

    setContact(contactRes.data as unknown as Contact);
    setEmails((emailsRes.data ?? []) as unknown as ContactEmail[]);
    setContactTags((tagsRes.data ?? []) as unknown as ContactTag[]);
    setAllTags((allTagsRes.data ?? []) as unknown as { id: number; name: string; category: string | null }[]);
    setInteractions((interactionsRes.data ?? []) as unknown as Interaction[]);
    setSightings((sightingsRes.data ?? []) as unknown as Sighting[]);
    setLoading(false);
  }

  async function saveField(field: string, value: string | null) {
    if (!contact) return;
    const update: any = { [field]: value || null, updated_at: new Date().toISOString() };
    // If changing first/last name, update full_name too
    if (field === 'first_name') update.full_name = `${value} ${contact.last_name}`;
    if (field === 'last_name') update.full_name = `${contact.first_name} ${value}`;

    const { error } = await supabase.from('contacts').update(update).eq('id', contact.id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved' });
      setContact(prev => prev ? { ...prev, ...update } : prev);
    }
    setEditingField(null);
  }

  async function addEmail() {
    if (!contact || !newEmail.email.trim()) return;
    const isPrimary = emails.length === 0;
    const { error } = await supabase.from('contact_emails').insert({
      contact_id: contact.id,
      email: newEmail.email.trim(),
      label: newEmail.label,
      is_primary: isPrimary,
      source: 'manual',
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Also update primary email on contact if this is the first/primary one
      if (isPrimary) {
        await supabase.from('contacts').update({ email: newEmail.email.trim() }).eq('id', contact.id);
        setContact(prev => prev ? { ...prev, email: newEmail.email.trim() } : prev);
      }
      toast({ title: 'Email added' });
      setAddEmailOpen(false);
      setNewEmail({ email: '', label: 'work' });
      loadAll();
    }
  }

  async function deleteEmail(emailId: number) {
    const { error } = await supabase.from('contact_emails').delete().eq('id', emailId);
    if (!error) {
      toast({ title: 'Email removed' });
      loadAll();
    }
  }

  async function setPrimaryEmail(emailId: number, emailAddr: string) {
    if (!contact) return;
    // Unset all, then set the one
    await supabase.from('contact_emails').update({ is_primary: false }).eq('contact_id', contact.id);
    await supabase.from('contact_emails').update({ is_primary: true }).eq('id', emailId);
    await supabase.from('contacts').update({ email: emailAddr }).eq('id', contact.id);
    setContact(prev => prev ? { ...prev, email: emailAddr } : prev);
    toast({ title: 'Primary email updated' });
    loadAll();
  }

  async function addTag() {
    if (!contact || !selectedTagId) return;
    const { error } = await supabase.from('contact_tags').insert({
      contact_id: contact.id,
      tag_id: parseInt(selectedTagId),
      tagged_by: user?.email ?? 'dashboard',
    });
    if (error) {
      if (error.code === '23505') toast({ title: 'Already tagged' });
      else toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tag added' });
    }
    setAddTagOpen(false);
    setSelectedTagId('');
    loadAll();
  }

  async function removeTag(tagId: number) {
    if (!contact) return;
    await supabase.from('contact_tags').delete().eq('contact_id', contact.id).eq('tag_id', tagId);
    toast({ title: 'Tag removed' });
    loadAll();
  }

  async function addInteraction() {
    if (!contact || !newInteraction.subject.trim()) return;
    const { error } = await supabase.from('interactions').insert({
      contact_id: contact.id,
      interaction_type: newInteraction.type,
      subject: newInteraction.subject.trim(),
      body: newInteraction.body.trim() || null,
      logged_by: user?.email ?? 'dashboard',
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Interaction logged' });
      setAddInteractionOpen(false);
      setNewInteraction({ type: 'note', subject: '', body: '' });
      loadAll();
    }
  }

  async function deleteContact() {
    if (!contact) return;
    const { error } = await supabase.from('contacts').delete().eq('id', contact.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contact deleted' });
      navigate('/contacts');
    }
  }

  async function searchOrgs(q: string) {
    setOrgSearch(q);
    if (q.length < 2) { setOrgResults([]); return; }
    const { data } = await supabase.from('organizations').select('id, name').ilike('name', `%${q}%`).limit(10);
    setOrgResults((data ?? []) as { id: number; name: string }[]);
  }

  async function changeOrg(orgId: number, orgName: string) {
    if (!contact) return;
    await supabase.from('contacts').update({ org_id: orgId }).eq('id', contact.id);
    setContact(prev => prev ? { ...prev, org_id: orgId, organizations: { id: orgId, name: orgName } as any } : prev);
    setOrgSearchOpen(false);
    toast({ title: 'Organization updated' });
  }

  async function migrateEmailToContactEmails() {
    if (!contact?.email) return;
    const { error } = await supabase.from('contact_emails').insert({
      contact_id: contact.id,
      email: contact.email,
      label: 'work',
      is_primary: true,
      source: 'migrated',
    });
    if (!error) {
      toast({ title: 'Email migrated to multi-email system' });
      loadAll();
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Contact not found</p>
        <Link href="/contacts" className="text-primary text-sm hover:underline mt-2 inline-block">Back to contacts</Link>
      </div>
    );
  }

  // Which emails to use for compose? Prefer contact_emails, fall back to contact.email
  const primaryEmail = emails.find(e => e.is_primary)?.email ?? contact.email;
  const availableTagsToAdd = allTags.filter(t => !contactTags.some(ct => ct.tag_id === t.id));

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/contacts" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Contacts
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{contact.full_name}</span>
      </div>

      {/* Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <EditableField
                value={contact.full_name}
                field="full_name"
                editing={editingField}
                editValue={editValue}
                onStartEdit={(field, val) => { setEditingField(field); setEditValue(val); }}
                onSave={(field, val) => saveField(field, val)}
                onCancel={() => setEditingField(null)}
                setEditValue={setEditValue}
                className="text-xl font-semibold"
              />
              <EditableField
                value={contact.title ?? ''}
                field="title"
                editing={editingField}
                editValue={editValue}
                onStartEdit={(field, val) => { setEditingField(field); setEditValue(val); }}
                onSave={(field, val) => saveField(field, val)}
                onCancel={() => setEditingField(null)}
                setEditValue={setEditValue}
                className="text-sm text-muted-foreground"
                placeholder="Add title..."
              />
            </div>
            <div className="flex items-center gap-2">
              {primaryEmail && (
                <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)} className="gap-1.5 h-8">
                  <Send className="w-3.5 h-3.5" /> Email
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Contact</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {contact.full_name}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteContact} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Key fields grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
            <FieldDisplay
              icon={Briefcase}
              label="Seniority"
              render={
                <SelectField
                  value={contact.seniority ?? ''}
                  options={seniorityOptions}
                  onSave={(val) => saveField('seniority', val)}
                  placeholder="Set seniority..."
                />
              }
            />
            <FieldDisplay
              icon={Star}
              label="Warmth"
              render={
                <SelectField
                  value={contact.warmth ?? ''}
                  options={warmthOptions}
                  onSave={(val) => saveField('warmth', val)}
                  placeholder="Set warmth..."
                  renderValue={(val) => (
                    <Badge variant="secondary" className={`text-xs px-2 py-0.5 ${warmthColor[val] ?? ''}`}>{val}</Badge>
                  )}
                />
              }
            />
            <FieldDisplay
              icon={User}
              label="Status"
              render={
                <SelectField
                  value={contact.relationship_status ?? ''}
                  options={relationshipOptions}
                  onSave={(val) => saveField('relationship_status', val)}
                  placeholder="Set status..."
                />
              }
            />
            <FieldDisplay
              icon={User}
              label="Assigned To"
              render={
                <EditableField
                  value={contact.assigned_to ?? ''}
                  field="assigned_to"
                  editing={editingField}
                  editValue={editValue}
                  onStartEdit={(field, val) => { setEditingField(field); setEditValue(val); }}
                  onSave={(field, val) => saveField(field, val)}
                  onCancel={() => setEditingField(null)}
                  setEditValue={setEditValue}
                  className="text-sm"
                  placeholder="Assign..."
                />
              }
            />
          </div>

          {/* Organization */}
          <div className="mt-4 pt-4 border-t flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">Org</span>
            {contact.organizations ? (
              <div className="flex items-center gap-2">
                <Link href={`/organizations/${(contact.organizations as any).id}`} className="text-sm font-medium text-primary hover:underline">
                  {(contact.organizations as any).name}
                </Link>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setOrgSearchOpen(true)}>Change</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setOrgSearchOpen(true)}>
                <Plus className="w-3 h-3 mr-1" /> Set organization
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Emails, Tags, Details */}
        <div className="lg:col-span-1 space-y-4">
          {/* Emails Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" /> Email Addresses
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAddEmailOpen(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {emails.length === 0 && contact.email && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs">
                    <span>{contact.email}</span>
                    <Badge variant="outline" className="text-[9px]">legacy</Badge>
                  </div>
                  <Button size="sm" variant="outline" className="w-full h-7 text-[10px]" onClick={migrateEmailToContactEmails}>
                    <MailPlus className="w-3 h-3 mr-1" /> Migrate to multi-email
                  </Button>
                </div>
              )}
              {emails.length === 0 && !contact.email && (
                <p className="text-xs text-muted-foreground py-2 text-center">No emails on file</p>
              )}
              {emails.map(e => (
                <div key={e.id} className="flex items-center justify-between p-2 bg-muted/20 rounded group">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{e.email}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{e.label}</Badge>
                      {e.is_primary && <Badge className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-0">Primary</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!e.is_primary && (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={() => setPrimaryEmail(e.id, e.email)}>
                        <Star className="w-3 h-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-destructive" onClick={() => deleteEmail(e.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tags Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground" /> Tags
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAddTagOpen(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contactTags.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No tags</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {contactTags.map(ct => (
                    <Badge key={ct.tag_id} variant="secondary" className="text-xs px-2 py-1 gap-1 group">
                      <Link href={`/tags/${ct.tag_id}`} className="hover:underline">{ct.tags.name}</Link>
                      <button onClick={() => removeTag(ct.tag_id)} className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contact Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow icon={Phone} label="Phone">
                <EditableField
                  value={contact.phone ?? ''} field="phone" editing={editingField} editValue={editValue}
                  onStartEdit={(f, v) => { setEditingField(f); setEditValue(v); }}
                  onSave={(f, v) => saveField(f, v)} onCancel={() => setEditingField(null)}
                  setEditValue={setEditValue} className="text-sm" placeholder="Add phone..."
                />
              </DetailRow>
              <DetailRow icon={Linkedin} label="LinkedIn">
                <EditableField
                  value={contact.linkedin_url ?? ''} field="linkedin_url" editing={editingField} editValue={editValue}
                  onStartEdit={(f, v) => { setEditingField(f); setEditValue(v); }}
                  onSave={(f, v) => saveField(f, v)} onCancel={() => setEditingField(null)}
                  setEditValue={setEditValue} className="text-sm" placeholder="Add LinkedIn..."
                  renderDisplay={contact.linkedin_url ? (
                    <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate block max-w-[200px]">
                      {contact.linkedin_url.replace('https://www.linkedin.com/in/', '').replace('/', '')}
                    </a>
                  ) : undefined}
                />
              </DetailRow>
              <DetailRow icon={User} label="Gender">
                <SelectField value={contact.gender ?? ''} options={['Female', 'Male', 'Non-binary', 'Unknown']} onSave={val => saveField('gender', val)} placeholder="Set gender..." />
              </DetailRow>
              <DetailRow icon={Globe} label="Source">
                <span className="text-sm text-muted-foreground">{contact.source_type ?? '—'}</span>
              </DetailRow>
              <DetailRow icon={Calendar} label="Added">
                <span className="text-sm text-muted-foreground">{new Date(contact.created_at).toLocaleDateString()}</span>
              </DetailRow>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableTextarea
                value={contact.crm_notes ?? ''}
                onSave={val => saveField('crm_notes', val)}
                placeholder="Add notes about this contact..."
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Timeline, Emails, Sightings */}
        <div className="lg:col-span-2 space-y-4">
          {/* Interactions */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" /> Interactions ({interactions.length})
                </CardTitle>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddInteractionOpen(true)}>
                  <Plus className="w-3 h-3" /> Log Interaction
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {interactions.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground text-center">No interactions logged yet</p>
              ) : (
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {interactions.map(i => (
                    <div key={i.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{i.interaction_type}</Badge>
                          <span className="text-sm font-medium">{i.subject ?? 'No subject'}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(i.occurred_at).toLocaleDateString()}
                        </span>
                      </div>
                      {i.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{i.body}</p>}
                      {i.logged_by && <p className="text-[10px] text-muted-foreground mt-1">by {i.logged_by}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email History */}
          <EmailHistory contactId={parseInt(id!)} refreshKey={emailRefreshKey} />

          {/* Sightings */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted-foreground" /> Sightings ({sightings.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sightings.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground text-center">No sightings recorded</p>
              ) : (
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {sightings.map(s => (
                    <div key={s.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{s.source_type}</Badge>
                          <span className="text-sm font-medium">{s.source_name ?? 'Unknown source'}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(s.found_at).toLocaleDateString()}
                        </span>
                      </div>
                      {s.context && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.context}</p>}
                      {s.detail_value && <p className="text-xs mt-1"><span className="text-muted-foreground">{s.detail_type}:</span> {s.detail_value}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Email Compose Dialog */}
      {primaryEmail && (
        <EmailComposeDialog
          contactId={contact.id}
          contactEmail={primaryEmail}
          contactName={contact.full_name}
          open={composeOpen}
          onOpenChange={setComposeOpen}
          onEmailSent={() => setEmailRefreshKey(k => k + 1)}
        />
      )}

      {/* Add Email Dialog */}
      <Dialog open={addEmailOpen} onOpenChange={setAddEmailOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle className="text-base">Add Email Address</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={newEmail.email} onChange={e => setNewEmail(p => ({ ...p, email: e.target.value }))} className="h-8 text-sm" placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Select value={newEmail.label} onValueChange={val => setNewEmail(p => ({ ...p, label: val }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddEmailOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={addEmail}>Add Email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Tag Dialog */}
      <Dialog open={addTagOpen} onOpenChange={setAddTagOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle className="text-base">Add Tag</DialogTitle></DialogHeader>
          <div className="py-2">
            <Select value={selectedTagId} onValueChange={setSelectedTagId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select tag..." /></SelectTrigger>
              <SelectContent>
                {availableTagsToAdd.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name} {t.category && <span className="text-muted-foreground ml-1">({t.category})</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddTagOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={addTag} disabled={!selectedTagId}>Add Tag</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Interaction Dialog */}
      <Dialog open={addInteractionOpen} onOpenChange={setAddInteractionOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader><DialogTitle className="text-base">Log Interaction</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={newInteraction.type} onValueChange={val => setNewInteraction(p => ({ ...p, type: val }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input value={newInteraction.subject} onChange={e => setNewInteraction(p => ({ ...p, subject: e.target.value }))} className="h-8 text-sm" placeholder="Brief description..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Details (optional)</Label>
              <Textarea value={newInteraction.body} onChange={e => setNewInteraction(p => ({ ...p, body: e.target.value }))} className="text-sm min-h-[80px]" placeholder="Additional details..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddInteractionOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={addInteraction}>Log It</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Org Search Dialog */}
      <Dialog open={orgSearchOpen} onOpenChange={setOrgSearchOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle className="text-base">Change Organization</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={orgSearch} onChange={e => searchOrgs(e.target.value)} placeholder="Search organizations..." className="h-9 text-sm" />
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              {orgResults.map(org => (
                <button key={org.id} onClick={() => changeOrg(org.id, org.name)}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
                  {org.name}
                </button>
              ))}
              {orgSearch.length >= 2 && orgResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No organizations found</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Helper Components ── */

function EditableField({ value, field, editing, editValue, onStartEdit, onSave, onCancel, setEditValue, className, placeholder, renderDisplay }: {
  value: string; field: string; editing: string | null; editValue: string;
  onStartEdit: (field: string, val: string) => void; onSave: (field: string, val: string) => void;
  onCancel: () => void; setEditValue: (v: string) => void;
  className?: string; placeholder?: string; renderDisplay?: React.ReactNode;
}) {
  if (editing === field) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(field, editValue); if (e.key === 'Escape') onCancel(); }}
          className="h-7 text-sm"
        />
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onSave(field, editValue)}>
          <Check className="w-3.5 h-3.5 text-green-600" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCancel}>
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1 cursor-pointer" onClick={() => onStartEdit(field, value)}>
      {renderDisplay ?? (
        <span className={`${className ?? ''} ${!value ? 'text-muted-foreground/50 italic' : ''}`}>
          {value || placeholder || 'Click to edit...'}
        </span>
      )}
      <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  );
}

function SelectField({ value, options, onSave, placeholder, renderValue }: {
  value: string; options: string[]; onSave: (val: string) => void; placeholder?: string;
  renderValue?: (val: string) => React.ReactNode;
}) {
  return (
    <Select value={value || '_none'} onValueChange={val => onSave(val === '_none' ? '' : val)}>
      <SelectTrigger className="h-7 text-xs border-0 shadow-none px-0 w-auto min-w-[80px] hover:bg-muted/50 rounded">
        <SelectValue>
          {value ? (renderValue ? renderValue(value) : <span className="text-sm">{value}</span>) : (
            <span className="text-sm text-muted-foreground/50 italic">{placeholder ?? 'Set...'}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none"><span className="text-muted-foreground">None</span></SelectItem>
        {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function FieldDisplay({ icon: Icon, label, render }: { icon: any; label: string; render: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase">{label}</span>
      </div>
      {render}
    </div>
  );
}

function DetailRow({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
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
      {value ? (
        <p className="text-sm whitespace-pre-wrap">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground/50 italic">{placeholder}</p>
      )}
      <p className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1">Click to edit</p>
    </div>
  );
}
