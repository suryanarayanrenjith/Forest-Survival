import { type FormEvent, useEffect, useState } from 'react';
import { LogIn, LockKeyhole, UserPlus, X, ShieldAlert, Users, Calendar, ArrowLeft, ArrowRight, Check, Loader2, Crosshair, Trophy, GitBranch, Sparkles } from 'lucide-react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { getDeviceFingerprints } from '../utils/deviceFingerprint';
import {
  checkDisplayName,
  checkDob,
  checkPassword,
  checkPasswordAgainstUsername,
  checkUsername,
  maxDobString,
  normalizeDisplayName,
  normalizeDob,
  normalizeUsername,
} from '../../convex/authValidation';
import MenuShell from './MenuShell';

interface AuthMenuProps {
  onClose: () => void;
  onSignedIn: () => void;
  initialMode?: 'signIn' | 'signUp';
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

  // ── Live username validation + availability check (sign-up step 1) ─────────
  // The username runs through the SAME `checkUsername` the server uses, so a
  // reserved/spammy/badly-formatted handle is rejected inline in step 1 — never
  // after the user has filled in the profile step. Only once the handle passes
  // every format rule do we ask Convex whether it's already taken (debounced so
  // we don't fire a query on every keystroke).
  const normalizedUsername = normalizeUsername(username);
  const usernameFormatError = normalizedUsername.length === 0 ? null : checkUsername(normalizedUsername);
  const usernameFormatValid = normalizedUsername.length > 0 && usernameFormatError === null;
  const [debouncedUsername, setDebouncedUsername] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedUsername(normalizedUsername), 400);
    return () => clearTimeout(id);
  }, [normalizedUsername]);

  const shouldCheckAvailability = isSignUp && step === 1 && usernameFormatValid && debouncedUsername === normalizedUsername;
  const usernameTaken = useQuery(
    api.profile.usernameExists,
    shouldCheckAvailability ? { username: debouncedUsername } : 'skip',
  );
  // 'idle' | 'invalid' | 'checking' | 'available' | 'taken' — drives the inline
  // indicator. 'invalid' surfaces the exact format/reserved/spammy reason live.
  const usernameStatus: 'idle' | 'invalid' | 'checking' | 'available' | 'taken' =
    !isSignUp || step !== 1 || normalizedUsername.length === 0
      ? 'idle'
      : usernameFormatError !== null
        ? 'invalid'
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

  // Step 1 → 2 gate: enforce the FULL server rule-set for the account fields
  // before showing onboarding, so no credential error can slip through to the
  // profile step. Every check here mirrors `convex/auth.ts` via the shared
  // `convex/authValidation` module — same messages, same order.
  const goToProfileStep = () => {
    if (!username.trim()) return setError('Enter a username.');
    const usernameError = checkUsername(normalizedUsername);
    if (usernameError) return setError(usernameError);
    // Don't advance until the availability check has confirmed the handle is free.
    if (usernameStatus === 'taken') return setError('That username is already taken. Choose another.');
    if (usernameStatus === 'checking') return setError('Checking username availability…');
    if (!password) return setError('Enter a password.');
    const passwordError = checkPassword(password);
    if (passwordError) return setError(passwordError);
    const passwordUsernameError = checkPasswordAgainstUsername(password, normalizedUsername);
    if (passwordUsernameError) return setError(passwordUsernameError);
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
    // Re-run the step-1 credential gate defensively, then validate the profile
    // fields with the same checks the server uses.
    const usernameError = checkUsername(normalizedUsername);
    if (usernameError) { setStep(1); return setError(usernameError); }
    const passwordError = checkPassword(password) ?? checkPasswordAgainstUsername(password, normalizedUsername);
    if (passwordError) { setStep(1); return setError(passwordError); }
    if (!fullName.trim()) return setError('Enter your name.');
    const nameError = checkDisplayName(normalizeDisplayName(fullName));
    if (nameError) return setError(nameError);
    if (!dob) return setError('Enter your date of birth.');
    const dobError = checkDob(normalizeDob(dob));
    if (dobError) return setError(dobError);
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
      className="fixed inset-0 z-50 overflow-y-auto menu-overlay-in"
      style={{ background: 'rgba(4,8,7,0.92)', backdropFilter: 'blur(16px)' }}
    >
      <MenuShell variant="main" />

      <div className="relative z-10 flex min-h-full items-center justify-center p-3 sm:p-5">
      <div
        className="relative grid w-full max-w-4xl overflow-hidden rounded-[22px] border border-emerald-400/15 bg-[#080d0b] shadow-[0_40px_100px_rgba(0,0,0,0.6)] md:grid-cols-[0.92fr_1fr]"
        style={{ animation: 'authFade 0.28s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* ── LEFT · brand / value panel (desktop) ───────────────────── */}
        <aside
          className="hud-frame relative hidden md:flex flex-col justify-between overflow-hidden border-r border-white/[0.06] p-8"
          style={{ background: 'linear-gradient(160deg, rgba(46,232,180,0.07), rgba(8,13,11,0) 58%)' }}
        >
          <div
            className="panel-drift pointer-events-none absolute -top-20 -left-12 h-56 w-56 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(46,232,180,0.16), transparent 70%)' }}
          />
          <div className="relative">
            <p className="font-hud flex items-center gap-2 text-[10px] tracking-[0.4em] text-emerald-300/90 font-semibold uppercase">
              <Crosshair className="w-3 h-3" strokeWidth={2.2} /> Forest Survival
            </p>
            <h2 className="font-display mt-4 text-3xl font-semibold uppercase leading-[0.95] tracking-wide text-white">
              {isSignUp ? (step === 1 ? <>Join the<br />survivors</> : <>Set up your<br />profile</>) : <>Welcome<br />back</>}
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-400">
              {isSignUp
                ? 'Create a free account to take the fight online and carry your progress between runs.'
                : 'Sign back in to recover your loadout, rank and progress where you left off.'}
            </p>
          </div>

          <ul className="relative mt-8 space-y-3">
            {[
              { icon: Users, title: 'Online Multiplayer', desc: 'Co-op & survival with friends' },
              { icon: Trophy, title: 'Achievements & Ranks', desc: 'Every milestone tracked' },
              { icon: GitBranch, title: 'Skill Tree', desc: 'Permanent, run-to-run upgrades' },
              { icon: Sparkles, title: 'Daily Challenges', desc: 'Fresh goals, real rewards' },
            ].map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.07] flex-shrink-0">
                  <Icon className="w-4 h-4 text-emerald-300" strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-white truncate">{title}</span>
                  <span className="font-hud block text-[11px] text-gray-500 truncate">{desc}</span>
                </span>
              </li>
            ))}
          </ul>

          {availability !== undefined && (
            <div className="relative mt-8">
              {registrationFull ? (
                <p className="font-hud flex items-center gap-2 text-[11px] tracking-wide text-rose-200/90">
                  <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} /> Registration is full right now
                </p>
              ) : (
                <p className="font-hud flex items-center gap-2 text-[11px] tracking-wide text-emerald-200/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                  <span><span className="font-bold text-emerald-300">{remaining}</span> account {remaining === 1 ? 'spot' : 'spots'} remaining</span>
                </p>
              )}
            </div>
          )}
        </aside>

        {/* ── RIGHT · form panel ─────────────────────────────────────── */}
        <section className="relative p-5 sm:p-7">
          {/* Top row — mobile header (left, small screens only) + close button.
              In-flow so the close never overlaps the Login/Register tabs. */}
          <div className="mb-5 flex items-start gap-3">
            <div className="md:hidden flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/12 border border-emerald-400/25 flex-shrink-0">
                <LockKeyhole className="w-5 h-5 text-emerald-300" strokeWidth={2.1} />
              </div>
              <div className="min-w-0">
                <p className="font-hud text-[10px] tracking-[0.35em] text-emerald-300/90 font-semibold uppercase">Authentication</p>
                <h2 className="font-display text-base font-semibold uppercase tracking-wide text-white truncate">
                  {isSignUp ? (step === 1 ? 'Create account' : 'About you') : 'Sign in'}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close authentication panel"
              className="ml-auto flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 bg-white/[0.02] text-gray-400 transition-colors hover:text-white hover:bg-white/[0.08]"
            >
              <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Segmented Login / Register control */}
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
              <button
                type="button"
                onClick={() => switchMode('signIn')}
                className={`font-hud rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors border ${!isSignUp ? 'border-emerald-400/30 bg-emerald-500/15 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => switchMode('signUp')}
                className={`font-hud rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors border ${isSignUp ? 'border-emerald-400/30 bg-emerald-500/15 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
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
                <div className="md:hidden flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-100">
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
                        usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'text-rose-300'
                          : usernameStatus === 'available' ? 'text-emerald-300'
                          : 'text-gray-500'
                      }`}>
                        {usernameStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.5} />}
                        {usernameStatus === 'available' && <Check className="w-3 h-3" strokeWidth={2.75} />}
                        {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <X className="w-3 h-3 flex-shrink-0" strokeWidth={2.75} />}
                        {usernameStatus === 'checking' ? 'Checking availability…'
                          : usernameStatus === 'available' ? 'Username is available'
                          : usernameStatus === 'invalid' ? usernameFormatError
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
                      {confirmPassword.length > 0 && (
                        password === confirmPassword ? (
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                            <Check className="w-3 h-3" strokeWidth={2.75} /> Passwords match
                          </p>
                        ) : (
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-rose-300">
                            <X className="w-3 h-3 flex-shrink-0" strokeWidth={2.75} /> Passwords do not match
                          </p>
                        )
                      )}
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
                <SubmitButton busy={false} disabled={registrationFull || usernameStatus === 'taken' || usernameStatus === 'invalid'}>
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
  'mt-1.5 w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400/55 focus:ring-2 focus:ring-emerald-400/20 focus:bg-[#070b0f]';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="font-hud block text-[11px] font-semibold tracking-[0.24em] text-gray-400 uppercase">{label}</label>
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
    <span className={`font-hud text-xs font-semibold uppercase tracking-wider ${active ? 'text-white' : 'text-gray-500'}`}>{label}</span>
  </div>
);

const SubmitButton = ({ busy, disabled, children }: { busy: boolean; disabled?: boolean; children: React.ReactNode }) => (
  <button
    type="submit"
    disabled={disabled}
    className="font-hud group flex items-center justify-center gap-2 w-full rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-wider text-[#04130a] transition-all duration-150 hover:brightness-110 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:brightness-100"
    style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)', boxShadow: '0 12px 30px -12px rgba(46,232,180,0.7)' }}
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
