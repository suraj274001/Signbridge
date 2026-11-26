import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Play,
  Pause,
  RotateCcw,
  Send,
  AlertCircle,
  Search,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSpeech } from '../hooks/useSpeech';
import { speechToGloss } from '../lib/glossParser';
import { getSignByGloss, getSignPack } from '../data/signs';
import { SignAvatar3D } from '../components/SignAvatar3D';
import type { FacialGrammarTag, SignDefinition } from '../types/signbridge';

const SAMPLE_PHRASES = [
  'Hello, what is your name?',
  'Please help me with water',
  'I do not understand, sorry',
  'Good morning friend, where is the hospital?',
  'Thank you, I want food',
];

export function SpeakPage() {
  const { theme, spokenLanguage, signLanguage } = useApp();
  const speech = useSpeech(spokenLanguage);
  const allSigns = useMemo(() => getSignPack(signLanguage), [signLanguage]);

  const [inputText, setInputText] = useState('Hello, what is your name?');
  const [parsedGlosses, setParsedGlosses] = useState<string[]>(['HELLO', 'YOU', 'NAME', 'WHAT']);
  const [removedFillers, setRemovedFillers] = useState<string[]>(['is']);
  const [facialCue, setFacialCue] = useState<FacialGrammarTag>('WH_QUESTION');

  const [queueIndex, setQueueIndex] = useState(0);
  const [signProgress, setSignProgress] = useState(0.5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [lexiconFilter, setLexiconFilter] = useState('');

  const rafRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  const currentGloss = parsedGlosses[queueIndex] ?? null;
  const currentSignDef: SignDefinition | null = currentGloss
    ? getSignByGloss(currentGloss, signLanguage) ?? null
    : null;

  const triggerTextToSign = useCallback(
    (phrase: string) => {
      const parsed = speechToGloss(phrase, signLanguage);
      setInputText(phrase);
      setParsedGlosses(parsed.glosses);
      setRemovedFillers(parsed.removedFillers);
      setFacialCue(parsed.facialCue);
      setQueueIndex(0);
      setSignProgress(0);
      setIsPlaying(parsed.glosses.length > 0);
    },
    [signLanguage]
  );

  // Playback loop stepping through gloss queue at selected speed
  useEffect(() => {
    if (!isPlaying || parsedGlosses.length === 0) return;

    lastFrameTimeRef.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.08);
      lastFrameTimeRef.current = now;

      const activeDef = getSignByGloss(parsedGlosses[queueIndex], signLanguage);
      const durationSec = (activeDef?.durationMs ?? 900) / 1000;

      setSignProgress((prev) => {
        const next = prev + (dt * speed) / durationSec;
        if (next >= 1) {
          if (queueIndex < parsedGlosses.length - 1) {
            setQueueIndex((idx) => idx + 1);
            return 0;
          } else {
            setIsPlaying(false);
            return 1;
          }
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, parsedGlosses, queueIndex, speed, signLanguage]);

  const handleToggleMic = () => {
    if (speech.isListening) {
      speech.stopListening();
    } else {
      speech.startListening((finalText) => {
        triggerTextToSign(finalText);
      });
    }
  };

  const handleReplay = () => {
    if (parsedGlosses.length === 0) return;
    setQueueIndex(0);
    setSignProgress(0);
    setIsPlaying(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    triggerTextToSign(inputText);
  };

  const filteredLexicon = useMemo(() => {
    const q = lexiconFilter.trim().toLowerCase();
    if (!q) return allSigns;
    return allSigns.filter(
      (s) =>
        s.gloss.toLowerCase().includes(q) ||
        s.labelEn.toLowerCase().includes(q) ||
        s.labelHi.includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [allSigns, lexiconFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Speech to 3D Sign Avatar
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Speak or type in English/Hindi · Automatic filler removal &amp; WH-final {signLanguage}{' '}
            gloss reordering · Articulated Three.js avatar
          </p>
        </div>

        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Lexicon: {allSigns.length} animated signs · Facial cue: {facialCue}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: 3D Avatar Viewport + Playback Controls */}
        <div className="lg:col-span-7 space-y-4">
          <SignAvatar3D
            currentSign={currentSignDef}
            progress={signProgress}
            isPlaying={isPlaying}
            facialCue={facialCue}
            isDark={theme === 'dark'}
            height={440}
          />

          {/* Playback Control Bar */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!isPlaying && signProgress >= 1) {
                    setQueueIndex(0);
                    setSignProgress(0);
                  }
                  setIsPlaying((p) => !p);
                }}
                disabled={parsedGlosses.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-4 h-4" aria-hidden="true" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" aria-hidden="true" /> Play
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleReplay}
                disabled={parsedGlosses.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 disabled:opacity-40 transition-colors"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Replay
              </button>
            </div>

            <div className="flex items-center gap-3 min-w-[200px]">
              <label
                htmlFor="avatar-speed-slider"
                className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
              >
                Speed
              </label>
              <input
                id="avatar-speed-slider"
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="flex-1 accent-blue-700 dark:accent-blue-400"
              />
              <span className="font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200 w-9 text-right">
                {speed.toFixed(1)}×
              </span>
            </div>
          </div>

          {/* Current Sign Description */}
          {currentSignDef && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
              <div>
                <span className="font-mono font-semibold text-teal-700 dark:text-teal-400 mr-2">
                  {currentSignDef.gloss}
                </span>
                <span className="text-slate-700 dark:text-slate-300">
                  {currentSignDef.description}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {currentSignDef.handedness} · {currentSignDef.labelHi}
              </span>
            </div>
          )}
        </div>

        {/* Right: Mic + Text Input + Gloss Queue */}
        <div className="lg:col-span-5 space-y-5">
          {/* Speech & Text Input Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Spoken or Typed Input
              </h2>
              <button
                type="button"
                onClick={handleToggleMic}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                  speech.isListening
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white'
                }`}
              >
                {speech.isListening ? (
                  <>
                    <MicOff className="w-4 h-4" aria-hidden="true" /> Stop Mic
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" aria-hidden="true" /> Start Mic
                  </>
                )}
              </button>
            </div>

            {speech.error && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{speech.error}</span>
              </div>
            )}

            {speech.interimTranscript && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                Listening (interim): <em className="text-slate-900 dark:text-white">{speech.interimTranscript}</em>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3">
              <label htmlFor="speak-text-input" className="sr-only">
                Type a sentence to translate into sign language
              </label>
              <textarea
                id="speak-text-input"
                rows={2}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type or speak a sentence, e.g. What is your name?"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                Convert to Gloss &amp; Animate
              </button>
            </form>

            <div className="space-y-2 pt-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">Sample sentences:</div>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_PHRASES.map((phrase) => (
                  <button
                    key={phrase}
                    type="button"
                    onClick={() => triggerTextToSign(phrase)}
                    className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gloss Queue Card */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Gloss Queue ({signLanguage} Order)
              </h2>
              <span className="font-mono text-xs text-teal-700 dark:text-teal-400">
                {facialCue}
              </span>
            </div>

            {parsedGlosses.length > 0 ? (
              <div
                data-testid="gloss-queue"
                className="flex flex-wrap gap-2"
                role="list"
                aria-label="Ordered sign gloss queue"
              >
                {parsedGlosses.map((gloss, idx) => {
                  const isActive = idx === queueIndex;
                  const known = Boolean(getSignByGloss(gloss, signLanguage));
                  return (
                    <button
                      key={`${gloss}-${idx}`}
                      type="button"
                      onClick={() => {
                        setQueueIndex(idx);
                        setSignProgress(0);
                        setIsPlaying(true);
                      }}
                      className={`px-3 py-2 rounded-lg font-mono text-xs font-semibold border transition-colors ${
                        isActive
                          ? 'bg-blue-700 dark:bg-blue-600 text-white border-blue-700 dark:border-blue-500'
                          : known
                            ? 'bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      {idx + 1}. {gloss}
                      {!known && ' (spell)'}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Enter or speak a sentence to populate the queue.</p>
            )}

            {removedFillers.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stripped fillers/copulas:{' '}
                <span className="font-mono">{removedFillers.join(', ')}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Interactive 36-Sign Vocabulary Browser */}
      <section className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Built-in Sign Lexicon ({allSigns.length} signs)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any sign to preview its keyframe animation directly on the 3D avatar.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="lexicon-search" className="sr-only">
              Search sign vocabulary
            </label>
            <input
              id="lexicon-search"
              type="search"
              value={lexiconFilter}
              onChange={(e) => setLexiconFilter(e.target.value)}
              placeholder="Filter signs (e.g. water, what)..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {filteredLexicon.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setParsedGlosses([s.gloss]);
                setRemovedFillers([]);
                setFacialCue(s.facialCue ?? 'NEUTRAL');
                setQueueIndex(0);
                setSignProgress(0);
                setIsPlaying(true);
              }}
              className={`p-2.5 rounded-lg border text-left transition-colors ${
                currentGloss === s.gloss
                  ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/50'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white truncate">
                {s.gloss}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {s.labelEn} · {s.labelHi}
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
