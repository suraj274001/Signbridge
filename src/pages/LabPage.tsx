import { useEffect, useMemo, useState } from 'react';
import { Camera, CameraOff, RotateCcw } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useCamera } from '../hooks/useCamera';
import { useHands } from '../hooks/useHands';
import { useFace } from '../hooks/useFace';
import {
  featuresToLandmarks,
  generateCanonicalHand,
  normalizeHand,
  transformLandmarks,
} from '../lib/normalization';
import {
  DEFAULT_GRAMMAR_THRESHOLDS,
  classifyFacialGrammar,
  generateSyntheticFacialWindow,
} from '../lib/grammar';
import { SkeletonCanvas } from '../components/SkeletonCanvas';
import type {
  FacialFeatures,
  FacialGrammarTag,
  GrammarThresholds,
  HandTrajectorySpec,
  Handedness,
  Landmark3D,
} from '../types/signbridge';

export function LabPage() {
  const camera = useCamera();
  const hands = useHands(false);
  const face = useFace(false);

  // Part 1: Normalization Invariance Lab State
  const [useLiveCamera, setUseLiveCamera] = useState(false);
  const [handshape, setHandshape] = useState<HandTrajectorySpec['handshape']>('peace_v');
  const [handedness, setHandedness] = useState<Handedness>('Right');
  const [scale, setScale] = useState(1.15);
  const [rotationDeg, setRotationDeg] = useState(32);
  const [offsetX, setOffsetX] = useState(0.54);
  const [offsetY, setOffsetY] = useState(0.68);

  const [liveRawRight, setLiveRawRight] = useState<Landmark3D[] | null>(null);
  const [liveNormRight, setLiveNormRight] = useState<Landmark3D[] | null>(null);
  const [liveFaceSeries, setLiveFaceSeries] = useState<FacialFeatures[]>([]);

  // Part 2: Facial Grammar Debug State
  const [grammarPreset, setGrammarPreset] = useState<FacialGrammarTag>('POLAR_QUESTION');
  const [thresholds, setThresholds] = useState<GrammarThresholds>(DEFAULT_GRAMMAR_THRESHOLDS);

  // Synthetic raw & normalized pair + quantitative invariance drift
  const syntheticLab = useMemo(() => {
    const canonicalRight = generateCanonicalHand(handshape, 'Right');
    const canonicalBaseNorm = normalizeHand(canonicalRight, 'Right');

    const baseHand = generateCanonicalHand(handshape, handedness);
    const transformedRaw = transformLandmarks(baseHand, {
      scale,
      rotationDeg,
      offsetX,
      offsetY,
    });
    const normVec = normalizeHand(transformedRaw, handedness);
    const normLandmarks = featuresToLandmarks(normVec);

    // L2 drift vs canonical right-hand reference (should stay ~0.0000!)
    let sumSq = 0;
    for (let i = 0; i < normVec.length; i++) {
      const d = normVec[i] - canonicalBaseNorm[i];
      sumSq += d * d;
    }
    const drift = Math.sqrt(sumSq);

    return {
      raw: transformedRaw,
      normalized: normLandmarks,
      normVec,
      drift,
    };
  }, [handshape, handedness, scale, rotationDeg, offsetX, offsetY]);

  // Live camera tracking loop when enabled
  useEffect(() => {
    if (!useLiveCamera || !camera.isActive || !hands.isReady) return;
    let rafId = 0;
    let active = true;

    const loop = (now: number) => {
      if (!active) return;
      const video = camera.videoRef.current;
      if (video && video.readyState >= 2) {
        const hRes = hands.detectFrame(video, now);
        if (hRes && hRes.rawHands.length > 0) {
          const primary = hRes.rawHands[0];
          setLiveRawRight(primary.landmarks);
          setLiveNormRight(featuresToLandmarks(normalizeHand(primary.landmarks, primary.handedness)));
        }
        if (face.isReady) {
          const fRes = face.detectFrame(video, now);
          if (fRes?.features) {
            setLiveFaceSeries((prev) => [...prev.slice(-29), fRes.features!]);
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
  }, [useLiveCamera, camera.isActive, camera.videoRef, hands.isReady, hands.detectFrame, face.isReady, face.detectFrame]);

  const activeFacialSeries = useMemo(() => {
    if (useLiveCamera && liveFaceSeries.length >= 5) return liveFaceSeries;
    return generateSyntheticFacialWindow(grammarPreset, 30);
  }, [useLiveCamera, liveFaceSeries, grammarPreset]);

  const grammarEval = useMemo(
    () => classifyFacialGrammar(activeFacialSeries, thresholds),
    [activeFacialSeries, thresholds]
  );

  const chartData = useMemo(
    () =>
      activeFacialSeries.map((f, idx) => ({
        frame: idx + 1,
        browRaise: Number(f.eyebrowRaise.toFixed(3)),
        browFurrow: Number(f.eyebrowFurrow.toFixed(3)),
        mouthAR: Number(f.mouthAspectRatio.toFixed(3)),
        headPitch: Number(f.headPitch.toFixed(1)),
        headYaw: Number(f.headYaw.toFixed(1)),
      })),
    [activeFacialSeries]
  );

  const handleToggleLive = async () => {
    if (useLiveCamera) {
      camera.stopCamera();
      setUseLiveCamera(false);
    } else {
      const ok = await camera.startCamera();
      if (ok) {
        await Promise.all([hands.loadModel(), face.loadModel()]);
        setUseLiveCamera(true);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Normalization &amp; Facial Grammar Lab
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Verify palm-coordinate invariance in real time and inspect rolling 30-frame facial
            grammar time-series curves.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggleLive}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap self-start md:self-auto ${
            useLiveCamera
              ? 'bg-rose-600 hover:bg-rose-700 text-white'
              : 'bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white'
          }`}
        >
          {useLiveCamera ? (
            <>
              <CameraOff className="w-4 h-4" aria-hidden="true" /> Switch to Interactive Simulator
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" aria-hidden="true" /> Use Live Webcam Feed
            </>
          )}
        </button>
      </div>

      {/* Hidden video element for webcam processing */}
      <video ref={camera.videoRef} playsInline muted className="hidden" />

      {/* Section 1: Side-by-Side Raw vs Normalized Skeletons */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              01. Palm-Coordinate Normalization Visualizer
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Drag distance, wrist tilt, pan, or flip Left/Right handedness — observe the normalized
              skeleton stay locked to the canonical wrist origin and vertical middle-MCP axis.
            </p>
          </div>

          {!useLiveCamera && (
            <div className="font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
              Invariance L2 error: <strong>{syntheticLab.drift.toFixed(6)}</strong> (63 feats)
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonCanvas
            mode="raw"
            rightHand={useLiveCamera ? liveRawRight : syntheticLab.raw}
            title={
              useLiveCamera
                ? 'Raw Camera Landmarks (Live)'
                : `Raw Camera Input (${handedness} · ${rotationDeg}° · ${scale.toFixed(2)}×)`
            }
            height={300}
            testId="lab-raw-skeleton"
          />
          <SkeletonCanvas
            mode="normalized"
            rightHand={useLiveCamera ? liveNormRight : syntheticLab.normalized}
            title="Palm-Coordinate Normalized (63 feats)"
            height={300}
            testId="lab-normalized-skeleton"
          />
        </div>

        {!useLiveCamera && (
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div>
              <label htmlFor="lab-handshape" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Handshape
              </label>
              <select
                id="lab-handshape"
                value={handshape}
                onChange={(e) => setHandshape(e.target.value as HandTrajectorySpec['handshape'])}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                <option value="flat_open">Flat Open</option>
                <option value="peace_v">Peace / V</option>
                <option value="point_index">Index Point</option>
                <option value="thumbs_up">Thumbs Up</option>
                <option value="cup_c">Cup C</option>
                <option value="l_shape">L-Shape</option>
                <option value="y_shape">Y-Shape</option>
                <option value="fist">Fist</option>
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Handedness
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                {(['Right', 'Left'] as Handedness[]).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setHandedness(side)}
                    className={`py-1 text-xs font-medium rounded-md transition-colors ${
                      handedness === side
                        ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {side}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="lab-scale" className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                <span>Distance / Scale</span>
                <span className="font-mono tabular-nums">{scale.toFixed(2)}×</span>
              </label>
              <input
                id="lab-scale"
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <label htmlFor="lab-rot" className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                <span>Wrist Tilt</span>
                <span className="font-mono tabular-nums">{rotationDeg}°</span>
              </label>
              <input
                id="lab-rot"
                type="range"
                min={-90}
                max={90}
                step={2}
                value={rotationDeg}
                onChange={(e) => setRotationDeg(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <label htmlFor="lab-panx" className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                <span>Horizontal Pan</span>
                <span className="font-mono tabular-nums">{offsetX.toFixed(2)}</span>
              </label>
              <input
                id="lab-panx"
                type="range"
                min={0.22}
                max={0.78}
                step={0.02}
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setScale(1.0);
                  setRotationDeg(0);
                  setOffsetX(0.5);
                  setOffsetY(0.7);
                  setHandedness('Right');
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Reset Pose
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Facial Grammar Time-Series Debug Charts */}
      <section className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              02. Facial Grammar Time-Series &amp; Threshold Debugger
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Rolling 30-frame feature curves classified into POLAR_QUESTION, WH_QUESTION, NEGATION,
              or NEUTRAL.
            </p>
          </div>

          {!useLiveCamera && (
            <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex-wrap gap-1">
              {(['NEUTRAL', 'POLAR_QUESTION', 'WH_QUESTION', 'NEGATION'] as FacialGrammarTag[]).map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGrammarPreset(preset)}
                    className={`px-3 py-1.5 text-xs font-mono font-medium rounded-md transition-colors ${
                      grammarPreset === preset
                        ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Classification Readout Strip */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Classified Output</div>
            <div
              data-testid="lab-grammar-classification"
              className="font-mono text-base font-bold text-teal-700 dark:text-teal-400"
            >
              {grammarEval.tag} · {Math.round(grammarEval.confidence * 100)}%
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
            {grammarEval.reason}
          </p>
        </div>

        {/* Dual Time-Series Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Eyebrow Raise, Furrow &amp; Mouth Aspect Ratio (Inter-Eye Normalized)
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="frame" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="browRaise" name="Brow Raise" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="browFurrow" name="Brow Furrow" stroke="#d97706" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="mouthAR" name="Mouth AR" stroke="#0d9488" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Head Orientation Angles (Pitch &amp; Yaw in Degrees)
            </h3>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="frame" tick={{ fontSize: 11 }} />
                  <YAxis domain={[-25, 25]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="headPitch" name="Head Pitch (°)" stroke="#059669" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="headYaw" name="Head Yaw (°)" stroke="#e11d48" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tunable Rule Thresholds */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label htmlFor="thresh-raise" className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>Brow Raise Threshold (Polar Q)</span>
              <span className="font-mono tabular-nums">{thresholds.browRaiseThreshold.toFixed(2)}</span>
            </label>
            <input
              id="thresh-raise"
              type="range"
              min={0.2}
              max={0.5}
              step={0.01}
              value={thresholds.browRaiseThreshold}
              onChange={(e) =>
                setThresholds((t) => ({ ...t, browRaiseThreshold: Number(e.target.value) }))
              }
              className="w-full accent-teal-600"
            />
          </div>

          <div>
            <label htmlFor="thresh-furrow" className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>Brow Furrow Threshold (WH Q)</span>
              <span className="font-mono tabular-nums">{thresholds.browFurrowThreshold.toFixed(2)}</span>
            </label>
            <input
              id="thresh-furrow"
              type="range"
              min={0.25}
              max={0.75}
              step={0.02}
              value={thresholds.browFurrowThreshold}
              onChange={(e) =>
                setThresholds((t) => ({ ...t, browFurrowThreshold: Number(e.target.value) }))
              }
              className="w-full accent-teal-600"
            />
          </div>

          <div>
            <label htmlFor="thresh-yaw" className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              <span>Head-Shake Yaw Span (Negation)</span>
              <span className="font-mono tabular-nums">{thresholds.yawOscillationThreshold.toFixed(1)}°</span>
            </label>
            <input
              id="thresh-yaw"
              type="range"
              min={6}
              max={24}
              step={1}
              value={thresholds.yawOscillationThreshold}
              onChange={(e) =>
                setThresholds((t) => ({ ...t, yawOscillationThreshold: Number(e.target.value) }))
              }
              className="w-full accent-teal-600"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
