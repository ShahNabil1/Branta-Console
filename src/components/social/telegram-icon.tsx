import { useId } from "react";

export function TelegramIcon({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 240 240"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1=".667" x2=".417" y1=".167" y2=".75">
          <stop offset="0" stopColor="#37aee2" />
          <stop offset="1" stopColor="#1e96c8" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="120" fill={`url(#${gradientId})`} />
      <path
        fill="#c8daea"
        d="M98 175c-4 0-3-1-4-5l-11-38 87-52"
      />
      <path fill="#a9c9dd" d="M98 175c3 0 5-2 7-4l19-19-24-15" />
      <path
        fill="#fff"
        d="M100 137l58 43c6 4 11 2 13-6l24-114c3-10-3-14-9-11L44 106c-10 4-10 10-2 12l37 12 86-54c4-3 8-1 5 2"
      />
    </svg>
  );
}
