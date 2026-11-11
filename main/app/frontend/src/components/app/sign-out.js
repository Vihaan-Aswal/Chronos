import { supabase } from "../../supabase-client";

export async function signOut(navigate) {
  try {
    await supabase.auth.signOut();
  } catch {
    // A failed network sign-out must not trap the user in the app.
  }
  sessionStorage.removeItem("chronos_user");
  sessionStorage.removeItem("chronos_role");
  navigate("/", { replace: true });
}
