import type { AvatarKeyframe, SignDefinition } from '../types/signbridge';

export type LibraryCategoryFilter = 'all' | SignDefinition['category'];
export type LibraryHandednessFilter = 'all' | SignDefinition['handedness'];

export interface SignLibraryFilters {
  query: string;
  category: LibraryCategoryFilter;
  handedness: LibraryHandednessFilter;
}

export const LIBRARY_CATEGORIES: { id: LibraryCategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'greeting', label: 'Greetings' },
  { id: 'question', label: 'Questions' },
  { id: 'social', label: 'Social' },
  { id: 'need', label: 'Needs' },
  { id: 'action', label: 'Actions' },
  { id: 'pronoun', label: 'Pronouns' },
  { id: 'descriptor', label: 'Descriptors' },
];

/**
 * Pure filter & search function for the SignBridge sign library.
 * Matches across English label, Hindi label, gloss, synonyms, category, and physical description.
 */
export function filterSigns(
  signs: SignDefinition[],
  filters: SignLibraryFilters
): SignDefinition[] {
  const q = filters.query.trim().toLowerCase();

  return signs.filter((sign) => {
    if (filters.category !== 'all' && sign.category !== filters.category) {
      return false;
    }
    if (filters.handedness !== 'all' && sign.handedness !== filters.handedness) {
      return false;
    }
    if (!q) return true;

    return (
      sign.labelEn.toLowerCase().includes(q) ||
      sign.labelHi.toLowerCase().includes(q) ||
      sign.gloss.toLowerCase().includes(q) ||
      sign.category.toLowerCase().includes(q) ||
      sign.description.toLowerCase().includes(q) ||
      sign.synonyms.some((syn) => syn.toLowerCase().includes(q))
    );
  });
}

/**
 * Returns the index of the keyframe closest to normalized playback progress [0..1].
 */
export function getActiveKeyframeIndex(keyframes: AvatarKeyframe[], progress: number): number {
  if (!keyframes || keyframes.length === 0) return -1;
  let bestIdx = 0;
  let bestDist = Math.abs(keyframes[0].t - progress);
  for (let i = 1; i < keyframes.length; i++) {
    const dist = Math.abs(keyframes[i].t - progress);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Formats a 3D numeric tuple cleanly for monospace inspection tables.
 */
export function formatTuple3(tuple: [number, number, number], digits = 2): string {
  return `[${tuple.map((v) => v.toFixed(digits)).join(', ')}]`;
}
