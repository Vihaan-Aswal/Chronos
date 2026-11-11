import { Link } from "react-router-dom";
import ChronosMark from "../chronos-mark.jsx";

export default function Brand({ tone = "ink", to = "/", className = "" }) {
  return (
    <Link
      className={`app-brand ${className}`.trim()}
      to={to}
      aria-label="Chronos home"
    >
      <span aria-hidden="true">
        <ChronosMark size={24} variant={tone === "cream" ? "gold" : "dark"} />
      </span>
      <span>Chronos</span>
    </Link>
  );
}
