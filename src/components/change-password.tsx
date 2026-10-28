import { useState } from "react";
import { control } from "@/components/cards";
import { authClient } from "@/lib/auth/client";
import { changePasswordErrorText, checkNewPassword, MIN_PASSWORD } from "@/lib/auth/password-rules";

export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit() {
    setError("");
    setDone("");
    const problem = checkNewPassword(current, next, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const res = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: revokeOthers });
      if (res.error) {
        setError(changePasswordErrorText(res.error));
      } else {
        setCurrent("");
        setNext("");
        setConfirm("");
        setDone(revokeOthers ? "Password updated. Other devices are signed out." : "Password updated. You're all set.");
      }
    } catch {
      setError(changePasswordErrorText(null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="password" className="mt-10 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">Change password</h2>
      <p className="mt-1 text-sm text-muted">For email sign-ins. Min {MIN_PASSWORD} characters.</p>
      <form
        className="mt-4 grid gap-3 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label><span className="mb-1 block text-sm text-muted">Current password</span><input className={control} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label><span className="mb-1 block text-sm text-muted">New password</span><input className={control} type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label><span className="mb-1 block text-sm text-muted">Confirm new password</span><input className={control} type="password" autoComplete="new-password" minLength={MIN_PASSWORD} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm md:col-span-3"><input type="checkbox" checked={revokeOthers} onChange={(e) => setRevokeOthers(e.target.checked)} /> Sign me out on other devices</label>
        {error ? <p role="alert" className="text-sm text-danger md:col-span-3">{error}</p> : null}
        {done ? <p role="status" className="text-sm text-brand md:col-span-3">{done}</p> : null}
        <button className="h-12 rounded-full bg-brand font-semibold text-card disabled:opacity-60" type="submit" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </section>
  );
}
