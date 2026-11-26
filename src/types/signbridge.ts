export interface Landmark3D {
  x: number;
  y: number;
  z: number;
}

export type Handedness = 'Left' | 'Right';

export type FacialGrammarTag =
  | 'NEUTRAL'
  | 'POLAR_QUESTION'
  | 'WH_QUESTION'
  | 'NEGATION';

export type SignLanguageCode = 'ISL' | 'ASL';
export type SpokenLanguageCode = 'en-IN' | 'hi-IN' | 'en-US';
export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface FacialFeatures {
  timestamp: number;
  eyebrowRaise: number; // Normalized vertical brow lift (0..1+)
  eyebrowFurrow: number; // Normalized inner brow compression (0..1+)
  interEyeDistance: number; // Scale denominator in normalized image units
  mouthAspectRatio: number; // Vertical lip aperture / mouth width
  headPitch: number; // Degrees (+ forward nod / down, - up)
  headYaw: number; // Degrees (+ right turn, - left turn)
  headRoll: number; // Degrees (+ right tilt, - left tilt)
}

export interface GrammarClassification {
  tag: FacialGrammarTag;
  confidence: number;
  reason: string;
  scores: Record<FacialGrammarTag, number>;
}

export interface GrammarThresholds {
  browRaiseThreshold: number;
  browFurrowThreshold: number;
  pitchForwardThreshold: number;
  yawOscillationThreshold: number;
  yawMinZeroCrossings: number;
}

export interface ArmPose {
  /** Target wrist position in avatar local space (torso center = [0, 1.15, 0]) */
  handPos: [number, number, number];
  /** Wrist Euler rotation [rx, ry, rz] in radians */
  handRot: [number, number, number];
  /** Finger curl values [thumb, index, middle, ring, pinky] in 0 (open) .. 1 (curled) */
  fingers: [number, number, number, number, number];
  /** Finger spread 0..1 */
  spread?: number;
}

export interface AvatarKeyframe {
  /** Normalized progress in sign clip [0..1] */
  t: number;
  right: ArmPose;
  left?: ArmPose;
  headRot?: [number, number, number];
  browLift?: number; // -1 (furrow) .. +1 (raise)
}

export interface HandTrajectorySpec {
  handshape:
    | 'flat_open'
    | 'fist'
    | 'point_index'
    | 'peace_v'
    | 'thumbs_up'
    | 'cup_c'
    | 'pinch_o'
    | 'claw'
    | 'l_shape'
    | 'y_shape';
  motion:
    | 'wave'
    | 'forward_arc'
    | 'chest_circle'
    | 'nod_tap'
    | 'side_shake'
    | 'lift_up'
    | 'chin_out'
    | 'forehead_out'
    | 'point_self'
    | 'point_out'
    | 'palm_flip'
    | 'two_hand_meet'
    | 'push_down';
  twoHanded?: boolean;
}

export interface SignDefinition {
  id: string;
  gloss: string;
  labelEn: string;
  labelHi: string;
  category: 'greeting' | 'question' | 'pronoun' | 'action' | 'need' | 'descriptor' | 'social';
  signLanguage: SignLanguageCode;
  handedness: 'one-hand' | 'two-hand';
  synonyms: string[];
  description: string;
  facialCue?: FacialGrammarTag;
  durationMs: number;
  keyframes: AvatarKeyframe[];
  prototypeSpec: HandTrajectorySpec;
}

export interface TrainingSample {
  id: string;
  label: string;
  createdAt: number;
  frames: number[][]; // 30 frames x 129 features (or 63 padded to 129)
  source: 'webcam' | 'synthetic' | 'imported';
}

export interface PredictionResult {
  gloss: string;
  confidence: number;
  latencyMs: number;
  engine: 'tfjs' | 'knn-dtw';
  topK: Array<{ gloss: string; confidence: number }>;
}

export interface ConversationMessage {
  id: string;
  sender: 'signer' | 'speaker';
  text: string;
  glosses?: string[];
  grammar?: FacialGrammarTag;
  confidence?: number;
  timestamp: number;
}

export interface EvaluationLogEntry {
  id: string;
  timestamp: number;
  gloss: string;
  sentence: string;
  confidence: number;
  latencyMs: number;
  fps: number;
  grammar: FacialGrammarTag;
  engine: 'tfjs' | 'knn-dtw';
  rating?: 'up' | 'down';
}

export interface FeedbackEntry {
  id: string;
  timestamp: number;
  rating: number; // 1..5
  role: 'deaf_signer' | 'hearing_user' | 'interpreter' | 'researcher';
  comments: string;
}

export interface WERResult {
  wer: number; // 0..1+ (percentage = wer * 100)
  substitutions: number;
  deletions: number;
  insertions: number;
  refWords: number;
  hypWords: number;
}
