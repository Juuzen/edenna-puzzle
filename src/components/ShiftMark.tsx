/**
 * Segno statico dello sfalsamento, per dove la griglia resta dritta (editor,
 * miniature): due quadrati sfalsati, in inchiostro neutro.
 */
export function ShiftMark({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={`ep-shift-mark${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden
      focusable="false"
    >
      <rect className="ep-shift-mark__back" x={1} y={1} width={6.5} height={6.5} rx={1} />
      <rect className="ep-shift-mark__front" x={4.5} y={4.5} width={6.5} height={6.5} rx={1} />
    </svg>
  );
}
