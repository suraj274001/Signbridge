import { useMemo, useState } from 'react';
import {
  Download,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { computeWER } from '../lib/glossParser';
import type { FeedbackEntry } from '../types/signbridge';

export function EvaluationPage() {
  const {
    evalLogs,
    addEvalLog,
    rateEvalLog,
    clearEvalLogs,
    feedbackEntries,
    addFeedbackEntry,
  } = useApp();

  // WER Calculator state
  const [refSentence, setRefSentence] = useState('What is your name please?');
  const [hypSentence, setHypSentence] = useState('What is your name?');

  const werResult = useMemo(() => computeWER(refSentence, hypSentence), [refSentence, hypSentence]);

  // Usability feedback form state
  const [rating, setRating] = useState(5);
  const [role, setRole] = useState<FeedbackEntry['role']>('deaf_signer');
  const [comments, setComments] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Aggregate metrics
  const stats = useMemo(() => {
    if (evalLogs.length === 0) {
      return { count: 0, avgLatency: 0, avgFps: 0, avgConf: 0, approvalRate: null as number | null };
    }
    const count = evalLogs.length;
    const avgLatency = evalLogs.reduce((s, l) => s + l.latencyMs, 0) / count;
    const avgFps = evalLogs.reduce((s, l) => s + l.fps, 0) / count;
    const avgConf = (evalLogs.reduce((s, l) => s + l.confidence, 0) / count) * 100;
    const rated = evalLogs.filter((l) => l.rating);
    const up = rated.filter((l) => l.rating === 'up').length;
    return {
      count,
      avgLatency: Number(avgLatency.toFixed(1)),
      avgFps: Math.round(avgFps),
      avgConf: Number(avgConf.toFixed(1)),
      approvalRate: rated.length > 0 ? Math.round((up / rated.length) * 100) : null,
    };
  }, [evalLogs]);

  const chartData = useMemo(
    () =>
      evalLogs
        .slice(0, 15)
        .reverse()
        .map((entry, i) => ({
          idx: `#${i + 1} ${entry.gloss}`,
          latencyMs: entry.latencyMs,
          confidencePct: Math.round(entry.confidence * 100),
        })),
    [evalLogs]
  );

  const handleSeedDemoLogs = () => {
    const samples = [
      { gloss: 'HELLO', sentence: 'Hello.', confidence: 0.94, latencyMs: 14.2, fps: 30, grammar: 'NEUTRAL' as const, engine: 'knn-dtw' as const },
      { gloss: 'NAME', sentence: 'What is your name?', confidence: 0.89, latencyMs: 16.5, fps: 29, grammar: 'WH_QUESTION' as const, engine: 'knn-dtw' as const },
      { gloss: 'WATER', sentence: 'I want water.', confidence: 0.92, latencyMs: 12.8, fps: 30, grammar: 'NEUTRAL' as const, engine: 'knn-dtw' as const },
      { gloss: 'UNDERSTAND', sentence: 'I do not understand.', confidence: 0.86, latencyMs: 15.1, fps: 28, grammar: 'NEGATION' as const, engine: 'knn-dtw' as const },
    ];
    for (const s of samples) addEvalLog(s);
  };

  const handleExportJSON = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      summary: stats,
      werSnapshot: { reference: refSentence, hypothesis: hypSentence, ...werResult },
      predictions: evalLogs,
      feedback: feedbackEntries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signbridge-evaluation-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = ['timestamp', 'gloss', 'sentence', 'confidence', 'latencyMs', 'fps', 'grammar', 'engine', 'rating'];
    const rows = evalLogs.map((l) =>
      [
        new Date(l.timestamp).toISOString(),
        l.gloss,
        `"${l.sentence.replace(/"/g, '""')}"`,
        l.confidence,
        l.latencyMs,
        l.fps,
        l.grammar,
        l.engine,
        l.rating ?? '',
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signbridge-predictions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!comments.trim()) {
      setFormError('Please enter brief comments before submitting your usability rating.');
      return;
    }
    addFeedbackEntry({
      rating,
      role,
      comments: comments.trim(),
    });
    setComments('');
    setFormSubmitted(true);
    setTimeout(() => setFormSubmitted(false), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Evaluation &amp; Telemetry
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Session latency, FPS, confidence ratings, Word Error Rate (WER) calculator, usability
            feedback, and CSV/JSON exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={evalLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export JSON
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Predictions logged', value: String(stats.count) },
          { label: 'Mean latency', value: `${stats.avgLatency} ms` },
          { label: 'Mean FPS', value: `${stats.avgFps}` },
          { label: 'Mean confidence', value: `${stats.avgConf}%` },
          {
            label: 'Thumbs-up rate',
            value: stats.approvalRate !== null ? `${stats.approvalRate}%` : '—',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
            <div className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* WER Calculator + Latency Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* WER Calculator */}
        <section className="lg:col-span-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Word Error Rate (WER) Calculator
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Computes Levenshtein word edit distance: (Substitutions + Deletions + Insertions) /
              Reference words.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="wer-ref" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reference (Ground-truth sentence)
              </label>
              <input
                id="wer-ref"
                type="text"
                value={refSentence}
                onChange={(e) => setRefSentence(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            <div>
              <label htmlFor="wer-hyp" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Predicted (SignBridge output)
              </label>
              <input
                id="wer-hyp"
                type="text"
                value={hypSentence}
                onChange={(e) => setHypSentence(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>
          </div>

          <div
            data-testid="wer-result-box"
            className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center"
          >
            <div>
              <div className="text-xs text-slate-500">WER</div>
              <div className="font-mono text-xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                {(werResult.wer * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Substitutions</div>
              <div className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums">
                {werResult.substitutions}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Deletions</div>
              <div className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums">
                {werResult.deletions}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Insertions</div>
              <div className="font-mono text-xl font-semibold text-slate-900 dark:text-white tabular-nums">
                {werResult.insertions}
              </div>
            </div>
          </div>
        </section>

        {/* Session Latency Chart */}
        <section className="lg:col-span-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Inference Latency Profile (ms)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sign-end to text-output latency across recent session predictions.
              </p>
            </div>
            {evalLogs.length === 0 && (
              <button
                type="button"
                onClick={handleSeedDemoLogs}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Load sample logs
              </button>
            )}
          </div>

          <div className="h-[220px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="latencyMs" name="Latency (ms)" fill="#1d4ed8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-lg border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs text-slate-500">
                Run predictions on Translate or load sample logs to populate latency metrics.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Prediction Log Table + Usability Feedback Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Session Predictions Table */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Session Prediction Log ({evalLogs.length})
            </h2>
            {evalLogs.length > 0 && (
              <button
                type="button"
                onClick={clearEvalLogs}
                className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 hover:underline font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Clear logs
              </button>
            )}
          </div>

          {evalLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-3">
              <p>No predictions logged in this session yet.</p>
              <button
                type="button"
                onClick={handleSeedDemoLogs}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add 4 Sample Entries
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-4 font-semibold">Gloss</th>
                    <th className="py-2.5 px-4 font-semibold">Output</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Conf.</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Latency</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {evalLogs.slice(0, 20).map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900 dark:text-white">
                        {row.gloss}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 max-w-[200px] truncate">
                        {row.sentence}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right">
                        {Math.round(row.confidence * 100)}%
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-right">
                        {row.latencyMs} ms
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => rateEvalLog(row.id, 'up')}
                            aria-label={`Thumbs up for ${row.gloss}`}
                            className={`p-1 rounded ${
                              row.rating === 'up'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => rateEvalLog(row.id, 'down')}
                            aria-label={`Thumbs down for ${row.gloss}`}
                            className={`p-1 rounded ${
                              row.rating === 'down'
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400'
                                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                            }`}
                          >
                            <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Usability Feedback Form */}
        <section className="lg:col-span-5 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Usability Feedback (Saved Locally)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Collect structured 1–5 accessibility &amp; clarity ratings during user studies.
            </p>
          </div>

          <form onSubmit={handleSubmitFeedback} className="space-y-3.5">
            <div>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Overall clarity &amp; responsiveness (1–5)
              </span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-pressed={rating === n}
                    aria-label={`Rate ${n} out of 5`}
                    className={`w-10 h-10 rounded-lg font-mono text-sm font-semibold border transition-colors ${
                      rating === n
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="fb-role" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Participant perspective
              </label>
              <select
                id="fb-role"
                value={role}
                onChange={(e) => setRole(e.target.value as FeedbackEntry['role'])}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="deaf_signer">Deaf / Hard-of-Hearing Signer</option>
                <option value="hearing_user">Hearing Conversation Partner</option>
                <option value="interpreter">Sign Language Interpreter</option>
                <option value="researcher">Accessibility Researcher / Evaluator</option>
              </select>
            </div>

            <div>
              <label htmlFor="fb-comments" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Observations &amp; suggestions
              </label>
              <textarea
                id="fb-comments"
                rows={3}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Note caption readability, facial grammar responsiveness, or avatar clarity..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
            </div>

            {formError && (
              <p role="alert" className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                {formError}
              </p>
            )}

            {formSubmitted && (
              <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Feedback saved locally.
              </p>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
            >
              Save Usability Feedback
            </button>
          </form>

          {feedbackEntries.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5 max-h-[200px] overflow-y-auto">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Saved Responses ({feedbackEntries.length})
              </div>
              {feedbackEntries.map((fb) => (
                <div
                  key={fb.id}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between font-mono text-slate-500">
                    <span>{fb.role.replace('_', ' ')}</span>
                    <strong className="text-blue-700 dark:text-blue-400">{fb.rating}/5</strong>
                  </div>
                  <p className="text-slate-800 dark:text-slate-200">{fb.comments}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
