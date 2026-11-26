import rawIslSigns from './isl_signs.json';
import type { SignDefinition, SignLanguageCode } from '../../types/signbridge';
import { generatePrototypeSequence } from '../../lib/normalization';

export const ISL_SIGNS: SignDefinition[] = rawIslSigns as SignDefinition[];

/**
 * Language-agnostic sign pack registry.
 * ISL is the default pack; ASL maps onto the shared 36-sign prototype pack with ASL metadata
 * so additional regional keyframe packs can be dropped in without changing pipeline code.
 */
export function getSignPack(language: SignLanguageCode = 'ISL'): SignDefinition[] {
  if (language === 'ASL') {
    return ISL_SIGNS.map((s) => ({
      ...s,
      signLanguage: 'ASL',
    }));
  }
  return ISL_SIGNS;
}

export function getSignByGloss(
  gloss: string,
  language: SignLanguageCode = 'ISL'
): SignDefinition | undefined {
  const upper = gloss.toUpperCase();
  return getSignPack(language).find((s) => s.gloss === upper);
}

let cachedPrototypes: Array<{ label: string; frames: number[][] }> | null = null;

/**
 * Deterministic 30-frame normalized sequence prototypes for all built-in signs.
 * Allows immediate out-of-the-box k-NN + DTW classification before custom training.
 */
export function getBuiltInSignPrototypes(): Array<{ label: string; frames: number[][] }> {
  if (cachedPrototypes) return cachedPrototypes;
  cachedPrototypes = ISL_SIGNS.map((sign) => ({
    label: sign.gloss,
    frames: generatePrototypeSequence(sign.prototypeSpec, 30),
  }));
  return cachedPrototypes;
}
