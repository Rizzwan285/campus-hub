import { useState } from 'react';
import { GraduationCap, ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import { apiFetch, ApiError, isApiConfigured } from '@/services/api';

export function Login() {
  const login = useAuthStore((state) => state.login);

  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cleanRoll = rollNumber.trim();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cleanRoll) {
      setError('Enter your roll number.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      // Ask first whether this account needs a password, so the field appears
      // before the user is told they got something wrong.
      if (!needsPassword) {
        const check = await apiFetch<{ passwordRequired: boolean }>(
          `/api/auth/check/${encodeURIComponent(cleanRoll)}`,
        );
        if (check.passwordRequired) {
          setNeedsPassword(true);
          setBusy(false);
          return;
        }
      }

      await login(cleanRoll, needsPassword ? password : undefined);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.payload.passwordRequired) setNeedsPassword(true);
        setError(err.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isApiConfigured()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Sign-in unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This build has no API configured, so accounts are disabled. Set
            <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">VITE_API_URL</code>
            and rebuild to enable sign-in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border/60 rounded-2xl shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-8 pt-8 pb-6 text-center">
            <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-4">
              <GraduationCap className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Campus Companion</h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Sign in with your roll number to sync your timetable and mess across devices.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
            <div>
              <label htmlFor="roll" className="block text-sm font-medium mb-1.5">
                Roll number
              </label>
              <input
                id="roll"
                value={rollNumber}
                onChange={(event) => {
                  setRollNumber(event.target.value);
                  setNeedsPassword(false);
                  setPassword('');
                  setError('');
                }}
                placeholder="142301026"
                autoComplete="username"
                autoCapitalize="characters"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
              />
            </div>

            {needsPassword && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <label htmlFor="password" className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  This account has administrator access, so it needs a password.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full rounded-xl h-11 text-sm font-semibold">
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
              No password needed for student accounts — this app stores only your
              timetable and mess preference. You'll stay signed in for 30 days.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
