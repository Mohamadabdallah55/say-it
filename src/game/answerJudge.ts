export const JUDGE_PASS_THRESHOLD = 80;

export interface JudgeTeamInput {
  teamId: string;
  teamName: string;
  isTurnOwner: boolean;
  answer: string;
}

export interface JudgeTeamEvaluation extends JudgeTeamInput {
  completeness: number;
  passed: boolean;
  reason: string;
}

export interface JudgeVerdict {
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  winnerIsTurnOwner: boolean;
  threshold: number;
  summary: string;
  teamResults: JudgeTeamEvaluation[];
}

const ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeArabicForJudge(raw: string): string {
  let text = (raw || '').trim().toLowerCase();
  if (!text) return '';

  text = text.replace(ARABIC_DIACRITICS_RE, '');
  text = text.replace(/[٠-٩]/g, (ch) => String(EASTERN_DIGITS.indexOf(ch)));
  text = text
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function tokenizeArabic(normalized: string): string[] {
  if (!normalized) return [];
  return normalized
    .split(/\s+/)
    .map((tok) => (tok.length > 3 && tok.startsWith('ال') ? tok.slice(2) : tok))
    .filter(Boolean);
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function scoreSingleReference(candidateRaw: string, referenceRaw: string): number {
  const candNorm = normalizeArabicForJudge(candidateRaw);
  const refNorm = normalizeArabicForJudge(referenceRaw);
  if (!candNorm || !refNorm) return 0;
  if (candNorm === refNorm) return 100;

  const candTokens = tokenizeArabic(candNorm);
  const refTokens = tokenizeArabic(refNorm);
  if (candTokens.length === 0 || refTokens.length === 0) return 0;

  if (candTokens.join(' ') === refTokens.join(' ')) return 100;

  // Token match ratio (exact or near-exact per token)
  let matchedRefWeight = 0;
  for (const refTok of refTokens) {
    let bestTokenSim = 0;
    for (const candTok of candTokens) {
      if (candTok === refTok) {
        bestTokenSim = 1;
        break;
      }
      const maxLen = Math.max(candTok.length, refTok.length);
      if (maxLen >= 4) {
        const dist = levenshteinDistance(candTok, refTok);
        const sim = Math.max(0, 1 - dist / maxLen);
        if (sim >= 0.75 && sim > bestTokenSim) {
          bestTokenSim = sim;
        }
      }
    }
    matchedRefWeight += bestTokenSim;
  }

  const coverage = matchedRefWeight / refTokens.length;
  const maxStrLen = Math.max(candNorm.length, refNorm.length);
  const charSim = maxStrLen > 0 ? Math.max(0, 1 - levenshteinDistance(candNorm, refNorm) / maxStrLen) : 0;

  // Penalize noisy extra wrong tokens gently if candidate is much longer than reference
  const precisionRatio = Math.min(1, refTokens.length / Math.max(candTokens.length, 1));
  const combined =
    refTokens.length === 1
      ? Math.max(charSim, coverage * (0.7 + 0.3 * precisionRatio))
      : coverage * (0.85 + 0.15 * precisionRatio) * 0.78 + charSim * 0.22;

  return Math.max(0, Math.min(100, Math.round(combined * 100)));
}

export function scoreArabicAnswerCompleteness(
  candidate: string,
  expectedAnswer: string,
  acceptableAnswers?: string[],
): number {
  const references = [expectedAnswer, ...(acceptableAnswers || [])]
    .flatMap((entry) => entry.split(/\s*[\/|،]\s*|\s+أو\s+/))
    .map((s) => s.trim())
    .filter(Boolean);

  if (references.length === 0) return 0;

  let best = scoreSingleReference(candidate, expectedAnswer);
  for (const ref of references) {
    const score = scoreSingleReference(candidate, ref);
    if (score > best) best = score;
  }
  return best;
}

export function resolveTurnOwnerPriorityVerdict(
  evaluations: Array<{
    teamId: string;
    teamName: string;
    isTurnOwner: boolean;
    answer: string;
    completeness: number;
    reason?: string;
  }>,
): JudgeVerdict {
  const normalizedResults: JudgeTeamEvaluation[] = evaluations.map((entry) => {
    const completeness = Math.max(0, Math.min(100, Math.round(entry.completeness)));
    const passed = Boolean(entry.answer.trim()) && completeness > JUDGE_PASS_THRESHOLD;
    const defaultReason = !entry.answer.trim()
      ? 'لم يُقدّم الفريق إجابة.'
      : passed
        ? `تجاوز حد القبول (${completeness}% > ${JUDGE_PASS_THRESHOLD}%).`
        : `لم يصل إلى الحد المطلوب فوق ${JUDGE_PASS_THRESHOLD}% (${completeness}%).`;
    return {
      teamId: entry.teamId,
      teamName: entry.teamName,
      isTurnOwner: entry.isTurnOwner,
      answer: entry.answer.trim(),
      completeness,
      passed,
      reason: entry.reason?.trim() || defaultReason,
    };
  });

  const turnOwner = normalizedResults.find((item) => item.isTurnOwner);
  if (turnOwner && turnOwner.passed) {
    return {
      winnerTeamId: turnOwner.teamId,
      winnerTeamName: turnOwner.teamName,
      winnerIsTurnOwner: true,
      threshold: JUDGE_PASS_THRESHOLD,
      summary: `يفوز «${turnOwner.teamName}» (صاحب الدور) بنسبة اكتمال ${turnOwner.completeness}% وله الأولوية لتجاوزه حد ${JUDGE_PASS_THRESHOLD}% بنجاح`,
      teamResults: normalizedResults,
    };
  }

  const stealingWinners = normalizedResults
    .filter((item) => !item.isTurnOwner && item.passed)
    .sort((a, b) => b.completeness - a.completeness);

  if (stealingWinners.length > 0) {
    const bestStealer = stealingWinners[0];
    return {
      winnerTeamId: bestStealer.teamId,
      winnerTeamName: bestStealer.teamName,
      winnerIsTurnOwner: false,
      threshold: JUDGE_PASS_THRESHOLD,
      summary: `تنجح السرقة ويفوز «${bestStealer.teamName}» بنسبة اكتمال ${bestStealer.completeness}% بعد بقاء صاحب الدور دون حد ${JUDGE_PASS_THRESHOLD}%`,
      teamResults: normalizedResults,
    };
  }

  return {
    winnerTeamId: null,
    winnerTeamName: null,
    winnerIsTurnOwner: false,
    threshold: JUDGE_PASS_THRESHOLD,
    summary: `لم تتجاوز أي إجابة حد الاكتمال المطلوب (أكثر من ${JUDGE_PASS_THRESHOLD}%)، لذا لا يحصل أي فريق على النقاط`,
    teamResults: normalizedResults,
  };
}

export function evaluateAnswersLocally(params: {
  teams: JudgeTeamInput[];
  expectedAnswer: string;
  acceptableAnswers?: string[];
}): JudgeVerdict {
  const evaluated = params.teams.map((team) => {
    const completeness = team.answer.trim()
      ? scoreArabicAnswerCompleteness(team.answer, params.expectedAnswer, params.acceptableAnswers)
      : 0;
    return {
      ...team,
      completeness,
    };
  });
  return resolveTurnOwnerPriorityVerdict(evaluated);
}
