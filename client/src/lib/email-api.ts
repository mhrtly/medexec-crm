import { supabase } from './supabase';

const SUPABASE_URL = 'https://bcjahzdtuowhaysxzzgz.supabase.co';

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
