// src/components/Login.jsx

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  function showMsg(type, text) {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 5000);
  }

  async function handleSignup() {
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!loginError) {
        showMsg("info", "User already registered. Please log in.");
        setLoading(false);
        return;
      }

      if (loginError.message !== "Invalid login credentials") {
        showMsg("error", "Signup error: " + loginError.message);
        setLoading(false);
        return;
      }

      const { error: signupError } =
        await supabase.auth.signUp({ email, password });

      if (signupError) {
        showMsg("error", "Signup failed: " + signupError.message);
        setLoading(false);
        return;
      }

      showMsg("success", "Signup successful! Please log in now.");
    } finally {
      setLoading(false);
    }
  }

  async function loginAndRedirect(role) {
    setLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showMsg("error", "Login failed: " + error.message);
        setLoading(false);
        return;
      }

      const internalRole = role === "host" ? "teacher" : "student";
      navigate(`/${internalRole}`, {
        state: { user: data.user, role: internalRole },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />

      <div className="relative w-full max-w-sm">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl p-8 ring-1 ring-white/5">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 mb-4 text-3xl font-bold text-indigo-200">
              C
            </div>
            <h1 className="text-white text-3xl font-bold tracking-tight mb-1">
              Chronos
            </h1>
            <p className="text-indigo-200/80 text-sm">
              Restore classroom visibility
            </p>
          </div>

          {message.text && (
            <div
              className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
                message.type === "error"
                  ? "bg-red-500/20 text-red-200 border border-red-400/30"
                  : message.type === "success"
                  ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                  : "bg-indigo-500/20 text-indigo-200 border border-indigo-400/30"
              }`}
            >
              {message.text}
            </div>
          )}

          <input
            type="email"
            placeholder="Email"
            className="w-full p-3.5 rounded-xl bg-white/10 text-white placeholder-indigo-200/50 border border-white/10 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all duration-200"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full p-3.5 rounded-xl bg-white/10 text-white placeholder-indigo-200/50 border border-white/10 mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all duration-200"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleSignup}
            disabled={loading}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-xl transition-all duration-200 mb-6 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Please wait..." : "Sign Up"}
          </button>

          <div className="text-center text-indigo-200/70 mb-4 text-sm font-medium">
            Choose your role
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => loginAndRedirect("host")}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:opacity-50"
            >
              Host
            </button>
            <button
              onClick={() => loginAndRedirect("join")}
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
