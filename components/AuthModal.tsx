"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { useAuth } from "../app/providers";

function friendlyAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("email-already-in-use")) return "An account already exists for this email.";
  if (code.includes("invalid-credential")) return "That email or password doesn’t match.";
  if (code.includes("weak-password")) return "Use a stronger password with at least six characters.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please wait a moment and try again.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function AuthModal() {
  const {
    authOpen,
    authMode,
    closeAuth,
    setAuthMode,
    register,
    login,
    resetPassword,
    configured,
  } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMessage("");
        closeAuth();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [authOpen, authMode, closeAuth]);

  if (!authOpen) return null;

  const dismiss = () => {
    setMessage("");
    closeAuth();
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) dismiss();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (authMode === "register" && password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setMessage("Password must be at least six characters.");
      return;
    }
    setBusy(true);
    try {
      if (authMode === "register") await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setMessage("Enter your email first, then choose reset password.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setMessage("Password reset email sent.");
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-backdrop" onMouseDown={closeFromBackdrop}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" type="button" onClick={dismiss} aria-label="Close account dialog">×</button>
        <div className="auth-brand">
          <img src="/deccan-flame-logo.webp" alt="" />
          <span><strong>Deccan Flame</strong><small>Guest table</small></span>
        </div>

        {!configured ? (
          <div className="auth-setup">
            <span>Firebase setup needed</span>
            <h2 id="auth-title">Connect your Firebase project.</h2>
            <p>Copy <strong>.env.example</strong> to <strong>.env.local</strong>, add your Firebase web app values, then restart the local server.</p>
            <button type="button" onClick={dismiss}>Got it</button>
          </div>
        ) : (
          <>
            <div className="auth-tabs" aria-label="Account action">
              <button className={authMode === "login" ? "active" : ""} type="button" onClick={() => { setMessage(""); setAuthMode("login"); }}>Sign in</button>
              <button className={authMode === "register" ? "active" : ""} type="button" onClick={() => { setMessage(""); setAuthMode("register"); }}>Register</button>
            </div>
            <div className="auth-heading">
              <p>{authMode === "login" ? "Welcome back" : "Join the table"}</p>
              <h2 id="auth-title">{authMode === "login" ? "Your vote is waiting." : "Create your Deccan account."}</h2>
            </div>
            <form className="auth-form" onSubmit={submit}>
              {authMode === "register" && (
                <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
              )}
              <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
              <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={authMode === "login" ? "current-password" : "new-password"} required /></label>
              {authMode === "register" && (
                <label><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
              )}
              {message && <p className="auth-message" role="status">{message}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>
                <span>{busy ? "One moment…" : authMode === "login" ? "Sign in" : "Create account"}</span><i aria-hidden="true">↗</i>
              </button>
              {authMode === "login" && <button className="auth-reset" type="button" onClick={sendReset} disabled={busy}>Reset password</button>}
            </form>
          </>
        )}
      </section>
    </div>
  );
}
