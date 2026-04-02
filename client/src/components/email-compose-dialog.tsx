import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { sendEmail } from '@/lib/email-api';
import { Send, Loader2 } from 'lucide-react';

interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    subject: '',
    body: '',
  },
  {
    id: 'conference-invitation',
    label: 'MDXW 2026 Conference Invitation',
    subject: 'Join Us at MedExecWomen 2026',
    body: `Hi {firstName},

I hope this message finds you well. I wanted to personally invite you to MedExecWomen 2026 — the premier gathering for women medtech executives — taking place on April 24, 2026.

This is a unique opportunity to connect with fellow leaders, share insights, and be part of a community dedicated to advancing women in medtech. We've curated an inspiring lineup of speakers and sessions that I think you'll find truly valuable.

We'd love to have you join us. If you're interested, simply reply to this email and I'll send over the registration details.

Looking forward to hearing from you!

Warm regards`,
  },
  {
    id: 'follow-up-intro',
    label: 'Follow-Up After Introduction',
    subject: 'Great connecting with you',
    body: `Hi {firstName},

It was wonderful connecting with you recently. I really enjoyed our conversation and wanted to follow up.

I'm involved with MedExecWomen, a community and annual conference focused on empowering women leaders in medtech. I'd love to share more about what we're doing and how it might be relevant to you.

Would you be open to a quick chat sometime soon? Happy to work around your schedule.

Best regards`,
  },
  {
    id: 'past-attendee',
    label: 'Past Attendee Re-engagement',
    subject: "We'd love to see you again at MDXW 2026",
    body: `Hi {firstName},

As a past MedExecWomen attendee, you know firsthand how special this community is. We'd love to welcome you back for MDXW 2026 on April 24, 2026!

This year, we're bringing even more engaging content, expanded networking opportunities, and an incredible speaker lineup. It's shaping up to be our best event yet.

We haven't seen your registration come through yet and wanted to make sure you don't miss out. Early registration is filling up fast.

Reply to this email and I'll get you set up right away. Hope to see you there!

Warm regards`,
  },
  {
    id: 'speaker-vip',
    label: 'Speaker/VIP Invitation',
    subject: 'Special invitation — MDXW 2026',
    body: `Dear {firstName},

Your leadership and contributions to the medtech industry have not gone unnoticed, and I wanted to extend a special invitation to MedExecWomen 2026, taking place April 24, 2026.

We are assembling an exceptional group of senior women executives for a day of thought leadership, strategic dialogue, and meaningful connection. Given your expertise and accomplishments, we believe your presence — whether as an attendee or a speaker — would be a tremendous addition to this year's event.

I would welcome the opportunity to discuss how you might like to participate. Please don't hesitate to reach out, and I'll be happy to share more details.

With respect and admiration`,
  },
];

function getSenderDisplay(email: string | undefined): string | null {
  if (!email) return null;
  if (email === 'mark@hrtly.com' || email === 'markus.hartley@gmail.com') return 'mark@medexecwomen.org';
  if (email === 'kathy@medexecwomen.org') return 'kathy@medexecwomen.org';
  return null;
}

interface EmailComposeDialogProps {
  contactId: number;
  contactEmail: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmailSent: () => void;
}

export function EmailComposeDialog({
  contactId,
  contactEmail,
  contactName,
  open,
  onOpenChange,
  onEmailSent,
}: EmailComposeDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const senderDisplay = getSenderDisplay(user?.email);
  const firstName = contactName.split(' ')[0];

  function resetForm() {
    setCc('');
    setBcc('');
    setSubject('');
    setBody('');
  }

  function applyTemplate(templateId: string) {
    const template = EMAIL_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body.replace(/\{firstName\}/g, firstName));
  }

  function parseAddresses(input: string): string[] {
    return input
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      toast({ title: 'Missing fields', description: 'Subject and body are required.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      await sendEmail({
        contact_id: contactId,
        to: contactEmail,
        cc: parseAddresses(cc),
        bcc: parseAddresses(bcc),
        subject: subject.trim(),
        body_html: body.replace(/\n/g, '<br>'),
        body_text: body,
      });

      toast({ title: 'Email sent', description: `Email sent to ${contactName}.` });
      resetForm();
      onOpenChange(false);
      onEmailSent();
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base">Send Email</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Compose an email to {contactName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Template</label>
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input value={contactEmail} disabled className="h-8 text-xs bg-muted" />
            {senderDisplay && (
              <p className="text-[10px] text-muted-foreground">Sending as {senderDisplay}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">CC</label>
              <Input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="comma-separated"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">BCC</label>
              <Input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="comma-separated"
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Body</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              className="text-xs min-h-[160px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSend} disabled={sending}>
            {sending ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-3 h-3 mr-1.5" /> Send Email</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
