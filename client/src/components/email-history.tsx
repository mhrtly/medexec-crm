import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { getEmailHistory } from '@/lib/email-api';
import { Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface Email {
  id: number;
  sender_address: string;
  sent_by: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  body_html: string;
  body_text: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
  created_at: string;
}

interface EmailHistoryProps {
  contactId: number;
  refreshKey?: number;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  sent: {
    label: 'Sent',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  sending: {
    label: 'Sending',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
};

export function EmailHistory({ contactId, refreshKey }: EmailHistoryProps) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    loadEmails();
  }, [contactId, refreshKey]);

  async function loadEmails() {
    setLoading(true);
    try {
      const data = await getEmailHistory(contactId);
      setEmails((data ?? []) as Email[]);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Emails</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Emails ({emails.length})</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {emails.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground text-center">No emails sent yet</p>
        ) : (
          <div className="divide-y divide-border">
            {emails.map((email) => {
              const expanded = expandedId === email.id;
              const status = statusConfig[email.status] ?? statusConfig.sending;

              return (
                <div key={email.id}>
                  <button
                    className="w-full text-left px-5 py-3 hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedId(expanded ? null : email.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {expanded ? (
                          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 shrink-0 ${status.className}`}>
                          {status.label}
                        </Badge>
                        <span className="text-sm font-medium truncate">{email.subject}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-2">
                        {format(new Date(email.sent_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-5">
                      from {email.sender_address}
                    </p>
                  </button>

                  {expanded && (
                    <div className="px-5 pb-4 pt-1 bg-muted/20">
                      <div className="text-xs space-y-1 mb-3">
                        <p><span className="text-muted-foreground">To:</span> {email.to_addresses.join(', ')}</p>
                        {email.cc_addresses.length > 0 && (
                          <p><span className="text-muted-foreground">CC:</span> {email.cc_addresses.join(', ')}</p>
                        )}
                        {email.bcc_addresses.length > 0 && (
                          <p><span className="text-muted-foreground">BCC:</span> {email.bcc_addresses.join(', ')}</p>
                        )}
                      </div>
                      <div
                        className="text-xs leading-relaxed border rounded p-3 bg-background"
                        dangerouslySetInnerHTML={{ __html: email.body_html }}
                      />
                      {email.error_message && (
                        <p className="text-xs text-red-600 mt-2">Error: {email.error_message}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
