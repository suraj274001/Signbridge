import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Circle,
  Cpu,
  Download,
  Upload,
  Trash2,
  Plus,
  Database,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
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
import { useApp } from '../context/AppContext';
import { useCamera } from '../hooks/useCamera';
import { useHands } from '../hooks/useHands';
import { getSignPack } from '../data/signs';
import {
  featuresToLandmarks,
  generatePrototypeSequence,
  normalizeTwoHands,
} from '../lib/normalization';
import {
  clearAllTrainingSamples,
  deleteTrainingSample,
  saveTrainingSample,
  sharedTFModel,
  type TrainingProgress,
} from '../lib/model';
import { SkeletonCanvas } from '../components/SkeletonCanvas';
import type { TrainingSample } from '../types/signbridge';

const TARGET_FRAMES = 30;

export function TrainPage() {
  const {
    signLanguage,
    customSamples,
    refreshSamplesAndModel,
    tfModelReady,
    tfModelLabels,
  } = useApp();

  const camera = useCamera();
  const hands = useHands(false);
  const builtInSigns = useMemo(() => getSignPack(signLanguage), [signLanguage]);

  const [labelInput, setLabelInput] = useState('HELLO');
  const [customLabelDraft, setCustomLabelDraft] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFramesCount, setRecordedFramesCount] = useState(0);
  const [previewSample, setPreviewSample] = useState<TrainingSample | null>(null);

  const [epochs, setEpochs] = useState(20);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingHistory, setTrainingHistory] = useState<TrainingProgress[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingFramesRef = useRef<number[][]>([]);
  const isRecordingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const groupedSamples = useMemo(() => {
    const map = new Map<string, TrainingSample[]>();
    for (const s of customSamples) {
      const key = s.label.toUpperCase();
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [customSamples]);

  const allLabelOptions = useMemo(() => {
    const set = new Set<string>(builtInSigns.map((s) => s.gloss));
    for (const s of customSamples) set.add(s.label.toUpperCase());
    if (labelInput.trim()) set.add(labelInput.trim().toUpperCase());
    return Array.from(set).sort();
  }, [builtInSigns, customSamples, labelInput]);

  // Camera capture loop during active recording
  useEffect(() => {
    if (!camera.isActive || !hands.isReady) return;
    let rafId = 0;
    let active = true;

    const loop = (now: number) => {
      if (!active) return;
      const video = camera.videoRef.current;
      if (video && video.readyState >= 2 && isRecordingRef.current) {
        const res = hands.detectFrame(video, now);
        if (res && (res.rightHand || res.leftHand)) {
          const norm = normalizeTwoHands(res.rightHand, res.leftHand);
          recordingFramesRef.current.push(norm);
          setRecordedFramesCount(recordingFramesRef.current.length);

          if (recordingFramesRef.current.length >= TARGET_FRAMES) {
            isRecordingRef.current = false;
            setIsRecording(false);
            const captured = recordingFramesRef.current.slice(0, TARGET_FRAMES);
            const sample: TrainingSample = {
              id: `smp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              label: labelInput.trim().toUpperCase() || 'CUSTOM',
              createdAt: Date.now(),
              frames: captured,
              source: 'webcam',
            };
            void saveTrainingSample(sample).then(async () => {
              await refreshSamplesAndModel();
              setPreviewSample(sample);
              setStatusMessage(`Saved 30-frame webcam sample for "${sample.label}".`);
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
  }, [camera.isActive, camera.videoRef, hands.isReady, hands.detectFrame, labelInput, refreshSamplesAndModel]);

  const handleStartWebcamRecording = useCallback(() => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (!camera.isActive || !hands.isReady) {
      setErrorMessage('Start the webcam first, or use "Add Demo Sample" to test without a camera.');
      return;
    }

    setCountdown(3);
    let current = 3;
    const timer = window.setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCountdown(current);
      } else {
        window.clearInterval(timer);
        setCountdown(null);
        recordingFramesRef.current = [];
        setRecordedFramesCount(0);
        isRecordingRef.current = true;
        setIsRecording(true);
      }
    }, 700);
  }, [camera.isActive, hands.isReady]);

  // Deterministic synthetic sample recorder for testing & quick starter dataset creation
  const handleAddSyntheticSamples = async (count = 5) => {
    setErrorMessage(null);
    const targetLabel = labelInput.trim().toUpperCase();
    if (!targetLabel) {
      setErrorMessage('Enter or select a sign label first.');
      return;
    }

    const builtIn = builtInSigns.find((s) => s.gloss === targetLabel);
    const spec = builtIn?.prototypeSpec ?? {
      handshape: 'flat_open' as const,
      motion: 'wave' as const,
      twoHanded: false,
    };

    let lastSample: TrainingSample | null = null;
    for (let i = 0; i < count; i++) {
      const baseSeq = generatePrototypeSequence(spec, TARGET_FRAMES);
      const jittered = baseSeq.map((frame) =>
        frame.map((v) => (v === 0 ? 0 : Number((v + (Math.random() - 0.5) * 0.035).toFixed(5))))
      );
      const sample: TrainingSample = {
        id: `smp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        label: targetLabel,
        createdAt: Date.now() + i,
        frames: jittered,
        source: 'synthetic',
      };
      await saveTrainingSample(sample);
      lastSample = sample;
    }

    await refreshSamplesAndModel();
    if (lastSample) setPreviewSample(lastSample);
    setStatusMessage(`Added ${count} training samples (30 frames each) for "${targetLabel}".`);
  };

  const handleCreateCustomLabel = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customLabelDraft.trim().toUpperCase().replace(/\s+/g, '_');
    if (!cleaned) return;
    setLabelInput(cleaned);
    setCustomLabelDraft('');
    setStatusMessage(`Selected custom sign label "${cleaned}".`);
  };

  const handleDeleteSample = async (id: string) => {
    await deleteTrainingSample(id);
    if (previewSample?.id === id) setPreviewSample(null);
    await refreshSamplesAndModel();
  };

  const handleTrainModel = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    if (groupedSamples.length < 2) {
      setErrorMessage('Collect samples for at least 2 distinct sign labels before training the TF.js neural model.');
      return;
    }

    setIsTraining(true);
    setTrainingHistory([]);
    try {
      const result = await sharedTFModel.train(customSamples, epochs, (progress) => {
        setTrainingHistory((prev) => [...prev, progress]);
      });
      await refreshSamplesAndModel();
      setStatusMessage(
        `Model trained across ${result.labels.length} classes (final accuracy ${(result.finalAccuracy * 100).toFixed(1)}%) and saved to browser IndexedDB.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Model training failed.');
    } finally {
      setIsTraining(false);
    }
  };

  const handleExportDataset = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      signLanguage,
      sampleCount: customSamples.length,
      samples: customSamples,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signbridge-dataset-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportDataset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { samples?: TrainingSample[] } | TrainingSample[];
      const list = Array.isArray(parsed) ? parsed : parsed.samples ?? [];
      let imported = 0;
      for (const item of list) {
        if (item.label && Array.isArray(item.frames) && item.frames.length > 0) {
          await saveTrainingSample({
            id: item.id || `imp_${Date.now()}_${imported}`,
            label: item.label.toUpperCase(),
            createdAt: item.createdAt || Date.now(),
            frames: item.frames,
            source: 'imported',
          });
          imported++;
        }
      }
      await refreshSamplesAndModel();
      setStatusMessage(`Imported ${imported} training samples into local IndexedDB.`);
    } catch {
      setErrorMessage('Invalid dataset JSON file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportTFModel = async () => {
    setErrorMessage(null);
    try {
      await sharedTFModel.exportModelDownload();
      setStatusMessage('Exported TensorFlow.js model topology and weights.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Train or load a model first.');
    }
  };

  const previewLandmarks = useMemo(() => {
    if (!previewSample || previewSample.frames.length === 0) return null;
    const mid = previewSample.frames[Math.floor(previewSample.frames.length / 2)];
    return featuresToLandmarks(mid.slice(0, 63));
  }, [previewSample]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            In-Browser Dataset &amp; Model Training
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Record 30-frame normalized sign sequences, train a TensorFlow.js 1D-CNN + GRU classifier
            locally, and persist models in IndexedDB.
          </p>
        </div>

        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportDataset}
            disabled={customSamples.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export Dataset
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" /> Import Dataset
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportDataset}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleExportTFModel}
            disabled={!tfModelReady}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium disabled:opacity-40"
          >
            <Database className="w-3.5 h-3.5" aria-hidden="true" /> Export TF.js Model
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2.5 text-sm text-emerald-900 dark:text-emerald-200"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center gap-2.5 text-sm text-rose-900 dark:text-rose-200"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Label Selection + Recording Stage */}
        <div className="lg:col-span-6 space-y-5">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              1. Choose or Create Sign Label
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="train-label-select"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Active sign label
                </label>
                <select
                  id="train-label-select"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono"
                >
                  {allLabelOptions.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              <form onSubmit={handleCreateCustomLabel}>
                <label
                  htmlFor="custom-label-input"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Or create custom label
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="custom-label-input"
                    type="text"
                    value={customLabelDraft}
                    onChange={(e) => setCustomLabelDraft(e.target.value)}
                    placeholder="e.g. COFFEE"
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />
                  <button
                    type="submit"
                    aria-label="Add custom label"
                    className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!camera.isActive ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await camera.startCamera();
                      if (ok) await hands.loadModel();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" /> Start Camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={camera.stopCamera}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                  >
                    <CameraOff className="w-3.5 h-3.5" aria-hidden="true" /> Stop
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleStartWebcamRecording}
                  disabled={!camera.isActive || isRecording || countdown !== null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-40"
                >
                  <Circle className="w-3 h-3 fill-current" aria-hidden="true" />
                  Record 30 Frames
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleAddSyntheticSamples(5)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 text-xs font-semibold hover:bg-teal-100 dark:hover:bg-teal-900/50"
              >
                +5 Demo Samples ({labelInput})
              </button>
            </div>

            <div className="relative aspect-[4/3] bg-slate-900 flex items-center justify-center">
              <video
                ref={camera.videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] ${
                  camera.isActive ? 'block' : 'hidden'
                }`}
              />

              {countdown !== null && (
                <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                  <span className="font-display text-7xl font-bold text-white tabular-nums">
                    {countdown}
                  </span>
                </div>
              )}

              {isRecording && (
                <div className="absolute top-3 left-3 px-3 py-1.5 rounded-md bg-rose-600 text-white font-mono text-xs font-semibold tabular-nums">
                  REC {recordedFramesCount}/{TARGET_FRAMES} frames
                </div>
              )}

              {!camera.isActive && (
                <div className="p-6 text-center max-w-sm space-y-2 text-slate-300 text-xs">
                  <p className="font-semibold text-white text-sm">Record 5–10 samples per sign</p>
                  <p>
                    Start your webcam to record live 30-frame sequences, or click &ldquo;+5 Demo
                    Samples&rdquo; for at least 2 labels (e.g., HELLO and WATER) to train the
                    TensorFlow.js 1D-CNN + GRU model immediately.
                  </p>
                </div>
              )}
            </div>
          </div>

          {previewSample && (
            <SkeletonCanvas
              mode="normalized"
              rightHand={previewLandmarks}
              title={`Sample Preview · ${previewSample.label} (${previewSample.source})`}
              height={190}
            />
          )}
        </div>

        {/* Right: Collected Dataset + TF.js Training Control + Loss/Accuracy Chart */}
        <div className="lg:col-span-6 space-y-5">
          {/* Collected Samples Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  2. Recorded Dataset ({customSamples.length} samples · {groupedSamples.length} classes)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Saved in local IndexedDB · Immediately available to k-NN/DTW &amp; TF.js trainer.
                </p>
              </div>
              {customSamples.length > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await clearAllTrainingSamples();
                    setPreviewSample(null);
                    await refreshSamplesAndModel();
                  }}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-medium"
                >
                  Clear all
                </button>
              )}
            </div>

            {groupedSamples.length === 0 ? (
              <div className="p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500 dark:text-slate-400">
                No custom samples recorded yet. Record via webcam or add demo samples for 2+ labels.
              </div>
            ) : (
              <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
                {groupedSamples.map(([lbl, items]) => (
                  <div
                    key={lbl}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">
                        {lbl}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {items.length} {items.length === 1 ? 'sample' : 'samples'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((smp, idx) => (
                        <div
                          key={smp.id}
                          className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => setPreviewSample(smp)}
                            className="px-2 py-1 font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            #{idx + 1}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSample(smp.id)}
                            aria-label={`Delete sample ${idx + 1} for ${lbl}`}
                            className="px-1.5 py-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border-l border-slate-200 dark:border-slate-700"
                          >
                            <Trash2 className="w-3 h-3" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TF.js Training Panel */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  3. Train TensorFlow.js 1D-CNN + GRU Model
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tfModelReady
                    ? `Saved model ready in IndexedDB (${tfModelLabels.join(', ')})`
                    : 'No neural model trained yet — k-NN/DTW fallback is active.'}
                </p>
              </div>
              {tfModelReady && (
                <button
                  type="button"
                  onClick={async () => {
                    await sharedTFModel.deleteSavedModel();
                    await refreshSamplesAndModel();
                    setStatusMessage('Removed saved TensorFlow.js model from IndexedDB.');
                  }}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-medium"
                >
                  Delete model
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="epochs-input" className="font-medium text-slate-700 dark:text-slate-300">
                  Epochs:
                </label>
                <input
                  id="epochs-input"
                  type="number"
                  min={5}
                  max={60}
                  value={epochs}
                  onChange={(e) => setEpochs(Math.max(5, Math.min(60, Number(e.target.value) || 20)))}
                  className="w-16 px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono tabular-nums"
                />
              </div>

              <button
                type="button"
                onClick={handleTrainModel}
                disabled={isTraining || groupedSamples.length < 2}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                <Cpu className="w-4 h-4" aria-hidden="true" />
                {isTraining
                  ? `Training (${trainingHistory.length}/${epochs})...`
                  : 'Train Model in Browser'}
              </button>
            </div>

            {/* Live Loss & Accuracy Chart */}
            <div className="h-[240px] w-full pt-2">
              {trainingHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trainingHistory} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="epoch" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="loss"
                      name="Training Loss"
                      stroke="#e11d48"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="accuracy"
                      name="Training Accuracy"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full rounded-lg border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  Live epoch loss &amp; accuracy chart appears here during training.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
