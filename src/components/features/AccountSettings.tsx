import { useEffect, useState } from 'react';
import { Loader2, UtensilsCrossed, LogOut, ShieldCheck, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { useAuthStore } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { firstYearBatch } from '@/lib/academicProfile';

const MESSES = ['Kedaram', 'Nila'] as const;
const BRANCHES = ['CSE', 'DS', 'EE', 'ME', 'CE'];
const YEARS = ['1', '2', '3', '4'];

interface AccountSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Profile editing after onboarding — most importantly the mess switcher, since
 * students move between messes between academic years.
 */
export function AccountSettings({ open, onOpenChange }: AccountSettingsProps) {
  const account = useAuthStore((state) => state.account);
  const updateAccount = useAuthStore((state) => state.updateAccount);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  const [pendingYear, setPendingYear] = useState<string | null>(null);
  useEffect(() => { if (!open) setPendingYear(null); }, [open]);

  if (!account) return null;
  const year = pendingYear ?? account.yearOfStudy ?? '';
  const needsBatch = account.program === 'UG' && year === '1';

  const save = async (field: string, patch: Record<string, unknown>) => {
    setSaving(field);
    setError('');
    try {
      await updateAccount(patch);
      setPendingYear(null);
      setSaved(field);
      setTimeout(() => setSaved((current) => (current === field ? null : current)), 1800);
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(null);
    }
  };

  const rowClass = 'w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            Account
            {account.role === 'admin' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                <ShieldCheck className="h-3 w-3" /> Developer
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            Signed in as <span className="font-medium text-foreground">{account.rollNumber}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
              <UtensilsCrossed className="h-3.5 w-3.5 text-primary" /> Mess
              {saved === 'mess' && <Check className="h-3.5 w-3.5 text-green-600" />}
            </label>
            <div className="flex rounded-xl bg-muted/50 p-1">
              {MESSES.map((mess) => (
                <button
                  key={mess}
                  disabled={saving !== null}
                  onClick={() => save('mess', { mess })}
                  className={`flex-1 text-sm font-medium py-2 px-3 rounded-lg transition-all ${
                    account.mess === mess
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {saving === 'mess' && account.mess !== mess ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    mess
                  )}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Change this when you move hostels — first years shift to Kedaram after their first year.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Name {saved === 'name' && <Check className="inline h-3.5 w-3.5 text-green-600" />}
            </label>
            <input
              defaultValue={account.name ?? ''}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value && value !== account.name) void save('name', { name: value });
              }}
              className={rowClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-2">
                Branch {saved === 'branch' && <Check className="inline h-3.5 w-3.5 text-green-600" />}
              </label>
              <select
                disabled={saving !== null}
                value={account.branch ?? ''}
                onChange={(event) => void save('branch', { branch: event.target.value })}
                className={rowClass}
              >
                <option value="" disabled>Select</option>
                {BRANCHES.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Year {saved === 'yearOfStudy' && <Check className="inline h-3.5 w-3.5 text-green-600" />}
              </label>
              <select
                disabled={saving !== null}
                aria-label="Year of study"
                value={year}
                onChange={(event) => {
                  const nextYear = event.target.value;
                  if (account.program === 'UG' && nextYear === '1') {
                    setPendingYear(nextYear);
                  } else {
                    setPendingYear(null);
                    void save('yearOfStudy', { yearOfStudy: nextYear, batchNo: null });
                  }
                }}
                className={rowClass}
              >
                <option value="" disabled>Select</option>
                {YEARS.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          {needsBatch && (
            <div>
              <label htmlFor="account-batch" className="block text-sm font-medium mb-2">Batch number</label>
              <select
                id="account-batch"
                className={rowClass}
                disabled={saving !== null}
                value={pendingYear || !firstYearBatch(account.batchNo) ? '' : `B${firstYearBatch(account.batchNo)}`}
                onChange={(event) => void save('yearOfStudy', { yearOfStudy: '1', batchNo: event.target.value })}
              >
                <option value="" disabled>Select your batch</option>
                {Array.from({ length: 24 }, (_, i) => `B${i + 1}`).map(batch => (
                  <option key={batch} value={batch}>{batch}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-2">
                Select B1–B24 to save first year and load only your batch's classes.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Changing year, branch or batch clears your course selection. First-year core courses load for the selected batch.
          </p>

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {account.role === 'admin' && (
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => {
                onOpenChange(false);
                navigate('/admin');
              }}
            >
              <ShieldCheck className="h-4 w-4" /> Developer tools
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full rounded-xl text-red-500 hover:text-red-600"
            onClick={() => {
              logout();
              onOpenChange(false);
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
