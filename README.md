# SignBridge

**SignBridge** is a browser-native, real-time two-way sign language communication platform built with React, TypeScript, Vite, Tailwind CSS, MediaPipe Tasks Vision, TensorFlow.js, React Three Fiber, and the Web Speech API.

Everything runs **100% client-side** in the user's browser using their webcam and microphone — no paid APIs and no backend required.

## Pages & Capabilities

- **`/` Landing Page**: Interactive raw vs. palm-normalized hand-skeleton hero visual, core problem breakdown, bidirectional features, animated step-by-step flow diagram, comparison table, tech stack, and FAQ accordion.
- **`/translate` Sign → Text + Speech**: Live MediaPipe HandLandmarker (2 hands × 21 landmarks) + FaceLandmarker (468 landmarks + transformation matrix) at ~30 FPS, palm-coordinate normalization, sliding 30-frame window inference (Web Worker k-NN+DTW or trained TF.js 1D-CNN+GRU), facial grammar tagging, live captions, Web Speech TTS, confidence threshold slider, and zero-webcam simulation controls.
- **`/speak` Speech → 3D Sign Avatar**: Web Speech API SpeechRecognition (English & Hindi), filler-stripping and WH-final gloss parser, articulated Three.js (`@react-three/fiber`) 3D avatar with analytical arm IK and expressive eyebrows, playback speed control, replay, and 36-sign interactive lexicon browser.
- **`/conversation` Two-Way Chat Mode**: Split workspace with signer capture on the left, unified chronological timeline in the center, speaker mic/text + 3D avatar on the right, and `.txt` transcript export.
- **`/train` Custom Data Collection & Training**: Create/select sign labels, record 30-frame normalized sequences with a 3-2-1 countdown (or add synthetic demo samples), preview/delete samples, train a TensorFlow.js 1D-CNN+GRU model with live loss/accuracy curves, save to IndexedDB, and export/import dataset & model files.
- **`/lab` Normalization & Facial Grammar Lab**: Side-by-side raw vs. palm-coordinate normalized skeletons with live distance/tilt/pan/handedness invariance sliders and L2 error readout, plus rolling 30-frame Recharts time-series charts and tunable thresholds for `POLAR_QUESTION`, `WH_QUESTION`, `NEGATION`, and `NEUTRAL`.
- **`/evaluation` Metrics & WER**: Per-session latency, FPS, confidence logs with thumbs-up/thumbs-down ratings, Levenshtein Word Error Rate (WER) calculator, local usability feedback form (1–5), and CSV/JSON export.
- **`/about` Mission & Accessibility**: Project mission, WCAG 2.1 AA accessibility statement, and candid prototype limitations.

## Quick Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Running Unit Tests

Core math and linguistic modules (`normalizeHand`, `normalizeTwoHands`, `computeFacialFeatures`, `classifyFacialGrammar`, `speechToGloss`, `glossToSentenceRuleBased`, `computeWER`, and `KNNDTWClassifier`) have deterministic unit tests:

```bash
npx --yes tsx --test src/lib/normalization.test.ts src/lib/grammar.test.ts src/lib/glossParser.test.ts src/lib/classifier.test.ts
```

## Collecting Data & Training a Custom Model

1. Navigate to **`/train`**.
2. Choose an existing sign label or enter a new custom label (e.g. `COFFEE`).
3. Start your webcam and click **Record 30 Frames** (repeat 5–10 times per sign for at least 2 distinct signs). You can also click **+5 Demo Samples** to test the training loop without a webcam.
4. Click **Train Model in Browser**. The 1D-CNN + GRU network trains locally in TensorFlow.js and saves automatically to `indexeddb://signbridge-sign-model`.
5. Return to **`/translate`** and select **TF.js 1D-CNN+GRU** in the Model dropdown (or use **k-NN + DTW** for immediate few-shot matching with 5–10 samples).

## Static Site Deployment (Netlify / Vercel / GitHub Pages)

SignBridge builds to a pure static bundle in `dist/`:

```bash
npm run build
```

- **Netlify**: Publish directory `dist`, add a `_redirects` rule `/* /index.html 200` for SPA routing.
- **Vercel**: Framework preset `Vite`, output directory `dist` (add `vercel.json` SPA rewrite to `/index.html`).
- **GitHub Pages**: Deploy `dist` and ensure 404 fallback redirects to `index.html`.

> **HTTPS Note**: Browser webcam (`getUserMedia`) and microphone (`SpeechRecognition`) APIs require HTTPS in production (or `localhost` in local development).

## Optional Natural-Language Refinement Proxy

By default, SignBridge uses a deterministic client-side English & Hindi gloss-to-sentence engine (`src/lib/glossParser.ts`) with zero external API calls. If you optionally deploy a server-side proxy backed by the Gemini API, set `VITE_GLOSS_REFINER_ENDPOINT` in `.env` to your endpoint URL (`POST { glosses, grammar, language } -> { sentence }`). Never expose API keys in client-side code.

## Known Limitations

- **Prototype Vocabulary**: Ships with 36 everyday Indian Sign Language (ISL) starter signs. It is a research and educational prototype, not a replacement for certified sign language interpreters.
- **Lighting & Occlusion**: Single-webcam MediaPipe tracking degrades in low light or heavy hand-to-face occlusion.
- **Browser Support**: Web Speech `SpeechRecognition` is currently best supported in Chromium-based browsers (Chrome, Edge). Text input and simulation fallbacks are provided across all browsers.
