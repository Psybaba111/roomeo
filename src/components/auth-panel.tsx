import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { listCities } from "@/lib/roomsetu/public-api";
import { control } from "@/components/cards";
import { errText, safeNext } from "@/lib/ui-text";

const BEARER_KEY = "grok-auth.bearer-token";

async function remember(token?: string | null) {
  if (!token) return;
  sessionStorage.setItem(BEARER_KEY, token);
  await authClient.getSession();
}

export function AuthPanel({ mode }: { mode: "login" | "register" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mobile, setMobile] = useState("");
  const [city, setCity] = useState("Bengaluru");
  const [intent, setIntent] = useState("BOTH");
  const [cities, setCities] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const picked = sessionStorage.getItem("roomsetu-intent");
    if (picked === "LOOKING" || picked === "OFFERING" || picked === "BOTH") setIntent(picked);
    void listCities()
      .then((rows) => setCities(rows.map((r) => r.name)))
      .catch(() => undefined);
  }, []);

  async function finish() {
    const next = safeNext(sessionStorage.getItem("roomsetu-next"));
    sessionStorage.removeItem("roomsetu-next");
    window.location.assign(next);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-4xl">{mode === "login" ? "Welcome back" : "Create your roomeo.com"}</h1>
      <p className="mt-2 text-muted">
        {mode === "login" ? "Use email, Google, or X." : "A few details. You can be looking, offering, or both."}
      </p>
      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void (async () => {
            try {
              if (mode === "register") {
                const result = await authClient.signUp.email({ email, password, name });
                if (result.error) throw new Error(result.error.message || "Could not create the account");
                await remember((result.data as { token?: string } | null)?.token);
                sessionStorage.setItem("roomsetu-extra", JSON.stringify({ mobile, city, intent }));
                sessionStorage.removeItem("roomsetu-intent");
              } else {
                const result = await authClient.signIn.email({ email, password });
                if (result.error) throw new Error(result.error.message || "Could not sign in");
                await remember((result.data as { token?: string } | null)?.token);
              }
              await finish();
            } catch (err) {
              setError(errText(err));
              setBusy(false);
            }
          })();
        }}
      >
        {mode === "register" ? (
          <>
            <input className={control} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className={control} placeholder="Mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
            <select className={control} value={city} onChange={(e) => setCity(e.target.value)}>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className={control} value={intent} onChange={(e) => setIntent(e.target.value)}>
              <option value="LOOKING">Looking for a room</option>
              <option value="OFFERING">Offering a room</option>
              <option value="BOTH">Both</option>
            </select>
          </>
        ) : null}
        <input className={control} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={control} type="password" placeholder="Password (8+ characters)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button type="submit" disabled={busy} className="h-12 w-full rounded-full bg-brand font-semibold text-card disabled:opacity-60">
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <div className="my-4 text-center text-sm text-muted">or</div>
      <div className="space-y-2">
        {GROK_PROVIDERS.map((p) => (
          <button
            key={p.providerId}
            type="button"
            className="h-12 w-full rounded-full border border-line bg-card font-semibold"
            onClick={() => {
              void signIn(p.providerId, { callbackURL: "/dashboard" }).catch((err) => setError(errText(err)));
            }}
          >
            Continue with {p.label}
          </button>
        ))}
      </div>
      {mode === "register" ? (
        <p className="mt-6 text-sm text-muted">
          The first account created on this prototype becomes the operator and can open the marketplace desk.
        </p>
      ) : null}
      <p className={`${mode === "register" ? "mt-2" : "mt-6"} text-sm text-muted`}>
        {mode === "login" ? (
          <>
            New here? <Link to="/register" className="font-semibold text-brand">Create an account</Link>
          </>
        ) : (
          <>
            Already have one? <Link to="/login" className="font-semibold text-brand">Sign in</Link>
          </>
        )}
      </p>
    </div>
  );
}
