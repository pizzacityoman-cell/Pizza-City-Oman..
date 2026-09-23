import React from "react";

interface LoaderProps {
  size?: number;
  text?: string;
  fullPage?: boolean;
  loop?: boolean;
}

export default function Loader({ size = 120, text, fullPage = false }: LoaderProps) {
  const pizzaSvg = (
    <div
      className="pizza-loader-container flex flex-col items-center justify-center select-none"
      style={{ width: size, height: size }}
      role="status"
      aria-label={text || "Loading..."}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full drop-shadow-md animate-pizza-spin-gentle"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Glowing Oven Heat Backdrop */}
        <circle cx="50" cy="50" r="42" fill="url(#ovenGlow)" opacity="0.2" />

        {/* Crust base */}
        <path
          d="M 50 12 A 40 40 0 0 1 88 50 L 50 50 Z"
          fill="#D97706"
          stroke="#B45309"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="origin-[50px_50px] animate-pizza-slice-pulse"
        />

        {/* Cheese layer */}
        <path
          d="M 50 17 A 34 34 0 0 1 82 50 L 50 50 Z"
          fill="url(#cheeseGrad)"
          stroke="#F59E0B"
          strokeWidth="1.5"
        />

        {/* Pepperoni 1 */}
        <circle cx="62" cy="30" r="5.5" fill="#DC2626" stroke="#991B1B" strokeWidth="1.2" />
        <circle cx="60.5" cy="28.5" r="1.5" fill="#EF4444" opacity="0.8" />

        {/* Pepperoni 2 */}
        <circle cx="72" cy="42" r="4.8" fill="#DC2626" stroke="#991B1B" strokeWidth="1.2" />
        <circle cx="70.5" cy="40.8" r="1.2" fill="#EF4444" opacity="0.8" />

        {/* Pepperoni 3 */}
        <circle cx="57" cy="42" r="4" fill="#DC2626" stroke="#991B1B" strokeWidth="1.2" />

        {/* Basil / Herb specks */}
        <ellipse cx="68" cy="25" rx="1.8" ry="3.2" transform="rotate(30 68 25)" fill="#16A34A" />
        <ellipse cx="56" cy="23" rx="1.5" ry="2.6" transform="rotate(-25 56 23)" fill="#15803D" />
        <ellipse cx="65" cy="47" rx="1.5" ry="2.6" transform="rotate(45 65 47)" fill="#16A34A" />

        {/* Cheese stretch stream */}
        <path
          d="M 50 50 Q 46 62 48 70 Q 50 78 50 82"
          stroke="#FBBF24"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          className="animate-pulse"
        />

        {/* Steam Waves */}
        <path
          d="M 60 10 Q 64 6 60 2"
          stroke="#F87171"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
          className="animate-steam-1"
          opacity="0.75"
        />
        <path
          d="M 72 16 Q 76 12 72 8"
          stroke="#FBBF24"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
          className="animate-steam-2"
          opacity="0.75"
        />

        {/* Gradients */}
        <defs>
          <radialGradient id="ovenGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="cheeseGrad" x1="50" y1="17" x2="82" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );

  const content = text ? (
    <div className="flex flex-col items-center gap-3">
      {pizzaSvg}
      <p className="text-sm font-semibold text-stone-700 dark:text-stone-300 animate-pulse tracking-wide">
        {text}
      </p>
    </div>
  ) : (
    pizzaSvg
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white/90 dark:bg-stone-950/90 backdrop-blur-md">
        {content}
      </div>
    );
  }

  return content;
}
