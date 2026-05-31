import { type FormEvent, useEffect, useState } from 'react';
import { LogIn, LockKeyhole, UserRound, UserPlus, X, ShieldAlert, Users, Calendar, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getDeviceFingerprints } from '../utils/deviceFingerprint';
import MenuShell from './MenuShell';

interface AuthMenuProps {
  onClose: () => void;
  onSignedIn: () => void;
  initialMode?: 'signIn' | 'signUp';
}

function maxDobString(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return d.toISOString().slice(0, 10);
}

const AuthMenu = ({ onClose, onSignedIn, initialMode = 'signIn' }: AuthMenuProps) => {
  const { signIn } = useAuthActions();
  const availability = useQuery(api.signupGuard.signupAvailability);
  const [mode, setMode] = useState<'signIn' | 'signUp'>(initialMode);
  const [step, setStep] = useState<1 | 2>(1); // signUp onboarding step
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === 'signUp';
  const registrationFull = availability?.full ?? false;
  const remaining = availability?.remaining;

  // ── Live username availability check (sign-up step 1) ──────────────────────
  // Mirrors the server's username rules for a fast local verdict, then asks
  // Convex whether the handle is already taken — debounced so we don't fire a
  // query on every keystroke. The "Continue" gate blocks taken/checking names.
  const normalizedUsername = username.trim().toLowerCase();
  const usernameFormatValid = /^[a-z0-9](?:[a-z0-9._-]{1,18}[a-z0-9])?$/.test(normalizedUsername);
  const [debouncedUsername, setDebouncedUsername] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedUsername(normalizedUsername), 400);
    return () => clearTimeout(id);
  }, [normalizedUsername]);

  const checkUsername = isSignUp && step === 1 && usernameFormatValid && debouncedUsername === normalizedUsername;
  const usernameTaken = useQuery(
    api.profile.usernameExists,
    checkUsername ? { username: debouncedUsername } : 'skip',
  );
  // 'idle' | 'checking' | 'available' | 'taken' — drives the inline indicator.
  // Invalid formats stay 'idle' (no spinner) — the Continue gate surfaces the
  // specific format error instead.
  const usernameStatus: 'idle' | 'checking' | 'available' | 'taken' =
    !isSignUp || step !== 1 || normalizedUsername.length === 0 || !usernameFormatValid
      ? 'idle'
      : debouncedUsername !== normalizedUsername || usernameTaken === undefined
        ? 'checking'
        : usernameTaken
          ? 'taken'
          : 'available';

  const switchMode = (next: 'signIn' | 'signUp') => {
    setMode(next);
    setStep(1);
    setError(null);
  };

  // Step 1 → 2 gate: validate account fields before showing onboarding.
  const goToProfileStep = () => {
    const trimmed = username.trim();
    if (!trimmed) return setError('Enter a username.');
    if (trimmed.length < 3) return setError('Username must be at least 3 characters.');
    if (!usernameFormatValid) return setError('Use letters, numbers, dots, underscores, or dashes.');
    // Don't advance until the availability check has confirmed the handle is free.
    if (usernameStatus === 'taken') return setError('That username is already taken. Choose another.');
    if (usernameStatus === 'checking') return setError('Checking username availability…');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return setError('Password must include letters and numbers.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setError(null);
    setStep(2);
  };

  const submitSignIn = async () => {
    const trimmed = username.trim();
    if (!trimmed) return setError('Enter a username.');
    if (!password) return setError('Enter a password.');
    await runAuth(() => {
      const fd = new FormData();
      fd.set('username', trimmed);
      fd.set('password', password);
      fd.set('flow', 'signIn');
      return fd;
    });
  };

  const submitSignUp = async () => {
    if (registrationFull) return setError('Registration is full right now. Please try again later.');
    if (fullName.trim().length < 2) return setError('Enter your name (at least 2 characters).');
    if (!dob) return setError('Enter your date of birth.');
    if (dob > maxDobString()) return setError('You must be at least 13 years old to play.');
    await runAuth(async () => {
      const fd = new FormData();
      fd.set('username', username.trim());
      fd.set('password', password);
      fd.set('name', fullName.trim());
      fd.set('dob', dob);
      fd.set('flow', 'signUp');
      // Multiple independent device signals (hardware + persistent). The server
      // caps accounts against all of them, so one account is allowed per device.
      const fingerprints = await getDeviceFingerprints();
      fd.set('fingerprint', fingerprints[0] ?? '');
      fd.set('fingerprints', fingerprints.join(','));
      return fd;
    });
  };

  const runAuth = async (buildForm: () => FormData | Promise<FormData>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const formData = await buildForm();
      await signIn('password', formData);
      onSignedIn();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!isSignUp) return void submitSignIn();
    if (step === 1) return goToProfileStep();
    void submitSignUp();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'rgba(5,8,10,0.94)', backdropFilter: 'blur(14px)' }}
    >
      <MenuShell variant="main" />

      <div className="relative z-10 flex min-h-full items-center justify-center p-3 sm:p-4">
      <div
        className="w-full max-w-2xl overflow-hidden rounded-[20px] border border-white/10 bg-[#0b0f15] shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        style={{ animation: 'authFade 0.28s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/12 border border-emerald-400/25">
              <LockKeyhole className="w-5 h-5 text-emerald-300" strokeWidth={2.1} />
            </div>
            <div>
              <p className="text-[10px] tracking-[0.35em] text-emerald-300/90 font-semibold uppercase">Authentication</p>
              <h2 className="text-lg font-bold text-white tracking-wide">
                {isSignUp ? (step === 1 ? 'Create your account' : 'Tell us about you') : 'Sign in to continue'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close authentication panel"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400 transition-colors hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
          </button>
        </div>

        <section className="p-5 sm:p-6">
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-emerald-500/10 border border-emerald-400/15">
                  <UserRound className="w-5 h-5 text-emerald-300" strokeWidth={2.1} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-300">Use your handle and password</p>
                  <p className="text-[11px] text-gray-500">Unlocks Multiplayer, achievements & the skill tree.</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => switchMode('signIn')}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${!isSignUp ? 'bg-white/[0.06] text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => switchMode('signUp')}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors ${isSignUp ? 'bg-white/[0.06] text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                Register
              </button>
            </div>

            {/* Step indicator for sign-up onboarding */}
            {isSignUp && (
              <div className="flex items-center gap-2">
                <StepDot active={step === 1} done={step > 1} label="Account" index={1} />
                <span className="h-px flex-1 bg-white/10" />
                <StepDot active={step === 2} done={false} label="Profile" index={2} />
              </div>
            )}

            {isSignUp && step === 1 && availability !== undefined && (
              registrationFull ? (
                <div className="flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-500/[0.07] px-3 py-2 text-sm text-rose-100">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" strokeWidth={2.1} />
                  Registration is full right now. Existing players can still sign in.
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-100">
                  <Users className="w-4 h-4 flex-shrink-0" strokeWidth={2.1} />
                  <span><span className="font-semibold">{remaining}</span> account {remaining === 1 ? 'spot' : 'spots'} remaining.</span>
                </div>
              )
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* ── Sign in, or sign-up step 1: account credentials ── */}
              {(!isSignUp || step === 1) && (
                <>
                  <Field label="Username">
                    <input
                      name="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      spellCheck={false}
                      autoCapitalize="none"
                      placeholder="Your handle"
                      className={inputClass}
                    />
                    {isSignUp && step === 1 && usernameStatus !== 'idle' && (
                      <p className={`mt-1 flex items-center gap-1.5 text-[11px] font-medium ${
                        usernameStatus === 'taken' ? 'text-rose-300'
                          : usernameStatus === 'available' ? 'text-emerald-300'
                          : 'text-gray-500'
                      }`}>
                        {usernameStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.5} />}
                        {usernameStatus === 'available' && <Check className="w-3 h-3" strokeWidth={2.75} />}
                        {usernameStatus === 'taken' && <X className="w-3 h-3" strokeWidth={2.75} />}
                        {usernameStatus === 'checking' ? 'Checking availability…'
                          : usernameStatus === 'available' ? 'Username is available'
                          : 'Username is already taken'}
                      </p>
                    )}
                  </Field>

                  <Field label="Password">
                    <input
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      placeholder="Enter your password"
                      className={inputClass}
                    />
                    {isSignUp && <p className="mt-1 text-[11px] text-gray-500">At least 8 characters, with letters and numbers.</p>}
                  </Field>

                  {isSignUp && (
                    <Field label="Confirm Password">
                      <input
                        name="confirmPassword"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        type="password"
                        autoComplete="new-password"
                        placeholder="Confirm your password"
                        className={inputClass}
                      />
                    </Field>
                  )}
                </>
              )}

              {/* ── Sign-up step 2: interactive onboarding ── */}
              {isSignUp && step === 2 && (
                <>
                  <div className="rounded-lg border border-emerald-400/15 bg-emerald-500/[0.04] px-3 py-2.5 text-xs text-gray-300">
                    Welcome, survivor. A couple of details to set up your profile.
                  </div>
                  <Field label="Your Name">
                    <input
                      name="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      placeholder="e.g. Alex Carter"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[11px] text-gray-500">This is your display name in the game.</p>
                  </Field>
                  <Field label="Date of Birth">
                    <div className="relative">
                      <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" strokeWidth={2.1} />
                      <input
                        name="dob"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        type="date"
                        max={maxDobString()}
                        className={`${inputClass} pl-9 [color-scheme:dark]`}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">Used to verify it's you when changing your password.</p>
                  </Field>
                </>
              )}

              {error && (
                <div className="rounded-lg border border-rose-400/20 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100">{error}</div>
              )}

              {/* Actions */}
              {!isSignUp ? (
                <SubmitButton busy={busy} disabled={busy}>
                  <LogIn className="w-4 h-4" strokeWidth={2.25} /> {busy ? 'Signing In...' : 'Sign In'}
                </SubmitButton>
              ) : step === 1 ? (
                <SubmitButton busy={false} disabled={registrationFull || usernameStatus === 'taken'}>
                  Continue <ArrowRight className="w-4 h-4" strokeWidth={2.25} />
                </SubmitButton>
              ) : (
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep(1); }}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/[0.06]"
                  >
                    <ArrowLeft className="w-4 h-4" strokeWidth={2.25} /> Back
                  </button>
                  <SubmitButton busy={busy} disabled={busy || registrationFull}>
                    <UserPlus className="w-4 h-4" strokeWidth={2.25} /> {busy ? 'Creating Account...' : 'Create Account'}
                  </SubmitButton>
                </div>
              )}
            </form>
          </div>
        </section>
      </div>
      </div>

      <style>{`
        @keyframes authFade {
          from { opacity: 0; transform: scale(0.98) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

const inputClass =
  'w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-xs font-semibold tracking-[0.22em] text-gray-500 uppercase">{label}</label>
    {children}
  </div>
);

const StepDot = ({ active, done, label, index }: { active: boolean; done: boolean; label: string; index: number }) => (
  <div className="flex items-center gap-2">
    <span
      className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors ${
        active ? 'bg-emerald-500 text-[#04130a]' : done ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/[0.06] text-gray-500'
      }`}
    >
      {index}
    </span>
    <span className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
  </div>
);

const SubmitButton = ({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) => (
  <button
    type="submit"
    disabled={disabled}
    className="group flex items-center justify-center gap-2 w-full rounded-lg px-4 py-2.5 text-sm font-bold tracking-wide text-[#04130a] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
    style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
  >
    {children}
    {busy && <span className="sr-only">Working…</span>}
  </button>
);

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === 'string') return data;
  }
  if (error instanceof Error) {
    if (/InvalidAccountId|InvalidSecret|Invalid credentials/i.test(error.message)) {
      return 'Incorrect username or password.';
    }
    return error.message;
  }
  if (typeof error === 'string') return error;
  return 'Authentication failed. Please try again.';
}

export default AuthMenu;
