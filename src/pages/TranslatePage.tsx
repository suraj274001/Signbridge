import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  CameraOff,
  Volume2,
  VolumeX,
  Trash2,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  Play,
  AlertCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCamera } from '../hooks/useCamera';
import { useHands } from '../hooks/useHands';
import { useFace } from '../hooks/useFace';
import { useSpeech } from '../hooks/useSpeech';
import {
  HAND_CONNECTIONS,
  featuresToLandmarks,
  generatePrototypeSequence,
  normalizeTwoHands,
} from '../lib/normalization';
import {
  classifyFacialGrammar,
  generateSyntheticFacialWindow,
} from '../lib/grammar';
import { refineGlossToSentence } from '../lib/glossParser';
import {
  mapGlossSequenceToEmojis,
  mapGlossToEmoji,
  mapGrammarToEmoji,
} from '../lib/emojiMap';
import { getSignPack } from '../data/signs';
import type {
  FacialFeatures,
  FacialGrammarTag,
  GrammarClassification,
  Landmark3D,
  PredictionResult,
} from '../types/signbridge';
import { SkeletonCanvas } from '../components/SkeletonCanvas';

const WINDOW_SIZE = 30;

export function TranslatePage() {
  const {
    spokenLanguage,
    signLanguage,
    activeEngine,
    setActiveEngine,
    tfModelReady,
    predictSequence,
    addEvalLog,
    rateEvalLog,
  } = useApp();

  const camera = useCamera();
  const hands = useHands(false);
  const face = useFace(false);
  const speech = useSpeech(spokenLanguage);

  const signs = getSignPack(signLanguage);

  const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
  const [speakEnabled, setSpeakEnabled] = useState(true);
  const [showFaceMesh, setShowFaceMesh] = useState(true);
  const [showEmojiOverlay, setShowEmojiOverlay] = useState(true);
  const [copied, setCopied] = useState(false);

  const [glossTokens, setGlossTokens] = useState<string[]>([]);
  const [liveSentence, setLiveSentence] = useState('');
  const [lastPrediction, setLastPrediction] = useState<PredictionResult | null>(null);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [ratedState, setRatedState] = useState<'up' | 'down' | null>(null);

  const [fps, setFps] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [bufferFill, setBufferFill] = useState(0);

  const [currentFeatures, setCurrentFeatures] = useState<FacialFeatures>({
    timestamp: Date.now(),
    eyebrowRaise: 0.22,
    eyebrowFurrow: 0.18,
    interEyeDistance: 0.14,
    mouthAspectRatio: 0.09,
    headPitch: 1.0,
    headYaw: 0,
    headRoll: 0,
  });
  const [grammarState, setGrammarState] = useState<GrammarClassification>({
    tag: 'NEUTRAL',
    confidence: 0.95,
    reason: 'Neutral declarative clause',
    scores: { NEUTRAL: 0.95, POLAR_QUESTION: 0.02, WH_QUESTION: 0.02, NEGATION: 0.01 },
  });

  // Simulation controls for zero-webcam testing
  const [simSign, setSimSign] = useState<string>('HELLO');
  const [simGrammar, setSimGrammar] = useState<FacialGrammarTag>('NEUTRAL');
  const [previewNormHand, setPreviewNormHand] = useState<Landmark3D[] | null>(null);

  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handWindowRef = useRef<number[][]>([]);
  const faceWindowRef = useRef<FacialFeatures[]>([]);
  const lastInferTimeRef = useRef(0);
  const lastEmittedGlossRef = useRef<{ gloss: string; time: number }>({ gloss: '', time: 0 });
  const fpsCounterRef = useRef({ frames: 0, lastStamp: performance.now() });

  const commitRecognizedSign = useCallback(
    async (pred: PredictionResult, grammar: GrammarClassification, measuredFps: number) => {
      const t0 = performance.now();
      setLastPrediction(pred);

      if (pred.confidence < confidenceThreshold) {
        return;
      }

      const nextGlosses = [...glossTokens, pred.gloss].slice(-10);
      setGlossTokens(nextGlosses);

      const { sentence } = await refineGlossToSentence(
        nextGlosses,
        grammar.tag,
        spokenLanguage
      );
      const totalLatency = Number((pred.latencyMs + (performance.now() - t0)).toFixed(1));
      setLatencyMs(totalLatency);
      setLiveSentence(sentence);

      if (speakEnabled && sentence) {
        speech.speak(sentence, spokenLanguage);
      }

      const logId = addEvalLog({
        gloss: pred.gloss,
        sentence,
        confidence: pred.confidence,
        latencyMs: totalLatency,
        fps: measuredFps || 30,
        grammar: grammar.tag,
        engine: pred.engine,
      });
      setLastLogId(logId);
      setRatedState(null);
    },
    [confidenceThreshold, glossTokens, spokenLanguage, speakEnabled, speech, addEvalLog]
  );

  // Start webcam + load MediaPipe Hand & Face models together
  const handleStartLive = async () => {
    const camOk = await camera.startCamera();
    if (!camOk) return;
    await Promise.all([hands.loadModel(), face.loadModel()]);
  };

  // Live requestAnimationFrame camera loop
  useEffect(() => {
    if (!camera.isActive || !hands.isReady) return;
    let rafId = 0;
    let active = true;

    const loop = (now: number) => {
      if (!active) return;
      const video = camera.videoRef.current;
      const canvas = overlayCanvasRef.current;

      if (video && video.readyState >= 2) {
        // Update FPS once every 500ms
        fpsCounterRef.current.frames += 1;
        const dtFps = now - fpsCounterRef.current.lastStamp;
        if (dtFps >= 500) {
          const currentFps = Math.round((fpsCounterRef.current.frames * 1000) / dtFps);
          setFps(currentFps);
          fpsCounterRef.current.frames = 0;
          fpsCounterRef.current.lastStamp = now;
        }

        const handRes = hands.detectFrame(video, now);
        const faceRes = face.isReady ? face.detectFrame(video, now) : null;

        // Draw live overlay on canvas
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const w = video.videoWidth || 640;
            const h = video.videoHeight || 480;
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }
            ctx.clearRect(0, 0, w, h);

            if (showFaceMesh && faceRes?.landmarks) {
              ctx.fillStyle = 'rgba(45, 212, 191, 0.55)';
              for (let i = 0; i < faceRes.landmarks.length; i += 4) {
                const p = faceRes.landmarks[i];
                ctx.fillRect(p.x * w, p.y * h, 2, 2);
              }
            }

            if (handRes?.rawHands) {
              for (const hObj of handRes.rawHands) {
                ctx.strokeStyle = hObj.handedness === 'Right' ? '#3b82f6' : '#14b8a6';
                ctx.lineWidth = 2.5;
                for (const [a, b] of HAND_CONNECTIONS) {
                  const pa = hObj.landmarks[a];
                  const pb = hObj.landmarks[b];
                  ctx.beginPath();
                  ctx.moveTo(pa.x * w, pa.y * h);
                  ctx.lineTo(pb.x * w, pb.y * h);
                  ctx.stroke();
                }
                for (let j = 0; j < hObj.landmarks.length; j++) {
                  const pt = hObj.landmarks[j];
                  ctx.fillStyle = j === 0 || j === 9 ? '#f59e0b' : '#ffffff';
                  ctx.beginPath();
                  ctx.arc(pt.x * w, pt.y * h, 3.5, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
            }
          }
        }

        // Update facial grammar rolling window
        if (faceRes?.features) {
          faceWindowRef.current.push(faceRes.features);
          if (faceWindowRef.current.length > WINDOW_SIZE) {
            faceWindowRef.current.shift();
          }
          setCurrentFeatures(faceRes.features);
          if (faceWindowRef.current.length >= 10) {
            setGrammarState(classifyFacialGrammar(faceWindowRef.current));
          }
        }

        // Push normalized 129-float hand frame to sliding 30-frame window
        if (handRes && (handRes.rightHand || handRes.leftHand)) {
          const normalized = normalizeTwoHands(handRes.rightHand, handRes.leftHand);
          handWindowRef.current.push(normalized);
          if (handWindowRef.current.length > WINDOW_SIZE) {
            handWindowRef.current.shift();
          }
          setBufferFill(handWindowRef.current.length);
          setPreviewNormHand(featuresToLandmarks(normalized.slice(0, 63)));

          // Run sequence classification every ~750ms once window is full
          if (
            handWindowRef.current.length === WINDOW_SIZE &&
            now - lastInferTimeRef.current > 750
          ) {
            lastInferTimeRef.current = now;
            const snapshot = handWindowRef.current.map((f) => [...f]);
            const grammarSnapshot = classifyFacialGrammar(faceWindowRef.current);

            void predictSequence(snapshot).then((pred) => {
              if (!active) return;
              const elapsedSinceSame = now - lastEmittedGlossRef.current.time;
              if (
                pred.confidence >= confidenceThreshold &&
                (pred.gloss !== lastEmittedGlossRef.current.gloss || elapsedSinceSame > 2200)
              ) {
                lastEmittedGlossRef.current = { gloss: pred.gloss, time: now };
                void commitRecognizedSign(pred, grammarSnapshot, fps || 30);
              } else {
                setLastPrediction(pred);
              }
            });
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
  }, [
    camera.isActive,
    camera.videoRef,
    hands.isReady,
    hands.detectFrame,
    face.isReady,
    face.detectFrame,
    showFaceMesh,
    predictSequence,
    confidenceThreshold,
    commitRecognizedSign,
    fps,
  ]);

  // End-to-end deterministic simulation trigger (runs exact normalization + DTW/TFjs + grammar + TTS pipeline)
  const handleRunSimulation = async (overrideSign?: string, overrideGrammar?: FacialGrammarTag) => {
    const targetGloss = overrideSign ?? simSign;
    const targetGrammar = overrideGrammar ?? simGrammar;
    const def = signs.find((s) => s.gloss === targetGloss) ?? signs[0];
    if (!def) return;

    const seq = generatePrototypeSequence(def.prototypeSpec, WINDOW_SIZE);
    setBufferFill(WINDOW_SIZE);
    setPreviewNormHand(featuresToLandmarks(seq[15].slice(0, 63)));

    const facialWindow = generateSyntheticFacialWindow(targetGrammar, WINDOW_SIZE);
    const grammarRes = classifyFacialGrammar(facialWindow);
    setCurrentFeatures(facialWindow[facialWindow.length - 1]);
    setGrammarState(grammarRes);
    setFps(30);

    const pred = await predictSequence(seq);
    await commitRecognizedSign(pred, grammarRes, 30);
  };

  const handleClear = () => {
    setGlossTokens([]);
    setLiveSentence('');
    setLastPrediction(null);
    setLastLogId(null);
    setRatedState(null);
    handWindowRef.current = [];
    setBufferFill(0);
    speech.cancelSpeech();
  };

  const handleCopy = async () => {
    if (!liveSentence) return;
    try {
      await navigator.clipboard.writeText(liveSentence);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleRate = (rating: 'up' | 'down') => {
    if (!lastLogId) return;
    rateEvalLog(lastLogId, rating);
    setRatedState(rating);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign to Text &amp; Speech
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Live webcam hand &amp; facial grammar recognition · Prototype 36-sign {signLanguage} vocabulary (add custom signs on{' '}
            <Link to="/train" className="text-blue-700 dark:text-blue-400 underline">
              Train
            </Link>
            )
          </p>
        </div>

        {/* Live Telemetry Readout (Requested: Latency + FPS) */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
          <span>
            FPS: <strong className="text-slate-900 dark:text-white">{fps}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Latency: <strong className="text-slate-900 dark:text-white">{latencyMs} ms</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Window: <strong className="text-slate-900 dark:text-white">{bufferFill}/30</strong>
          </span>
          <span aria-hidden="true">·</span>
          <label className="inline-flex items-center gap-1.5">
            <span>Model:</span>
            <select
              aria-label="Select inference engine"
              value={activeEngine}
              onChange={(e) => setActiveEngine(e.target.value as 'tfjs' | 'knn-dtw')}
              className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
            >
              <option value="knn-dtw">k-NN + DTW (36+ signs)</option>
              <option value="tfjs" disabled={!tfModelReady}>
                TF.js 1D-CNN+GRU {tfModelReady ? '(Loaded)' : '(Train first)'}
              </option>
            </select>
          </label>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Camera Viewport + Simulation Bar */}
        <div className="lg:col-span-7 space-y-5">
          {/* Camera Container */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!camera.isActive ? (
                  <button
                    type="button"
                    onClick={handleStartLive}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    Start Webcam
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={camera.stopCamera}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    <CameraOff className="w-4 h-4" aria-hidden="true" />
                    Stop Webcam
                  </button>
                )}

                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none ml-2">
                  <input
                    type="checkbox"
                    checked={showFaceMesh}
                    onChange={(e) => setShowFaceMesh(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  Face mesh overlay
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none ml-2">
                  <input
                    type="checkbox"
                    checked={showEmojiOverlay}
                    onChange={(e) => setShowEmojiOverlay(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                  />
                  Emoji overlay
                </label>
              </div>

              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {hands.status === 'loading' || face.status === 'loading'
                  ? 'Loading MediaPipe WASM...'
                  : camera.isActive
                    ? 'Tracking 2 hands + face'
                    : 'Camera idle'}
              </span>
            </div>

            {/* Loading skeleton bar while MediaPipe initializes */}
            {(hands.status === 'loading' || face.status === 'loading') && (
              <div
                role="status"
                aria-live="polite"
                className="px-4 py-3 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex items-center gap-3 text-xs text-blue-900 dark:text-blue-200"
              >
                <div className="h-3 w-28 rounded bg-blue-200 dark:bg-blue-800 animate-pulse" />
                <span>Initializing MediaPipe HandLandmarker &amp; FaceLandmarker models...</span>
              </div>
            )}

            {/* Video + Overlay Stage */}
            <div className="relative aspect-[16/10] bg-slate-900 flex items-center justify-center overflow-hidden">
              <video
                ref={camera.videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] ${
                  camera.isActive ? 'block' : 'hidden'
                }`}
              />
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none ${
                  camera.isActive ? 'block' : 'hidden'
                }`}
              />

              {!camera.isActive && (
                <div className="p-6 text-center max-w-md space-y-3">
                  {camera.error ? (
                    <>
                      <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" aria-hidden="true" />
                      <h2 className="text-base font-semibold text-white">{camera.error.title}</h2>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        {camera.error.message}
                      </p>
                    </>
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
                      <h2 className="text-base font-semibold text-white">
                        Ready for local webcam tracking
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        Click &ldquo;Start Webcam&rdquo; to track hands and facial expressions at 30
                        FPS locally, or run a live synthetic sign sequence below without a camera.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Secondary Expressive Emoji Overlay (Active Sign + Visual Gesture Trail) */}
              {showEmojiOverlay && (lastPrediction || glossTokens.length > 0) && (() => {
                const activeEmoji = lastPrediction
                  ? mapGlossToEmoji(lastPrediction.gloss)
                  : mapGlossToEmoji(glossTokens[glossTokens.length - 1]);
                const grammarEmoji = mapGrammarToEmoji(grammarState.tag);
                const emojiTrail = mapGlossSequenceToEmojis(glossTokens, 6);

                return (
                  <div
                    data-testid="emoji-overlay"
                    aria-label={`Expressive emoji overlay: ${activeEmoji.label}`}
                    className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3.5 sm:p-4"
                  >
                    {/* Top-right active detected sign reaction card */}
                    <div className="flex justify-end">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`${activeEmoji.gloss}-${glossTokens.length}`}
                          initial={{ opacity: 0, scale: 0.85, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -4 }}
                          transition={{ duration: 0.22, ease: 'easeOut' }}
                          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/85 border border-slate-700/80 shadow-lg text-white"
                        >
                          <span
                            role="img"
                            aria-label={activeEmoji.label}
                            className="text-3xl sm:text-4xl leading-none select-none"
                          >
                            {activeEmoji.emoji}
                          </span>
                          <div className="text-left min-w-0">
                            <div className="text-sm font-semibold leading-tight text-white">
                              {activeEmoji.label}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
                              <span className="text-teal-300">{activeEmoji.gloss}</span>
                              {lastPrediction && (
                                <>
                                  <span>·</span>
                                  <span>{Math.round(lastPrediction.confidence * 100)}%</span>
                                </>
                              )}
                            </div>
                            {grammarState.tag !== 'NEUTRAL' && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] font-mono text-amber-300">
                                <span role="img" aria-hidden="true">
                                  {grammarEmoji.emoji}
                                </span>
                                <span>{grammarEmoji.shortLabel}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {/* Bottom-left visual emoji sentence trail */}
                    {emojiTrail.length > 0 && (
                      <div className="flex justify-start">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-700/70 text-white max-w-full overflow-hidden">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">
                            Visual cue
                          </span>
                          {emojiTrail.map((item, idx) => (
                            <span
                              key={`${item.gloss}-${idx}`}
                              title={`${item.label} (${item.gloss})`}
                              className={`inline-flex items-center gap-1 text-base sm:text-lg leading-none ${
                                idx === emojiTrail.length - 1 ? 'scale-110' : 'opacity-80'
                              }`}
                            >
                              <span role="img" aria-label={item.label}>
                                {item.emoji}
                              </span>
                              {idx < emojiTrail.length - 1 && (
                                <span
                                  aria-hidden="true"
                                  className="text-[10px] text-slate-500 font-mono"
                                >
                                  →
                                </span>
                              )}
                            </span>
                          ))}
                          {grammarState.tag !== 'NEUTRAL' && (
                            <span
                              title={grammarEmoji.shortLabel}
                              className="ml-1 pl-1.5 border-l border-slate-700 text-sm leading-none"
                            >
                              {grammarEmoji.emoji}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Interactive Pipeline Simulator (No Webcam Required) */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Test pipeline without webcam
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Feeds a real 30-frame normalized sequence &amp; facial window through the active
                  classifier and sentence builder.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label
                  htmlFor="sim-sign-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Sign sequence (36 built-in)
                </label>
                <select
                  id="sim-sign-select"
                  value={simSign}
                  onChange={(e) => setSimSign(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  {signs.map((s) => (
                    <option key={s.id} value={s.gloss}>
                      {s.gloss} — {s.labelEn} ({s.labelHi})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-4">
                <label
                  htmlFor="sim-grammar-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Non-manual facial grammar
                </label>
                <select
                  id="sim-grammar-select"
                  value={simGrammar}
                  onChange={(e) => setSimGrammar(e.target.value as FacialGrammarTag)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="NEUTRAL">NEUTRAL (Statement)</option>
                  <option value="POLAR_QUESTION">POLAR_QUESTION (Raised brows)</option>
                  <option value="WH_QUESTION">WH_QUESTION (Furrowed brows)</option>
                  <option value="NEGATION">NEGATION (Head shake)</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={() => void handleRunSimulation()}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  <Play className="w-4 h-4" aria-hidden="true" />
                  Run Sign
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Quick phrases:</span>
              {[
                { label: 'Hello', gloss: 'HELLO', g: 'NEUTRAL' as FacialGrammarTag },
                { label: 'Name?', gloss: 'NAME', g: 'WH_QUESTION' as FacialGrammarTag },
                { label: 'Water', gloss: 'WATER', g: 'NEUTRAL' as FacialGrammarTag },
                { label: 'Good?', gloss: 'GOOD', g: 'POLAR_QUESTION' as FacialGrammarTag },
                { label: 'Understand (No)', gloss: 'UNDERSTAND', g: 'NEGATION' as FacialGrammarTag },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    setSimSign(q.gloss);
                    setSimGrammar(q.g);
                    void handleRunSimulation(q.gloss, q.g);
                  }}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Caption, Controls, Facial Grammar Panel & Normalized Preview */}
        <div className="lg:col-span-5 space-y-5">
          {/* Live Caption & Audio Output Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Live Caption Output
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSpeakEnabled((v) => !v)}
                  aria-pressed={speakEnabled}
                  aria-label={speakEnabled ? 'Mute spoken audio' : 'Enable spoken audio'}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    speakEnabled
                      ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {speakEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  Speak {speakEnabled ? 'On' : 'Off'}
                </button>

                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!liveSentence}
                  aria-label="Copy caption text"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>

                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Clear recognized caption"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            {/* Large Accessible Caption Display */}
            <div
              role="status"
              aria-live="polite"
              data-testid="live-caption-output"
              className="min-h-[112px] p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3"
            >
              {liveSentence ? (
                <p className="text-2xl sm:text-3xl font-display font-semibold text-slate-900 dark:text-white leading-snug">
                  {liveSentence}
                </p>
              ) : (
                <p className="text-base text-slate-400 dark:text-slate-500">
                  Recognized sentences will appear here in real time.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                <span>
                  Glosses:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {glossTokens.length > 0 ? glossTokens.join(' · ') : '—'}
                  </strong>
                </span>
                {lastLogId && (
                  <div className="flex items-center gap-1.5">
                    <span>Accurate?</span>
                    <button
                      type="button"
                      onClick={() => handleRate('up')}
                      aria-label="Mark prediction accurate"
                      className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 ${
                        ratedState === 'up' ? 'text-emerald-600 dark:text-emerald-400' : ''
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate('down')}
                      aria-label="Mark prediction inaccurate"
                      className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 ${
                        ratedState === 'down' ? 'text-rose-600 dark:text-rose-400' : ''
                      }`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Confidence Score + Adjustable Threshold Slider */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400">
                  Latest match:{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {lastPrediction ? lastPrediction.gloss : 'None'}
                  </strong>
                </span>
                <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                  {lastPrediction ? `${Math.round(lastPrediction.confidence * 100)}%` : '0%'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-700 dark:bg-blue-400 transition-all duration-150"
                  style={{ width: `${Math.round((lastPrediction?.confidence ?? 0) * 100)}%` }}
                />
              </div>

              <div className="pt-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <label
                    htmlFor="confidence-threshold-slider"
                    className="font-medium text-slate-700 dark:text-slate-300"
                  >
                    Confidence threshold
                  </label>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {confidenceThreshold.toFixed(2)}
                  </span>
                </div>
                <input
                  id="confidence-threshold-slider"
                  type="range"
                  min={0.4}
                  max={0.95}
                  step={0.05}
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  className="w-full accent-blue-700 dark:accent-blue-400"
                />
              </div>
            </div>
          </div>

          {/* Non-Manual Facial Grammar Live Panel */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Non-Manual Facial Grammar
              </h2>
              <span
                data-testid="detected-grammar-tag"
                className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400"
              >
                {grammarState.tag} ({Math.round(grammarState.confidence * 100)}%)
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">{grammarState.reason}</p>

            <div className="space-y-2.5 text-xs">
              {[
                {
                  label: 'Eyebrow raise',
                  val: currentFeatures.eyebrowRaise,
                  pct: Math.min(100, (currentFeatures.eyebrowRaise / 0.55) * 100),
                  fmt: currentFeatures.eyebrowRaise.toFixed(2),
                },
                {
                  label: 'Eyebrow furrow',
                  val: currentFeatures.eyebrowFurrow,
                  pct: Math.min(100, currentFeatures.eyebrowFurrow * 100),
                  fmt: currentFeatures.eyebrowFurrow.toFixed(2),
                },
                {
                  label: 'Mouth aspect ratio',
                  val: currentFeatures.mouthAspectRatio,
                  pct: Math.min(100, (currentFeatures.mouthAspectRatio / 0.6) * 100),
                  fmt: currentFeatures.mouthAspectRatio.toFixed(2),
                },
                {
                  label: 'Head pitch',
                  val: currentFeatures.headPitch,
                  pct: Math.min(100, (Math.abs(currentFeatures.headPitch) / 25) * 100),
                  fmt: `${currentFeatures.headPitch.toFixed(1)}°`,
                },
                {
                  label: 'Head yaw',
                  val: currentFeatures.headYaw,
                  pct: Math.min(100, (Math.abs(currentFeatures.headYaw) / 30) * 100),
                  fmt: `${currentFeatures.headYaw.toFixed(1)}°`,
                },
              ].map((bar) => (
                <div key={bar.label} className="space-y-1">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>{bar.label}</span>
                    <span className="font-mono tabular-nums text-slate-900 dark:text-slate-200">
                      {bar.fmt}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 dark:bg-teal-400 transition-all duration-100"
                      style={{ width: `${Math.max(4, bar.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mini Normalized Hand Verification Window */}
          <SkeletonCanvas
            mode="normalized"
            rightHand={previewNormHand}
            title="Normalized Palm Input (63 feats)"
            height={175}
          />
        </div>
      </div>
    </div>
  );
}
