import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpokenLanguageCode } from '../types/signbridge';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [alt: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeech(language: SpokenLanguageCode = 'en-IN') {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalCallbackRef = useRef<((text: string) => void) | null>(null);

  const sttSupported = getSpeechRecognitionCtor() !== null;
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore already stopped
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(
    (onFinal?: (text: string) => void) => {
      setError(null);
      onFinalCallbackRef.current = onFinal ?? null;

      if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
        setError('Microphone speech recognition requires HTTPS or localhost. You can type sentences directly below.');
        return false;
      }

      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError('Web SpeechRecognition is not supported in this browser (works best in Chrome/Edge). Use the text input below to test Speech → Sign.');
        return false;
      }

      stopListening();

      try {
        const recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event) => {
          let interim = '';
          let finalChunk = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const transcript = res[0]?.transcript ?? '';
            if (res.isFinal) {
              finalChunk += transcript + ' ';
            } else {
              interim += transcript;
            }
          }
          setInterimTranscript(interim.trim());
          if (finalChunk.trim()) {
            const cleaned = finalChunk.trim();
            setFinalTranscript(cleaned);
            onFinalCallbackRef.current?.(cleaned);
          }
        };

        recognition.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setError('Microphone permission denied. Enable microphone access in browser settings or type text directly.');
          } else if (event.error === 'audio-capture') {
            setError('No microphone detected. Connect a mic or type a phrase below.');
          } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
            setError(`Speech recognition error: ${event.error}`);
          }
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
          setInterimTranscript('');
        };

        recognitionRef.current = recognition;
        recognition.start();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to start speech recognition.');
        setIsListening(false);
        return false;
      }
    },
    [language, stopListening]
  );

  const speak = useCallback(
    (text: string, overrideLang?: SpokenLanguageCode) => {
      if (!ttsSupported || !text.trim()) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = overrideLang ?? language;
        utterance.rate = 0.98;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      } catch {
        setIsSpeaking(false);
      }
    },
    [language, ttsSupported]
  );

  const cancelSpeech = useCallback(() => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [ttsSupported]);

  useEffect(() => {
    return () => {
      stopListening();
      if (ttsSupported) window.speechSynthesis.cancel();
    };
  }, [stopListening, ttsSupported]);

  return {
    sttSupported,
    ttsSupported,
    isListening,
    isSpeaking,
    interimTranscript,
    finalTranscript,
    error,
    setFinalTranscript,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
