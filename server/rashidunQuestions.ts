import { difficultyForPoints } from '../src/game/pdfValidation';
import { RASHIDUN_CATEGORY } from '../src/game/rashidun';
import type { PointValue, QuizQuestion } from '../src/game/types';
import rows from './rashidunQuestions.json';

export interface RashidunQuestionRow {
  id: string;
  number: number;
  score: number;
  topic: string;
  question: string;
  answer: string;
  explanation: string;
  caliph: string;
  source_url: string;
  type: string;
}

const typedRows = rows as RashidunQuestionRow[];

export const RASHIDUN_QUESTIONS: QuizQuestion[] = typedRows.map((row) => {
  const points = (row.score === 200 || row.score === 400 || row.score === 600
    ? row.score
    : 400) as PointValue;

  return {
    id: row.id,
    categoryId: RASHIDUN_CATEGORY.id,
    categoryName: RASHIDUN_CATEGORY.name,
    questionType: 'direct_qa',
    difficulty: difficultyForPoints(points),
    points,
    prompt: row.question,
    answer: row.answer,
    subtopic: row.topic,
    explanation: `${row.explanation} · الخليفة المعني: ${row.caliph}`,
    sourceRef: `${row.caliph} · ${row.source_url}`,
    isSensitiveReligious: true,
    verificationStatus: 'verified',
    status: 'approved',
  };
});
