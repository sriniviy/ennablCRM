interface LogoProps {
  className?: string;
}

const ENNABL_ORANGE = "#FF3C00";

/**
 * The ennabl wordmark. The text uses `currentColor` so it follows the theme
 * foreground (dark on light mode, light on dark mode), while the accent arc
 * stays the constant brand orange — keeping the logo legible in both modes.
 */
export function EnnablLogo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 132 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="ennabl"
    >
      <text
        x="0"
        y="27"
        fontFamily="Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="30"
        fontWeight="700"
        letterSpacing="-1.5"
        fill="currentColor"
      >
        ennabl
      </text>
      <path
        d="M2 30 C 7 34, 16 34, 22 30"
        stroke={ENNABL_ORANGE}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Compact square brand mark (the "e"), used in collapsed/icon contexts.
 * The orange fill is constant so it reads on both light and dark backgrounds.
 */
export function EnnablMark({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="ennabl"
    >
      <rect width="36" height="36" rx="9" fill={ENNABL_ORANGE} />
      <text
        x="18"
        y="26"
        textAnchor="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="24"
        fontWeight="700"
        fill="#ffffff"
      >
        e
      </text>
    </svg>
  );
}
