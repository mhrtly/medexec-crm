import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) setError(error.message);
      else setMessage('Check your email for a confirmation link.');
    } else {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-label="MedExecWomen logo">
              <rect x="4" y="4" width="40" height="40" rx="10" stroke="hsl(4, 72%, 62%)" strokeWidth="2.5" fill="none"/>
              <path d="M14 32V18l5 8 5-8v14" stroke="hsl(222, 35%, 20%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M29 18h7M29 25h5M29 32h7" stroke="hsl(4, 72%, 62%)" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">MedExecWomen</h1>
          <p className="text-sm text-muted-foreground">CRM &amp; Executive Intelligence</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-base font-medium text-center">
              {isSignUp ? 'Create your account' : 'Sign in to continue'}
            </h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  data-testid="input-password"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" data-testid="text-error">{error}</p>
              )}
              {message && (
                <p className="text-sm text-green-600 dark:text-green-400" data-testid="text-message">{message}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading} data-testid="button-submit">
                {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError(''); setMessage(''); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-toggle-auth"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
