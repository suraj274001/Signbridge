import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Play,
  Pause,
  RotateCcw,
  Repeat,
  Copy,
  Check,
  Download,
  Code2,
  Table2,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getSignPack } from '../data/signs';
import { SignAvatar3D } from '../components/SignAvatar3D';
import {
  LIBRARY_CATEGORIES,
  filterSigns,
  formatTuple3,
  getActiveKeyframeIndex,
  type LibraryCategoryFilter,
  type LibraryHandednessFilter,
} from '../lib/signLibrary';
import type { SignDefinition } from '../types/signbridge';

const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;

export function SignLibraryPage() {
  const { theme, signLanguage } = useApp();
  const signs = useMemo(() => getSignPack(signLanguage), [signLanguage]);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LibraryCategoryFilter>('all');
  const [handedness, setHandedness] = useState<LibraryHandednessFilter>('all');
  const [selectedId, setSelectedId] = useState<string>(signs[0]?.id ?? 'hello');

  // 3D Avatar animation playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLooping, setIsLooping] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [progress, setProgress] = useState(0);

  // Keyframe inspector tab & copy confirmation
  const [inspectorTab, setInspectorTab] = useState<'table' | 'json'>('table');
  const [copiedJson, setCopiedJson] = useState(false);

  const filteredSigns = useMemo(
    () => filterSigns(signs, { query, category, handedness }),
    [signs, query, category, handedness]
  );

  const selectedSign: SignDefinition | null = useMemo(() => {
    const exact = signs.find((s) => s.id === selectedId);
    return exact ?? filteredSigns[0] ?? signs[0] ?? null;
  }, [signs, selectedId, filteredSigns]);

  const lastTickRef = useRef<number | null>(null);

  // Drive smooth normalized progress [0..1] for the selected sign
  useEffect(() => {
    if (!isPlaying || !selectedSign) {
      lastTickRef.current = null;
      return;
    }

    let rafId = 0;
    const step = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const dt = Math.min(now - lastTickRef.current, 100);
      lastTickRef.current = now;

      const durationMs = Math.max(400, selectedSign.durationMs / speed);
      setProgress((prev) => {
        const next = prev + dt / durationMs;
        if (next >= 1) {
          if (isLooping) {
            return next - Math.floor(next);
          }
          setIsPlaying(false);
          return 1;
        }
        return next;
      });

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isLooping, speed, selectedSign]);

  const handleSelectSign = (sign: SignDefinition) => {
    setSelectedId(sign.id);
    setProgress(0);
    setIsPlaying(true);
  };

  const handleReplay = () => {
    setProgress(0);
    setIsPlaying(true);
  };

  const handleJumpToKeyframe = (t: number) => {
    setIsPlaying(false);
    setProgress(t);
  };

  const formattedJson = useMemo(() => {
    if (!selectedSign) return '';
    return JSON.stringify(selectedSign, null, 2);
  }, [selectedSign]);

  const handleCopyJson = async () => {
    if (!formattedJson) return;
    try {
      await navigator.clipboard.writeText(formattedJson);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  };

  const handleDownloadJson = () => {
    if (!selectedSign || !formattedJson) return;
    const blob = new Blob([formattedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signbridge-${selectedSign.id}-keyframes.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeKeyframeIndex = selectedSign
    ? getActiveKeyframeIndex(selectedSign.keyframes, progress)
    : -1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign Library &amp; Keyframe Explorer
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Search the {signs.length}-sign {signLanguage} starter vocabulary, preview articulated 3D
            avatar animations, and inspect exact pose keyframes.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-slate-600 dark:text-slate-400 shrink-0">
          <span>
            Showing <strong className="text-slate-900 dark:text-white">{filteredSigns.length}</strong>{' '}
            of {signs.length} signs
          </span>
          <Link
            to="/speak"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-sans font-medium transition-colors"
          >
            Compose sentence <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Main Two-Column Library + Inspector Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Search, Filters & Word List */}
        <section
          aria-label="Searchable sign word list"
          className="lg:col-span-5 space-y-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5"
        >
          {/* Search Input */}
          <div className="relative">
            <label htmlFor="library-search" className="sr-only">
              Search signs by English, Hindi, gloss, or synonym
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="library-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search English, Hindi, gloss, or synonym (e.g. water, नमस्ते)..."
              className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search query"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Category Filter Row */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
              {LIBRARY_CATEGORIES.map((cat) => {
                const active = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    aria-pressed={active}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                      active
                        ? 'bg-blue-700 text-white border-blue-700 dark:bg-blue-600 dark:border-blue-600'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Handedness Segmented Toggle */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500 dark:text-slate-400">Handedness:</span>
              <div
                role="group"
                aria-label="Filter by handedness"
                className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-0.5 text-xs"
              >
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'one-hand', label: 'One-hand' },
                    { id: 'two-hand', label: 'Two-hand' },
                  ] as { id: LibraryHandednessFilter; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setHandedness(opt.id)}
                    aria-pressed={handedness === opt.id}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      handedness === opt.id
                        ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 font-semibold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scrollable Word List */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            {filteredSigns.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No signs matched &ldquo;{query}&rdquo;
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Try another keyword or clear your active category filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setCategory('all');
                    setHandedness('all');
                  }}
                  className="mt-2 inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <ul className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1" role="list">
                {filteredSigns.map((sign) => {
                  const isSelected = selectedSign?.id === sign.id;
                  return (
                    <li key={sign.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSign(sign)}
                        aria-current={isSelected ? 'true' : undefined}
                        className={`w-full text-left px-3.5 py-3 rounded-lg border transition-colors flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'border-blue-600 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                            : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-sm font-semibold truncate ${
                                isSelected
                                  ? 'text-blue-800 dark:text-blue-300'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {sign.labelEn}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {sign.labelHi}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            <span className="text-teal-700 dark:text-teal-400 font-medium">
                              {sign.gloss}
                            </span>
                            <span>·</span>
                            <span>{sign.category}</span>
                            <span>·</span>
                            <span>{sign.handedness}</span>
                          </div>
                        </div>

                        <div className="shrink-0 text-right font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          <div>{sign.keyframes.length} kf</div>
                          <div>{sign.durationMs}ms</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Right Column: Selected Sign 3D Animation + Keyframe Data Inspector */}
        <section
          aria-label="Selected sign 3D preview and keyframe data"
          className="lg:col-span-7 space-y-5"
        >
          {selectedSign && (
            <>
              {/* Word Header & Physical Description */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                        {selectedSign.labelEn}
                      </h2>
                      <span className="text-base text-slate-500 dark:text-slate-400">
                        {selectedSign.labelHi}
                      </span>
                      <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                        GLOSS: {selectedSign.gloss}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {selectedSign.description}
                    </p>
                  </div>
                </div>

                {/* Key Sign Attributes Grid */}
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Handedness</dt>
                    <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {selectedSign.handedness}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Facial Cue</dt>
                    <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {selectedSign.facialCue ?? 'NEUTRAL'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Duration</dt>
                    <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {selectedSign.durationMs} ms ({selectedSign.keyframes.length} kf)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 dark:text-slate-400">Prototype Spec</dt>
                    <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100 truncate">
                      {selectedSign.prototypeSpec.handshape} / {selectedSign.prototypeSpec.motion}
                    </dd>
                  </div>
                </dl>

                {selectedSign.synonyms.length > 0 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Synonyms:{' '}
                    </span>
                    {selectedSign.synonyms.join(', ')}
                  </div>
                )}
              </div>

              {/* 3D Avatar Preview & Playback Scrubber */}
              <div className="space-y-3">
                <SignAvatar3D
                  currentSign={selectedSign}
                  progress={progress}
                  isPlaying={isPlaying}
                  facialCue={selectedSign.facialCue ?? 'NEUTRAL'}
                  isDark={theme === 'dark'}
                  height={380}
                />

                {/* Playback Controls + Timeline Scrubber */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isPlaying && progress >= 0.99) {
                            setProgress(0);
                          }
                          setIsPlaying((p) => !p);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" aria-hidden="true" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" aria-hidden="true" /> Play
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleReplay}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Replay
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsLooping((l) => !l)}
                        aria-pressed={isLooping}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          isLooping
                            ? 'border-teal-600 dark:border-teal-500 text-teal-700 dark:text-teal-300 bg-teal-50/70 dark:bg-teal-950/40'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Repeat className="w-3.5 h-3.5" aria-hidden="true" /> Loop
                      </button>
                    </div>

                    <div className="flex items-center gap-2.5 text-xs">
                      <label
                        htmlFor="library-speed-slider"
                        className="text-slate-600 dark:text-slate-400"
                      >
                        Speed
                      </label>
                      <input
                        id="library-speed-slider"
                        type="range"
                        min={0.4}
                        max={1.8}
                        step={0.1}
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="w-24 accent-blue-700"
                      />
                      <span className="font-mono tabular-nums w-9 text-right text-slate-700 dark:text-slate-300">
                        {speed.toFixed(1)}×
                      </span>
                    </div>
                  </div>

                  {/* Interactive Keyframe Timeline Scrubber */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                      <label htmlFor="keyframe-scrubber">Timeline Progress (t)</label>
                      <span className="tabular-nums text-slate-900 dark:text-slate-100">
                        t = {progress.toFixed(2)} · {(progress * selectedSign.durationMs).toFixed(0)} ms
                      </span>
                    </div>
                    <input
                      id="keyframe-scrubber"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={progress}
                      onChange={(e) => {
                        setIsPlaying(false);
                        setProgress(Number(e.target.value));
                      }}
                      className="w-full accent-teal-600"
                    />
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Jump to exact keyframe:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSign.keyframes.map((kf, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleJumpToKeyframe(kf.t)}
                            className={`px-2 py-0.5 rounded font-mono text-[11px] border transition-colors ${
                              activeKeyframeIndex === idx
                                ? 'bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-teal-600'
                                : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-500'
                            }`}
                          >
                            KF {idx + 1} (t={kf.t.toFixed(2)})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Keyframe Data Inspector (Structured Table + Raw JSON) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Keyframe Data ({selectedSign.keyframes.length} poses)
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      role="tablist"
                      aria-label="Keyframe view format"
                      className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-0.5 text-xs"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={inspectorTab === 'table'}
                        onClick={() => setInspectorTab('table')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                          inspectorTab === 'table'
                            ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 font-semibold shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <Table2 className="w-3.5 h-3.5" aria-hidden="true" /> Structured
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={inspectorTab === 'json'}
                        onClick={() => setInspectorTab('json')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                          inspectorTab === 'json'
                            ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 font-semibold shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" aria-hidden="true" /> Raw JSON
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      {copiedJson ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy JSON
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      aria-label={`Download ${selectedSign.labelEn} keyframes JSON`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" /> .json
                    </button>
                  </div>
                </div>

                {inspectorTab === 'table' ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedSign.keyframes.map((kf, idx) => {
                      const isActive = activeKeyframeIndex === idx;
                      return (
                        <div
                          key={idx}
                          className={`p-4 transition-colors ${
                            isActive
                              ? 'bg-teal-50/50 dark:bg-teal-950/25'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2 font-mono text-xs">
                              <span
                                className={`font-semibold ${
                                  isActive
                                    ? 'text-teal-700 dark:text-teal-300'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                Keyframe #{idx + 1}
                              </span>
                              <span className="text-slate-500 dark:text-slate-400">
                                t = {kf.t.toFixed(2)} ({Math.round(kf.t * selectedSign.durationMs)}{' '}
                                ms)
                              </span>
                              {kf.browLift !== undefined && (
                                <span className="text-blue-700 dark:text-blue-400">
                                  · browLift: {kf.browLift > 0 ? '+' : ''}
                                  {kf.browLift.toFixed(2)}
                                </span>
                              )}
                              {kf.headRot && (
                                <span className="text-slate-500 dark:text-slate-400">
                                  · headRot: {formatTuple3(kf.headRot)}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleJumpToKeyframe(kf.t)}
                              className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              Preview pose
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {/* Right Hand Pose */}
                            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 p-3 space-y-2">
                              <div className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                Right Hand
                              </div>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                <span>pos (x,y,z):</span>
                                <span className="text-slate-900 dark:text-slate-100">
                                  {formatTuple3(kf.right.handPos)}
                                </span>
                                <span>rot (rad):</span>
                                <span className="text-slate-900 dark:text-slate-100">
                                  {formatTuple3(kf.right.handRot)}
                                </span>
                                <span>spread:</span>
                                <span className="text-slate-900 dark:text-slate-100">
                                  {(kf.right.spread ?? 0.2).toFixed(2)}
                                </span>
                              </div>
                              <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                                  Finger Curls (0 open → 1 curled)
                                </div>
                                <div className="grid grid-cols-5 gap-1 font-mono text-[10px] text-center">
                                  {kf.right.fingers.map((curl, fIdx) => (
                                    <div
                                      key={fIdx}
                                      className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1 px-0.5"
                                    >
                                      <div className="text-slate-400">{FINGER_NAMES[fIdx].slice(0, 3)}</div>
                                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                                        {curl.toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Left Hand Pose (when two-handed) */}
                            <div className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 p-3 space-y-2">
                              <div className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                Left Hand
                              </div>
                              {kf.left ? (
                                <>
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                    <span>pos (x,y,z):</span>
                                    <span className="text-slate-900 dark:text-slate-100">
                                      {formatTuple3(kf.left.handPos)}
                                    </span>
                                    <span>rot (rad):</span>
                                    <span className="text-slate-900 dark:text-slate-100">
                                      {formatTuple3(kf.left.handRot)}
                                    </span>
                                    <span>spread:</span>
                                    <span className="text-slate-900 dark:text-slate-100">
                                      {(kf.left.spread ?? 0.2).toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                                      Finger Curls (0 open → 1 curled)
                                    </div>
                                    <div className="grid grid-cols-5 gap-1 font-mono text-[10px] text-center">
                                      {kf.left.fingers.map((curl, fIdx) => (
                                        <div
                                          key={fIdx}
                                          className="rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 py-1 px-0.5"
                                        >
                                          <div className="text-slate-400">
                                            {FINGER_NAMES[fIdx].slice(0, 3)}
                                          </div>
                                          <div className="font-semibold text-slate-800 dark:text-slate-100">
                                            {curl.toFixed(2)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">
                                  Resting neutral pose (one-hand sign).
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <pre className="p-4 text-xs font-mono leading-relaxed text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 overflow-x-auto max-h-[440px]">
                    <code>{formattedJson}</code>
                  </pre>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
