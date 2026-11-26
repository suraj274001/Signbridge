import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowLeftRight,
  ChevronDown,
  ScanFace,
  Compass,
  Camera,
  Cpu,
  Volume2,
  Mic,
  Box,
  Layers,
  Check,
  Minus,
} from 'lucide-react';
import { HeroHandSkeleton } from '../components/HeroHandSkeleton';

const PROBLEMS = [
  {
    num: '01',
    title: 'One-way asymmetry',
    body: 'Most sign recognition demos only translate sign to text, leaving Deaf and hard-of-hearing users without a visual reply path when hearing speakers talk back.',
  },
  {
    num: '02',
    title: 'Missing facial grammar',
    body: 'In ISL and ASL, eyebrows and head motion distinguish questions from statements and encode negation. Dropping non-manual markers flips the meaning of a sentence.',
  },
  {
    num: '03',
    title: 'Fragile spatial tracking',
    body: 'Classifiers trained on raw pixel coordinates break as soon as a signer shifts position, leans closer to the webcam, tilts their wrist, or uses their opposite hand.',
  },
];

const SIGN_TO_SPEECH_STEPS = [
  { label: 'Camera', detail: '30 FPS local webcam video feed via getUserMedia', icon: Camera },
  { label: 'Landmarks', detail: '21 hand joints × 2 hands + 468 face points via MediaPipe', icon: Layers },
  { label: 'Normalization', detail: 'Wrist-zeroed, palm-scaled, axis-aligned 63-float vector', icon: Compass },
  { label: 'Model', detail: '30-frame window via k-NN/DTW or in-browser TF.js 1D-CNN+GRU', icon: Cpu },
  { label: 'Text + Voice', detail: 'Facial grammar applied + live caption & Web Speech TTS', icon: Volume2 },
];

const SPEECH_TO_SIGN_STEPS = [
  { label: 'Mic', detail: 'Browser microphone capture with interim + final text', icon: Mic },
  { label: 'Speech-to-Text', detail: 'Web Speech API supporting English & Hindi locales', icon: Volume2 },
  { label: 'Gloss', detail: 'Filler stripping & WH-final sign-language word order', icon: Layers },
  { label: '3D Avatar', detail: 'Articulated Three.js avatar playing JSON keyframes + brows', icon: Box },
];

const COMPARISON_ROWS = [
  {
    capability: 'Communication direction',
    signbridge: 'Two-way: Sign → Speech & Speech → 3D Avatar',
    typical: 'One-way gesture-to-text only',
    sbBetter: true,
  },
  {
    capability: 'Non-manual facial grammar',
    signbridge: 'Eyebrow raise/furrow + head pitch/yaw rules',
    typical: 'Hand landmarks only (no grammar cues)',
    sbBetter: true,
  },
  {
    capability: 'Camera distance & tilt invariance',
    signbridge: 'Palm-coordinate normalization + left-hand mirror',
    typical: 'Raw screen coordinates (sensitive to framing)',
    sbBetter: true,
  },
  {
    capability: 'Custom sign training',
    signbridge: 'In-browser recording + TF.js training in IndexedDB',
    typical: 'Fixed static vocabulary or cloud retraining',
    sbBetter: true,
  },
  {
    capability: 'Privacy & deployment',
    signbridge: '100% client-side static site (zero video upload)',
    typical: 'Requires paid cloud APIs or GPU backend',
    sbBetter: true,
  },
];

const TECH_STACK = [
  { name: 'MediaPipe Tasks Vision', role: '2-Hand & 468-Point Face Tracking' },
  { name: 'TensorFlow.js', role: 'In-Browser 1D-CNN + GRU & IndexedDB' },
  { name: 'React Three Fiber', role: 'Articulated 3D Signing Avatar' },
  { name: 'Web Speech API', role: 'Local STT & Multilingual TTS' },
  { name: 'Web Workers', role: 'Off-Main-Thread DTW Inference' },
  { name: 'React + TypeScript', role: 'Zero-Backend Static Architecture' },
];

const FAQS = [
  {
    q: 'Does SignBridge upload my webcam video or microphone audio to a server?',
    a: 'No. Hand tracking, face landmark extraction, palm normalization, k-NN/DTW matching, TensorFlow.js training, and 3D avatar rendering all execute locally inside your browser. Datasets and trained models are saved in your browser IndexedDB.',
  },
  {
    q: 'How large is the built-in vocabulary right now?',
    a: 'SignBridge is an honest, open research prototype shipping with 36 starter Indian Sign Language (ISL) signs covering greetings, questions, pronouns, and everyday essentials. You can record 5–10 samples of any new sign on the Train page to expand it immediately.',
  },
  {
    q: 'Why does facial grammar recognition matter so much for sign language?',
    a: 'Sign languages are grammatical visual languages, not hand-only codes. Raising eyebrows with a forward head tilt turns a statement into a yes/no question, furrowed brows signal WH-questions, and a horizontal head shake marks negation.',
  },
  {
    q: 'Can I use SignBridge without a webcam or microphone to evaluate it?',
    a: 'Yes. Both the Translate and Lab pages include deterministic simulation controls so you can test palm-coordinate invariance, facial grammar curves, DTW/TF.js classification, and the 3D avatar even on a device without camera or mic hardware.',
  },
  {
    q: 'Can other sign languages such as ASL or BSL be added?',
    a: 'Yes. The sign lexicon, gloss reordering rules, and training pipeline are language-agnostic. ISL is the default pack with English and Hindi output, and an ASL pack switch is already wired into the architecture.',
  },
];

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeDirection, setActiveDirection] = useState<'sign-to-speech' | 'speech-to-sign'>(
    'sign-to-speech'
  );

  const steps =
    activeDirection === 'sign-to-speech' ? SIGN_TO_SPEECH_STEPS : SPEECH_TO_SIGN_STEPS;

  return (
    <div className="bg-slate-50 dark:bg-slate-950">
      {/* 1. Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 flex flex-col justify-center space-y-6"
          >
            <p className="text-xs font-medium text-blue-700 dark:text-blue-400 tracking-wide">
              Browser-native · Indian Sign Language &amp; English/Hindi · Zero backend
            </p>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08]">
              Two-way sign language communication, right in your browser.
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              SignBridge translates live sign language with facial grammar into captions and
              speech, and turns spoken replies into articulated 3D avatar signing — locally on your
              webcam and microphone.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/translate"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                Try Live Demo
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 text-sm font-semibold transition-colors whitespace-nowrap"
              >
                How it works
              </a>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              <span>36 starter ISL signs</span>
              <span aria-hidden="true">·</span>
              <span>63 palm-invariant features/hand</span>
              <span aria-hidden="true">·</span>
              <span>4 facial grammar classes</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 flex"
          >
            <div className="w-full">
              <HeroHandSkeleton />
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. Problem Section */}
      <section className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-3 mb-12">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Why existing sign translation tools fall short
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
              Academic gesture demos often treat sign language like isolated hand poses. Real
              conversations break down along three structural gaps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PROBLEMS.map((item) => (
              <div
                key={item.num}
                className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-3"
              >
                <div className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                  {item.num}
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {item.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Features Section (Asymmetric Grid) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="max-w-2xl space-y-3 mb-12">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Engineered around real sign linguistics
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">
            Every layer of SignBridge runs directly in the browser so you can inspect, test, and
            retrain the pipeline transparently.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                01. Bidirectional real-time pipeline
              </h3>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                Translate continuous signing into live captions and spoken English or Hindi, then
                capture spoken responses via microphone, reorder them into sign-language gloss
                syntax, and play them on an articulated Three.js avatar.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-2 text-sm font-medium">
              <Link
                to="/translate"
                className="inline-flex items-center gap-1.5 text-blue-700 dark:text-blue-400 hover:underline"
              >
                Open Sign → Speech <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/speak"
                className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400 hover:underline"
              >
                Open Speech → 3D Avatar <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/conversation"
                className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:underline"
              >
                Split Conversation Mode <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400 flex items-center justify-center">
                <ScanFace className="w-5 h-5" aria-hidden="true" />
              </div>
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                02. Facial grammar recognition
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Computes inter-eye normalized eyebrow raise, furrow, mouth aspect ratio, and
                head pitch/yaw/roll across 30-frame windows to detect polar questions, WH-questions,
                and head-shake negation.
              </p>
            </div>
            <Link
              to="/lab"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 dark:text-teal-400 hover:underline"
            >
              Inspect grammar charts <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="lg:col-span-3 p-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 flex items-center justify-center shrink-0">
                  <Compass className="w-5 h-5" aria-hidden="true" />
                </div>
                <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
                  03. Palm-coordinate normalization
                </h3>
              </div>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Every 21-point hand skeleton is wrist-zeroed, divided by its wrist-to-middle-MCP
                palm span, horizontally mirrored for left hands, and rotationally aligned to a
                canonical vertical axis — yielding 63 invariant features per hand (129 for two-hand
                signs with relative wrist offset).
              </p>
            </div>
            <div className="lg:col-span-4 flex lg:justify-end">
              <Link
                to="/lab"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white transition-colors whitespace-nowrap"
              >
                Test Invariance in Lab
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. How It Works — Animated Dual Flow Diagram */}
      <section
        id="how-it-works"
        className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-16 lg:py-24"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="space-y-3 max-w-xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                How the local pipeline works
              </h2>
              <p className="text-slate-600 dark:text-slate-400 text-base">
                Switch between both directions to inspect each stage from sensor capture to
                grammatical output.
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Pipeline direction"
              className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 self-start"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeDirection === 'sign-to-speech'}
                onClick={() => setActiveDirection('sign-to-speech')}
                className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeDirection === 'sign-to-speech'
                    ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign → Text + Voice
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeDirection === 'speech-to-sign'}
                onClick={() => setActiveDirection('speech-to-sign')}
                className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeDirection === 'speech-to-sign'
                    ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Speech → 3D Avatar
              </button>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 gap-4 ${
              steps.length === 5 ? 'md:grid-cols-5' : 'md:grid-cols-4'
            }`}
          >
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={`${activeDirection}-${step.label}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.06 }}
                  className="relative p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        activeDirection === 'sign-to-speech'
                          ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400'
                          : 'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-xs text-slate-400 tabular-nums">
                      0{idx + 1}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    {step.label}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {step.detail}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Comparison Table */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="max-w-2xl space-y-3 mb-10">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            SignBridge vs typical sign-language apps
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base">
            Concrete architectural differences across grammar, spatial robustness, and privacy.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
                <th className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">
                  Capability
                </th>
                <th className="py-3.5 px-5 font-semibold text-blue-700 dark:text-blue-400">
                  SignBridge
                </th>
                <th className="py-3.5 px-5 font-semibold text-slate-500 dark:text-slate-400">
                  Typical Sign Apps
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.capability}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-4 px-5 font-medium text-slate-900 dark:text-slate-100">
                    {row.capability}
                  </td>
                  <td className="py-4 px-5 text-slate-800 dark:text-slate-200">
                    <span className="inline-flex items-start gap-2">
                      <Check
                        className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{row.signbridge}</span>
                    </span>
                  </td>
                  <td className="py-4 px-5 text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-start gap-2">
                      <Minus className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{row.typical}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Tech Stack */}
      <section className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white mb-6">
            Client-side technology stack
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TECH_STACK.map((item) => (
              <div
                key={item.name}
                className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 flex flex-col gap-1"
              >
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.name}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400">{item.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. FAQ Accordion */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        <div className="space-y-3 mb-10">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Frequently asked questions
          </h2>
          <p className="text-slate-600 dark:text-slate-400 text-base">
            Scope, privacy, and how SignBridge operates locally without cloud dependencies.
          </p>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={faq.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full py-5 flex items-center justify-between gap-4 text-left text-base font-medium text-slate-900 dark:text-slate-100 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="pb-5 text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed pr-8">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
