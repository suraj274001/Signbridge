import { useEffect, useRef, useState } from 'react';
import {
  HAND_CONNECTIONS,
  featuresToLandmarks,
  generateCanonicalHand,
  normalizeHand,
  transformLandmarks,
} from '../lib/normalization';
import type { HandTrajectorySpec } from '../types/signbridge';

interface DemoStage {
  gloss: string;
  caption: string;
  grammar: string;
  handshape: HandTrajectorySpec['handshape'];
}

const HERO_STAGES: DemoStage[] = [
  { gloss: 'HELLO', caption: 'Hello, welcome!', grammar: 'NEUTRAL', handshape: 'flat_open' },
  { gloss: 'YOU · NAME · WHAT', caption: 'What is your name?', grammar: 'WH_QUESTION', handshape: 'peace_v' },
  { gloss: 'HELP · PLEASE', caption: 'Can you help me?', grammar: 'POLAR_QUESTION', handshape: 'thumbs_up' },
  { gloss: 'WATER · WANT', caption: 'I want water.', grammar: 'NEUTRAL', handshape: 'cup_c' },
];

/**
 * Looping 21-landmark hand-skeleton hero visual that animates real palm-coordinate
 * normalization in real time without external media dependencies.
 */
export function HeroHandSkeleton() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStageIdx((prev) => (prev + 1) % HERO_STAGES.length);
    }, 3200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    const startTime = performance.now();

    const draw = (now: number) => {
      const elapsed = prefersReduced ? 0.5 : (now - startTime) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = Math.max(260, Math.floor(rect.height));

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const isDark = document.documentElement.classList.contains('dark');
      ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      // Subtle precision coordinate grid
      ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.09)' : 'rgba(15,23,42,0.06)';
      ctx.lineWidth = 1;
      const step = 28;
      for (let x = step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const stage = HERO_STAGES[stageIdx];
      const baseHand = generateCanonicalHand(stage.handshape, 'Right', elapsed * 0.45);

      // Left half: Raw tilted & zooming camera hand
      const rawTilt = Math.sin(elapsed * 1.1) * 24;
      const rawScale = 0.92 + Math.sin(elapsed * 0.8) * 0.16;
      const rawHand = transformLandmarks(baseHand, {
        scale: rawScale,
        rotationDeg: rawTilt,
        offsetX: Math.cos(elapsed * 0.9) * 0.04,
        offsetY: Math.sin(elapsed * 0.7) * 0.03,
      });

      // Right half: Palm-coordinate normalized hand (locked & invariant!)
      const normFeats = normalizeHand(rawHand, 'Right');
      const normHand = featuresToLandmarks(normFeats);

      // Divider line between Raw and Normalized view
      const midX = width / 2;
      ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.12)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(midX, 24);
      ctx.lineTo(midX, height - 24);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Raw Hand (Left)
      const leftCenterX = width * 0.25;
      const leftCenterY = height * 0.72;
      const rawPxScale = Math.min(width * 0.34, height * 0.56);

      ctx.strokeStyle = isDark ? '#60a5fa' : '#2563eb';
      ctx.lineWidth = 2.2;
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = rawHand[a];
        const pb = rawHand[b];
        ctx.beginPath();
        ctx.moveTo(leftCenterX + pa.x * rawPxScale * 2.2, leftCenterY + pa.y * rawPxScale * 2.2);
        ctx.lineTo(leftCenterX + pb.x * rawPxScale * 2.2, leftCenterY + pb.y * rawPxScale * 2.2);
        ctx.stroke();
      }
      for (let i = 0; i < rawHand.length; i++) {
        const p = rawHand[i];
        const px = leftCenterX + p.x * rawPxScale * 2.2;
        const py = leftCenterY + p.y * rawPxScale * 2.2;
        ctx.fillStyle = i === 0 ? '#f59e0b' : isDark ? '#93c5fd' : '#1d4ed8';
        ctx.beginPath();
        ctx.arc(px, py, i === 0 ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Normalized Hand (Right) with canonical axes
      const rightCenterX = width * 0.75;
      const rightCenterY = height * 0.74;
      const normPxScale = Math.min(width * 0.14, height * 0.24);

      // Canonical axes (origin = wrist, -Y = middle-MCP)
      ctx.strokeStyle = isDark ? 'rgba(45,212,191,0.35)' : 'rgba(13,148,136,0.3)';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(rightCenterX - normPxScale * 1.1, rightCenterY);
      ctx.lineTo(rightCenterX + normPxScale * 1.1, rightCenterY);
      ctx.moveTo(rightCenterX, rightCenterY + normPxScale * 0.3);
      ctx.lineTo(rightCenterX, rightCenterY - normPxScale * 2.1);
      ctx.stroke();

      ctx.strokeStyle = isDark ? '#2dd4bf' : '#0d9488';
      ctx.lineWidth = 2.4;
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = normHand[a];
        const pb = normHand[b];
        ctx.beginPath();
        ctx.moveTo(rightCenterX + pa.x * normPxScale, rightCenterY + pa.y * normPxScale);
        ctx.lineTo(rightCenterX + pb.x * normPxScale, rightCenterY + pb.y * normPxScale);
        ctx.stroke();
      }
      for (let i = 0; i < normHand.length; i++) {
        const p = normHand[i];
        const px = rightCenterX + p.x * normPxScale;
        const py = rightCenterY + p.y * normPxScale;
        ctx.fillStyle = i === 0 || i === 9 ? '#f59e0b' : isDark ? '#5eead4' : '#0f766e';
        ctx.beginPath();
        ctx.arc(px, py, i === 0 || i === 9 ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Clean responsive inline canvas labels (no overlap/clipping on 390px mobile)
      const isCompact = width < 460;
      ctx.font = isCompact
        ? '500 10px "IBM Plex Mono", monospace'
        : '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      const leftLabel = isCompact
        ? `Raw (${rawTilt.toFixed(0)}°)`
        : `Raw 21-pt input (${rawTilt.toFixed(0)}° tilt)`;
      const rightLabel = isCompact ? 'Normalized (63)' : 'Palm-normalized (63 feats)';
      ctx.fillText(leftLabel, 12, 22);
      ctx.fillText(rightLabel, midX + 12, 22);

      ctx.restore();

      if (!prefersReduced) {
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [stageIdx]);

  const current = HERO_STAGES[stageIdx];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="font-medium text-slate-900 dark:text-slate-100">
          Real-Time Landmark Pipeline Preview
        </span>
        <span className="font-mono tabular-nums">21 pts · 30 FPS</span>
      </div>

      <div className="relative flex-1 min-h-[280px]">
        <canvas
          ref={canvasRef}
          aria-label="Looping comparison of raw tilted hand landmarks on the left and palm-coordinate normalized landmarks on the right"
          className="w-full h-full block"
        />
      </div>

      <div className="px-4 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {current.gloss} · {current.grammar}
          </div>
          <div className="text-base font-semibold text-slate-900 dark:text-white">
            &ldquo;{current.caption}&rdquo;
          </div>
        </div>
        <div className="flex items-center gap-1">
          {HERO_STAGES.map((st, i) => (
            <button
              key={st.gloss}
              type="button"
              onClick={() => setStageIdx(i)}
              aria-label={`Preview sign ${st.gloss}`}
              className={`h-2 rounded-full transition-all ${
                i === stageIdx
                  ? 'w-6 bg-blue-700 dark:bg-blue-400'
                  : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
