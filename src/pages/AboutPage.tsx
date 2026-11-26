import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const TEAM_MEMBERS = [
  {
    name: 'Sign Linguistics & ISL Advisory',
    role: 'Gloss syntax, non-manual facial grammar cues, and Deaf-first usability review',
  },
  {
    name: 'Computer Vision & Normalization',
    role: 'MediaPipe 2-hand + 468-point face extraction and palm-coordinate invariance math',
  },
  {
    name: 'In-Browser ML & 3D Avatar Systems',
    role: 'Web Worker DTW, TensorFlow.js 1D-CNN+GRU IndexedDB pipeline, and Three.js IK rigging',
  },
];

const LIMITATIONS = [
  {
    title: 'Small starter vocabulary (36 ISL signs)',
    detail:
      'SignBridge ships as an open educational & research prototype with 36 everyday signs. It is not a substitute for certified human sign language interpreters in medical, legal, or emergency settings.',
  },
  {
    title: 'Single-webcam lighting & occlusion constraints',
    detail:
      'Rapid motion blur, dim lighting, or hands crossing directly in front of the face can reduce MediaPipe landmark stability. Consistent front lighting improves tracking reliability.',
  },
  {
    title: 'Synthetic avatar expressiveness vs. human signing',
    detail:
      'Our procedural Three.js avatar animates arm IK, finger curls, head motion, and eyebrows from JSON keyframes, which captures core sign intent but cannot yet match the full fluidity of a native human signer.',
  },
  {
    title: 'Regional dialect variation',
    detail:
      'Indian Sign Language (ISL) and ASL feature rich regional variations. The Train page lets local communities record and export their own regional sign datasets directly in the browser.',
  },
];

export function AboutPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14 space-y-14">
      {/* Mission */}
      <section className="space-y-4">
        <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
          Project Mission &amp; Accessibility Statement
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          Building transparent, privacy-first tools for two-way sign communication.
        </h1>
        <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
          SignBridge was created to demonstrate that respectful, bidirectional sign language
          assistive technology can run locally in any modern web browser — combining spatial
          normalization, non-manual facial grammar, custom in-browser training, and 3D avatar
          synthesis without sending personal video streams to cloud servers.
        </p>
      </section>

      {/* Accessibility Statement */}
      <section className="p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Accessibility Statement (WCAG 2.1 AA Targets)
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-300">
          <li className="space-y-1">
            <strong className="text-slate-900 dark:text-white block">
              Adjustable typography &amp; high contrast
            </strong>
            <span>
              Global text scaling (SM / MD / LG / XL) in the navigation bar and footer, paired with
              accessible light and dark mode contrast pairs.
            </span>
          </li>
          <li className="space-y-1">
            <strong className="text-slate-900 dark:text-white block">
              Full keyboard &amp; screen-reader semantics
            </strong>
            <span>
              Skip-to-content link, visible focus rings, ARIA live regions for captions, and native
              buttons/selects across every workflow.
            </span>
          </li>
          <li className="space-y-1">
            <strong className="text-slate-900 dark:text-white block">
              Reduced-motion respect
            </strong>
            <span>
              Respects <code className="font-mono text-xs">prefers-reduced-motion</code> across CSS
              transitions and the hero landmark animation loop.
            </span>
          </li>
          <li className="space-y-1">
            <strong className="text-slate-900 dark:text-white block">
              Graceful sensor fallbacks
            </strong>
            <span>
              Every tool provides clear permission errors, HTTPS guidance, and deterministic text or
              simulation alternatives when camera/mic hardware is absent.
            </span>
          </li>
        </ul>
      </section>

      {/* Team */}
      <section className="space-y-5">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Project Disciplines &amp; Contributors
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TEAM_MEMBERS.map((m) => (
            <div
              key={m.name}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
            >
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {m.name}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{m.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Honest Limitations */}
      <section className="space-y-5">
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Known Limitations &amp; Responsible Use
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            We believe assistive AI tools must be candid about what they can and cannot do today.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {LIMITATIONS.map((item) => (
            <div
              key={item.title}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2"
            >
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {item.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Ready to inspect the normalization math or train custom signs?
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/lab"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Open Lab <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <Link
            to="/train"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
          >
            Train Custom Signs <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
