import { KNNDTWClassifier, type SequenceTemplate } from '../lib/classifier';
import type { PredictionResult } from '../types/signbridge';

interface InitMessage {
  type: 'INIT_TEMPLATES';
  templates: SequenceTemplate[];
}

interface PredictMessage {
  type: 'PREDICT';
  requestId: number;
  frames: number[][];
}

type WorkerRequest = InitMessage | PredictMessage;

const classifier = new KNNDTWClassifier([], 3, 2);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'INIT_TEMPLATES') {
    classifier.setTemplates(msg.templates);
    self.postMessage({ type: 'READY', count: classifier.getTemplateCount() });
  } else if (msg.type === 'PREDICT') {
    const result: PredictionResult = classifier.predict(msg.frames);
    self.postMessage({
      type: 'PREDICTION',
      requestId: msg.requestId,
      result,
    });
  }
};
