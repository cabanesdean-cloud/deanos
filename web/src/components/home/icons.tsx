/** Small stroke icons for the homepage. 16px, currentColor, decorative (aria-hidden). */

type P = { size?: number };

function Svg({ size = 16, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export const Icon = {
  Mail: (p: P) => (
    <Svg {...p}>
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" />
      <path d="M2.5 4.5 8 8.75l5.5-4.25" />
    </Svg>
  ),
  Copy: (p: P) => (
    <Svg {...p}>
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.5" />
      <path d="M10.75 5.25V3.75a1.5 1.5 0 0 0-1.5-1.5h-5.5a1.5 1.5 0 0 0-1.5 1.5v5.5a1.5 1.5 0 0 0 1.5 1.5h1.5" />
    </Svg>
  ),
  Check: (p: P) => (
    <Svg {...p}>
      <path d="m3 8.5 3.25 3.25L13 5" />
    </Svg>
  ),
  Download: (p: P) => (
    <Svg {...p}>
      <path d="M8 2.25v8M4.75 7 8 10.25 11.25 7M2.75 13.25h10.5" />
    </Svg>
  ),
  Menu: (p: P) => (
    <Svg {...p}>
      <path d="M2.5 5h11M2.5 11h11" />
    </Svg>
  ),
  Close: (p: P) => (
    <Svg {...p}>
      <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
    </Svg>
  ),
  Chevron: (p: P) => (
    <Svg {...p}>
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </Svg>
  ),
  ChevronDown: (p: P) => (
    <Svg {...p}>
      <path d="m3.5 6 4.5 4.5L12.5 6" />
    </Svg>
  ),
  Pin: (p: P) => (
    <Svg {...p}>
      <path d="M8 14.25s4.75-4.1 4.75-7.75a4.75 4.75 0 0 0-9.5 0C3.25 10.15 8 14.25 8 14.25z" />
      <circle cx="8" cy="6.5" r="1.6" />
    </Svg>
  ),
  LinkedIn: ({ size = 16 }: P) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
      <path d="M3.6 5.9h-2.2v8.1h2.2V5.9zM2.5 2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM14.6 9.4c0-2.2-.5-3.7-3-3.7-1.2 0-2 .6-2.3 1.3V5.9H7.2v8.1h2.2v-4c0-1.1.2-2.1 1.5-2.1s1.4 1.2 1.4 2.2v3.9h2.3V9.4z" />
    </svg>
  ),
  GitHub: ({ size = 16 }: P) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden focusable="false">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
};
