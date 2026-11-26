import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import type { FontScale } from '../types/signbridge';

export function Footer() {
  const { fontScale, setFontScale } = useApp();

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2 space-y-3">
            <Link
              to="/"
              className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white"
            >
              SignBridge
            </Link>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
              Browser-native bidirectional sign language communication platform. Runs locally on
              your webcam and microphone with zero backend requirement or cloud video upload.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Research prototype · 36-sign ISL starter vocabulary · Custom in-browser TF.js training
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tools</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <Link to="/translate" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Sign to Text &amp; Speech
                </Link>
              </li>
              <li>
                <Link to="/speak" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Speech to 3D Avatar
                </Link>
              </li>
              <li>
                <Link to="/conversation" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Two-Way Conversation
                </Link>
              </li>
              <li>
                <Link to="/library" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Sign Library &amp; Keyframes
                </Link>
              </li>
              <li>
                <Link to="/train" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Train Custom Signs
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Research &amp; Info</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <Link to="/lab" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Normalization &amp; Grammar Lab
                </Link>
              </li>
              <li>
                <Link to="/evaluation" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Evaluation &amp; WER Metrics
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-blue-700 dark:hover:text-blue-400 transition-colors">
                  Mission &amp; Accessibility
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            SignBridge · Open browser accessibility project · All video &amp; audio processed locally
          </p>

          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>Caption &amp; text size:</span>
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-900">
              {(['sm', 'md', 'lg', 'xl'] as FontScale[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFontScale(s)}
                  aria-pressed={fontScale === s}
                  className={`px-2 py-1 rounded-md font-mono uppercase transition-colors ${
                    fontScale === s
                      ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
