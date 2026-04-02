import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { sendEmail } from '@/lib/email-api';
import { Send, Loader2 } from 'lucide-react';

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
  const [sending, setSending] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  function resetForm() {
    setCc('');
    setBcc('');
    setSubject('');
    setBody('');
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
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <Input value={contactEmail} disabled className="h-8 text-xs bg-muted" />
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
