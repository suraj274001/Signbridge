import type { FacialGrammarTag } from '../types/signbridge';

export interface SignEmojiMapping {
  gloss: string;
  emoji: string;
  label: string;
  isFallback?: boolean;
}

export interface GrammarEmojiMapping {
  tag: FacialGrammarTag;
  emoji: string;
  shortLabel: string;
}

const SIGN_EMOJI_TABLE: Record<string, { emoji: string; label: string }> = {
  // All 36 built-in ISL signs
  HELLO: { emoji: '👋', label: 'Hello' },
  THANK_YOU: { emoji: '🙏', label: 'Thank you' },
  PLEASE: { emoji: '🤲', label: 'Please' },
  SORRY: { emoji: '😔', label: 'Sorry' },
  YES: { emoji: '👍', label: 'Yes' },
  NO: { emoji: '🙅', label: 'No' },
  HELP: { emoji: '🆘', label: 'Help' },
  WATER: { emoji: '💧', label: 'Water' },
  FOOD: { emoji: '🍽️', label: 'Food' },
  HOME: { emoji: '🏠', label: 'Home' },
  NAME: { emoji: '🪪', label: 'Name' },
  WHAT: { emoji: '❓', label: 'What' },
  WHERE: { emoji: '📍', label: 'Where' },
  WHO: { emoji: '👤', label: 'Who' },
  WHY: { emoji: '🤔', label: 'Why' },
  HOW: { emoji: '🧭', label: 'How' },
  YOU: { emoji: '👉', label: 'You' },
  ME: { emoji: '🙋', label: 'Me' },
  GOOD: { emoji: '✨', label: 'Good' },
  BAD: { emoji: '👎', label: 'Bad' },
  MORNING: { emoji: '🌅', label: 'Morning' },
  NIGHT: { emoji: '🌙', label: 'Night' },
  FRIEND: { emoji: '🤝', label: 'Friend' },
  FAMILY: { emoji: '👨‍👩‍👧‍👦', label: 'Family' },
  DOCTOR: { emoji: '🩺', label: 'Doctor' },
  HOSPITAL: { emoji: '🏥', label: 'Hospital' },
  WORK: { emoji: '💼', label: 'Work' },
  SCHOOL: { emoji: '🏫', label: 'School' },
  TIME: { emoji: '⏰', label: 'Time' },
  WAIT: { emoji: '⏳', label: 'Wait' },
  STOP: { emoji: '✋', label: 'Stop' },
  GO: { emoji: '🚶', label: 'Go' },
  COME: { emoji: '🫴', label: 'Come' },
  UNDERSTAND: { emoji: '💡', label: 'Understand' },
  WANT: { emoji: '🫶', label: 'Want' },
  LOVE: { emoji: '❤️', label: 'Love' },

  // Common custom-trained sign extensions
  COFFEE: { emoji: '☕', label: 'Coffee' },
  TEA: { emoji: '🍵', label: 'Tea' },
  HAPPY: { emoji: '😊', label: 'Happy' },
  SAD: { emoji: '😢', label: 'Sad' },
  PAIN: { emoji: '🤕', label: 'Pain' },
  EMERGENCY: { emoji: '🚨', label: 'Emergency' },
  PHONE: { emoji: '📱', label: 'Phone' },
  BOOK: { emoji: '📖', label: 'Book' },
  MUSIC: { emoji: '🎵', label: 'Music' },
  MONEY: { emoji: '💳', label: 'Money' },
  SLEEP: { emoji: '😴', label: 'Sleep' },
  OK: { emoji: '👌', label: 'OK' },
};

const GRAMMAR_EMOJI_TABLE: Record<FacialGrammarTag, GrammarEmojiMapping> = {
  NEUTRAL: { tag: 'NEUTRAL', emoji: '💬', shortLabel: 'Statement' },
  POLAR_QUESTION: { tag: 'POLAR_QUESTION', emoji: '🤨', shortLabel: 'Yes/No Q' },
  WH_QUESTION: { tag: 'WH_QUESTION', emoji: '🧐', shortLabel: 'WH-Question' },
  NEGATION: { tag: 'NEGATION', emoji: '🚫', shortLabel: 'Negation' },
};

/**
 * Normalizes a gloss key (e.g. "thank you" or "THANK_YOU") and returns its expressive Emoji mapping.
 */
export function mapGlossToEmoji(gloss: string): SignEmojiMapping {
  const normalized = gloss.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const match = SIGN_EMOJI_TABLE[normalized];
  if (match) {
    return {
      gloss: normalized,
      emoji: match.emoji,
      label: match.label,
      isFallback: false,
    };
  }

  const readable = normalized
    ? normalized
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase())
    : 'Sign';

  return {
    gloss: normalized || 'SIGN',
    emoji: '🤟',
    label: readable,
    isFallback: true,
  };
}

/**
 * Maps a sequence of recognized gloss tokens into an ordered Emoji visual trail.
 */
export function mapGlossSequenceToEmojis(glosses: string[], maxItems = 6): SignEmojiMapping[] {
  return glosses.slice(-maxItems).map(mapGlossToEmoji);
}

/**
 * Returns the companion expressive Emoji metadata for a detected non-manual facial grammar cue.
 */
export function mapGrammarToEmoji(tag: FacialGrammarTag): GrammarEmojiMapping {
  return GRAMMAR_EMOJI_TABLE[tag] ?? GRAMMAR_EMOJI_TABLE.NEUTRAL;
}
