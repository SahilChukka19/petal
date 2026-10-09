"use client";

import { useRef } from "react";

const QUOTES = [
  { text: "Small steps every day add up to big change.", emoji: "🌱" },
  { text: "Consistency beats intensity.", emoji: "🔥" },
  { text: "Learn today. Thank yourself tomorrow.", emoji: "✨" },
  { text: "Progress, not perfection.", emoji: "🎯" },
  { text: "Every expert was once a beginner.", emoji: "🌸" },
];

const NOTE_GRADS = [
  "linear-gradient(145deg, #FFF4F9 0%, #FFD6E7 100%)",
  "linear-gradient(145deg, #F5F0FF 0%, #E8D5FF 100%)",
  "linear-gradient(145deg, #FFF8F0 0%, #FFE8CC 100%)",
  "linear-gradient(145deg, #F0FAFF 0%, #CCF0FF 100%)",
  "linear-gradient(145deg, #F5FFF0 0%, #CCFFDD 100%)",
];
const NOTE_BORDERS = ["#F5B5CF", "#C8A0E8", "#FFB870", "#80D0E0", "#80E0A0"];
const NOTE_SHADOWS = [
  "rgba(232,71,138,0.18)", "rgba(147,100,200,0.18)", "rgba(255,140,60,0.18)",
  "rgba(60,180,200,0.18)", "rgba(60,180,100,0.18)",
];
const NOTE_TEXT = ["#7A1F4A", "#4A1A7A", "#7A3A0A", "#0A4A6A", "#0A5A2A"];
const WASHI = [
  "repeating-linear-gradient(135deg, rgba(232,71,138,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(147,100,200,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(255,160,80,0.5) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(80,180,200,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
  "repeating-linear-gradient(135deg, rgba(60,180,100,0.45) 0 4px, rgba(255,255,255,0.55) 4px 8px)",
];
const TILTS = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0"];

const COLORS = [
  "#FFB8D4", "#F9C8DD", "#E8A0C0", "#FFC8E0", "#FFD6E8", 
  "#F0A8CC", "#E8C8E0", "#FFC0D8", "#FFD0E8", "#F9D0E0"
];

// Generate 40 petals deterministically to avoid hydration mismatch
const PETALS = Array.from({ length: 40 }).map((_, i) => {
  const r1 = (Math.sin(i * 12.9898) * 43758.5453) % 1;
  const r2 = (Math.sin(i * 78.233) * 43758.5453) % 1;
  const r3 = (Math.sin(i * 45.123) * 43758.5453) % 1;
  const r4 = (Math.sin(i * 93.234) * 43758.5453) % 1;
  const r5 = (Math.sin(i * 21.123) * 43758.5453) % 1;
  const r6 = (Math.sin(i * 64.234) * 43758.5453) % 1;

  return {
    delay: Math.abs(r1) * 10,
    dur: 6 + Math.abs(r2) * 5,
    x: Math.abs(r3) * 100,
    size: 10 + Math.abs(r4) * 14,
    opacity: 0.3 + Math.abs(r5) * 0.5,
    sway: 10 + Math.abs(r6) * 30,
    color: COLORS[i % COLORS.length],
  };
});

function PetalSVG({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <ellipse cx="20" cy="10" rx="7" ry="11" fill={color} transform="rotate(0 20 20)" />
      <ellipse cx="20" cy="10" rx="7" ry="11" fill={color} transform="rotate(90 20 20)" />
      <ellipse cx="20" cy="10" rx="7" ry="11" fill={color} transform="rotate(180 20 20)" />
      <ellipse cx="20" cy="10" rx="7" ry="11" fill={color} transform="rotate(270 20 20)" />
      <circle cx="20" cy="20" r="5" fill="#FFF0F6" />
      <circle cx="20" cy="20" r="2.5" fill="#F9B8D0" />
    </svg>
  );
}

/** Cherry blossom petals drifting softly beside the calendar. */
export default function HangingBanners() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <style>{`
        @keyframes petalFall {
          0%   { transform: translateY(-50px) rotate(0deg);   opacity: 0; }
          8%   { opacity: 1; }
          85%  { opacity: var(--petal-opacity); }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes petalSway {
          0%   { margin-left: 0px; }
          25%  { margin-left: var(--petal-sway); }
          75%  { margin-left: calc(var(--petal-sway) * -1); }
          100% { margin-left: 0px; }
        }
      `}</style>

      {/* Full-screen falling petals layer (behind everything, starting below navbar) */}
      <div 
        className="fixed inset-0 pointer-events-none overflow-hidden" 
        style={{ top: '70px', zIndex: -1 }}
        aria-hidden
      >
        {PETALS.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: 0,
              opacity: 0,
              animation: `petalFall ${p.dur}s ease-in ${p.delay}s infinite, petalSway ${p.dur * 0.6}s ease-in-out ${p.delay}s infinite`,
              ["--petal-opacity" as string]: p.opacity,
              ["--petal-sway" as string]: `${p.sway}px`,
            }}
          >
            <PetalSVG size={p.size} color={p.color} />
          </div>
        ))}
      </div>

      {/* Quote sticky notes (anchored to the calendar) */}
      <div
        ref={containerRef}
        className="hidden 2xl:flex absolute z-10 pointer-events-none flex-col gap-3 pt-4"
        style={{ left: -210, top: 0, width: 190 }}
        aria-hidden
      >
        {QUOTES.map((q, i) => (
          <div
            key={i}
            className={`relative rounded-2xl px-4 pt-5 pb-3 ${TILTS[i]} transition-all duration-300 hover:rotate-0 hover:scale-105 pointer-events-auto cursor-default`}
            style={{
              background: NOTE_GRADS[i],
              border: `1px solid ${NOTE_BORDERS[i]}`,
              boxShadow: `0 4px 16px ${NOTE_SHADOWS[i]}, 0 1px 4px rgba(0,0,0,0.05)`,
            }}
          >
            {/* Washi tape */}
            <span
              className="absolute -top-1 left-1/2 h-2.5 w-10 -translate-x-1/2 rotate-1 rounded-sm"
              style={{ background: WASHI[i] }}
            />
            {/* Emoji */}
            <div className="text-xl mb-1.5">{q.emoji}</div>
            {/* Quote text */}
            <p
              className="font-playfair italic font-bold leading-snug"
              style={{ fontSize: "0.78rem", color: NOTE_TEXT[i], wordBreak: "break-word" }}
            >
              {q.text}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
