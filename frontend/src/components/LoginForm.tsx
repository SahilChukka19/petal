"use client";

import { useState } from "react";
import { login } from "@/lib/api";

export default function LoginForm({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setError("Please enter your username.");
      return;
    }
    if (!cleanPass) {
      setError("Please enter your password.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await login(cleanUser, cleanPass);
      onLogin(res.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = { border: "1px solid #F0DDE8", background: "#FAFAFA", color: "#2D1B2A", fontFamily: "var(--font-jakarta)" };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "linear-gradient(160deg, #FDF7F9 0%, #FBF0F4 40%, #F9EEF4 100%)" }}>
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl p-8 flex flex-col gap-5"
        style={{ background: "#fff", border: "1px solid #F0DDE8", boxShadow: "0 16px 48px rgba(232,71,138,0.12)" }}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "linear-gradient(135deg, #F9B8D5, #E8478A)" }}>🌸</div>
          <h1 className="font-playfair text-2xl font-bold" style={{ color: "#2D1B2A" }}>Petal</h1>
          <p className="text-sm" style={{ color: "#7A4E6A" }}>Sign in to your learning journal</p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold" style={{ color: "#2D1B2A" }}>
          <span>Username <span style={{ color: "#E8478A" }}>*</span></span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full px-4 py-2.5 rounded-xl text-sm font-normal outline-none"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold" style={{ color: "#2D1B2A" }}>
          <span>Password <span style={{ color: "#E8478A" }}>*</span></span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full px-4 py-2.5 rounded-xl text-sm font-normal outline-none"
            style={inputStyle}
          />
        </label>

        {error && <p className="text-xs" style={{ color: "#B42318" }}>{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #F0B8CF, #E8478A)", boxShadow: "0 4px 14px rgba(232,71,138,0.35)" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
