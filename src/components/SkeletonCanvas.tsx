import { useEffect, useRef } from 'react';
import type { Landmark3D } from '../types/signbridge';
import { HAND_CONNECTIONS } from '../lib/normalization';

interface SkeletonCanvasProps {
  mode: 'raw' | 'normalized';
  rightHand: Landmark3D[] | null;
  leftHand?: Landmark3D[] | null;
  faceLandmarks?: Landmark3D[] | null;
  showFaceMesh?: boolean;
  title?: string;
  height?: number;
  testId?: string;
}

const FACE_CONTOUR_INDICES = [
  // Eyebrows
  [70, 63, 105, 66, 107],
  [336, 296, 334, 293, 300],
  // Eyes
  [33, 160, 159, 158, 133, 153, 145, 144, 33],
  [362, 385, 386, 387, 263, 373, 374, 380, 362],
  // Lips outer
  [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61],
  // Jawline
  [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
];

/**
 * Reusable 2D canvas renderer for raw camera-space landmarks or palm-coordinate normalized skeletons.
 */
export function SkeletonCanvas({
  mode,
  rightHand,
  leftHand = null,
  faceLandmarks = null,
  showFaceMesh = false,
  title,
  height = 280,
  testId,
}: SkeletonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(260, Math.floor(canvas.getBoundingClientRect().width));
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#0f172a' : '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Subtle grid
    ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(15,23,42,0.06)';
    ctx.lineWidth = 1;
    for (let x = 24; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 24; y < height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const drawHand = (
      pts: Landmark3D[],
      strokeColor: string,
      jointColor: string,
      offsetCenterX = width / 2
    ) => {
      if (pts.length !== 21) return;
      const toScreen = (p: Landmark3D): [number, number] => {
        if (mode === 'raw') {
          return [p.x * width, p.y * height];
        }
        const scale = Math.min(width, height) * 0.28;
        return [offsetCenterX + p.x * scale, height * 0.78 + p.y * scale];
      };

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.4;
      for (const [a, b] of HAND_CONNECTIONS) {
        const [ax, ay] = toScreen(pts[a]);
        const [bx, by] = toScreen(pts[b]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      for (let i = 0; i < pts.length; i++) {
        const [px, py] = toScreen(pts[i]);
        ctx.fillStyle = i === 0 || i === 9 ? '#f59e0b' : jointColor;
        ctx.beginPath();
        ctx.arc(px, py, i === 0 || i === 9 ? 4.5 : 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (mode === 'normalized') {
      const originX = leftHand && rightHand ? width * 0.68 : width * 0.5;
      const originY = height * 0.78;
      const axisLen = Math.min(width, height) * 0.55;

      // Draw canonical palm axes
      ctx.strokeStyle = isDark ? 'rgba(45,212,191,0.35)' : 'rgba(13,148,136,0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(originX - axisLen * 0.65, originY);
      ctx.lineTo(originX + axisLen * 0.65, originY);
      ctx.moveTo(originX, originY + 24);
      ctx.lineTo(originX, originY - axisLen);
      ctx.stroke();

      if (rightHand) {
        drawHand(
          rightHand,
          isDark ? '#2dd4bf' : '#0d9488',
          isDark ? '#5eead4' : '#0f766e',
          leftHand ? width * 0.68 : width * 0.5
        );
      }
      if (leftHand) {
        drawHand(
          leftHand,
          isDark ? '#60a5fa' : '#2563eb',
          isDark ? '#93c5fd' : '#1d4ed8',
          rightHand ? width * 0.32 : width * 0.5
        );
      }
    } else {
      // Raw camera space
      if (showFaceMesh && faceLandmarks && faceLandmarks.length >= 455) {
        ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.45)' : 'rgba(71,85,105,0.45)';
        ctx.lineWidth = 1.3;
        for (const path of FACE_CONTOUR_INDICES) {
          ctx.beginPath();
          path.forEach((idx, j) => {
            const p = faceLandmarks[idx];
            if (!p) return;
            if (j === 0) ctx.moveTo(p.x * width, p.y * height);
            else ctx.lineTo(p.x * width, p.y * height);
          });
          ctx.stroke();
        }
      }

      if (rightHand) {
        drawHand(rightHand, isDark ? '#60a5fa' : '#2563eb', isDark ? '#93c5fd' : '#1d4ed8');
      }
      if (leftHand) {
        drawHand(leftHand, isDark ? '#2dd4bf' : '#0d9488', isDark ? '#5eead4' : '#0f766e');
      }
    }

    if (!rightHand && !leftHand) {
      ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('No hand landmarks detected yet', width / 2, height / 2);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }, [mode, rightHand, leftHand, faceLandmarks, showFaceMesh, height]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      {title && (
        <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between gap-3">
          <span className="truncate">{title}</span>
          <span className="font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            {mode === 'normalized' ? 'Origin: wrist (0,0,0)' : 'Camera UV space'}
          </span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        data-testid={testId}
        style={{ height: `${height}px` }}
        aria-label={title ?? `${mode} hand skeleton view`}
        className="w-full block"
      />
    </div>
  );
}
