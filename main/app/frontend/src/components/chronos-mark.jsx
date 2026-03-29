// src/components/ChronosMark.jsx
//
// The Chronos brand mark — an open C-arc (300° of a circle) with a single
// inward tick stroke at the gap. Reads simultaneously as: the letter C,
// a clock face with one hand, and an eye — all in a single path.
//
// Props:
//   size    {number}           Width & height in px. Default: 32.
//   variant {"dark" | "gold"}  "dark" = #041523 (use on light/parchment backgrounds)
//                              "gold" = #DCC492 (use on dark/midnight backgrounds)

export default function ChronosMark({ size = 32, variant = "dark" }) {
  const color = variant === "gold" ? "#DCC492" : "#041523";
  // Unique id per variant+size to avoid clipPath collisions when multiple marks render
  const clipId = `cm-${variant}-${size}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="80 38 165 167"
      role="img"
      aria-label="Chronos"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points="120,120 320,102 320,320 -80,320 -80,-80 204,-61" />
        </clipPath>
      </defs>
      <g transform="translate(40, 0)">
        <g clipPath={`url(#${clipId})`}>
          <path
            d="M 120 40 A 80 80 0 1 1 120 200 A 80 80 0 1 1 120 40 Z M 132 54 A 62 66 0 1 0 132 186 A 62 66 0 1 0 132 54 Z"
            fill={color}
            fillRule="evenodd"
          />
        </g>
        <line
          x1="167.5" y1="86.7"
          x2="180.6" y2="77.6"
          stroke={color}
          strokeWidth="5.5"
          strokeLinecap="butt"
        />
      </g>
    </svg>
  );
}
