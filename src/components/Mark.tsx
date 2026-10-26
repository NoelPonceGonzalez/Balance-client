export function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 6.5v18.5M12 25h8M5.5 9.5h21" />
        <path d="M8 9.5 5.4 16c.75.75 1.8 1.15 2.6 1.15S10 16.75 10.6 16L8 9.5z" />
        <path d="M24 9.5 21.4 16c.75.75 1.8 1.15 2.6 1.15s1.85-.4 2.6-1.15L24 9.5z" />
      </g>
    </svg>
  );
}
