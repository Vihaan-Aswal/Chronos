/**
 * AuthGuard.jsx
 *
 * A thin wrapper component that protects routes requiring an authenticated user.
 *
 * Recovery strategy (layered, no backend changes):
 *   1. sessionStorage.getItem('chronos_user') — set on sign-in, fastest path.
 *   2. supabase.auth.getUser()                — recovers from active Supabase
 *      session cookie on page refresh even after sessionStorage is cleared.
 *   3. If both fail → redirect to /signin.
 *
 * Usage in main.jsx:
 *   <Route path="/choose-role" element={<AuthGuard><ChooseRolePage /></AuthGuard>} />
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AuthGuard({ children }) {
  const navigate = useNavigate();
  // null  = still checking
  // true  = authenticated, render children
  // false = unauthenticated, redirect fired
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      // --- Layer 1: sessionStorage (synchronous, fastest) ---
      const raw = sessionStorage.getItem("chronos_user");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Accept any truthy object that looks like a user record
          if (parsed && (parsed.id || parsed.user_id)) {
            if (!cancelled) setStatus(true);
            return;
          }
        } catch {
          // Malformed JSON — fall through to layer 2
          sessionStorage.removeItem("chronos_user");
        }
      }

      // --- Layer 2: Supabase session cookie recovery ---
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!cancelled) {
          if (!error && data?.user) {
            // Restore sessionStorage so subsequent guards are fast
            sessionStorage.setItem("chronos_user", JSON.stringify(data.user));
            setStatus(true);
          } else {
            setStatus(false);
          }
        }
      } catch {
        if (!cancelled) setStatus(false);
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  // Redirect once we know the user is not authenticated
  useEffect(() => {
    if (status === false) {
      navigate("/signin", { replace: true });
    }
  }, [status, navigate]);

  // Still verifying → render nothing (avoids flash of protected content)
  if (status === null) return null;

  // Authenticated → render the wrapped route
  if (status === true) return children;

  // Redirecting → render nothing
  return null;
}
