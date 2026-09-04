import React from 'react';

interface SeshiMarkProps {
  size?: 24 | 32 | 40;
  className?: string;
  label?: string;
}

const SeshiMark: React.FC<SeshiMarkProps> = ({ size = 40, className = '', label }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    className={className}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M20 11.2 28.8 20 20 28.8 11.2 20 20 11.2Z"
      stroke="var(--text-primary)"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M20 15.7 24.3 20 20 24.3 15.7 20 20 15.7Z"
      fill="var(--accent)"
    />
    <path
      d="M10.2 30.1A14.2 14.2 0 0 1 7.1 14.5"
      stroke="var(--accent-bright)"
      strokeWidth="2.1"
      strokeLinecap="round"
    />
    <path
      d="M29.1 9.1a14.2 14.2 0 0 1 3.4 15.7"
      stroke="var(--text-primary)"
      strokeOpacity="0.72"
      strokeWidth="2.1"
      strokeLinecap="round"
    />
    <circle cx="31.8" cy="29.7" r="2.2" fill="var(--accent-bright)" />
  </svg>
);

export default SeshiMark;
