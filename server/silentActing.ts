import { SILENT_ACTING_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './silentActing.json';

export const SILENT_ACTING_PROMPT_PREFIX = 'بطاقة تمثيل صامت';

export const SILENT_ACTING_QUESTIONS: QuizQuestion[] = rows.map((row) => {
  const difficulty = difficultyForPoints(row.points);
  const wordCount = row.phrase.trim().split(/\s+/).filter(Boolean).length;
  const wordLabel =
    wordCount === 2 ? 'كلمتين' : wordCount <= 10 ? `${wordCount} كلمات` : `${wordCount} كلمة`;
  const cardCode = row.id.replace('ACT-', '#');
  return {
    id: row.id,
    categoryId: SILENT_ACTING_CATEGORY.id,
    categoryName: SILENT_ACTING_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    prompt: `${SILENT_ACTING_PROMPT_PREFIX} (${cardCode}) • ${row.kind} من ${wordLabel} — امسح رمز QR من هاتف الممثّل فقط`,
    answer: row.phrase,
    subtopic: `${row.kind} • ${wordCount === 2 ? 'كلمتان' : wordLabel}`,
    explanation: row.actingTip,
    timeLimitSeconds: row.points >= 600 ? 75 : row.points >= 400 ? 60 : 45,
    verificationStatus: 'verified',
    status: 'approved',
  };
});
