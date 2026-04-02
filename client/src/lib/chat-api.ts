import { supabase } from './supabase';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  sender_email: string | null;
  sender_name: string | null;
  content: string;
  model_used: string | null;
  provider: string | null;
  tokens_used: number | null;
  created_at: string;
}

export interface ChatSettings {
  id: number;
  user_email: string;
  provider: string;
  model: string;
  api_key_encrypted: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  name: string;
  defaultModel: string;
  models: { id: string; name: string }[];
}

export const PROVIDERS: Provider[] = [
  {
    id: 'perplexity',
    name: 'Perplexity',
    defaultModel: 'sonar',
    models: [
      { id: 'sonar', name: 'Sonar' },
      { id: 'sonar-pro', name: 'Sonar Pro' },
      { id: 'sonar-reasoning', name: 'Sonar Reasoning' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    ],
  },
  {
    id: 'google',
    name: 'Google AI',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' },
    ],
  },
];

export async function fetchChatHistory(limit = 50): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendChatMessage(
  message: string,
  history: { role: string; content: string }[],
  provider: string,
  model: string,
  apiKey?: string,
): Promise<{ content: string; message: ChatMessage }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const resp = await fetch(
    'https://bcjahzdtuowhaysxzzgz.supabase.co/functions/v1/chat-with-ai',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjamFoemR0dW93aGF5c3h6emd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg1MzQsImV4cCI6MjA5MDU2NDUzNH0.c6qeh9CpPIJhPzR-cfPL994UNOUnXjFYYsOTzM8K-3w',
      },
      body: JSON.stringify({
        message,
        history,
        provider,
        model,
        api_key: apiKey || undefined,
      }),
    },
  );

  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json.error ?? `Request failed (${resp.status})`);
  }
  return json;
}

export async function fetchUserSettings(userEmail: string): Promise<ChatSettings[]> {
  const { data, error } = await supabase
    .from('chat_settings')
    .select('*')
    .eq('user_email', userEmail);
  if (error) throw error;
  return (data ?? []) as ChatSettings[];
}

export async function saveProviderSettings(
  userEmail: string,
  provider: string,
  model: string,
  apiKey: string,
  isDefault: boolean,
): Promise<void> {
  // Upsert
  const { data: existing } = await supabase
    .from('chat_settings')
    .select('id')
    .eq('user_email', userEmail)
    .eq('provider', provider)
    .single();

  if (existing) {
    await supabase
      .from('chat_settings')
      .update({ model, api_key_encrypted: apiKey, is_default: isDefault, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('chat_settings').insert({
      user_email: userEmail,
      provider,
      model,
      api_key_encrypted: apiKey,
      is_default: isDefault,
    });
  }

  // If setting as default, unset others
  if (isDefault && existing) {
    await supabase
      .from('chat_settings')
      .update({ is_default: false })
      .eq('user_email', userEmail)
      .neq('provider', provider);
  }
}

export async function deleteProviderSettings(userEmail: string, provider: string): Promise<void> {
  await supabase
    .from('chat_settings')
    .delete()
    .eq('user_email', userEmail)
    .eq('provider', provider);
}
