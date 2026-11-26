import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  EvaluationLogEntry,
  FeedbackEntry,
  FontScale,
  PredictionResult,
  SignLanguageCode,
  SpokenLanguageCode,
  TrainingSample,
} from '../types/signbridge';
import { getBuiltInSignPrototypes } from '../data/signs';
import { KNNDTWClassifier } from '../lib/classifier';
import { loadTrainingSamples, sharedTFModel } from '../lib/model';

const THEME_KEY = 'signbridge_theme_v1';
const LANG_KEY = 'signbridge_spoken_lang_v1';
const SIGN_LANG_KEY = 'signbridge_sign_lang_v1';
const FONT_SCALE_KEY = 'signbridge_font_scale_v1';
const EVAL_LOGS_KEY = 'signbridge_eval_logs_v1';
const FEEDBACK_KEY = 'signbridge_feedback_v1';

interface AppContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  spokenLanguage: SpokenLanguageCode;
  setSpokenLanguage: (lang: SpokenLanguageCode) => void;
  signLanguage: SignLanguageCode;
  setSignLanguage: (lang: SignLanguageCode) => void;
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
  // Training & model state
  customSamples: TrainingSample[];
  refreshSamplesAndModel: () => Promise<void>;
  tfModelReady: boolean;
  tfModelLabels: string[];
  activeEngine: 'tfjs' | 'knn-dtw';
  setActiveEngine: (engine: 'tfjs' | 'knn-dtw') => void;
  predictSequence: (frames: number[][]) => Promise<PredictionResult>;
  // Evaluation telemetry & feedback
  evalLogs: EvaluationLogEntry[];
  addEvalLog: (entry: Omit<EvaluationLogEntry, 'id' | 'timestamp'>) => string;
  rateEvalLog: (id: string, rating: 'up' | 'down') => void;
  clearEvalLogs: () => void;
  feedbackEntries: FeedbackEntry[];
  addFeedbackEntry: (entry: Omit<FeedbackEntry, 'id' | 'timestamp'>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return 'light';
  });

  const [spokenLanguage, setSpokenLanguageState] = useState<SpokenLanguageCode>(() => {
    const stored = localStorage.getItem(LANG_KEY) as SpokenLanguageCode | null;
    return stored === 'hi-IN' || stored === 'en-US' || stored === 'en-IN' ? stored : 'en-IN';
  });

  const [signLanguage, setSignLanguageState] = useState<SignLanguageCode>(() => {
    const stored = localStorage.getItem(SIGN_LANG_KEY) as SignLanguageCode | null;
    return stored === 'ASL' ? 'ASL' : 'ISL';
  });

  const [fontScale, setFontScaleState] = useState<FontScale>(() => {
    const stored = localStorage.getItem(FONT_SCALE_KEY) as FontScale | null;
    return stored === 'sm' || stored === 'md' || stored === 'lg' || stored === 'xl' ? stored : 'md';
  });

  const [customSamples, setCustomSamples] = useState<TrainingSample[]>([]);
  const [tfModelReady, setTfModelReady] = useState(false);
  const [tfModelLabels, setTfModelLabels] = useState<string[]>([]);
  const [activeEngine, setActiveEngine] = useState<'tfjs' | 'knn-dtw'>('knn-dtw');

  const [evalLogs, setEvalLogs] = useState<EvaluationLogEntry[]>(() =>
    safeJsonParse<EvaluationLogEntry[]>(localStorage.getItem(EVAL_LOGS_KEY), [])
  );

  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>(() =>
    safeJsonParse<FeedbackEntry[]>(localStorage.getItem(FEEDBACK_KEY), [])
  );

  // Local fallback classifier + Web Worker ref
  const knnRef = useRef<KNNDTWClassifier>(new KNNDTWClassifier(getBuiltInSignPrototypes(), 3, 2));
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);
  const pendingResolversRef = useRef<Map<number, (res: PredictionResult) => void>>(new Map());
  const requestIdRef = useRef(1);

  // Sync theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Sync font scale to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-font-scale', fontScale);
    localStorage.setItem(FONT_SCALE_KEY, fontScale);
  }, [fontScale]);

  const setSpokenLanguage = useCallback((lang: SpokenLanguageCode) => {
    setSpokenLanguageState(lang);
    localStorage.setItem(LANG_KEY, lang);
  }, []);

  const setSignLanguage = useCallback((lang: SignLanguageCode) => {
    setSignLanguageState(lang);
    localStorage.setItem(SIGN_LANG_KEY, lang);
  }, []);

  const setFontScale = useCallback((scale: FontScale) => {
    setFontScaleState(scale);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Initialize inference Web Worker once
  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    try {
      const worker = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'READY') {
          workerReadyRef.current = true;
        } else if (data?.type === 'PREDICTION') {
          const resolver = pendingResolversRef.current.get(data.requestId);
          if (resolver) {
            pendingResolversRef.current.delete(data.requestId);
            resolver(data.result as PredictionResult);
          }
        }
      };
      worker.onerror = () => {
        workerReadyRef.current = false;
      };
      workerRef.current = worker;
      worker.postMessage({
        type: 'INIT_TEMPLATES',
        templates: getBuiltInSignPrototypes(),
      });
      return () => {
        worker.terminate();
        workerRef.current = null;
        workerReadyRef.current = false;
      };
    } catch {
      workerReadyRef.current = false;
    }
  }, []);

  const refreshSamplesAndModel = useCallback(async () => {
    const samples = await loadTrainingSamples();
    setCustomSamples(samples);

    // Combine built-in 36 prototypes + user-recorded samples for few-shot DTW
    const combinedTemplates = [
      ...getBuiltInSignPrototypes(),
      ...samples.map((s) => ({ label: s.label.toUpperCase(), frames: s.frames })),
    ];
    knnRef.current.setTemplates(combinedTemplates);
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'INIT_TEMPLATES',
        templates: combinedTemplates,
      });
    }

    // Attempt to restore trained TensorFlow.js model from IndexedDB
    const loaded = sharedTFModel.isLoaded() || (await sharedTFModel.loadFromIndexedDB());
    setTfModelReady(loaded);
    setTfModelLabels(sharedTFModel.getLabels());
    if (loaded) {
      setActiveEngine('tfjs');
    }
  }, []);

  useEffect(() => {
    void refreshSamplesAndModel();
  }, [refreshSamplesAndModel]);

  const predictSequence = useCallback(
    async (frames: number[][]): Promise<PredictionResult> => {
      if (activeEngine === 'tfjs' && sharedTFModel.isLoaded()) {
        const tfRes = sharedTFModel.predict(frames);
        if (tfRes) return tfRes;
      }

      // Offload DTW matching to Web Worker when available
      if (workerRef.current && workerReadyRef.current) {
        return await new Promise<PredictionResult>((resolve) => {
          const reqId = requestIdRef.current++;
          pendingResolversRef.current.set(reqId, resolve);
          workerRef.current!.postMessage({
            type: 'PREDICT',
            requestId: reqId,
            frames,
          });
          // Safety fallback if worker does not reply within 600ms
          setTimeout(() => {
            if (pendingResolversRef.current.has(reqId)) {
              pendingResolversRef.current.delete(reqId);
              resolve(knnRef.current.predict(frames));
            }
          }, 600);
        });
      }

      return knnRef.current.predict(frames);
    },
    [activeEngine]
  );

  const addEvalLog = useCallback((entry: Omit<EvaluationLogEntry, 'id' | 'timestamp'>) => {
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const full: EvaluationLogEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
    };
    setEvalLogs((prev) => {
      const next = [full, ...prev].slice(0, 200);
      localStorage.setItem(EVAL_LOGS_KEY, JSON.stringify(next));
      return next;
    });
    return id;
  }, []);

  const rateEvalLog = useCallback((id: string, rating: 'up' | 'down') => {
    setEvalLogs((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, rating } : item));
      localStorage.setItem(EVAL_LOGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearEvalLogs = useCallback(() => {
    setEvalLogs([]);
    localStorage.removeItem(EVAL_LOGS_KEY);
  }, []);

  const addFeedbackEntry = useCallback((entry: Omit<FeedbackEntry, 'id' | 'timestamp'>) => {
    const full: FeedbackEntry = {
      ...entry,
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    setFeedbackEntries((prev) => {
      const next = [full, ...prev].slice(0, 100);
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        theme,
        toggleTheme,
        spokenLanguage,
        setSpokenLanguage,
        signLanguage,
        setSignLanguage,
        fontScale,
        setFontScale,
        customSamples,
        refreshSamplesAndModel,
        tfModelReady,
        tfModelLabels,
        activeEngine,
        setActiveEngine,
        predictSequence,
        evalLogs,
        addEvalLog,
        rateEvalLog,
        clearEvalLogs,
        feedbackEntries,
        addFeedbackEntry,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
