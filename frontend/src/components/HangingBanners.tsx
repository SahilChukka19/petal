"use client";

import { useEffect, useRef } from "react";

const QUOTES = [
  "Small steps every day add up to big change.",
  "Consistency beats intensity.",
  "Learn something today your future self will thank you for.",
  "Progress, not perfection.",
];

const W = 190; // board width
const H = 72; // board height (rigid distance between its two rope attach points)
const ROPES = [34, 30, 30, 30]; // rope length above each board
const NAIL = { x: 105, y: 14 };

const WOOD = {
  background:
    "repeating-linear-gradient(92deg, rgba(120,72,40,0.07) 0 2px, transparent 2px 9px), linear-gradient(180deg, #E8C79B 0%, #D9AE7C 55%, #CB9D6C 100%)",
  border: "1px solid #B98A5C",
  boxShadow: "0 6px 14px rgba(120,72,40,0.22), inset 0 1px 0 rgba(255,255,255,0.45)",
};

type P = { x: number; y: number; px: number; py: number };
type Link = [number, number, number]; // node a, node b, rest length

/** Node 0 is the nail. Board i owns nodes 1+2i (top) and 2+2i (bottom). */
function buildChain() {
  const pts: P[] = [{ ...NAIL, px: NAIL.x, py: NAIL.y }];
  const links: Link[] = [];
  let y = NAIL.y;
  QUOTES.forEach((_, i) => {
    y += ROPES[i];
    pts.push({ x: NAIL.x, y, px: NAIL.x, py: y });
    links.push([pts.length - 2, pts.length - 1, ROPES[i]]);
    y += H;
    pts.push({ x: NAIL.x, y, px: NAIL.x, py: y });
    links.push([pts.length - 2, pts.length - 1, H]);
  });
  return { pts, links };
}

/** Untouched copy used only for the first paint; the live simulation mutates its own chain. */
const INITIAL = buildChain().pts;

const boardTransform = (top: P, bottom: P) => {
  const cx = (top.x + bottom.x) / 2;
  const cy = (top.y + bottom.y) / 2;
  const angle = Math.atan2(bottom.y - top.y, bottom.x - top.x) - Math.PI / 2;
  return `translate(${cx - W / 2}px, ${cy - H / 2}px) rotate(${angle}rad)`;
};

/** Wooden motivation banners hanging from a nail. Drag any board and the chain swings from the nail. */
export default function HangingBanners() {
  const chain = useRef(buildChain());
  const containerRef = useRef<HTMLDivElement>(null);
  const boardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const ropeRefs = useRef<(SVGLineElement | null)[]>([]);
  const drag = useRef<{ board: number; t: number; x: number; y: number } | null>(null);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const { pts, links } = chain.current;
    const GRAVITY = 0.55;
    const DAMPING = 0.995;
    const STEP = 1000 / 60;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let asleep = false;
    let calm = 0;

    const render = () => {
      QUOTES.forEach((_, i) => {
        const top = pts[1 + 2 * i];
        const bottom = pts[2 + 2 * i];
        const el = boardRefs.current[i];
        if (el) el.style.transform = boardTransform(top, bottom);
        const rope = ropeRefs.current[i];
        if (rope) {
          const from = i === 0 ? pts[0] : pts[2 * i];
          rope.setAttribute("x1", String(from.x));
          rope.setAttribute("y1", String(from.y));
          rope.setAttribute("x2", String(top.x));
          rope.setAttribute("y2", String(top.y));
        }
      });
    };

    const step = () => {
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * DAMPING;
        const vy = (p.y - p.py) * DAMPING;
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy + GRAVITY;
      }

      const d = drag.current;
      if (d) {
        const a = pts[1 + 2 * d.board];
        const b = pts[2 + 2 * d.board];
        let dx = d.x - (a.x + (b.x - a.x) * d.t);
        let dy = d.y - (a.y + (b.y - a.y) * d.t);
        const len = Math.hypot(dx, dy);
        if (len > 40) { dx = (dx / len) * 40; dy = (dy / len) * 40; }
        a.x += dx * 0.6; a.y += dy * 0.6;
        b.x += dx * 0.6; b.y += dy * 0.6;
      }

      for (let it = 0; it < 14; it++) {
        pts[0].x = NAIL.x; pts[0].y = NAIL.y; // the nail never moves
        for (const [ia, ib, rest] of links) {
          const a = pts[ia];
          const b = pts[ib];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const diff = (dist - rest) / dist;
          const wa = ia === 0 ? 0 : 0.5;
          const wb = ia === 0 ? 1 : 0.5;
          a.x += dx * diff * wa; a.y += dy * diff * wa;
          b.x -= dx * diff * wb; b.y -= dy * diff * wb;
        }
      }
    };

    const energy = () =>
      pts.reduce((m, p) => Math.max(m, Math.abs(p.x - p.px), Math.abs(p.y - p.py - GRAVITY)), 0);

    const loop = (t: number) => {
      acc += Math.min(t - last, 100);
      last = t;
      while (acc >= STEP) { step(); acc -= STEP; }
      render();
      // only sleep once motion has been negligible for a while AND everything hangs straight (not at a swing's apex)
      const hanging = pts.every((p) => Math.abs(p.x - NAIL.x) < 0.5);
      calm = !drag.current && hanging && energy() < 0.02 ? calm + 1 : 0;
      if (calm > 30) { asleep = true; calm = 0; return; }
      raf = requestAnimationFrame(loop);
    };

    wake.current = () => {
      if (!asleep) return;
      asleep = false;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    // small initial nudge so it's obvious the banners are alive
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 1; i < pts.length; i++) pts[i].px -= 0.6 + i * 0.12;
    }
    last = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const local = (e: React.PointerEvent) => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { pts } = chain.current;
    const a = pts[1 + 2 * i];
    const b = pts[2 + 2 * i];
    const m = local(e);
    const ax = b.x - a.x;
    const ay = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((m.x - a.x) * ax + (m.y - a.y) * ay) / (ax * ax + ay * ay)));
    drag.current = { board: i, t, ...m };
    wake.current();
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current) Object.assign(drag.current, local(e));
  };
  const onUp = () => { drag.current = null; };

  const pts = INITIAL;

  return (
    <div
      ref={containerRef}
      className="hidden 2xl:block absolute z-10 pointer-events-none"
      style={{ left: -234, top: 0, width: 210, height: 1 }}
    >
      <svg width={210} height={560} className="absolute left-0 top-0 overflow-visible" aria-hidden>
        {QUOTES.map((_, i) => (
          <line
            key={i}
            ref={(el) => { ropeRefs.current[i] = el; }}
            x1={NAIL.x} y1={NAIL.y} x2={pts[1 + 2 * i].x} y2={pts[1 + 2 * i].y}
            stroke="#A07C52" strokeWidth={4} strokeLinecap="round" strokeDasharray="5 2"
          />
        ))}
        {/* the nail */}
        <circle cx={NAIL.x} cy={NAIL.y + 2} r={8} fill="rgba(60,35,15,0.25)" />
        <circle cx={NAIL.x} cy={NAIL.y} r={7} fill="#8A8F99" stroke="#5B6068" strokeWidth={1.5} />
        <circle cx={NAIL.x - 2} cy={NAIL.y - 2} r={2.5} fill="#D4D8DF" />
      </svg>

      {QUOTES.map((q, i) => (
        <div
          key={q}
          ref={(el) => { boardRefs.current[i] = el; }}
          role="img"
          aria-label={q}
          onPointerDown={onDown(i)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute left-0 top-0 flex items-center justify-center rounded-xl px-5 text-center select-none pointer-events-auto cursor-grab active:cursor-grabbing"
          style={{ ...WOOD, width: W, height: H, touchAction: "none", transform: boardTransform(pts[1 + 2 * i], pts[2 + 2 * i]) }}
        >
          <span className="absolute left-1/2 -top-1 w-2.5 h-2.5 -translate-x-1/2 rounded-full" style={{ background: "#7A5232" }} />
          {i < QUOTES.length - 1 && (
            <span className="absolute left-1/2 -bottom-1 w-2.5 h-2.5 -translate-x-1/2 rounded-full" style={{ background: "#7A5232" }} />
          )}
          <p className="font-playfair text-sm font-bold leading-snug" style={{ color: "#4A2B17", textShadow: "0 1px 0 rgba(255,255,255,0.35)" }}>
            {q}
          </p>
        </div>
      ))}
    </div>
  );
}
