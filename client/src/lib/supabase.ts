import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bcjahzdtuowhaysxzzgz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjamFoemR0dW93aGF5c3h6emd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg1MzQsImV4cCI6MjA5MDU2NDUzNH0.c6qeh9CpPIJhPzR-cfPL994UNOUnXjFYYsOTzM8K-3w';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'implicit',
    // Uses localStorage by default — sessions survive page refreshes,
    // tab closes, and browser restarts. Token auto-refresh keeps
    // sessions alive indefinitely as long as the refresh token is valid.
  },
});
