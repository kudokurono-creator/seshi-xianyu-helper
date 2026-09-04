import React from 'react';

const SpectralBackdrop: React.FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.04]"
  >
    <div
      className="absolute inset-0"
      style={{
        background: 'radial-gradient(circle at 72% 12%, var(--accent) 0%, transparent 54%)',
      }}
    />
    <svg
      viewBox="0 0 1200 820"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M-90 214C180 72 344 326 590 196S1002 82 1290 238" stroke="var(--accent-bright)" strokeWidth="1.2" />
      <path d="M-120 548C142 384 328 646 608 506S1018 376 1320 540" stroke="var(--text-primary)" strokeWidth="0.9" />
      <path d="M164 876C288 632 546 708 710 568S968 304 1234 350" stroke="var(--accent)" strokeWidth="1" />
      <circle cx="590" cy="196" r="3.2" fill="var(--accent-bright)" />
      <circle cx="608" cy="506" r="2.4" fill="var(--text-primary)" />
      <circle cx="968" cy="418" r="2.8" fill="var(--accent)" />
    </svg>
  </div>
);

export default SpectralBackdrop;
