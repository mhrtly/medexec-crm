import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Tag, Plus, ChevronRight, Users } from 'lucide-react';

interface TagWithCount {
  id: number;
  name: string;
  category: string | null;
  count: number;
}

const categoryColors: Record<string, string> = {
  'event': 'bg-blue-100 text-blue-700',
  'event-year': 'bg-indigo-100 text-indigo-700',
  'registration': 'bg-green-100 text-green-700',
  'engagement': 'bg-amber-100 text-amber-700',
  'affiliation': 'bg-purple-100 text-purple-700',
  'source': 'bg-slate-100 text-slate-700',
  'geography': 'bg-teal-100 text-teal-700',
  'relationship': 'bg-rose-100 text-rose-700',
  'data-quality': 'bg-emerald-100 text-emerald-700',
};

const categoryOptions = [
  'event', 'event-year', 'registration', 'engagement',
  'affiliation', 'source', 'geography', 'relationship', 'data-quality'
];

export default function TagsPage() {
  const { toast } = useToast();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTag, setNewTag] = useState({ name: '', category: '' });

  useEffect(() => { loadTags(); }, []);

  async function loadTags() {
    setLoading(true);
    // Get all tags
    const { data: allTags } = await supabase.from('tags').select('id, name, category').order('category').order('name');

    // Get counts per tag in parallel
    const tagList = allTags ?? [];
    const countPromises = tagList.map(t =>
      supabase.from('contact_tags').select('*', { count: 'exact', head: true }).eq('tag_id', t.id)
    );
    const countResults = await Promise.all(countPromises);

    const result: TagWithCount[] = tagList.map((t, i) => ({
      ...t,
      count: countResults[i].count ?? 0,
    }));

    setTags(result);
    setLoading(false);
  }

  async function handleCreate() {
    if (!newTag.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('tags').insert({
      name: newTag.name.trim().toLowerCase().replace(/\s+/g, '-'),
      category: newTag.category || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tag created' });
      setCreateOpen(false);
      setNewTag({ name: '', category: '' });
      loadTags();
    }
  }

  // Group by category
  const grouped = new Map<string, TagWithCount[]>();
  for (const tag of tags) {
    const cat = tag.category || 'uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(tag);
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tags</h1>
          <p className="text-sm text-muted-foreground">{tags.length} tags across {grouped.size} categories</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> New Tag
        </Button>
      </div>

      {Array.from(grouped.entries()).map(([category, catTags]) => (
        <div key={category}>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Badge variant="secondary" className={`text-[10px] ${categoryColors[category] ?? 'bg-gray-100 text-gray-700'}`}>
              {category}
            </Badge>
            <span className="text-muted-foreground/50">{catTags.length} tags</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {catTags.map(tag => (
              <Link key={tag.id} href={`/tags/${tag.id}`}>
                <Card className="hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">{tag.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 ml-5">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground tabular-nums">{tag.count.toLocaleString()} contacts</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* Create Tag Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle className="text-base">Create Tag</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={newTag.name} onChange={e => setNewTag(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" placeholder="e.g. mdxw-2027-paid" />
              <p className="text-[10px] text-muted-foreground">Will be lowercased and hyphenated</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={newTag.category} onValueChange={val => setNewTag(p => ({ ...p, category: val }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choose category..." /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
