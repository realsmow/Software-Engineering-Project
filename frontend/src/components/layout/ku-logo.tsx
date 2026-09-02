/**
 * KULogo - reusable Kasetsart University wordmark.
 * Ported verbatim from the reference HTML SVG (viewBox 100×130).
 * Kept as inline SVG (never rasterized) so it scales crisply.
 *
 * variant:
 *   - "onLight" → fills use the brand green accent token (sidebar)
 *   - "onDark"  → fills are white (green login panel)
 * size: width in px; height is derived from the 100:130 aspect ratio.
 */
export type KULogoVariant = "onDark" | "onLight";

interface KULogoProps {
  variant?: KULogoVariant;
  size?: number;
  className?: string;
}

const ASPECT = 130 / 100;

export function KULogo({ variant = "onLight", size = 56, className }: KULogoProps) {
  // onDark → white letters; onLight → accent green (follows theme via CSS var).
  const fill = variant === "onDark" ? "#ffffff" : "var(--accent)";

  return (
    <svg
      className={className}
      width={size}
      height={size * ASPECT}
      viewBox="0 0 100 130"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Kasetsart University"
    >
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontFamily="Prompt, Inter, Helvetica, sans-serif"
        fontWeight="600"
        fontSize="58"
        fill={fill}
        letterSpacing="-3"
        textLength="60"
        lengthAdjust="spacingAndGlyphs"
      >
        KU
      </text>
      {/* Green accent bar stays constant across variants (brand color) */}
      <rect x="8" y="70" width="84" height="6" fill="#c8dc4b" />
      <text
        x="50"
        y="94"
        textAnchor="middle"
        fontFamily="Prompt, Inter, sans-serif"
        fontWeight="600"
        fontSize="12.5"
        fill={fill}
        letterSpacing="0.4"
      >
        KASETSART
      </text>
      <text
        x="50"
        y="110"
        textAnchor="middle"
        fontFamily="Prompt, Inter, sans-serif"
        fontWeight="400"
        fontSize="10.5"
        fill={fill}
        letterSpacing="1.2"
      >
        UNIVERSITY
      </text>
    </svg>
  );
}

export default KULogo;
