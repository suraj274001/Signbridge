import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Download,
  Mic,
  MicOff,
  Send,
  Trash2,
  Volume2,
  Hand,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCamera } from '../hooks/useCamera';
import { useHands } from '../hooks/useHands';
import { useSpeech } from '../hooks/useSpeech';
import { getSignByGloss, getSignPack } from '../data/signs';
import { generatePrototypeSequence, normalizeTwoHands } from '../lib/normalization';
import { glossToSentenceRuleBased, speechToGloss } from '../lib/glossParser';
import { SignAvatar3D } from '../components/SignAvatar3D';
import type { ConversationMessage, FacialGrammarTag } from '../types/signbridge';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function ConversationPage() {
  const { theme, spokenLanguage, signLanguage, predictSequence } = useApp();
  const camera = useCamera();
  const hands = useHands(false);
  const speech = useSpeech(spokenLanguage);
  const signs = useMemo(() => getSignPack(signLanguage), [signLanguage]);

  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: 'seed_1',
      sender: 'signer',
      text: 'Hello. What is your name?',
      glosses: ['HELLO', 'YOU', 'NAME', 'WHAT'],
      grammar: 'WH_QUESTION',
      confidence: 0.91,
      timestamp: Date.now() - 45000,
    },
    {
      id: 'seed_2',
      sender: 'speaker',
      text: 'Hello, I am ready to help you.',
      glosses: ['HELLO', 'ME', 'HELP', 'YOU'],
      grammar: 'NEUTRAL',
      timestamp: Date.now() - 25000,
    },
  ]);

  // Signer quick-compose & live webcam buffer
  const [selectedSign, setSelectedSign] = useState('HELP');
  const [selectedGrammar, setSelectedGrammar] = useState<FacialGrammarTag>('POLAR_QUESTION');
  const [pendingGlosses, setPendingGlosses] = useState<string[]>([]);

  // Speaker input & embedded 3D avatar playback
  const [speakerText, setSpeakerText] = useState('');
  const [avatarQueue, setAvatarQueue] = useState<string[]>(['HELLO', 'ME', 'HELP', 'YOU']);
  const [avatarCue, setAvatarCue] = useState<FacialGrammarTag>('NEUTRAL');
  const [avatarIdx, setAvatarIdx] = useState(0);
  const [avatarProgress, setAvatarProgress] = useState(0.5);
  const [avatarPlaying, setAvatarPlaying] = useState(false);

  const handWindowRef = useRef<number[][]>([]);
  const lastInferRef = useRef(0);

  // Embedded avatar playback loop
  useEffect(() => {
    if (!avatarPlaying || avatarQueue.length === 0) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const def = getSignByGloss(avatarQueue[avatarIdx], signLanguage);
      const dur = (def?.durationMs ?? 850) / 1000;
      setAvatarProgress((prev) => {
        const next = prev + dt / dur;
        if (next >= 1) {
          if (avatarIdx < avatarQueue.length - 1) {
            setAvatarIdx((i) => i + 1);
            return 0;
          }
          setAvatarPlaying(false);
          return 1;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [avatarPlaying, avatarQueue, avatarIdx, signLanguage]);

  // Live webcam sign capture in conversation mode
  useEffect(() => {
    if (!camera.isActive || !hands.isReady) return;
    let rafId = 0;
    let active = true;

    const loop = (now: number) => {
      if (!active) return;
      const video = camera.videoRef.current;
      if (video && video.readyState >= 2) {
        const res = hands.detectFrame(video, now);
        if (res && (res.rightHand || res.leftHand)) {
          handWindowRef.current.push(normalizeTwoHands(res.rightHand, res.leftHand));
          if (handWindowRef.current.length > 30) handWindowRef.current.shift();

          if (handWindowRef.current.length === 30 && now - lastInferRef.current > 1200) {
            lastInferRef.current = now;
            const snap = handWindowRef.current.map((f) => [...f]);
            void predictSequence(snap).then((pred) => {
              if (!active || pred.confidence < 0.7) return;
              setPendingGlosses((prev) => [...prev, pred.gloss].slice(-6));
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
  }, [camera.isActive, camera.videoRef, hands.isReady, hands.detectFrame, predictSequence]);

  const handleSignerCaptureSimulated = async () => {
    const def = signs.find((s) => s.gloss === selectedSign) ?? signs[0];
    const seq = generatePrototypeSequence(def.prototypeSpec, 30);
    const pred = await predictSequence(seq);
    const nextGlosses = [...pendingGlosses, pred.gloss];
    const sentence = glossToSentenceRuleBased(nextGlosses, selectedGrammar, spokenLanguage);

    const msg: ConversationMessage = {
      id: `msg_${Date.now()}`,
      sender: 'signer',
      text: sentence,
      glosses: nextGlosses,
      grammar: selectedGrammar,
      confidence: pred.confidence,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    setPendingGlosses([]);
    speech.speak(sentence, spokenLanguage);
  };

  const handleSendPendingSigner = () => {
    if (pendingGlosses.length === 0) return;
    const sentence = glossToSentenceRuleBased(pendingGlosses, selectedGrammar, spokenLanguage);
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        sender: 'signer',
        text: sentence,
        glosses: pendingGlosses,
        grammar: selectedGrammar,
        timestamp: Date.now(),
      },
    ]);
    setPendingGlosses([]);
    speech.speak(sentence, spokenLanguage);
  };

  const handleSpeakerSubmit = (textToSend?: string) => {
    const clean = (textToSend ?? speakerText).trim();
    if (!clean) return;
    const parsed = speechToGloss(clean, signLanguage);
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}`,
        sender: 'speaker',
        text: clean,
        glosses: parsed.glosses,
        grammar: parsed.facialCue,
        timestamp: Date.now(),
      },
    ]);
    setSpeakerText('');
    if (parsed.glosses.length > 0) {
      setAvatarQueue(parsed.glosses);
      setAvatarCue(parsed.facialCue);
      setAvatarIdx(0);
      setAvatarProgress(0);
      setAvatarPlaying(true);
    }
  };

  const handleDownloadTranscript = () => {
    const lines = messages.map((m) => {
      const role = m.sender === 'signer' ? 'SIGNER' : 'SPEAKER';
      const glossNote = m.glosses && m.glosses.length > 0 ? ` [${m.glosses.join(' ')}]` : '';
      return `[${formatTime(m.timestamp)}] ${role}: ${m.text}${glossNote}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signbridge-transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeAvatarSign = avatarQueue[avatarIdx]
    ? getSignByGloss(avatarQueue[avatarIdx], signLanguage) ?? null
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Two-Way Conversation Mode
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Unified split workspace connecting signer webcam/gestures on the left and hearing speech
            + 3D avatar reply on the right.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadTranscript}
            disabled={messages.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 disabled:opacity-40 transition-colors"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Download Transcript
          </button>
          <button
            type="button"
            onClick={() => setMessages([])}
            aria-label="Clear conversation timeline"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            Clear
          </button>
        </div>
      </div>

      {/* 3-Column Split Layout: Signer | Shared Chat Timeline | Speaker + 3D Avatar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Signer Side */}
        <section
          aria-label="Signer input panel"
          className="lg:col-span-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-blue-700 dark:text-blue-400">
              Signer (Sign → Speech)
            </h2>
            {!camera.isActive ? (
              <button
                type="button"
                onClick={async () => {
                  const ok = await camera.startCamera();
                  if (ok) await hands.loadModel();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" /> Webcam
              </button>
            ) : (
              <button
                type="button"
                onClick={camera.stopCamera}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors"
              >
                <CameraOff className="w-3.5 h-3.5" aria-hidden="true" /> Stop
              </button>
            )}
          </div>

          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
            <video
              ref={camera.videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover scale-x-[-1] ${
                camera.isActive ? 'block' : 'hidden'
              }`}
            />
            {!camera.isActive && (
              <div className="p-4 text-center text-xs text-slate-400 space-y-1">
                <Hand className="w-6 h-6 mx-auto text-slate-500" aria-hidden="true" />
                <p>Enable webcam for live signing or send a sign gesture below.</p>
              </div>
            )}
          </div>

          {pendingGlosses.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-blue-900 dark:text-blue-200">
                Buffer: {pendingGlosses.join(' · ')}
              </span>
              <button
                type="button"
                onClick={handleSendPendingSigner}
                className="px-2.5 py-1 rounded bg-blue-700 text-white font-semibold"
              >
                Speak &amp; Send
              </button>
            </div>
          )}

          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Send sign turn (runs DTW classifier + TTS)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Select sign to send"
                value={selectedSign}
                onChange={(e) => setSelectedSign(e.target.value)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {signs.map((s) => (
                  <option key={s.id} value={s.gloss}>
                    {s.gloss} ({s.labelEn})
                  </option>
                ))}
              </select>

              <select
                aria-label="Select facial grammar for signer turn"
                value={selectedGrammar}
                onChange={(e) => setSelectedGrammar(e.target.value as FacialGrammarTag)}
                className="px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                <option value="NEUTRAL">NEUTRAL</option>
                <option value="POLAR_QUESTION">POLAR_QUESTION</option>
                <option value="WH_QUESTION">WH_QUESTION</option>
                <option value="NEGATION">NEGATION</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => void handleSignerCaptureSimulated()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold transition-colors"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              Translate Sign &amp; Speak
            </button>
          </div>
        </section>

        {/* Center: Unified Chronological Timeline */}
        <section
          aria-label="Conversation timeline"
          className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col min-h-[520px] max-h-[680px]"
        >
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-white">
              Conversation Timeline
            </span>
            <span className="font-mono text-slate-500 tabular-nums">
              {messages.length} messages
            </span>
          </div>

          <div
            data-testid="conversation-timeline"
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-xs text-slate-500 p-6">
                No messages yet. Sign on the left or speak/type on the right to start a
                conversation.
              </div>
            ) : (
              messages.map((m) => {
                const isSigner = m.sender === 'signer';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isSigner ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm space-y-1 border ${
                        isSigner
                          ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800 text-slate-900 dark:text-slate-100'
                          : 'bg-teal-50 dark:bg-teal-950/50 border-teal-200 dark:border-teal-800 text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <span>{isSigner ? 'Signer' : 'Speaker'}</span>
                        <span className="font-mono tabular-nums">{formatTime(m.timestamp)}</span>
                      </div>
                      <p className="font-medium leading-snug">{m.text}</p>
                      {m.glosses && m.glosses.length > 0 && (
                        <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                          {m.glosses.join(' · ')}
                          {m.grammar && m.grammar !== 'NEUTRAL' ? ` (${m.grammar})` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Right: Speaker Side + Embedded 3D Avatar */}
        <section
          aria-label="Speaker input and 3D avatar panel"
          className="lg:col-span-4 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-teal-700 dark:text-teal-400">
              Speaker (Speech → Sign)
            </h2>
            <button
              type="button"
              onClick={() => {
                if (speech.isListening) speech.stopListening();
                else speech.startListening((t) => handleSpeakerSubmit(t));
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors ${
                speech.isListening
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500'
              }`}
            >
              {speech.isListening ? (
                <>
                  <MicOff className="w-3.5 h-3.5" aria-hidden="true" /> Stop
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" /> Mic
                </>
              )}
            </button>
          </div>

          <SignAvatar3D
            currentSign={activeAvatarSign}
            progress={avatarProgress}
            isPlaying={avatarPlaying}
            facialCue={avatarCue}
            isDark={theme === 'dark'}
            height={270}
          />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSpeakerSubmit();
            }}
            className="space-y-2.5"
          >
            <label htmlFor="conv-speaker-input" className="sr-only">
              Speaker message
            </label>
            <div className="flex gap-2">
              <input
                id="conv-speaker-input"
                type="text"
                value={speakerText}
                onChange={(e) => setSpeakerText(e.target.value)}
                placeholder="Type or speak reply..."
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                aria-label="Send speaker reply to 3D avatar"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold transition-colors"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                Sign
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
