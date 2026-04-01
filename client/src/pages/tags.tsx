import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Tag as TagIcon } from 'lucide-react';

interface TagWithCount {
  id: number;
  name: string;
  category: string | null;
  contact_count: number;
}

const categoryColors: Record<string, string> = {
  affiliation: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  source: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  event: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  geography: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  relationship: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  'data-quality': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function TagsPage() {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('affiliation');
  const { toast } = useToast();

  useEffect(() => { loadTags(); }, []);

  async function loadTags() {
    setLoading(true);
    const { data } = await supabase
      .from('tags')
      .select('id, name, category, contact_tags(count)')
      .order('category')
      .order('name');

    const mapped = (data ?? []).map((t: any) => ({
      ...t,
      contact_count: t.contact_tags?.[0]?.count ?? 0,
    }));
    setTags(mapped as TagWithCount[]);
    setLoading(false);
  }

  async function addTag() {
    if (!newName.trim()) return;
    const { error } = await supabase.from('tags').insert({
      name: newName.trim().toLowerCase().replace(/\s+/g, '-'),
      category: newCategory,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Tag created' });
      setNewName('');
      loadTags();
    }
  }

  // Group tags by category
  const grouped = tags.reduce<Record<string, TagWithCount[]>>((acc, tag) => {
    const cat = tag.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tag);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tags</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{tags.length} tags across {Object.keys(grouped).length} categories</p>
      </div>

      {/* Add tag */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Add Tag</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="tag-name" className="h-8 text-xs flex-1" data-testid="input-new-tag" />
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-tag-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="affiliation">Affiliation</SelectItem>
                <SelectItem value="source">Source</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="geography">Geography</SelectItem>
                <SelectItem value="relationship">Relationship</SelectItem>
                <SelectItem value="data-quality">Data Quality</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" onClick={addTag} data-testid="button-add-tag">
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tag groups */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><div className="h-16 bg-muted rounded animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : (
        Object.entries(grouped).map(([category, categoryTags]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold capitalize flex items-center gap-2">
                <TagIcon className="w-4 h-4 text-muted-foreground" />
                {category}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {categoryTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className={`text-xs px-3 py-1 ${categoryColors[category] ?? ''}`}
                    data-testid={`tag-${tag.name}`}
                  >
                    {tag.name}
                    {tag.contact_count > 0 && (
                      <span className="ml-1.5 opacity-60 tabular-nums">{tag.contact_count}</span>
                    )}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
