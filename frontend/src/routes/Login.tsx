import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Incorrect email or password" : err instanceof Error ? err.message : "Unable to sign in. Please try again.");
    } finally { setPending(false); }
  }

  return (
    <div className="panel mx-auto mt-16 max-w-sm sm:mt-24">
      <p className="eyebrow">Golf Analytics</p>
      <h1 className="mb-2 mt-3 text-3xl font-bold">Welcome back</h1>
      <p className="mb-6 text-sm text-slate-500">Sign in to your personal clubhouse.</p>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full rounded border p-2" type="email" autoComplete="username" required aria-label="Email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoFocus />
        <input className="w-full rounded border p-2" type="password" autoComplete="current-password" required aria-label="Password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="error-notice">{error}</p>}
        <button className="btn-primary w-full" disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
