import * as tf from '@tensorflow/tfjs';
import type { PredictionResult, TrainingSample } from '../types/signbridge';
import { TWO_HAND_FEATURE_LENGTH } from './normalization';
import { resampleSequence } from './classifier';

const MODEL_DB_KEY = 'indexeddb://signbridge-sign-model';
const LABELS_STORAGE_KEY = 'signbridge_tfjs_labels_v1';
const SAMPLES_DB_NAME = 'signbridge_dataset_db';
const SAMPLES_STORE_NAME = 'samples';

export interface TrainingProgress {
  epoch: number;
  totalEpochs: number;
  loss: number;
  accuracy: number;
  valLoss?: number;
  valAccuracy?: number;
}

export interface SavedModelInfo {
  available: boolean;
  labels: string[];
  trainedAt?: number;
}

/**
 * Pad or truncate a frame vector to TWO_HAND_FEATURE_LENGTH (129).
 */
export function padFrameFeatures(frame: number[]): number[] {
  if (frame.length === TWO_HAND_FEATURE_LENGTH) return frame;
  if (frame.length > TWO_HAND_FEATURE_LENGTH) {
    return frame.slice(0, TWO_HAND_FEATURE_LENGTH);
  }
  return [...frame, ...new Array<number>(TWO_HAND_FEATURE_LENGTH - frame.length).fill(0)];
}

/**
 * IndexedDB helper for storing recorded 30-frame training samples locally in the browser.
 */
function openSamplesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SAMPLES_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SAMPLES_STORE_NAME)) {
        db.createObjectStore(SAMPLES_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadTrainingSamples(): Promise<TrainingSample[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openSamplesDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(SAMPLES_STORE_NAME, 'readonly');
      const store = tx.objectStore(SAMPLES_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as TrainingSample[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveTrainingSample(sample: TrainingSample): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openSamplesDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAMPLES_STORE_NAME, 'readwrite');
    tx.objectStore(SAMPLES_STORE_NAME).put(sample);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteTrainingSample(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openSamplesDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAMPLES_STORE_NAME, 'readwrite');
    tx.objectStore(SAMPLES_STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllTrainingSamples(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openSamplesDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAMPLES_STORE_NAME, 'readwrite');
    tx.objectStore(SAMPLES_STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * In-browser TensorFlow.js 1D-CNN + GRU sequence classifier.
 * Input shape: [30 frames, 129 palm-normalized features]
 * Output: softmax probabilities over trained sign labels.
 */
export class SignBridgeTFModel {
  private model: tf.LayersModel | null = null;
  private labels: string[] = [];

  public getInfo(): SavedModelInfo {
    if (this.model && this.labels.length > 0) {
      return { available: true, labels: [...this.labels] };
    }
    try {
      const raw = localStorage.getItem(LABELS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { labels: string[]; trainedAt?: number };
        if (Array.isArray(parsed.labels) && parsed.labels.length > 0) {
          return { available: true, labels: parsed.labels, trainedAt: parsed.trainedAt };
        }
      }
    } catch {
      // ignore
    }
    return { available: false, labels: [] };
  }

  public isLoaded(): boolean {
    return this.model !== null && this.labels.length > 0;
  }

  public getLabels(): string[] {
    return [...this.labels];
  }

  public async loadFromIndexedDB(): Promise<boolean> {
    try {
      const raw = localStorage.getItem(LABELS_STORAGE_KEY);
      if (!raw) return false;
      const meta = JSON.parse(raw) as { labels: string[] };
      if (!meta.labels || meta.labels.length < 2) return false;

      const loaded = await tf.loadLayersModel(MODEL_DB_KEY);
      if (this.model) this.model.dispose();
      this.model = loaded;
      this.labels = meta.labels;
      return true;
    } catch {
      return false;
    }
  }

  public buildArchitecture(numClasses: number, seqLen = 30, numFeatures = TWO_HAND_FEATURE_LENGTH): tf.LayersModel {
    const model = tf.sequential();

    // Spatial-temporal local motif extraction via 1D-CNN
    model.add(
      tf.layers.conv1d({
        inputShape: [seqLen, numFeatures],
        filters: 48,
        kernelSize: 3,
        padding: 'same',
        activation: 'relu',
      })
    );
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.maxPooling1d({ poolSize: 2 }));
    model.add(tf.layers.dropout({ rate: 0.2 }));

    // Temporal sequence modeling via GRU
    model.add(
      tf.layers.gru({
        units: 48,
        returnSequences: false,
      })
    );
    model.add(tf.layers.dropout({ rate: 0.25 }));

    // Classification head
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));

    model.compile({
      optimizer: tf.train.adam(0.0025),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  /**
   * Train the 1D-CNN + GRU model directly in the browser using recorded samples,
   * with slight Gaussian jitter augmentation for generalization when few samples exist.
   */
  public async train(
    samples: TrainingSample[],
    epochs = 24,
    onProgress?: (p: TrainingProgress) => void
  ): Promise<{ labels: string[]; finalAccuracy: number; finalLoss: number }> {
    const uniqueLabels = Array.from(new Set(samples.map((s) => s.label.toUpperCase()))).sort();
    if (uniqueLabels.length < 2) {
      throw new Error('Record samples for at least 2 distinct sign labels before training.');
    }

    const labelToIdx = new Map(uniqueLabels.map((l, i) => [l, i]));
    const xsData: number[][][] = [];
    const ysData: number[] = [];

    // Include original samples + 2 light noise-augmented copies for small-dataset stability
    for (const s of samples) {
      const idx = labelToIdx.get(s.label.toUpperCase());
      if (idx === undefined) continue;
      const resampled = resampleSequence(s.frames, 30).map(padFrameFeatures);
      xsData.push(resampled);
      ysData.push(idx);

      for (let aug = 0; aug < 2; aug++) {
        const noisy = resampled.map((frame) =>
          frame.map((v) => (v === 0 ? 0 : v + (Math.random() - 0.5) * 0.04))
        );
        xsData.push(noisy);
        ysData.push(idx);
      }
    }

    const numClasses = uniqueLabels.length;
    const xs = tf.tensor3d(xsData, [xsData.length, 30, TWO_HAND_FEATURE_LENGTH]);
    const ysIdx = tf.tensor1d(ysData, 'int32');
    const ys = tf.oneHot(ysIdx, numClasses);
    ysIdx.dispose();

    if (this.model) {
      this.model.dispose();
    }
    const model = this.buildArchitecture(numClasses);
    this.model = model;
    this.labels = uniqueLabels;

    let finalAccuracy = 0;
    let finalLoss = 0;

    try {
      await model.fit(xs, ys, {
        epochs,
        batchSize: Math.min(16, Math.max(4, Math.floor(xsData.length / 4))),
        shuffle: true,
        validationSplit: xsData.length >= 12 ? 0.2 : 0,
        callbacks: {
          onEpochEnd: async (epoch, logs) => {
            const loss = Number((logs?.loss ?? 0).toFixed(4));
            const accuracy = Number(((logs?.acc ?? logs?.accuracy ?? 0) as number).toFixed(4));
            const valLoss = logs?.val_loss !== undefined ? Number(logs.val_loss.toFixed(4)) : undefined;
            const valAccuracy =
              logs?.val_acc !== undefined || logs?.val_accuracy !== undefined
                ? Number(((logs?.val_acc ?? logs?.val_accuracy ?? 0) as number).toFixed(4))
                : undefined;

            finalLoss = loss;
            finalAccuracy = accuracy;
            onProgress?.({
              epoch: epoch + 1,
              totalEpochs: epochs,
              loss,
              accuracy,
              valLoss,
              valAccuracy,
            });
            await tf.nextFrame();
          },
        },
      });

      // Persist trained model in IndexedDB and labels in localStorage
      await model.save(MODEL_DB_KEY);
      localStorage.setItem(
        LABELS_STORAGE_KEY,
        JSON.stringify({ labels: uniqueLabels, trainedAt: Date.now() })
      );
    } finally {
      xs.dispose();
      ys.dispose();
    }

    return { labels: uniqueLabels, finalAccuracy, finalLoss };
  }

  public predict(sequence: number[][]): PredictionResult | null {
    if (!this.model || this.labels.length === 0 || sequence.length === 0) return null;
    const start = performance.now();
    const resampled = resampleSequence(sequence, 30).map(padFrameFeatures);

    const probs = tf.tidy(() => {
      const input = tf.tensor3d([resampled], [1, 30, TWO_HAND_FEATURE_LENGTH]);
      const out = this.model!.predict(input) as tf.Tensor;
      return Array.from(out.dataSync());
    });

    const ranked = probs
      .map((p, idx) => ({
        gloss: this.labels[idx] ?? 'UNKNOWN',
        confidence: Number(p.toFixed(3)),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    const latencyMs = Number((performance.now() - start).toFixed(1));
    return {
      gloss: ranked[0]?.gloss ?? 'UNKNOWN',
      confidence: ranked[0]?.confidence ?? 0,
      latencyMs,
      engine: 'tfjs',
      topK: ranked.slice(0, 4),
    };
  }

  /**
   * Export model weights & topology as downloadable files.
   */
  public async exportModelDownload(): Promise<void> {
    if (!this.model) {
      throw new Error('No trained TensorFlow.js model is loaded.');
    }
    await this.model.save('downloads://signbridge-cnn-gru-model');
  }

  /**
   * Remove saved model from IndexedDB.
   */
  public async deleteSavedModel(): Promise<void> {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.labels = [];
    localStorage.removeItem(LABELS_STORAGE_KEY);
    try {
      await tf.io.removeModel(MODEL_DB_KEY);
    } catch {
      // ignore if not present
    }
  }
}

export const sharedTFModel = new SignBridgeTFModel();
