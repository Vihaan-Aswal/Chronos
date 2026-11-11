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

export default function SignUpPage() {
  const navigate = useNavigate();
  const errorRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // Destroy the session Supabase may create, so the user signs in explicitly.
    if (data?.session) {
      await supabase.auth.signOut();
    }

    setSuccess(true);

    setTimeout(() => {
      navigate("/signin", { replace: true });
    }, 2200);
  }

  const mismatch = error === "Passwords do not match.";

  return (
    <div className="app auth">
      <aside className="auth-aside">
        <Brand tone="cream" />
        <div className="auth-aside-body">
          <h1>
            One room.
            <br />
            <em>Six labels.</em>
          </h1>
          <p className="auth-aside-lede">
            Teachers host and read the room. Students join and see their own
            signals. Neither side sees a blended score.
          </p>
        </div>
        <ul className="auth-facts">
          <li className="auth-fact is-kept">
            <CheckIcon />
            <span>One state at a time. No blended score.</span>
          </li>
          <li className="auth-fact is-kept">
            <CheckIcon />
            <span>The teacher keeps the last word on every action.</span>
          </li>
          <li className="auth-fact is-never">
            <MinusIcon />
            <span>No video frames, audio, page content, or grades.</span>
          </li>
        </ul>
      </aside>

      <main className="auth-main" id="main">
        <div className="auth-form">
          <h2 className="auth-title">Create your account</h2>
          <p className="auth-sub">
            One account for hosting a class or joining one.
          </p>

          {success && (
            <div className="notice notice-ok auth-notice" role="status">
              <CheckIcon />
              <span>
                Account created. Taking you to sign in…{" "}
                <Link to="/signin" replace>
                  Sign in now
                </Link>
              </span>
            </div>
          )}

          {error && !success && !mismatch && (
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

          {!success && (
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
                  autoComplete="new-password"
                  required
                  placeholder="Choose a password"
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

              <div className="field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="Repeat the password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={mismatch}
                  aria-describedby={mismatch ? "confirm-error" : undefined}
                />
                {mismatch && (
                  <p className="field-error" id="confirm-error" role="alert">
                    <AlertIcon />
                    The two passwords do not match.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-ink btn-lg btn-block"
                disabled={loading}
              >
                {loading ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}

          <p className="auth-switch">
            Already have an account? <Link to="/signin">Sign in</Link>
          </p>
        </div>

        <p className="auth-foot">
          <span>© 2026 Chronos</span>
          <span>Not a proctoring tool.</span>
        </p>
      </main>
    </div>
  );
}
