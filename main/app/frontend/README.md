# Chronos — Frontend

React 18 + Vite SPA for the Chronos engagement and identity platform.

## Scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start the Vite dev server on `http://localhost:5173` |
| `npm run build` | Build for production (output in `dist/`) |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | TypeScript static type check (`tsc --noEmit`) |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest test suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Environment variables

Copy `.env.example` to `.env` and fill in:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

VITE_BACKEND_URL=http://localhost:8000
VITE_BACKEND_WS_URL=ws://localhost:8000
VITE_HMS_TOKEN_ENDPOINT=http://localhost:8000/hms-token
VITE_HMS_ENV=dev

# Optional: verbose engagement debug logs
VITE_DEBUG_LOGS=false
```

## Key dependencies

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `react-router-dom` | Client-side routing |
| `@supabase/supabase-js` | Auth and database client |
| `@100mslive/react-sdk` | WebRTC video conferencing |
| `@mediapipe/tasks-vision` | MediaPipe vision tasks (face detection, landmarks) |
| `@vladmandic/face-api` | Face recognition / embedding |
| `recharts` | Engagement charts and analytics visualisation |
| `jspdf` | PDF export for session reports |
| `motion` | Animations and transitions |

## Testing

Tests use **Vitest** + **Testing Library**:

```bash
npm run test           # single run
npm run test:watch     # watch mode
npm run typecheck      # TS errors only
```

## Source layout

```
src/
├── components/        # Shared UI components
├── pages/             # Route-level page components
├── hooks/             # Custom React hooks
├── lib/               # Supabase client, HMS helpers, utilities
├── types/             # TypeScript type definitions
└── main.jsx           # App entry point
```

See the [root README](../../README.md) for full setup instructions.

