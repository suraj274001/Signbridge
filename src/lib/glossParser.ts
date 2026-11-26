import type {
  FacialGrammarTag,
  SignLanguageCode,
  SpokenLanguageCode,
  WERResult,
} from '../types/signbridge';

const FILLER_AND_COPULA_WORDS = new Set([
  'um', 'uh', 'umm', 'uhh', 'like', 'actually', 'basically', 'literally', 'just',
  'really', 'very', 'well', 'so', 'the', 'a', 'an', 'is', 'am', 'are', 'was',
  'were', 'be', 'been', 'being', 'to', 'of', 'for', 'in', 'on', 'at', 'with',
  'by', 'do', 'does', 'did', 'can', 'could', 'would', 'will', 'shall', 'have',
  'has', 'had', 'some', 'any', 'that', 'this', 'it',
]);

const WH_GLOSSES = new Set(['WHAT', 'WHERE', 'WHO', 'WHY', 'HOW', 'TIME']);

const NEGATION_WORDS = new Set([
  'not', 'no', 'never', 'dont', "don't", 'cannot', "can't", 'wont', "won't",
  'didnt', "didn't", 'isnt', "isn't", 'nahi', 'नहीं', 'ना',
]);

/**
 * Lexical synonym map from everyday English & Hindi words to canonical SignBridge gloss tokens.
 */
const WORD_TO_GLOSS: Record<string, string> = {
  // Greetings & social
  hello: 'HELLO',
  hi: 'HELLO',
  hey: 'HELLO',
  namaste: 'HELLO',
  नमस्ते: 'HELLO',
  thank: 'THANK_YOU',
  thanks: 'THANK_YOU',
  thankyou: 'THANK_YOU',
  धन्यवाद: 'THANK_YOU',
  please: 'PLEASE',
  kindly: 'PLEASE',
  कृपया: 'PLEASE',
  sorry: 'SORRY',
  apologize: 'SORRY',
  excuse: 'SORRY',
  माफ़: 'SORRY',
  yes: 'YES',
  yeah: 'YES',
  yep: 'YES',
  okay: 'YES',
  ok: 'YES',
  हाँ: 'YES',
  no: 'NO',
  not: 'NO',
  nope: 'NO',
  never: 'NO',
  नहीं: 'NO',
  help: 'HELP',
  assist: 'HELP',
  support: 'HELP',
  मदद: 'HELP',
  water: 'WATER',
  drink: 'WATER',
  thirsty: 'WATER',
  पानी: 'WATER',
  food: 'FOOD',
  eat: 'FOOD',
  hungry: 'FOOD',
  meal: 'FOOD',
  खाना: 'FOOD',
  home: 'HOME',
  house: 'HOME',
  घर: 'HOME',
  name: 'NAME',
  called: 'NAME',
  नाम: 'NAME',
  what: 'WHAT',
  क्या: 'WHAT',
  where: 'WHERE',
  कहाँ: 'WHERE',
  who: 'WHO',
  कौन: 'WHO',
  why: 'WHY',
  क्यों: 'WHY',
  how: 'HOW',
  कैसे: 'HOW',
  you: 'YOU',
  your: 'YOU',
  yours: 'YOU',
  आप: 'YOU',
  तुम: 'YOU',
  me: 'ME',
  i: 'ME',
  my: 'ME',
  myself: 'ME',
  मैं: 'ME',
  मेरा: 'ME',
  good: 'GOOD',
  great: 'GOOD',
  fine: 'GOOD',
  nice: 'GOOD',
  happy: 'GOOD',
  अच्छा: 'GOOD',
  bad: 'BAD',
  terrible: 'BAD',
  sad: 'BAD',
  poor: 'BAD',
  बुरा: 'BAD',
  morning: 'MORNING',
  सुबह: 'MORNING',
  night: 'NIGHT',
  evening: 'NIGHT',
  रात: 'NIGHT',
  friend: 'FRIEND',
  buddy: 'FRIEND',
  दोस्त: 'FRIEND',
  family: 'FAMILY',
  parents: 'FAMILY',
  परिवार: 'FAMILY',
  doctor: 'DOCTOR',
  physician: 'DOCTOR',
  डॉक्टर: 'DOCTOR',
  hospital: 'HOSPITAL',
  clinic: 'HOSPITAL',
  अस्पताल: 'HOSPITAL',
  work: 'WORK',
  job: 'WORK',
  office: 'WORK',
  काम: 'WORK',
  school: 'SCHOOL',
  college: 'SCHOOL',
  class: 'SCHOOL',
  स्कूल: 'SCHOOL',
  time: 'TIME',
  when: 'TIME',
  clock: 'TIME',
  समय: 'TIME',
  wait: 'WAIT',
  hold: 'WAIT',
  रुको: 'WAIT',
  stop: 'STOP',
  halt: 'STOP',
  बंद: 'STOP',
  go: 'GO',
  leave: 'GO',
  जाओ: 'GO',
  come: 'COME',
  arrive: 'COME',
  आओ: 'COME',
  understand: 'UNDERSTAND',
  know: 'UNDERSTAND',
  clear: 'UNDERSTAND',
  समझ: 'UNDERSTAND',
  want: 'WANT',
  need: 'WANT',
  चाहिए: 'WANT',
  love: 'LOVE',
  care: 'LOVE',
  प्यार: 'LOVE',
};

export interface ParsedGlossResult {
  glosses: string[];
  facialCue: FacialGrammarTag;
  removedFillers: string[];
  unmappedWords: string[];
}

/**
 * Convert spoken natural language (English or Hindi) into an ordered sign-language gloss queue.
 *
 * Rules applied (ISL / ASL topic-comment syntax):
 * 1. Detect sentence-level non-manual grammar cue (WH-question, polar question, negation).
 * 2. Handle multi-word phrases ("thank you" -> THANK_YOU).
 * 3. Strip conversational fillers and English copulas/articles ("um", "is", "the", "a").
 * 4. Map lexical stems/synonyms to canonical gloss tokens.
 * 5. Reorder WH-question tokens to clause-final position (e.g. "What is your name?" -> YOU NAME WHAT).
 * 6. Place explicit negation marker at clause-final position for ISL SOV-Neg structure.
 */
export function speechToGloss(
  text: string,
  _signLanguage: SignLanguageCode = 'ISL'
): ParsedGlossResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { glosses: [], facialCue: 'NEUTRAL', removedFillers: [], unmappedWords: [] };
  }

  const hasQuestionMark = trimmed.includes('?');
  const normalized = trimmed
    .toLowerCase()
    .replace(/thank\s+you/g, 'thankyou')
    .replace(/don't|do\s+not/g, 'not')
    .replace(/can't|cannot/g, 'not')
    .replace(/won't|will\s+not/g, 'not')
    .replace(/isn't|aren't/g, 'not')
    .replace(/[.,!?;:"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = normalized.split(' ').filter(Boolean);
  const removedFillers: string[] = [];
  const unmappedWords: string[] = [];
  const contentGlosses: string[] = [];
  const whTokens: string[] = [];
  let hasNegation = false;

  for (const raw of tokens) {
    if (NEGATION_WORDS.has(raw)) {
      hasNegation = true;
      continue;
    }

    const mapped = WORD_TO_GLOSS[raw];
    if (mapped) {
      if (WH_GLOSSES.has(mapped)) {
        if (!whTokens.includes(mapped)) whTokens.push(mapped);
      } else {
        // Avoid immediate duplicate adjacent glosses (e.g. "please kindly")
        if (contentGlosses[contentGlosses.length - 1] !== mapped) {
          contentGlosses.push(mapped);
        }
      }
      continue;
    }

    if (FILLER_AND_COPULA_WORDS.has(raw)) {
      removedFillers.push(raw);
      continue;
    }

    // Keep unknown words as uppercase fingerspell/fallback tokens so no meaning is dropped
    const upper = raw.toUpperCase();
    unmappedWords.push(upper);
    contentGlosses.push(upper);
  }

  // Reassemble in sign-language order: [Topic/Content] + [WH-word at end] + [NO if negated]
  const glosses = [...contentGlosses, ...whTokens];
  if (hasNegation) {
    glosses.push('NO');
  }

  let facialCue: FacialGrammarTag = 'NEUTRAL';
  if (whTokens.length > 0) {
    facialCue = 'WH_QUESTION';
  } else if (hasNegation) {
    facialCue = 'NEGATION';
  } else if (
    hasQuestionMark ||
    /^(do|does|did|is|are|can|could|will|would|have|has)\b/i.test(trimmed)
  ) {
    facialCue = 'POLAR_QUESTION';
  }

  return { glosses, facialCue, removedFillers, unmappedWords };
}

const GLOSS_TO_EN: Record<string, string> = {
  HELLO: 'Hello',
  THANK_YOU: 'thank you',
  PLEASE: 'please',
  SORRY: 'sorry',
  YES: 'yes',
  NO: 'no',
  HELP: 'help',
  WATER: 'water',
  FOOD: 'food',
  HOME: 'home',
  NAME: 'name',
  WHAT: 'what',
  WHERE: 'where',
  WHO: 'who',
  WHY: 'why',
  HOW: 'how',
  YOU: 'you',
  ME: 'I',
  GOOD: 'good',
  BAD: 'bad',
  MORNING: 'morning',
  NIGHT: 'night',
  FRIEND: 'friend',
  FAMILY: 'family',
  DOCTOR: 'doctor',
  HOSPITAL: 'hospital',
  WORK: 'work',
  SCHOOL: 'school',
  TIME: 'time',
  WAIT: 'wait',
  STOP: 'stop',
  GO: 'go',
  COME: 'come',
  UNDERSTAND: 'understand',
  WANT: 'want',
  LOVE: 'love',
};

const GLOSS_TO_HI: Record<string, string> = {
  HELLO: 'नमस्ते',
  THANK_YOU: 'धन्यवाद',
  PLEASE: 'कृपया',
  SORRY: 'माफ़ कीजिए',
  YES: 'हाँ',
  NO: 'नहीं',
  HELP: 'मदद',
  WATER: 'पानी',
  FOOD: 'खाना',
  HOME: 'घर',
  NAME: 'नाम',
  WHAT: 'क्या',
  WHERE: 'कहाँ',
  WHO: 'कौन',
  WHY: 'क्यों',
  HOW: 'कैसे',
  YOU: 'आप',
  ME: 'मैं',
  GOOD: 'अच्छा',
  BAD: 'बुरा',
  MORNING: 'सुबह',
  NIGHT: 'रात',
  FRIEND: 'दोस्त',
  FAMILY: 'परिवार',
  DOCTOR: 'डॉक्टर',
  HOSPITAL: 'अस्पताल',
  WORK: 'काम',
  SCHOOL: 'स्कूल',
  TIME: 'समय',
  WAIT: 'रुकिए',
  STOP: 'बंद कीजिए',
  GO: 'जाइए',
  COME: 'आइए',
  UNDERSTAND: 'समझ',
  WANT: 'चाहिए',
  LOVE: 'प्यार',
};

/**
 * Deterministic rule-based gloss-to-natural-sentence builder supporting English and Hindi,
 * conditioned on non-manual facial grammar tags.
 */
export function glossToSentenceRuleBased(
  glosses: string[],
  grammar: FacialGrammarTag = 'NEUTRAL',
  language: SpokenLanguageCode = 'en-IN'
): string {
  if (!glosses || glosses.length === 0) return '';
  const cleaned = glosses.map((g) => g.toUpperCase());
  const isHindi = language === 'hi-IN';

  // Common high-frequency conversational idioms first
  const joined = cleaned.join(' ');
  if (isHindi) {
    if (joined === 'YOU NAME WHAT') return 'आपका नाम क्या है?';
    if (joined === 'ME WATER WANT' || joined === 'WATER PLEASE') return 'कृपया मुझे पानी चाहिए।';
    if (joined === 'ME HELP WANT' || joined === 'PLEASE HELP') return 'कृपया मेरी मदद कीजिए।';
    if (joined === 'YOU GOOD' && grammar === 'POLAR_QUESTION') return 'क्या आप ठीक हैं?';
    if (joined === 'ME UNDERSTAND' && grammar === 'NEGATION') return 'मैं समझ नहीं पाया।';

    const words = cleaned.map((g) => GLOSS_TO_HI[g] ?? g.toLowerCase());
    let sentence = words.join(' ');
    if (grammar === 'NEGATION' && !cleaned.includes('NO')) {
      sentence = `${sentence} नहीं`;
    }
    if (grammar === 'POLAR_QUESTION') {
      sentence = `क्या ${sentence}?`;
    } else if (grammar === 'WH_QUESTION') {
      sentence = `${sentence}?`;
    } else {
      sentence = `${sentence}।`;
    }
    return sentence;
  }

  // English naturalization rules
  if (joined === 'YOU NAME WHAT') return 'What is your name?';
  if (joined === 'GOOD MORNING') return 'Good morning.';
  if (joined === 'GOOD NIGHT') return 'Good night.';
  if (joined === 'ME WATER WANT') {
    if (grammar === 'NEGATION') return 'I do not want water.';
    if (grammar === 'POLAR_QUESTION') return 'Do I need water?';
    return 'I want water.';
  }
  if (joined === 'ME FOOD WANT') {
    return grammar === 'NEGATION' ? 'I do not want food.' : 'I want food.';
  }
  if (joined === 'ME HELP WANT' || joined === 'HELP ME' || joined === 'PLEASE HELP') {
    return grammar === 'POLAR_QUESTION' ? 'Can you help me?' : 'Please help me.';
  }
  if (joined === 'HOSPITAL WHERE') return 'Where is the hospital?';
  if (joined === 'HOME WHERE') return 'Where is home?';
  if (joined === 'YOU GOOD' && grammar === 'POLAR_QUESTION') return 'Are you good?';
  if (joined === 'YOU UNDERSTAND' && grammar === 'POLAR_QUESTION') return 'Do you understand?';
  if (joined === 'ME UNDERSTAND' && grammar === 'NEGATION') return 'I do not understand.';
  if (joined === 'ME GO HOME') {
    return grammar === 'NEGATION' ? 'I am not going home.' : 'I am going home.';
  }

  // General rule-based grammar assembly
  const whToken = cleaned.find((g) => WH_GLOSSES.has(g));
  const nonWh = cleaned.filter((g) => !WH_GLOSSES.has(g) && g !== 'NO');
  const hasExplicitNo = cleaned.includes('NO');

  const mappedWords = nonWh.map((g, idx) => {
    if (g === 'ME') return idx === 0 ? 'I' : 'me';
    return GLOSS_TO_EN[g] ?? g.toLowerCase();
  });

  let sentence = mappedWords.join(' ').trim();

  if (grammar === 'NEGATION' || hasExplicitNo) {
    if (!sentence) {
      sentence = 'No';
    } else if (sentence.startsWith('I ')) {
      sentence = sentence.replace(/^I /, 'I do not ');
    } else if (sentence.startsWith('you ')) {
      sentence = sentence.replace(/^you /, 'You do not ');
    } else {
      sentence = `Not ${sentence}`;
    }
    return capitalizeFirst(sentence) + '.';
  }

  if (grammar === 'WH_QUESTION' || whToken) {
    const whWord = whToken ? GLOSS_TO_EN[whToken] ?? whToken.toLowerCase() : 'what';
    if (!sentence) {
      return capitalizeFirst(whWord) + '?';
    }
    return `${capitalizeFirst(whWord)} is ${sentence}?`;
  }

  if (grammar === 'POLAR_QUESTION') {
    if (!sentence) return 'Yes or no?';
    if (sentence.startsWith('you ')) {
      return `Do ${sentence}?`;
    }
    return `Is ${sentence}?`;
  }

  if (!sentence) return '';
  return capitalizeFirst(sentence) + '.';
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Optional natural-sentence refinement hook.
 * If an optional server-side proxy URL (VITE_GLOSS_REFINER_ENDPOINT) is configured,
 * sends the gloss sequence and facial grammar tag for refinement, with instant
 * fallback to the deterministic client-side rule-based engine.
 */
export async function refineGlossToSentence(
  glosses: string[],
  grammar: FacialGrammarTag,
  language: SpokenLanguageCode
): Promise<{ sentence: string; source: 'rule-based' | 'api' }> {
  const fallback = glossToSentenceRuleBased(glosses, grammar, language);
  const endpoint =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_GLOSS_REFINER_ENDPOINT as string | undefined)
      : undefined;

  if (!endpoint || glosses.length === 0) {
    return { sentence: fallback, source: 'rule-based' };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glosses, grammar, language }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { sentence: fallback, source: 'rule-based' };
    const data = (await res.json()) as { sentence?: string };
    if (data.sentence && data.sentence.trim()) {
      return { sentence: data.sentence.trim(), source: 'api' };
    }
  } catch {
    // Transparent fallback for static / offline usage
  }

  return { sentence: fallback, source: 'rule-based' };
}

/**
 * Compute standard Word Error Rate (WER) via Levenshtein edit distance at the word level:
 * WER = (Substitutions + Deletions + Insertions) / ReferenceWordCount
 */
export function computeWER(reference: string, hypothesis: string): WERResult {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[.,!?;:"'()।]/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);

  if (ref.length === 0) {
    return {
      wer: hyp.length === 0 ? 0 : 1,
      substitutions: 0,
      deletions: 0,
      insertions: hyp.length,
      refWords: 0,
      hypWords: hyp.length,
    };
  }

  const m = ref.length;
  const n = hyp.length;

  // dp[i][j] holds edit cost; ops tracks [sub, del, ins]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const sub: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const del: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const ins: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    dp[i][0] = i;
    del[i][0] = i;
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = j;
    ins[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
        sub[i][j] = sub[i - 1][j - 1];
        del[i][j] = del[i - 1][j - 1];
        ins[i][j] = ins[i - 1][j - 1];
      } else {
        const cSub = dp[i - 1][j - 1] + 1;
        const cDel = dp[i - 1][j] + 1;
        const cIns = dp[i][j - 1] + 1;

        if (cSub <= cDel && cSub <= cIns) {
          dp[i][j] = cSub;
          sub[i][j] = sub[i - 1][j - 1] + 1;
          del[i][j] = del[i - 1][j - 1];
          ins[i][j] = ins[i - 1][j - 1];
        } else if (cDel <= cIns) {
          dp[i][j] = cDel;
          sub[i][j] = sub[i - 1][j];
          del[i][j] = del[i - 1][j] + 1;
          ins[i][j] = ins[i - 1][j];
        } else {
          dp[i][j] = cIns;
          sub[i][j] = sub[i][j - 1];
          del[i][j] = del[i][j - 1];
          ins[i][j] = ins[i][j - 1] + 1;
        }
      }
    }
  }

  return {
    wer: Number((dp[m][n] / m).toFixed(4)),
    substitutions: sub[m][n],
    deletions: del[m][n],
    insertions: ins[m][n],
    refWords: m,
    hypWords: n,
  };
}
