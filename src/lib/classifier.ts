import type { PredictionResult } from '../types/signbridge';

export interface SequenceTemplate {
  label: string;
  frames: number[][]; // T x D (e.g. 30 x 129)
}

/**
 * Euclidean distance between two equal-length normalized landmark feature frames.
 */
export function frameDistance(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * Resample a variable-length landmark sequence to a fixed number of frames via linear interpolation.
 */
export function resampleSequence(frames: number[][], targetLen = 30): number[][] {
  if (frames.length === 0) return [];
  if (frames.length === targetLen) return frames;
  if (frames.length === 1) {
    return Array.from({ length: targetLen }, () => [...frames[0]]);
  }

  const dim = frames[0].length;
  const out: number[][] = [];
  for (let i = 0; i < targetLen; i++) {
    const pos = (i / (targetLen - 1)) * (frames.length - 1);
    const low = Math.floor(pos);
    const high = Math.min(frames.length - 1, Math.ceil(pos));
    const alpha = pos - low;
    const frame = new Array<number>(dim);
    for (let d = 0; d < dim; d++) {
      frame[d] = frames[low][d] * (1 - alpha) + frames[high][d] * alpha;
    }
    out.push(frame);
  }
  return out;
}

/**
 * Fast Sakoe-Chiba banded Dynamic Time Warping (DTW) distance between two normalized sequences.
 * Band radius keeps complexity O(T * band) so 36+ templates evaluate in a few milliseconds.
 */
export function dtwDistance(seqA: number[][], seqB: number[][], band = 5): number {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return Infinity;

  const w = Math.max(band, Math.abs(n - m));
  const prev = new Float64Array(m + 1).fill(Infinity);
  const curr = new Float64Array(m + 1).fill(Infinity);
  prev[0] = 0;

  for (let i = 1; i <= n; i++) {
    curr.fill(Infinity);
    const jStart = Math.max(1, i - w);
    const jEnd = Math.min(m, i + w);

    for (let j = jStart; j <= jEnd; j++) {
      const cost = frameDistance(seqA[i - 1], seqB[j - 1]);
      const minPrev = Math.min(prev[j], curr[j - 1], prev[j - 1]);
      curr[j] = cost + minPrev;
    }

    prev.set(curr);
  }

  // Normalize by path length (n + m) for length-independent distance scale
  return prev[m] / (n + m);
}

/**
 * k-Nearest Neighbors + Dynamic Time Warping classifier.
 * Enables immediate few-shot recognition after just 5-10 user samples per sign,
 * and ships pre-loaded with the 36 built-in ISL prototypes.
 */
export class KNNDTWClassifier {
  private templates: SequenceTemplate[] = [];
  private k: number;
  private stride: number;

  constructor(templates: SequenceTemplate[] = [], k = 3, stride = 2) {
    this.k = k;
    this.stride = stride;
    this.setTemplates(templates);
  }

  public setTemplates(templates: SequenceTemplate[]): void {
    this.templates = templates.map((t) => ({
      label: t.label,
      frames: this.downsample(resampleSequence(t.frames, 30)),
    }));
  }

  public addTemplate(template: SequenceTemplate): void {
    this.templates.push({
      label: template.label,
      frames: this.downsample(resampleSequence(template.frames, 30)),
    });
  }

  public getTemplateCount(): number {
    return this.templates.length;
  }

  private downsample(frames: number[][]): number[][] {
    if (this.stride <= 1) return frames;
    const out: number[][] = [];
    for (let i = 0; i < frames.length; i += this.stride) {
      out.push(frames[i]);
    }
    return out;
  }

  public predict(sequence: number[][]): PredictionResult {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.templates.length === 0 || sequence.length === 0) {
      return {
        gloss: 'UNKNOWN',
        confidence: 0,
        latencyMs: 0,
        engine: 'knn-dtw',
        topK: [],
      };
    }

    const query = this.downsample(resampleSequence(sequence, 30));

    // Compute DTW distance to every template
    const distances = this.templates.map((tpl) => ({
      label: tpl.label,
      dist: dtwDistance(query, tpl.frames, 4),
    }));

    distances.sort((a, b) => a.dist - b.dist);

    // Aggregate per-class best similarity using RBF kernel exp(-dist / sigma)
    const sigma = 1.65;
    const classScores = new Map<string, number>();
    const topPool = distances.slice(0, Math.max(this.k * 3, 8));

    for (const item of topPool) {
      const sim = Math.exp(-item.dist / sigma);
      const current = classScores.get(item.label) ?? 0;
      // Combine strongest match with slight multi-neighbor vote boost
      classScores.set(item.label, Math.max(current, sim) + sim * 0.08);
    }

    const ranked = Array.from(classScores.entries())
      .map(([gloss, rawScore]) => ({ gloss, rawScore }))
      .sort((a, b) => b.rawScore - a.rawScore);

    // Calibrate confidence using both absolute distance fit and margin over runner-up
    const bestDist = distances[0].dist;
    const bestAbsFit = Math.exp(-bestDist / 2.2);
    const totalScore = ranked.slice(0, 5).reduce((acc, r) => acc + r.rawScore, 0) || 1;

    const topK = ranked.slice(0, 4).map((r, idx) => {
      const rel = r.rawScore / totalScore;
      const conf = idx === 0 ? Math.min(0.99, bestAbsFit * 0.72 + rel * 0.35) : Math.min(0.9, rel * bestAbsFit);
      return {
        gloss: r.gloss,
        confidence: Number(conf.toFixed(3)),
      };
    });

    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;

    return {
      gloss: topK[0]?.gloss ?? 'UNKNOWN',
      confidence: topK[0]?.confidence ?? 0,
      latencyMs: Number(elapsed.toFixed(1)),
      engine: 'knn-dtw',
      topK,
    };
  }
}
