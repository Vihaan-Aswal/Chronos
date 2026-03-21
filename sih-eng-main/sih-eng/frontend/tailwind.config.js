/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Tailwind will activate the dark variant when a parent element has class="dark"
  darkMode: "class",
  theme: {
    extend: {
      // ─── Color Tokens ────────────────────────────────────────────────────────
      // This is a unified superset of all tokens that appear across the Stitch
      // screens (chronos_homepage light-mode + chronos_sign_in dark-mode).
      // Light-mode components use these directly.
      // Dark-mode components activate alternate values via Tailwind dark: variants
      // by applying class="dark" to their root element (see SignInPage).
      colors: {
        // --- Shared / cross-mode tokens ---
        "tertiary-fixed-dim":       "#dcc492", // Gold accent — same in both modes
        "tertiary-fixed":           "#fae0ab",

        // --- Light-mode (Parchment) palette — used on Homepage, SignUp, ChooseRole, Readiness ---
        // surface hierarchy
        "surface":                  "#faf9f5",
        "surface-dim":              "#dbdad6",
        "surface-bright":           "#faf9f5",
        "surface-container-lowest": "#ffffff",
        "surface-container-low":    "#f5f4f0",
        "surface-container":        "#efeeea",
        "surface-container-high":   "#e9e8e4",
        "surface-container-highest":"#e3e2df",
        "surface-variant":          "#e3e2df",
        "surface-tint":             "#506070",
        // primary / content
        "primary":                  "#051624",
        "primary-container":        "#1b2b39",
        "primary-fixed":            "#d3e4f7",
        "primary-fixed-dim":        "#b8c8db",
        "on-primary":               "#ffffff",
        "on-primary-fixed":         "#0c1d2a",
        "on-primary-fixed-variant": "#394857",
        "on-primary-container":     "#8292a4",
        "inverse-primary":          "#b8c8db",
        // secondary
        "secondary":                "#48626e",
        "secondary-container":      "#cbe7f5",
        "secondary-fixed":          "#cbe7f5",
        "secondary-fixed-dim":      "#afcbd8",
        "on-secondary":             "#ffffff",
        "on-secondary-container":   "#4e6874",
        "on-secondary-fixed":       "#021f29",
        "on-secondary-fixed-variant":"#304a55",
        // tertiary (light)
        "tertiary":                 "#1d1300",
        "tertiary-container":       "#352704",
        "on-tertiary":              "#ffffff",
        "on-tertiary-container":    "#a48e60",
        "on-tertiary-fixed":        "#251a00",
        "on-tertiary-fixed-variant":"#55451e",
        // background / text
        "background":               "#faf9f5",
        "on-background":            "#1b1c1a",
        "on-surface":               "#1b1c1a",
        "on-surface-variant":       "#43474c",
        "inverse-surface":          "#30312e",
        "inverse-on-surface":       "#f2f1ed",
        // outlines
        "outline":                  "#74777c",
        "outline-variant":          "#c4c7cc",
        // feedback
        "error":                    "#ba1a1a",
        "error-container":          "#ffdad6",
        "on-error":                 "#ffffff",
        "on-error-container":       "#93000a",

        // --- Dark-mode (Midnight) overrides — only active when .dark is on parent ---
        // These are stored under a "dark-*" namespace so components can reference them
        // OR components can rely on Tailwind's `dark:` variant to flip to different values.
        "midnight-surface":                  "#041523",
        "midnight-surface-dim":              "#041523",
        "midnight-surface-bright":           "#2b3b4a",
        "midnight-surface-container-lowest": "#000f1d",
        "midnight-surface-container-low":    "#0c1d2b",
        "midnight-surface-container":        "#10212f",
        "midnight-surface-container-high":   "#1b2b3a",
        "midnight-surface-container-highest":"#263645",
        "midnight-surface-variant":          "#263645",
        "midnight-surface-tint":             "#dcc492",
        // midnight primary
        "midnight-primary":                  "#f9e0ac",
        "midnight-primary-container":        "#dcc492",
        "midnight-primary-fixed":            "#f9e0ac",
        "midnight-primary-fixed-dim":        "#dcc492",
        "midnight-on-primary":               "#3d2e09",
        "midnight-on-primary-fixed":         "#251a00",
        "midnight-on-primary-fixed-variant": "#55451e",
        "midnight-on-primary-container":     "#625028",
        "midnight-inverse-primary":          "#6e5c33",
        // midnight secondary
        "midnight-secondary":                "#afcbd9",
        "midnight-secondary-container":      "#304a56",
        "midnight-secondary-fixed":          "#cbe7f5",
        "midnight-secondary-fixed-dim":      "#afcbd9",
        "midnight-on-secondary":             "#19343f",
        "midnight-on-secondary-container":   "#9eb9c7",
        "midnight-on-secondary-fixed":       "#011f29",
        "midnight-on-secondary-fixed-variant":"#304a56",
        // midnight tertiary
        "midnight-tertiary":                 "#f9e0ac",
        "midnight-tertiary-container":       "#dcc492",
        "midnight-on-tertiary":              "#3d2e09",
        "midnight-on-tertiary-container":    "#625028",
        "midnight-on-tertiary-fixed":        "#251a00",
        "midnight-on-tertiary-fixed-variant":"#55451e",
        // midnight background / text
        "midnight-background":               "#041523",
        "midnight-on-background":            "#d3e4f8",
        "midnight-on-surface":               "#d3e4f8",
        "midnight-on-surface-variant":       "#cfc5b7",
        "midnight-inverse-surface":          "#d3e4f8",
        "midnight-inverse-on-surface":       "#223241",
        // midnight outlines
        "midnight-outline":                  "#989082",
        "midnight-outline-variant":          "#4c463b",
        // midnight feedback
        "midnight-error":                    "#ffb4ab",
        "midnight-error-container":          "#93000a",
        "midnight-on-error":                 "#690005",
        "midnight-on-error-container":       "#ffdad6",
      },

      // ─── Typography ───────────────────────────────────────────────────────────
      fontFamily: {
        headline: ["Newsreader", "serif"],
        body:     ["Manrope", "sans-serif"],
        label:    ["Manrope", "sans-serif"],
      },

      // ─── Border Radius ────────────────────────────────────────────────────────
      // Sharp by default (per DESIGN.md primary buttons). Larger values for cards/modals.
      borderRadius: {
        DEFAULT: "0.125rem", // sharp — primary buttons, inputs
        lg:      "0.25rem",  // cards (md in DESIGN.md)
        xl:      "0.5rem",   // elevated modals
        full:    "0.75rem",  // chips, pills, tags (DESIGN.md "full")
      },

      // ─── Custom Animations ────────────────────────────────────────────────────
      keyframes: {
        "fade-in-out": {
          "0%":   { opacity: "0", transform: "translate(-50%, 20px)" },
          "10%":  { opacity: "1", transform: "translate(-50%, 0)" },
          "90%":  { opacity: "1", transform: "translate(-50%, 0)" },
          "100%": { opacity: "0", transform: "translate(-50%, -20px)" },
        },
        "nudge-slide-in": {
          "0%":   { opacity: "0", transform: "translate(-50%, 24px)" },
          "15%":  { opacity: "1", transform: "translate(-50%, 0)" },
          "85%":  { opacity: "1", transform: "translate(-50%, 0)" },
          "100%": { opacity: "0", transform: "translate(-50%, -12px)" },
        },
      },
      animation: {
        "fade-in-out":    "fade-in-out 3s ease-in-out",
        "nudge-slide-in": "nudge-slide-in 3s ease-in-out forwards",
      },
    },
  },
  plugins: [],
}