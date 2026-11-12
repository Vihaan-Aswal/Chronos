import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase-client";
import Brand from "../components/app/brand.jsx";
import {
  AlertIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  MinusIcon,
} from "../components/app/icons.jsx";
import "../styles/app-system.css";
import "../styles/auth.css";

export default function SignInPage() {
  const navigate = useNavigate();
  const errorRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // Persist user and access token — primary source of truth for AuthGuard & downstream pages
    const userWithToken = {
      ...data.user,
      token: data.session?.access_token || "",
    };
    sessionStorage.setItem("chronos_user", JSON.stringify(userWithToken));
    if (data.session?.access_token) {
      sessionStorage.setItem("chronos_token", data.session.access_token);
    }

    // Navigate with replace so Back from /choose-role goes to /, not here
    navigate("/choose-role", { replace: true });
  }

  return (
    <div className="app auth">
      <aside className="auth-aside">
        <Brand tone="cream" />
        <div className="auth-aside-body">
          <h1>
            Signals,
            <br />
            <em>not surveillance.</em>
          </h1>
          <p className="auth-aside-lede">
            A live class is twenty people, not one average. Chronos names one
            state at a time and hands the next move to the teacher.
          </p>
        </div>
        <ul className="auth-facts">
          <li className="auth-fact is-kept">
            <CheckIcon />
            <span>One state at a time. No blended score.</span>
          </li>
          <li className="auth-fact is-kept">
            <CheckIcon />
            <span>A nudge reaches the student before the teacher acts.</span>
          </li>
          <li className="auth-fact is-never">
            <MinusIcon />
            <span>No video frames, audio, page content, or grades.</span>
          </li>
        </ul>
      </aside>

      <main className="auth-main" id="main">
        <div className="auth-form">
          <h2 className="auth-title">Sign in</h2>
          <p className="auth-sub">Use the email you enrolled with.</p>

          {error && (
            <div
              className="notice notice-flag auth-notice"
              role="alert"
              ref={errorRef}
              tabIndex={-1}
            >
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field field-password">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="field-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-ink btn-lg btn-block"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth-switch">
            New to Chronos? <Link to="/signup">Create an account</Link>
          </p>
        </div>

        <p className="auth-foot">
          <span>© 2026 Chronos</span>
          <span>Signals, not surveillance.</span>
        </p>
      </main>
    </div>
  );
}
