import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bcjahzdtuowhaysxzzgz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjamFoemR0dW93aGF5c3h6emd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg1MzQsImV4cCI6MjA5MDU2NDUzNH0.c6qeh9CpPIJhPzR-cfPL994UNOUnXjFYYsOTzM8K-3w';

// In-memory storage adapter for sandboxed iframe environments
// where localStorage/sessionStorage are blocked
const memoryStore = new Map<string, string>();
const memoryStorage = {
  getItem: (key: string) => memoryStore.get(key) ?? null,
  setItem: (key: string, value: string) => { memoryStore.set(key, value); },
  removeItem: (key: string) => { memoryStore.delete(key); },
};

// No-op lock: navigator.locks can hang forever in sandboxed iframes
const noopLock = async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: memoryStorage,
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
    flowType: 'implicit',
    lock: noopLock as any,
  },
});
