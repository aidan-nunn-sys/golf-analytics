import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Incorrect email or password");
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm rounded border bg-white p-6">
      <h1 className="mb-4 text-lg font-semibold">Sign in</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full rounded border p-2" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoFocus />
        <input className="w-full rounded border p-2" type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-green-700 p-2 text-white" type="submit">Sign in</button>
      </form>
    </div>
  );
}
