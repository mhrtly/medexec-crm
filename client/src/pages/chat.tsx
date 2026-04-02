import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  fetchChatHistory,
  sendChatMessage,
  fetchUserSettings,
  saveProviderSettings,
  deleteProviderSettings,
  PROVIDERS,
  type ChatMessage,
  type ChatSettings,
} from '@/lib/chat-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Send,
  Settings,
  Bot,
  User,
  Loader2,
  Trash2,
  Check,
  Plus,
  Eye,
  EyeOff,
  Star,
  ChevronDown,
} from 'lucide-react';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function groupMessagesByDate(messages: ChatMessage[]): { date: string; messages: ChatMessage[] }[] {
  const groups: { date: string; messages: ChatMessage[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const d = formatDate(msg.created_at);
    if (d !== currentDate) {
      currentDate = d;
      groups.push({ date: d, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
}

// Simple markdown-ish renderer for messages
function renderContent(text: string) {
  // Split into lines, handle basic markdown
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${codeKey++}`} className="bg-muted/70 rounded-md px-3 py-2 text-xs font-mono overflow-x-auto my-2">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }
    // Headers
    if (line.startsWith('### ')) {
      elements.push(<p key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</p>);
    } else if (line.startsWith('## ')) {
      elements.push(<p key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(3)}</p>);
    } else if (line.startsWith('# ')) {
      elements.push(<p key={i} className="font-bold text-base mt-3 mb-1">{line.slice(2)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <p key={i} className="pl-4 text-sm leading-relaxed">
          <span className="text-muted-foreground mr-1.5">&bull;</span>
          {renderInline(line.slice(2))}
        </p>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <p key={i} className="pl-4 text-sm leading-relaxed">
            <span className="text-muted-foreground mr-1.5 font-mono text-xs">{match[1]}.</span>
            {renderInline(match[2])}
          </p>
        );
      }
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>);
    }
  }
  return <>{elements}</>;
}

function renderInline(text: string) {
  // Bold and inline code
  return text.split(/(\*\*.*?\*\*|`[^`]+`)/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-muted/70 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ChatSettings[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('perplexity');
  const [selectedModel, setSelectedModel] = useState('sonar');
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const userEmail = user?.email ?? '';

  // Load history + settings
  useEffect(() => {
    async function init() {
      try {
        const [history, userSettings] = await Promise.all([
          fetchChatHistory(100),
          fetchUserSettings(userEmail),
        ]);
        setMessages(history);
        setSettings(userSettings);

        // Set default provider from settings
        const def = userSettings.find(s => s.is_default);
        if (def) {
          setSelectedProvider(def.provider);
          setSelectedModel(def.model);
        }
      } catch (err) {
        console.error('Failed to load chat:', err);
      } finally {
        setLoading(false);
      }
    }
    if (userEmail) init();
  }, [userEmail]);

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('chat-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (payload) => {
        const newMsg = payload.new as ChatMessage;
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);

    // Optimistic user message
    const tempMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      sender_email: userEmail,
      sender_name: userEmail.includes('markus') || userEmail.includes('mark@') ? 'Mark' : 'Kathy',
      content: text,
      model_used: null,
      provider: null,
      tokens_used: null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const history = messages.slice(-20).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Get API key from settings if available
      const providerSetting = settings.find(s => s.provider === selectedProvider);
      const apiKey = providerSetting?.api_key_encrypted || undefined;

      const result = await sendChatMessage(text, history, selectedProvider, selectedModel, apiKey);
      // The realtime subscription will add the assistant message
      // But in case realtime is slow, add it here too
      if (result.message) {
        setMessages(prev => {
          if (prev.some(m => m.id === result.message.id)) return prev;
          return [...prev, result.message];
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message ?? 'Failed to send message',
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, messages, selectedProvider, selectedModel, settings, userEmail, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentProviderInfo = PROVIDERS.find(p => p.id === selectedProvider);

  if (loading) {
    return (
      <div className="flex flex-col h-full p-6 gap-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  const dateGroups = groupMessagesByDate(messages);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Chat with Computer</h1>
            <p className="text-[10px] text-muted-foreground">Ask about CRM data, strategy, anything</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Provider Selector */}
          <div className="relative">
            <button
              onClick={() => setShowProviderMenu(!showProviderMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted/50 hover:bg-muted transition-colors"
              data-testid="button-provider-select"
            >
              <span className="text-muted-foreground">Model:</span>
              <span>{currentProviderInfo?.name} / {PROVIDERS.find(p => p.id === selectedProvider)?.models.find(m => m.id === selectedModel)?.name ?? selectedModel}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            {showProviderMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProviderMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[220px]">
                  {PROVIDERS.map(p => {
                    const hasSetting = settings.some(s => s.provider === p.id && s.api_key_encrypted);
                    return (
                      <div key={p.id}>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          {p.name}
                          {hasSetting && <Check className="w-3 h-3 text-green-500" />}
                        </div>
                        {p.models.map(m => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setSelectedProvider(p.id);
                              setSelectedModel(m.id);
                              setShowProviderMenu(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center justify-between ${
                              selectedProvider === p.id && selectedModel === m.id ? 'bg-primary/10 text-primary font-medium' : ''
                            }`}
                            data-testid={`option-model-${m.id}`}
                          >
                            <span>{m.name}</span>
                            {selectedProvider === p.id && selectedModel === m.id && <Check className="w-3 h-3" />}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Settings Button */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-chat-settings">
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>AI Provider Settings</DialogTitle>
                <DialogDescription>
                  Add API keys for the providers you want to use. Keys are stored in the database.
                </DialogDescription>
              </DialogHeader>
              <SettingsPanel
                userEmail={userEmail}
                settings={settings}
                onUpdate={async () => {
                  const updated = await fetchUserSettings(userEmail);
                  setSettings(updated);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Welcome to CRM Chat</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Ask me anything about your contacts, organizations, registration campaign, or strategy. I can query the database directly.
            </p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {[
                'How many paid registrations do we have?',
                'Who are our hottest unregistered leads?',
                'Show multi-year attendees not registered',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 rounded-full text-xs bg-muted/50 hover:bg-muted border border-border/50 transition-colors"
                  data-testid={`suggestion-${i}`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {dateGroups.map((group) => (
          <div key={group.date}>
            <div className="flex items-center justify-center my-4">
              <div className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                {group.date}
              </div>
            </div>
            {group.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 py-3 ${msg.role === 'user' ? '' : ''}`}
                data-testid={`message-${msg.id}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  msg.role === 'assistant'
                    ? 'bg-primary/10'
                    : 'bg-muted'
                }`}>
                  {msg.role === 'assistant' ? (
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold">
                      {msg.role === 'assistant' ? 'Computer' : msg.sender_name ?? 'You'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                    {msg.model_used && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal">
                        {msg.provider}/{msg.model_used}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-foreground/90 leading-relaxed">
                    {msg.role === 'assistant' ? renderContent(msg.content) : <p className="text-sm">{msg.content}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {sending && (
          <div className="flex gap-3 py-3">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border px-6 py-3 shrink-0">
        <div className="flex items-end gap-2 max-w-4xl">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about contacts, registrations, strategy..."
              className="w-full resize-none rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-colors min-h-[44px] max-h-[200px]"
              rows={1}
              disabled={sending}
              data-testid="input-chat"
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            size="icon"
            className="h-11 w-11 rounded-lg shrink-0"
            data-testid="button-send"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

/* ── Settings Panel ── */
function SettingsPanel({
  userEmail,
  settings,
  onUpdate,
}: {
  userEmail: string;
  settings: ChatSettings[];
  onUpdate: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [editProvider, setEditProvider] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editDefault, setEditDefault] = useState(false);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleSave = async () => {
    if (!editProvider || !editKey) return;
    setSaving(true);
    try {
      await saveProviderSettings(userEmail, editProvider, editModel, editKey, editDefault);
      await onUpdate();
      setEditProvider('');
      setEditModel('');
      setEditKey('');
      setAdding(false);
      toast({ title: 'Saved', description: `${editProvider} settings saved.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (provider: string) => {
    try {
      await deleteProviderSettings(userEmail, provider);
      await onUpdate();
      toast({ title: 'Removed', description: `${provider} settings removed.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    }
  };

  return (
    <div className="space-y-4 mt-2">
      {/* Existing settings */}
      {settings.map((s) => {
        const prov = PROVIDERS.find(p => p.id === s.provider);
        return (
          <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{prov?.name ?? s.provider}</span>
                  {s.is_default && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">default</Badge>}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Model: {s.model} &middot; Key: {showKey[s.provider] ? (s.api_key_encrypted ?? '—') : '••••••••'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowKey(prev => ({ ...prev, [s.provider]: !prev[s.provider] }))}
              >
                {showKey[s.provider] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => handleDelete(s.provider)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        );
      })}

      {/* Add new */}
      {adding ? (
        <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/[0.02]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Provider</label>
              <select
                value={editProvider}
                onChange={(e) => {
                  const p = PROVIDERS.find(pr => pr.id === e.target.value);
                  setEditProvider(e.target.value);
                  setEditModel(p?.defaultModel ?? '');
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="select-provider"
              >
                <option value="">Select...</option>
                {PROVIDERS.filter(p => !settings.some(s => s.provider === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Model</label>
              <select
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                data-testid="select-model"
              >
                {PROVIDERS.find(p => p.id === editProvider)?.models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                )) ?? <option>Select provider first</option>}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">API Key</label>
            <input
              type="password"
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              placeholder="sk-..."
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
              data-testid="input-api-key"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={editDefault}
                onChange={(e) => setEditDefault(e.target.checked)}
                className="rounded border-border"
              />
              Set as default provider
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={!editProvider || !editKey || saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setAdding(true)}
          data-testid="button-add-provider"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Provider
        </Button>
      )}

      <p className="text-[10px] text-muted-foreground">
        API keys are stored in the database. For production use, consider encrypting them.
        Providers without a saved key will fall back to server-side environment variables if configured.
      </p>
    </div>
  );
}
