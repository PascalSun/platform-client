"use client";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, ArrowRight, X, Info, KeyRound, MailCheck, Hash } from "lucide-react";

import { changePassword, requestEmailCode, resendVerifyLink, signInWithPassword, verifyEmailCode, SUPPORT_EMAIL_FALLBACK } from "./auth";
import { config } from "./config";
// The sign-in dialog every app on the platform uses: an emailed 6-digit code by default, a
// password as the alternative. Moved here from the MineTrace frontend so CoreTrace, the hub
// and MineTrace share one dialog. Strings are English by default; pass `t` to translate.
export const EN = {
  "eg.backToPassword": "Back to password sign-in",
  "eg.beta": "beta",
  "eg.bodyPost": ". We'll email you a six-digit code. Enter it to sign in — no password, no spam.",
  "eg.bodyPre": "{app} is in",
  "eg.checkSpam": "Not there? Check your spam or junk folder — Outlook and corporate mail filters often put it there.",
  "eg.codeAria": "Six-digit code",
  "eg.codeBody": "We emailed a six-digit code to {email}. It has no link in it, so spam filters rarely touch it.",
  "eg.codeSent": "Code sent",
  "eg.codeTitle": "Enter your code",
  "eg.emailAria": "Email address",
  "eg.enter": "Continue",
  "eg.entering": "Entering…",
  "eg.existsBody": "{email} already has an account, so we emailed a sign-in link there. Open it to sign in, or use your password.",
  "eg.existsNoMail": "{email} already has an account. Sign in with your password, or ask for a new link.",
  "eg.existsTitle": "Check your email",
  "eg.forgot": "Forgot your password?",
  "eg.forgotBody": "Enter your email and we will send you a sign-in link. Open it to sign in and set a new password.",
  "eg.needEmail": "Enter your email first, then we can send the link.",
  "eg.newPassword": "New password",
  "eg.noCode": "No code? Sign in with password",
  "eg.noMailHelp": "You can contact Pascal to sort this out:",
  "eg.note": "Enter the code to sign in. During beta, chats and scored locations are logged to improve the model and product.",
  "eg.or": "or",
  "eg.otherEmail": "Use a different email",
  "eg.password": "Password",
  "eg.pwBody": "Enter your email and the account password from your welcome email (or the one you set on your account).",
  "eg.resendCode": "Send another code",
  "eg.resetBody": "We emailed a sign-in link to {email}. Open it and you will be signed in; then click your avatar (top right) → Account & password to set a new password.",
  "eg.resetTitle": "Reset your password",
  "eg.savePw": "Save password",
  "eg.saving": "Saving…",
  "eg.sendReset": "Send reset link",
  "eg.setPwBody": "Your email is confirmed. Pick a password — you will need it for the MCP connector; on the website your email alone is enough.",
  "eg.setPwTitle": "Choose a new password",
  "eg.skipPw": "Skip for now",
  "eg.title": "Enter your email to continue",
  "eg.useCode": "Email me a code instead",
  "eg.useEmail": "Sign in with an email link",
  "eg.usePassword": "Sign in with password",
  "eg.verify": "Verify",
  "eg.verifying": "Verifying…",
  "ve.linkSent": "Sent. Check your inbox (and spam).",
  "ve.resendLink": "Email me a sign-in link",
  "ve.sending": "Sending…"
} as const;
export type GateKey = keyof typeof EN;


/**
 * Email gate. Shown before entering the map when the user has no cached session.
 * A NEW email opens a session at once; the platform mails a verification link, and
 * the session stays in a grace period (map + scoring, no assistant, no private data)
 * until the link is used. An EXISTING account is not opened by its address alone:
 * the gate shows where the sign-in link went, offers a resend, the password mode,
 * and the support contact for when no email arrives. The password mode (email + the
 * account password from the welcome mail) opens a verified session straight away.
 */
export type EmailGateProps = {
  open: boolean;
  onClose: () => void;
  onAuthed: () => void;
  initialStep?: "email" | "password";
  /** Translate a string; English when omitted or when it returns nothing. */
  t?: (key: GateKey) => string | undefined;
};

export function EmailGate(props: EmailGateProps) {
  const { open, onClose, onAuthed, initialStep = "email" } = props;
  const t = (k: GateKey) => (props.t?.(k) ?? EN[k]).replace("{app}", config.appName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password" | "exists" | "forgot" | "code" | "setpw">(initialStep);
  /** Where the code screen goes on success: straight in, or on to choosing a password. */
  const [afterCode, setAfterCode] = useState<"in" | "setpw">("in");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [supportEmail, setSupportEmail] = useState(SUPPORT_EMAIL_FALLBACK);
  const [resent, setResent] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  // Reset each time the gate opens (done during render, the React-sanctioned way to react
  // to a prop change, rather than in an effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) { setPassword(""); setCode(""); setStep(initialStep); setError(null); setBusy(false); setResetMode(false); setAfterCode("in"); }
  }

  const SECONDARY = "flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40";
  const INPUT = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400";
  const switchTo = (s: "email" | "password" | "forgot") => {
    setStep(s); setPassword(""); setError(null);
    if (s !== "forgot") setAfterCode("in");
  };

  // Nothing is signed in until the emailed code is verified: the email step only asks the
  // platform for a code. (The old flow minted an unverified session here with a 30-day
  // grace; the owner wants no session at all before the code.)
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      await requestEmailCode(email.trim());
      setResent(false); setResetMode(false);
      setCode(""); setCodeSent(true); setStep("code");
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  async function resend() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await resendVerifyLink(email.trim(), { reset: resetMode }); setResent(true); setLinkSent(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  /** Forgot password: a code, then the new password is chosen here.
   *
   *  It used to mail a link that landed on a change-password page. Proving the address is
   *  the only thing that link did, and a code proves it without being the one message a
   *  corporate Microsoft filter refuses to deliver. The form it used to open is now just
   *  the next step on this screen. */
  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!valid) { setError(t("eg.needEmail")); emailRef.current?.focus(); return; }
    setAfterCode("setpw");
    await sendCode();
  }

  /** Ask for a one-time code — the sign-in mail with no link in it. */
  async function sendCode() {
    if (busy || !valid) return;
    setBusy(true); setError(null);
    try {
      await requestEmailCode(email.trim());
      setCode(""); setCodeSent(true); setStep("code");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.trim().length < 6) return;
    setBusy(true); setError(null);
    try {
      await verifyEmailCode(email.trim(), code.trim());
      // A verified session is exactly what the change-password endpoint wants, so the
      // reset flow can finish right here instead of sending the user to a page.
      if (afterCode === "setpw") { setPassword(""); setStep("setpw"); setBusy(false); return; }
      onAuthed();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy || password.length < 8) return;
    setBusy(true); setError(null);
    try { await changePassword(password); onAuthed(); }
    catch (err) { setError((err as Error).message); setBusy(false); }
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !password || busy) return;
    setBusy(true); setError(null);
    try {
      await signInWithPassword(email.trim(), password);
      onAuthed();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white/90 p-7 shadow-glass ring-1 ring-black/5 backdrop-blur-xl"
          >
            <button onClick={onClose} disabled={busy}
              className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40">
              <X size={16} />
            </button>

            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white">
              {step === "setpw" ? <KeyRound size={19} /> : step === "code" ? <Hash size={19} /> : step === "password" || step === "forgot" ? <KeyRound size={19} /> : step === "exists" ? <MailCheck size={19} /> : <Mail size={19} />}
            </span>
            <h2 className="mt-4 text-xl font-bold tracking-tight text-slate-900">
              {step === "setpw" ? t("eg.setPwTitle") : step === "code" ? t("eg.codeTitle") : step === "exists" ? (resetMode ? t("eg.resetTitle") : t("eg.existsTitle")) : step === "forgot" ? t("eg.resetTitle") : t("eg.title")}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {step === "setpw"
                ? t("eg.setPwBody")
                : step === "code"
                ? t("eg.codeBody").replace("{email}", email.trim())
                : step === "email"
                ? <>{t("eg.bodyPre")} <span className="font-medium text-slate-700">{t("eg.beta")}</span>{t("eg.bodyPost")}</>
                : step === "exists"
                ? (resetMode ? t("eg.resetBody") : linkSent ? t("eg.existsBody") : t("eg.existsNoMail")).replace("{email}", email.trim())
                : step === "forgot" ? t("eg.forgotBody")
                : t("eg.pwBody")}
            </p>

            {step === "email" ? (
              <form onSubmit={submitEmail} className="mt-5 space-y-3">
                <input
                  type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" aria-label={t("eg.emailAria")} autoComplete="username"
                  className={INPUT}
                />
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <button
                  type="submit" disabled={!valid || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy ? t("eg.entering") : t("eg.enter")} <ArrowRight size={16} />
                </button>
                <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />{t("eg.or")}<span className="h-px flex-1 bg-slate-200" />
                </div>
                <button type="button" disabled={busy} onClick={() => switchTo("password")} className={SECONDARY}>
                  <KeyRound size={16} /> {t("eg.usePassword")}
                </button>
              </form>
            ) : step === "exists" ? (
              <div className="mt-5 space-y-3">
                {resent && <p className="flex items-center gap-1.5 text-sm text-emerald-700"><MailCheck size={15} /> {t("ve.linkSent")}</p>}
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  {t("eg.checkSpam")}
                </p>
                {error && <p className="text-sm text-rose-600">{error}</p>}
                {!resetMode && (
                  <button type="button" disabled={busy} onClick={() => switchTo("password")}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40">
                    <KeyRound size={16} /> {t("eg.usePassword")}
                  </button>
                )}
                {/* Above the resend on purpose: resending the same link to someone whose
                    filter already ate it is the least likely thing to work. */}
                <button type="button" disabled={busy} onClick={sendCode} className={SECONDARY}>
                  <Hash size={16} /> {t("eg.useCode")}
                </button>
                <button type="button" disabled={busy} onClick={resend} className={SECONDARY}>
                  <Mail size={16} /> {busy ? t("ve.sending") : t("ve.resendLink")}
                </button>
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  {t("eg.noMailHelp")} <a href={`mailto:${supportEmail}`} className="font-semibold underline">{supportEmail}</a>
                </p>
                <button type="button" disabled={busy} onClick={() => switchTo("email")}
                  className="w-full text-xs text-slate-400 hover:text-slate-600">
                  {t("eg.otherEmail")}
                </button>
              </div>
            ) : step === "setpw" ? (
              <form onSubmit={savePassword} className="mt-5 space-y-3">
                <input
                  type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("eg.newPassword")} aria-label={t("eg.newPassword")} autoComplete="new-password"
                  className={INPUT}
                />
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <button
                  type="submit" disabled={password.length < 8 || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy ? t("eg.saving") : t("eg.savePw")} <ArrowRight size={16} />
                </button>
                {/* The session is already open and verified; a password is only needed for
                    the MCP connector, so skipping is a real option rather than a dead end. */}
                <button type="button" disabled={busy} onClick={onAuthed}
                  className="w-full text-xs text-slate-400 hover:text-slate-600">
                  {t("eg.skipPw")}
                </button>
              </form>
            ) : step === "code" ? (
              <form onSubmit={submitCode} className="mt-5 space-y-3">
                {codeSent && (
                  <>
                    <p className="flex items-center gap-1.5 text-sm text-emerald-700"><MailCheck size={15} /> {t("eg.codeSent")}</p>
                    {/* Said before they go looking, not after they give up. A filtered mail is
                        the single commonest reason someone never gets in, and the fix — open
                        the junk folder — is one the person can do and we cannot. */}
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                      {t("eg.checkSpam")}
                    </p>
                  </>
                )}
                <input
                  autoFocus value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
                  aria-label={t("eg.codeAria")}
                  className={`${INPUT} text-center font-mono text-lg tracking-[0.4em]`}
                />
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <button
                  type="submit" disabled={code.length < 6 || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy ? t("eg.verifying") : t("eg.verify")} <ArrowRight size={16} />
                </button>
                <button type="button" disabled={busy} onClick={sendCode} className={SECONDARY}>
                  <Mail size={16} /> {busy ? t("ve.sending") : t("eg.resendCode")}
                </button>
                <button type="button" disabled={busy}
                  onClick={async () => { await resend(); setStep("exists"); }}
                  className="w-full text-xs text-slate-400 hover:text-slate-600">
                  {t("ve.resendLink")}
                </button>
                <button type="button" disabled={busy} onClick={() => switchTo("password")}
                  className="w-full text-xs text-slate-400 hover:text-slate-600">
                  {t("eg.noCode")}
                </button>
              </form>
            ) : step === "forgot" ? (
              <form onSubmit={forgot} className="mt-5 space-y-3">
                <input
                  ref={emailRef} autoFocus
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" aria-label={t("eg.emailAria")} autoComplete="username"
                  className={INPUT}
                />
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <button
                  type="submit" disabled={!valid || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy ? t("ve.sending") : t("eg.sendReset")} <ArrowRight size={16} />
                </button>
                <button type="button" disabled={busy} onClick={() => switchTo("password")}
                  className="w-full text-xs text-slate-400 hover:text-slate-600">
                  {t("eg.backToPassword")}
                </button>
              </form>
            ) : (
              <form onSubmit={submitPassword} className="mt-5 space-y-3">
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com" aria-label={t("eg.emailAria")} autoComplete="username"
                  className={INPUT}
                />
                <input
                  type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("eg.password")} aria-label={t("eg.password")} autoComplete="current-password"
                  className={INPUT}
                />
                {error && <p className="text-sm text-rose-600">{error}</p>}
                <button
                  type="submit" disabled={!valid || !password || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  {busy ? t("eg.entering") : t("eg.enter")} <ArrowRight size={16} />
                </button>
                <button type="button" disabled={busy} onClick={() => switchTo("forgot")}
                  className="w-full py-1 text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline disabled:opacity-40">
                  {t("eg.forgot")}
                </button>
                <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />{t("eg.or")}<span className="h-px flex-1 bg-slate-200" />
                </div>
                <button type="button" disabled={busy} onClick={() => switchTo("email")} className={SECONDARY}>
                  <Mail size={16} /> {t("eg.useEmail")}
                </button>
              </form>
            )}

            <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-400">
              <Info size={13} className="mt-0.5 shrink-0" />
              {t("eg.note")}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
