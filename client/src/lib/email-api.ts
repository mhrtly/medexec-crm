import { supabase } from './supabase';

const SUPABASE_URL = 'https://bcjahzdtuowhaysxzzgz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjamFoemR0dW93aGF5c3h6emd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODg1MzQsImV4cCI6MjA5MDU2NDUzNH0.c6qeh9CpPIJhPzR-cfPL994UNOUnXjFYYsOTzM8K-3w';

interface SendEmailParams {
  contact_id: number;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_html: string;
  body_text?: string;
}

export async function sendEmail(params: SendEmailParams) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/send-email`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(params),
    }
  );

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to send email');
  return data;
}

export async function getEmailHistory(contactId: number) {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false });

  if (error) throw error;
  return data;
}
