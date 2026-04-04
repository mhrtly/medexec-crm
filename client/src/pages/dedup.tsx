import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Merge, Star, X,
  Sparkles, Mail, Linkedin, Phone, Shield,
  CheckCircle2, ArrowRight, Loader2, Keyboard,
  Play, Square, Bot,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DedupContact {
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
  gender: string | null;
  org_id: number | null;
  company: string | null;
  warmth: string | null;
  relationship_status: string | null;
  crm_notes: string | null;
  profile_notes: string | null;
  source_type: string | null;
  is_verified: boolean | null;
  confidence: string | null;
  assigned_to: string | null;
  created_at: string;
}

interface DedupCluster {
  cluster_id: number;
  score: number;
  match_reasons: string[];
  contacts: DedupContact[];
  _aiAnalysis?: AiAnalysis | null;
  _aiStatus?: 'pending' | 'analyzing' | 'done' | 'skipped' | 'error';
}

interface AiAnalysis {
  same_person: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  recommended_canonical: 'a' | 'b';
  canonical_reason?: string;
  error?: string;
}

interface MergePreview {
  cluster: DedupCluster;
  canonicalId: number;
}

// ---------------------------------------------------------------------------
// Session storage key for persisting clusters
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'dedup-clusters-v1';

function saveClusters(clusters: DedupCluster[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clusters));
  } catch { /* quota exceeded — ignore */ }
}

function loadClusters(): DedupCluster[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearClusters() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Local dashboard AI endpoint
// ---------------------------------------------------------------------------
const AI_BASE = 'http://127.0.0.1:8099';

// ---------------------------------------------------------------------------
// Haiku collection — localStorage + local file on disk via dashboard
// ---------------------------------------------------------------------------
const HAIKU_KEY = 'dedup-haikus';

function saveHaiku(haiku: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(HAIKU_KEY) || '[]') as string[];
    // Avoid duplicates
    if (!existing.includes(haiku)) {
      existing.unshift(haiku);
      // Keep last 200
      localStorage.setItem(HAIKU_KEY, JSON.stringify(existing.slice(0, 200)));
    }
  } catch { /* ignore */ }
}

function loadHaikus(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HAIKU_KEY) || '[]');
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function completenessScore(c: DedupContact): number {
  let s = 0;
  if (c.email) s += 3;
  if (c.linkedin_url) s += 2;
  if (c.phone) s += 1;
  if (c.bio) s += 2;
  if (c.crm_notes) s += 5;
  if (c.is_verified) s += 5;
  if (c.warmth && c.warmth !== 'cold') s += 3;
  if (c.seniority) s += 2;
  if (c.assigned_to) s += 1;
  if (c.profile_notes) s += 1;
  return s;
}

function suggestCanonical(contacts: DedupContact[]): number {
  let best = contacts[0];
  let bestScore = completenessScore(best);
  for (let i = 1; i < contacts.length; i++) {
    const s = completenessScore(contacts[i]);
    if (s > bestScore) {
      best = contacts[i];
      bestScore = s;
    }
  }
  return best.id;
}

function fieldFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

const COMPARE_FIELDS: { key: keyof DedupContact; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'linkedin_url', label: 'LinkedIn' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'bio', label: 'Bio' },
  { key: 'crm_notes', label: 'CRM Notes' },
  { key: 'profile_notes', label: 'Profile Notes' },
  { key: 'warmth', label: 'Warmth' },
  { key: 'relationship_status', label: 'Status' },
  { key: 'assigned_to', label: 'Assigned To' },
  { key: 'source_type', label: 'Source' },
  { key: 'gender', label: 'Gender' },
];

/** Build a human-readable merge summary for the interaction log. */
function buildMergeSummary(
  canonical: DedupContact,
  merged: DedupContact,
  cluster: DedupCluster,
  actor: string,
): { subject: string; body: string } {
  const fieldsFilled: string[] = [];
  const fieldsPreserved: string[] = [];

  for (const f of COMPARE_FIELDS) {
    const kFilled = fieldFilled(canonical[f.key]);
    const mFilled = fieldFilled(merged[f.key]);
    if (mFilled && !kFilled) fieldsFilled.push(f.label);
    else if (kFilled) fieldsPreserved.push(f.label);
  }

  const subject = `Merged with ${merged.full_name} (#${merged.id})`;
  const lines = [
    `Merged #${merged.id} (${merged.full_name}) into this contact.`,
    `Score: ${cluster.score} | Reasons: ${cluster.match_reasons.join(', ')}`,
  ];
  if (fieldsFilled.length > 0) lines.push(`Fields filled from merged record: ${fieldsFilled.join(', ')}`);
  if (fieldsPreserved.length > 0) lines.push(`Fields preserved (already had values): ${fieldsPreserved.join(', ')}`);
  if (cluster._aiAnalysis) {
    const ai = cluster._aiAnalysis;
    lines.push(`AI assessment: ${ai.same_person ? 'same person' : 'different people'} (${ai.confidence} confidence)`);
    if (ai.reasoning) lines.push(`AI reasoning: ${ai.reasoning}`);
  }
  lines.push(`Merged by: ${actor} via Dedup`);

  return { subject, body: lines.join('\n') };
}

const reasonColors: Record<string, string> = {
  'exact name': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'same email': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'same LinkedIn': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  'same last name + org': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'similar first name': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'name variant': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

// ---------------------------------------------------------------------------
// Merge Preview Panel
// ---------------------------------------------------------------------------
function MergePreviewPanel({
  cluster, canonicalId, onConfirm, onCancel, merging,
}: {
  cluster: DedupCluster;
  canonicalId: number;
  onConfirm: () => void;
  onCancel: () => void;
  merging: boolean;
}) {
  const keeper = cluster.contacts.find(c => c.id === canonicalId)!;
  const merging_contact = cluster.contacts.find(c => c.id !== canonicalId)!;

  const changes: { icon: string; text: string }[] = [];

  for (const f of COMPARE_FIELDS) {
    const kVal = keeper[f.key];
    const mVal = merging_contact[f.key];
    const kFilled = fieldFilled(kVal);
    const mFilled = fieldFilled(mVal);

    if (mFilled && !kFilled) {
      changes.push({ icon: '+', text: `${f.label} "${String(mVal).slice(0, 60)}" will fill empty field` });
    } else if (mFilled && kFilled && String(kVal).toLowerCase() !== String(mVal).toLowerCase()) {
      changes.push({ icon: '~', text: `${f.label} differs — keeper's value preserved` });
    } else if (kFilled && mFilled) {
      changes.push({ icon: '=', text: `${f.label} already matches` });
    }
  }

  if (merging_contact.email && merging_contact.email !== keeper.email) {
    changes.unshift({ icon: '+', text: `Email "${merging_contact.email}" will be added to contact_emails` });
  }

  return (
    <AlertDialogContent className="max-w-lg">
      <AlertDialogHeader>
        <AlertDialogTitle className="flex items-center gap-2">
          <Merge className="w-4 h-4 text-primary" />
          Merge Preview
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Keeping:</span>
              <span>{keeper.full_name}</span>
              <Badge variant="outline" className="text-[10px]">#{keeper.id}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">Merging:</span>
              <span>{merging_contact.full_name}</span>
              <Badge variant="outline" className="text-[10px]">#{merging_contact.id}</Badge>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">will be archived</span>
            </div>

            {cluster._aiAnalysis && (
              <div className="border rounded-md p-2 bg-purple-50/50 dark:bg-purple-900/10 text-xs">
                <span className="font-medium">AI says:</span>{' '}
                {cluster._aiAnalysis.same_person ? 'Same person' : 'Different people'}{' '}
                ({cluster._aiAnalysis.confidence} confidence)
                {cluster._aiAnalysis.reasoning && (
                  <p className="mt-0.5 text-muted-foreground">{cluster._aiAnalysis.reasoning}</p>
                )}
              </div>
            )}

            <div className="border rounded-md p-3 space-y-1.5 bg-muted/30 max-h-[250px] overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">What happens:</p>
              {changes.length === 0 && (
                <p className="text-xs text-muted-foreground">No field changes — records are identical.</p>
              )}
              {changes.map((ch, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={`shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    ch.icon === '+' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : ch.icon === '~' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground'
                  }`}>
                    {ch.icon === '+' ? '+' : ch.icon === '~' ? '~' : '='}
                  </span>
                  <span>{ch.text}</span>
                </div>
              ))}
              <div className="flex items-start gap-2 text-xs mt-1">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">+</span>
                <span>All sightings, tags, emails, and interactions will be transferred</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">i</span>
                <span>Full snapshot saved to merge_history for audit</span>
              </div>
            </div>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel} disabled={merging}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} disabled={merging} className="gap-1.5">
          {merging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
          {merging ? 'Merging...' : 'Confirm Merge'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

// ---------------------------------------------------------------------------
// Contact Card (inside a cluster)
// ---------------------------------------------------------------------------
function ContactCard({
  contact, isCanonical, onSelect,
}: {
  contact: DedupContact;
  isCanonical: boolean;
  onSelect: () => void;
}) {
  const score = completenessScore(contact);
  const filledCount = COMPARE_FIELDS.filter(f => fieldFilled(contact[f.key])).length;

  return (
    <button
      onClick={onSelect}
      className={`text-left rounded-lg border-2 p-4 transition-all w-full ${
        isCanonical
          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-muted-foreground/30 bg-card'
      }`}
    >
      {isCanonical && (
        <div className="flex items-center gap-1.5 mb-2">
          <Star className="w-3.5 h-3.5 text-primary fill-primary" />
          <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">Keep this one</span>
        </div>
      )}

      <div className="space-y-2">
        <div>
          <p className="font-semibold text-sm">{contact.full_name}</p>
          {contact.title && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{contact.title}</p>
          )}
          {contact.company && (
            <p className="text-xs text-muted-foreground">{contact.company}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {contact.email && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
              <Mail className="w-2.5 h-2.5" /> {contact.email}
            </span>
          )}
          {contact.linkedin_url && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
              <Linkedin className="w-2.5 h-2.5" /> LinkedIn
            </span>
          )}
          {contact.phone && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
              <Phone className="w-2.5 h-2.5" /> {contact.phone}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
          {contact.is_verified && (
            <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400">
              <Shield className="w-2.5 h-2.5" /> verified
            </span>
          )}
          {contact.seniority && <span>{contact.seniority}</span>}
          <span className="ml-auto">{filledCount}/{COMPARE_FIELDS.length} fields</span>
          <span className="tabular-nums">score {score}</span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cluster Card
// ---------------------------------------------------------------------------
function ClusterCard({
  cluster, index, canonicalId, onSetCanonical, onMerge, onDismiss, focused,
}: {
  cluster: DedupCluster;
  index: number;
  canonicalId: number;
  onSetCanonical: (id: number) => void;
  onMerge: () => void;
  onDismiss: () => void;
  focused: boolean;
}) {
  const scoreColor =
    cluster.score >= 80 ? 'text-red-600 dark:text-red-400'
    : cluster.score >= 50 ? 'text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground';

  const aiStatusBadge = cluster._aiStatus === 'done' && cluster._aiAnalysis ? (
    <Badge
      variant="outline"
      className={`text-[10px] ${
        cluster._aiAnalysis.same_person && cluster._aiAnalysis.confidence === 'high'
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          : cluster._aiAnalysis.same_person
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      <Bot className="w-2.5 h-2.5 mr-0.5" />
      {cluster._aiAnalysis.same_person
        ? `AI: same (${cluster._aiAnalysis.confidence})`
        : `AI: different`}
    </Badge>
  ) : cluster._aiStatus === 'analyzing' ? (
    <Badge variant="outline" className="text-[10px]">
      <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" /> Analyzing...
    </Badge>
  ) : cluster._aiStatus === 'skipped' ? (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      AI: skipped
    </Badge>
  ) : null;

  return (
    <Card className={`transition-all ${focused ? 'ring-2 ring-primary/40' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono">#{index + 1}</span>
            <CardTitle className="text-sm font-semibold">
              Score: <span className={scoreColor}>{cluster.score}</span>
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {cluster.match_reasons.map((r, i) => (
                <Badge key={i} variant="secondary" className={`text-[10px] ${reasonColors[r] || ''}`}>
                  {r}
                </Badge>
              ))}
            </div>
            {aiStatusBadge}
          </div>
          {cluster._aiAnalysis?.reasoning && (
            <p className="text-[10px] text-muted-foreground italic w-full mt-1 pl-8">
              {cluster._aiAnalysis.reasoning}
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {cluster.contacts.map(c => (
            <ContactCard
              key={c.id}
              contact={c}
              isCanonical={c.id === canonicalId}
              onSelect={() => onSetCanonical(c.id)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button size="sm" onClick={onMerge} className="gap-1.5 h-8">
            <Merge className="w-3.5 h-3.5" />
            Merge
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} className="gap-1.5 h-8 text-muted-foreground">
            <X className="w-3.5 h-3.5" />
            Not a Duplicate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function DedupPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [clusters, setClusters] = useState<DedupCluster[]>([]);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  const [canonicals, setCanonicals] = useState<Record<number, number>>({});
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [haikus, setHaikus] = useState<string[]>(loadHaikus());
  const [showHaikus, setShowHaikus] = useState(false);
  const [latestPoem, setLatestPoem] = useState<string | null>(null);
  const latestPoemTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-merge state
  const [autoPilot, setAutoPilot] = useState(false);
  const autoPilotRef = useRef(false); // ref for the async loop to check
  const [autoPilotStatus, setAutoPilotStatus] = useState('');
  const [autoPilotStats, setAutoPilotStats] = useState({ merged: 0, dismissed: 0, skipped: 0, total: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Load cached clusters on mount
  useEffect(() => {
    const cached = loadClusters();
    if (cached && cached.length > 0) {
      setClusters(cached);
    }
  }, []);

  // Save clusters to sessionStorage whenever they change
  useEffect(() => {
    if (clusters.length > 0) {
      saveClusters(clusters);
    }
  }, [clusters]);

  // Check if local AI backend is reachable + fetch any saved haikus from disk
  useEffect(() => {
    fetch(`${AI_BASE}/api/haikus`, { mode: 'cors' })
      .then(r => { if (r.ok) { setAiAvailable(true); return r.json(); } return null; })
      .then(data => {
        if (data?.haikus?.length) {
          // Merge disk haikus into localStorage
          const local = loadHaikus();
          const merged = [...new Set([...data.haikus, ...local])];
          localStorage.setItem(HAIKU_KEY, JSON.stringify(merged.slice(0, 200)));
          setHaikus(merged.slice(0, 200));
        }
      })
      .catch(() => setAiAvailable(false));
  }, []);

  // Initialize canonical selections when clusters change
  useEffect(() => {
    const newCanonicals: Record<number, number> = {};
    for (const cl of clusters) {
      if (!canonicals[cl.cluster_id]) {
        newCanonicals[cl.cluster_id] = suggestCanonical(cl.contacts);
      } else {
        newCanonicals[cl.cluster_id] = canonicals[cl.cluster_id];
      }
    }
    setCanonicals(newCanonicals);
  }, [clusters]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (mergePreview) return;

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (clusters.length > 0 && focusedIndex < clusters.length) {
          const cl = clusters[focusedIndex];
          const canonical = canonicals[cl.cluster_id];
          if (canonical) setMergePreview({ cluster: cl, canonicalId: canonical });
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (clusters.length > 0 && focusedIndex < clusters.length) {
          dismissCluster(clusters[focusedIndex]);
        }
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setFocusedIndex(i => Math.min(i + 1, clusters.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setFocusedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [clusters, focusedIndex, canonicals, mergePreview]);

  // Scroll focused cluster into view
  useEffect(() => {
    if (!containerRef.current) return;
    const cards = containerRef.current.querySelectorAll('[data-cluster-card]');
    cards[focusedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedIndex]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  async function scanDuplicates() {
    setScanning(true);
    setClusters([]);
    clearClusters();
    setFocusedIndex(0);
    try {
      const { data, error } = await supabase.rpc('scan_duplicates', {
        score_threshold: 35,
        max_results: 200,
      });
      if (error) throw error;
      const parsed: DedupCluster[] = (data ?? []).map((c: any, i: number) => ({
        ...c,
        cluster_id: c.cluster_id ?? i + 1,
      }));
      setClusters(parsed);
      if (parsed.length === 0) {
        toast({ title: 'No duplicates found', description: 'All contacts look unique.' });
      } else {
        toast({ title: `Found ${parsed.length} potential duplicates`, description: 'Review and merge or dismiss each cluster.' });
      }
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  }

  /** Core merge logic — used by both manual merge and AI auto-pilot */
  async function executeMerge(
    cluster: DedupCluster,
    canonicalId: number,
    actor: string = user?.email ?? 'staff',
  ) {
    setMerging(true);
    try {
      const canonical = cluster.contacts.find(c => c.id === canonicalId)!;
      const mergedAway = cluster.contacts.filter(c => c.id !== canonicalId);

      // 1. Collect all emails
      const allEmails = new Set<string>();
      for (const c of cluster.contacts) {
        if (c.email) allEmails.add(c.email.toLowerCase());
      }
      const contactIds = cluster.contacts.map(c => c.id);
      const { data: existingEmails } = await supabase
        .from('contact_emails')
        .select('email, contact_id')
        .in('contact_id', contactIds);
      for (const e of (existingEmails ?? [])) {
        allEmails.add(e.email.toLowerCase());
      }

      const { data: canonicalEmails } = await supabase
        .from('contact_emails')
        .select('email')
        .eq('contact_id', canonicalId);
      const existingSet = new Set((canonicalEmails ?? []).map(e => e.email.toLowerCase()));
      for (const email of allEmails) {
        if (!existingSet.has(email)) {
          await supabase.from('contact_emails').insert({
            contact_id: canonicalId, email, label: 'work', is_primary: false, source: 'dedup-merge',
          });
        }
      }

      // 2. Save merge history
      for (const merged of mergedAway) {
        await supabase.from('merge_history').insert({
          canonical_contact_id: canonicalId,
          merged_contact_id: merged.id,
          merged_data: merged,
          merge_note: `Dedup merge (score: ${cluster.score}, reasons: ${cluster.match_reasons.join(', ')})`,
          merged_by: actor,
        });
      }

      // 3. Combine tags
      const { data: allTagData } = await supabase
        .from('contact_tags')
        .select('tag_id')
        .in('contact_id', contactIds);
      const uniqueTagIds = [...new Set((allTagData ?? []).map(t => t.tag_id))];
      for (const tagId of uniqueTagIds) {
        await supabase.from('contact_tags').upsert({
          contact_id: canonicalId, tag_id: tagId, tagged_by: 'dedup-merge',
        }, { onConflict: 'contact_id,tag_id' });
      }

      // 4. Repoint child records
      for (const merged of mergedAway) {
        await supabase.from('sightings').update({ contact_id: canonicalId }).eq('contact_id', merged.id);
        await supabase.from('interactions').update({ contact_id: canonicalId }).eq('contact_id', merged.id);
      }

      // 5. Fill blank fields on canonical from merged + preserve differing data
      const updateData: Record<string, unknown> = {};
      for (const f of COMPARE_FIELDS) {
        if (!fieldFilled(canonical[f.key])) {
          for (const merged of mergedAway) {
            if (fieldFilled(merged[f.key])) {
              updateData[f.key] = merged[f.key];
              break;
            }
          }
        }
      }

      // Collect alternate titles/companies from merged records
      const altLines: string[] = [];
      for (const merged of mergedAway) {
        const diffTitle = fieldFilled(merged.title) && fieldFilled(canonical.title)
          && merged.title?.trim().toLowerCase() !== canonical.title?.trim().toLowerCase();
        const diffCompany = fieldFilled(merged.company) && fieldFilled(canonical.company)
          && merged.company?.trim().toLowerCase() !== canonical.company?.trim().toLowerCase();
        if (diffTitle || diffCompany) {
          const parts: string[] = [];
          if (diffTitle) parts.push(merged.title!);
          if (diffCompany) parts.push(`at ${merged.company!}`);
          altLines.push(`[Also: ${parts.join(' ')} (from #${merged.id})]`);
        }
      }

      const mergedNotes = mergedAway
        .filter(m => m.profile_notes)
        .map(m => `[MERGED from #${m.id}] ${m.profile_notes}`)
        .join('\n');
      const extraNotes = [...altLines, mergedNotes].filter(Boolean).join('\n');
      if (extraNotes) {
        updateData.profile_notes = [canonical.profile_notes, extraNotes].filter(Boolean).join('\n');
      }
      if (Object.keys(updateData).length > 0) {
        await supabase.from('contacts').update(updateData).eq('id', canonicalId);
      }

      // 6. Soft-delete merged contacts
      for (const merged of mergedAway) {
        await supabase.from('contact_emails').delete().eq('contact_id', merged.id);
        await supabase.from('contact_tags').delete().eq('contact_id', merged.id);
        await supabase.from('contacts').update({
          is_duplicate: true,
          duplicate_of: canonicalId,
        }).eq('id', merged.id);
      }

      // 7. Log merge as interaction on the canonical contact
      for (const merged of mergedAway) {
        const { subject, body } = buildMergeSummary(canonical, merged, cluster, actor);
        await supabase.from('interactions').insert({
          contact_id: canonicalId,
          interaction_type: 'merge',
          subject,
          body,
          logged_by: actor,
        });
      }

      // Remove cluster from list
      setClusters(prev => {
        const next = prev.filter(c => c.cluster_id !== cluster.cluster_id);
        saveClusters(next);
        return next;
      });
      setReviewedCount(n => n + 1);
      setMergePreview(null);
      setFocusedIndex(i => Math.min(i, clusters.length - 2));

      toast({
        title: 'Merged successfully',
        description: `${mergedAway.map(m => m.full_name).join(', ')} merged into ${canonical.full_name}.`,
      });
    } catch (err: any) {
      toast({ title: 'Merge failed', description: err.message, variant: 'destructive' });
      throw err; // re-throw so auto-pilot can handle
    } finally {
      setMerging(false);
    }
  }

  const dismissCluster = useCallback(async (cluster: DedupCluster) => {
    try {
      const ids = cluster.contacts.map(c => c.id).sort((a, b) => a - b);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          await supabase.from('dismissed_duplicates').upsert({
            contact_id_a: ids[i],
            contact_id_b: ids[j],
            dismissed_by: user?.email ?? 'staff',
          }, { onConflict: 'contact_id_a,contact_id_b' });
        }
      }
      setClusters(prev => {
        const next = prev.filter(c => c.cluster_id !== cluster.cluster_id);
        saveClusters(next);
        return next;
      });
      setReviewedCount(n => n + 1);
      setFocusedIndex(i => Math.min(i, clusters.length - 2));
      toast({ title: 'Dismissed', description: 'This pair won\'t appear in future scans.' });
    } catch (err: any) {
      toast({ title: 'Dismiss failed', description: err.message, variant: 'destructive' });
    }
  }, [clusters, user, toast]);

  // ---------------------------------------------------------------------------
  // Auto-merge all — algorithmic, no AI needed. Optionally asks AI for a
  // one-line note (fire-and-forget, never blocks the merge).
  // ---------------------------------------------------------------------------
  async function startAutoPilot() {
    autoPilotRef.current = true;
    setAutoPilot(true);
    setAutoPilotStats({ merged: 0, dismissed: 0, skipped: 0, total: 0 });

    let merged = 0;
    let failed = 0;

    while (autoPilotRef.current) {
      // Get latest cluster list
      const currentClusters = await new Promise<DedupCluster[]>(resolve => {
        setClusters(prev => { resolve(prev); return prev; });
      });

      if (currentClusters.length === 0) break;
      const target = currentClusters[0]; // always take the top one

      const a = target.contacts[0];
      const b = target.contacts[1];
      const canonicalId = suggestCanonical(target.contacts);

      setAutoPilotStatus(`Merging ${a.full_name} + ${b.full_name} (${merged + 1}/${merged + currentClusters.length})...`);

      // Fire-and-forget: generate a poem seeded by the person (via dashboard → Groq).
      // No guard — silently fails if dashboard isn't reachable.
      const canonical = target.contacts.find(c => c.id === canonicalId) ?? a;
      fetch(`${AI_BASE}/api/haiku`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: canonical.full_name,
          title: canonical.title,
          company: canonical.company,
        }),
      }).then(r => r.json()).then(data => {
        if (data?.haiku) {
          saveHaiku(data.haiku);
          setHaikus(loadHaikus());
          // Flash the new poem on screen
          setLatestPoem(data.haiku);
          if (latestPoemTimer.current) clearTimeout(latestPoemTimer.current);
          latestPoemTimer.current = setTimeout(() => setLatestPoem(null), 6000);
        }
      }).catch(() => {});

      // Merge immediately — don't wait for AI
      try {
        await executeMerge(target, canonicalId, `auto-merge (${user?.email ?? 'staff'})`);
        merged++;
      } catch {
        // If merge fails, skip this cluster to avoid infinite loop
        setClusters(prev => {
          const next = prev.filter(c => c.cluster_id !== target.cluster_id);
          saveClusters(next);
          return next;
        });
        failed++;
      }

      setAutoPilotStats({ merged, dismissed: 0, skipped: failed, total: merged + failed });
    }

    setAutoPilot(false);
    autoPilotRef.current = false;
    setAutoPilotStatus('');

    // Re-fetch poems from disk — fire-and-forget responses may not have reached the browser
    fetch(`${AI_BASE}/api/haikus`, { mode: 'cors' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.haikus?.length) {
          const local = loadHaikus();
          const all = [...new Set([...data.haikus, ...local])];
          localStorage.setItem(HAIKU_KEY, JSON.stringify(all.slice(0, 200)));
          setHaikus(all.slice(0, 200));
        }
      }).catch(() => {});

    toast({
      title: 'Auto-merge complete',
      description: `Merged ${merged} duplicate pairs.${failed > 0 ? ` ${failed} failed.` : ''}`,
    });
  }

  function stopAutoPilot() {
    autoPilotRef.current = false;
    setAutoPilot(false);
    setAutoPilotStatus('Stopping...');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="p-6 max-w-5xl space-y-5" ref={containerRef}>
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dedup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scan for duplicate contacts, review side-by-side, and merge with one click.
        </p>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={scanDuplicates} disabled={scanning || autoPilot} className="gap-1.5">
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {scanning ? 'Scanning...' : 'Scan for Duplicates'}
            </Button>

            {/* Auto-merge all */}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant={autoPilot ? 'destructive' : 'outline'}
                    onClick={autoPilot ? stopAutoPilot : startAutoPilot}
                    disabled={clusters.length === 0}
                    className="gap-1.5"
                  >
                    {autoPilot ? (
                      <>
                        <Square className="w-4 h-4" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Merge All
                      </>
                    )}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                {autoPilot
                  ? 'Click to stop'
                  : `Merge all ${clusters.length} clusters automatically. Uses completeness score to pick the keeper.${aiAvailable ? ' AI adds a quick sanity-check note in the background.' : ''}`}
              </TooltipContent>
            </Tooltip>

            <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
              {clusters.length > 0 && (
                <span className="tabular-nums">
                  {clusters.length} cluster{clusters.length !== 1 ? 's' : ''} remaining
                  {reviewedCount > 0 && <> &middot; {reviewedCount} reviewed</>}
                </span>
              )}
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowShortcuts(s => !s)}
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Auto-pilot status bar */}
          {autoPilot && (
            <div className="mt-3 pt-3 border-t flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-xs font-medium">{autoPilotStatus}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {autoPilotStats.total} processed: {autoPilotStats.merged} merged, {autoPilotStats.dismissed} dismissed, {autoPilotStats.skipped} skipped
                </p>
              </div>
            </div>
          )}

          {showShortcuts && (
            <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
              <span><kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">M</kbd> Merge focused</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">D</kbd> Dismiss focused</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">J/K</kbd> Navigate</span>
              <span><kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">?</kbd> Toggle shortcuts</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scanning skeleton */}
      {scanning && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-4 w-48" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-32" />
                  <Skeleton className="h-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cluster list */}
      {!scanning && clusters.length > 0 && (
        <div className="space-y-4">
          {clusters.map((cl, i) => (
            <div key={cl.cluster_id} data-cluster-card>
              <ClusterCard
                cluster={cl}
                index={i}
                canonicalId={canonicals[cl.cluster_id] ?? cl.contacts[0].id}
                onSetCanonical={(id) => setCanonicals(prev => ({ ...prev, [cl.cluster_id]: id }))}
                onMerge={() => setMergePreview({ cluster: cl, canonicalId: canonicals[cl.cluster_id] ?? cl.contacts[0].id })}
                onDismiss={() => dismissCluster(cl)}
                focused={i === focusedIndex}
              />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!scanning && clusters.length === 0 && reviewedCount === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Click "Scan for Duplicates" to find potential duplicate contacts.
            </p>
          </CardContent>
        </Card>
      )}

      {/* All done state */}
      {!scanning && clusters.length === 0 && reviewedCount > 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium">All done!</p>
            <p className="text-xs text-muted-foreground mt-1">
              {reviewedCount} cluster{reviewedCount !== 1 ? 's' : ''} reviewed this session.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Merge preview dialog */}
      <AlertDialog open={!!mergePreview} onOpenChange={(open) => { if (!open) setMergePreview(null); }}>
        {mergePreview && (
          <MergePreviewPanel
            cluster={mergePreview.cluster}
            canonicalId={mergePreview.canonicalId}
            onConfirm={() => executeMerge(mergePreview.cluster, mergePreview.canonicalId)}
            onCancel={() => setMergePreview(null)}
            merging={merging}
          />
        )}
      </AlertDialog>

      {/* Live poem flash — fades in at top-right as each poem arrives */}
      {latestPoem && (
        <div
          key={latestPoem}
          className="fixed top-20 right-6 z-50 max-w-xs animate-in fade-in slide-in-from-right-4 duration-700"
        >
          <div className="bg-background/90 backdrop-blur-md border border-violet-300/20 dark:border-violet-700/20 rounded-lg px-5 py-4 shadow-lg">
            <p className="text-sm leading-relaxed text-violet-300/90 italic whitespace-pre-line font-serif">
              {latestPoem}
            </p>
          </div>
        </div>
      )}

      {/* Poem collection — top-right corner */}
      <div className="fixed top-20 right-6 z-40">
        {showHaikus ? (
          <Card className="w-80 shadow-lg border-violet-200/15 dark:border-violet-800/15 bg-background/95 backdrop-blur-md">
            <CardHeader className="pb-2 pt-3 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium text-violet-400/60 flex items-center gap-1.5 tracking-wide uppercase">
                  <Sparkles className="w-3 h-3 text-violet-400/70" />
                  Psychosphere
                  <span className="text-violet-400/30 font-normal normal-case tracking-normal">
                    {haikus.length > 0 && ` \u00b7 ${haikus.length}`}
                  </span>
                </CardTitle>
                <button onClick={() => setShowHaikus(false)} className="text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-4 max-h-[400px] overflow-y-auto space-y-4">
              {haikus.length === 0 ? (
                <p className="text-xs leading-relaxed text-muted-foreground/40 italic">
                  No transmissions yet. Run auto-merge with the local dashboard running to begin.
                </p>
              ) : (
                haikus.map((h, i) => (
                  <p key={i} className="text-[13px] leading-[1.7] text-muted-foreground/70 italic whitespace-pre-line border-l-2 border-violet-400/10 pl-3 font-serif">
                    {h}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <button
            onClick={() => setShowHaikus(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-violet-50/50 dark:bg-violet-950/20 backdrop-blur border border-violet-300/15 dark:border-violet-700/15 shadow-sm hover:shadow-md hover:scale-110 transition-all group"
            title={haikus.length > 0 ? `${haikus.length} poems` : 'Psychosphere'}
          >
            <Sparkles className={`w-3.5 h-3.5 transition-colors ${haikus.length > 0 ? 'text-violet-400 group-hover:text-violet-300' : 'text-violet-400/30 group-hover:text-violet-400'}`} />
          </button>
        )}
      </div>
    </div>
  );
}
