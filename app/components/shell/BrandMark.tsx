export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect
        x="1.5"
        y="5.5"
        width="25"
        height="17"
        rx="3"
        fill="none"
        stroke="#fff"
        strokeOpacity=".9"
        strokeWidth="1.4"
      />
      <path d="M14 5.5v17" stroke="#fff" strokeOpacity=".5" strokeWidth="1.2" />
      <circle
        cx="14"
        cy="14"
        r="3.4"
        fill="none"
        stroke="#fff"
        strokeOpacity=".5"
        strokeWidth="1.2"
      />
      <circle cx="19.5" cy="11" r="2.6" fill="#d3ee51" />
    </svg>
  );
}
