import { SILENT_ACTING_CATEGORY } from '../src/game/curatedBanks';
import { difficultyForPoints, pointsForDifficulty } from '../src/game/pdfValidation';
import type { QuizQuestion } from '../src/game/types';
import rows from './silentActing.json';

export const SILENT_ACTING_QUESTIONS: QuizQuestion[] = rows.map((row) => {
  const difficulty = difficultyForPoints(row.level);
  const words = row.answer.trim().split(/\s+/).filter(Boolean).length;
  const wordLabel = words === 1 ? 'كلمة واحدة' : words === 2 ? 'كلمتان' : `${words} كلمات`;
  return {
    id: row.id,
    categoryId: SILENT_ACTING_CATEGORY.id,
    categoryName: SILENT_ACTING_CATEGORY.name,
    difficulty,
    points: pointsForDifficulty(difficulty),
    questionType: 'direct_qa',
    subtopic: row.subtopic,
    prompt: `تحدّي التمثيل الصامت (${wordLabel}): يمسح الممثّل رمز QR بهاتفه فقط لمعرفة المطلوب وتمثيله بدون كلام.`,
    answer: row.answer,
    hint: row.hint,
    explanation: row.explanation,
    status: 'approved',
    isBackup: false,
  };
});
