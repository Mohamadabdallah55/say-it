export type GamePhase =
  | 'LOBBY'
  | 'BOARD'
  | 'LIFELINE_PICK'
  | 'QUESTION_READY'
  | 'PLAYING'
  | 'TIME_UP'
  | 'REVEAL'
  | 'AWARD'
  | 'FINAL';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type PointValue = 200 | 300 | 400 | 500 | 600;
export type AgeGroup = 'kids_8_12' | 'teens_13_16' | 'adults' | 'mixed';
export type CardStatus = 'approved' | 'needs_review' | 'rejected';
export type ClientRole = 'host' | 'projector' | 'buzzer';
export type CommentaryMode = 'full' | 'light' | 'off';

export type QuestionType =
  | 'direct_qa'
  | 'complete'
  | 'true_false_explain'
  | 'who_am_i'
  | 'order_steps'
  | 'spot_error'
  | 'connect_two'
  | 'buzzer_challenge'
  | 'analysis_reasoning'
  | 'multiple_choice'
  | 'pantomime_optional';

export type LifelineType =
  | 'silence'
  | 'show_cards'
  | 'hint'
  | 'double_points'
  | 'pit'
  | 'second_chance'
  | 'two_answers'
  | 'swap_question'
  | 'buzzer_challenge';

export type CategoryIconKey =
  | 'general'
  | 'science'
  | 'history'
  | 'arabic'
  | 'puzzles'
  | 'sports'
  | 'islamic'
  | 'pdf'
  | 'skills'
  | 'geography'
  | 'tech'
  | 'price_tag'
  | 'rashidun'
  | 'jordan_logos'
  | 'world_cup_2026'
  | 'palestinian_proverbs'
  | 'visual_memory'
  | 'silent_acting';

export type QuestionImageDisplay = 'before_reveal' | 'after_reveal';

export interface PageRange {
  startPage: number;
  endPage: number;
}

export interface DeckCategory {
  availableDifficulties?: Difficulty[];
  topicCoverage?: string[];
  coveredSubtopics?: string[];
  pageRange?: PageRange;
  id: string;
  name: string;
  description?: string;
  iconKey: CategoryIconKey;
  accentColor: string;
  isVip?: boolean;
  isActive?: boolean;
  isCustom?: boolean;
  order?: number;
}

export interface CategoryProgressRecord {
  userId: string;
  categoryId: string;
  playedQuestionIds: string[];
  cycleCount: number;
  totalAnsweredAllTime: number;
  lastPlayedAt?: string | null;
  lastResetAt?: string | null;
}

export interface CategoryConsumptionStats {
  categoryId: string;
  totalCount: number;
  playedCount: number;
  remainingCount: number;
  percent: number;
  cycleCount: number;
  isExhausted: boolean;
}

export interface ExtractedPdfVisual {
  id: string;
  pageNumber: number;
  sourceFileName?: string;
  sourcePageNumber?: number;
  isStandaloneImage?: boolean;
  boundingBox: [number, number, number, number];
  caption: string;
  visualType?: string;
  imageBase64: string;
  width?: number;
  height?: number;
}

export interface QuizQuestion {
  id: string;
  categoryId: string;
  categoryName: string;
  difficulty: Difficulty;
  points: PointValue;
  questionType: QuestionType;
  prompt: string;
  startingLetter?: string;
  answer: string;
  acceptableAnswers?: string[];
  options?: string[];
  correctOptionIndex?: number;
  orderItems?: string[];
  correctOrder?: string[];
  hint?: string;
  explanation?: string;
  imageUrl?: string;
  previewImageUrl?: string;
  imageBase64?: string;
  imageCaption?: string;
  beforeImageUrls?: string[];
  afterImageUrl?: string;
  showSeconds?: number;
  memorySceneId?: string;
  memorySecondImageUrl?: string;
  imageDisplay?: QuestionImageDisplay;
  imageSourceUrl?: string;
  answerImageUrl?: string;
  audioUrl?: string;
  audioUrls?: string[];
  audioMode?: 'solo' | 'mix';
  answerAudioUrl?: string;
  videoUrl?: string;
  timeLimitSeconds?: number;
  subtopic?: string;
  teamIndex?: number;
  sourceRef?: string;
  sourceSnippet?: string;
  sourceFileName?: string;
  pageNumber?: number;
  verificationStatus?: 'verified' | 'unverified';
  isBackup?: boolean;
  isSensitiveReligious?: boolean;
  status: CardStatus;
  rejectionReason?: string;
  regeneratedCount?: number;
}

export interface SuggestedCategoryOutline {
  name: string;
  description: string;
  iconKey: CategoryIconKey;
  topicCoverage: string[];
  coveredSubtopics?: string[];
  pageRange?: PageRange;
  hasHypotheticalData?: boolean;
}

export interface CoverageValidationReport {
  totalPages: number;
  readablePages: number;
  coveredPageCount: number;
  pageCoveragePercent: number;
  totalSubtopics: number;
  coveredSubtopicsCount: number;
  subtopicCoveragePercent: number;
  uncoveredPages: number[];
  isFullCoverage: boolean;
  summary: string;
}

export interface SourceFileSummary {
  fileName: string;
  fileType: 'pdf' | 'image';
  fileHash: string;
  totalPages: number;
  readablePages: number;
  scannedPagesCount?: number;
}

export interface PdfAnalysisReport {
  fileName: string;
  fileHash: string;
  totalPages: number;
  readablePages: number;
  sourceFiles?: SourceFileSummary[];
  title: string;
  subjectDomain: string;
  mainTopics: string[];
  subTopics: string[];
  facts: string[];
  conceptsAndTerms: string[];
  causesAndEffects: string[];
  peopleAndEvents: string[];
  relationshipsAndConclusions: string[];
  educationalObjectives: string[];
  isReligiousContent: boolean;
  summary: string;
  warnings: string[];
  hypotheticalSections?: string[];
  suggestedCategories?: SuggestedCategoryOutline[];
  extractedVisuals?: ExtractedPdfVisual[];
  extractionMethod?: 'gemini_pdf' | 'pdf_parse' | 'ollama_pymupdf' | 'ollama_vision' | 'local_hybrid';
}

export interface BoardPlanCategory {
  id: string;
  name: string;
  description: string;
  iconKey: CategoryIconKey;
  accentColor: string;
  teamIndex?: number;
  pageRange?: PageRange;
  coveredSubtopics?: string[];
  subtopic200?: string;
  subtopic400?: string;
  subtopic600?: string;
  estimatedMaxQuestions: number;
  supportsEasy200: boolean;
  supportsMedium400: boolean;
  supportsHard600: boolean;
  sample200: string;
  sample400: string;
  sample600: string;
  topicCoverage: string[];
  capacityNote?: string;
  pantomimeSuitable: boolean;
}

export interface BoardPlanPreview {
  fileHash: string;
  title: string;
  boardMode?: 'categories' | 'team_bundles' | 'category_team_matrix';
  teamCount?: number;
  selectedDifficulties?: Difficulty[];
  recommendedCategoryCount: number;
  categories: BoardPlanCategory[];
  canBuildFull15Board: boolean;
  coverageReport?: CoverageValidationReport;
  warnings: string[];
  suggestedQuestionTypes: QuestionType[];
}

export interface RejectedQuestionLog {
  id: string;
  prompt: string;
  reason: string;
  categoryName: string;
}

export interface QuizDeck {
  schemaVersion: 2;
  id: string;
  title: string;
  description: string;
  sourceType: 'starter' | 'curated' | 'pdf' | 'imported';
  boardMode?: 'categories' | 'team_bundles' | 'category_team_matrix';
  teamCount?: number;
  selectedDifficulties?: Difficulty[];
  ageGroup: AgeGroup;
  createdAt: string;
  updatedAt: string;
  categories: DeckCategory[];
  questions: QuizQuestion[];
  pdfAnalysis?: PdfAnalysisReport;
  boardPlan?: BoardPlanPreview;
  rejectedLog?: RejectedQuestionLog[];
}

export interface TeamState {
  id: string;
  name: string;
  color: string;
  score: number;
  participantsCount: number;
  correctCount: number;
  lifelinesRemaining: number;
  usedLifelines: LifelineType[];
}

export interface ScoreHistoryEntry {
  ownerTeamId?: string;
  lifeline?: LifelineType | null;
  scoreChanges?: Record<string, number>;
  questionId?: string;
  id: string;
  actionId: string;
  roundId?: string;
  teamId: string | null;
  teamIds?: string[];
  delta: number;
  reason: string;
  timestamp: string;
  undone?: boolean;
}

export interface MatchSettings {
  countUp?: boolean;
  cards?: LifelineType[];
  categoryCount: number;
  timerSeconds: number;
  lifelinesEnabled: boolean;
  maxLifelinesPerTeam: number;
  buzzerMode: boolean;
  allowMultiTeamAward: boolean;
  commentaryMode: CommentaryMode;
  soundEnabled: boolean;
  reducedMotion: boolean;
}

export interface BoardTileState {
  ownerTeamId?: string;
  questionId: string;
  categoryId: string;
  difficulty: Difficulty;
  points: PointValue;
  used: boolean;
  wonByTeamId: string | null;
  wonByTeamIds?: string[];
  skipped?: boolean;
}

export interface TimerState {
  elapsedMs?: number;
  durationSeconds: number;
  remainingMs: number;
  running: boolean;
  startedAtMs: number | null;
  secondChanceGranted: boolean;
}

export interface BuzzerPress {
  teamId: string;
  teamName: string;
  teamColor: string;
  pressedAtMs: number;
}

export interface OrderPlay {
  teamId: string;
  attempts: number[][];
  turns: number;
  winner?: string | null;
}

export interface ActiveRound {
  ownerTeamId?: string;
  orderPlay?: OrderPlay;
  roundId: string;
  question: QuizQuestion;
  basePoints: PointValue;
  effectivePoints: number;
  activeLifeline: LifelineType | null;
  hintRevealed: boolean;
  twoAnswersActive: boolean;
  buzzerOpen: boolean;
  buzzerQueue: BuzzerPress[];
  answered: boolean;
  winningTeamIds: string[];
  awardedDelta: number;
  isCorrectionMode: boolean;
  swappedFromQuestionId?: string;
  memoryStage?: 'MEMORIZE' | 'QUESTION';
  memorizeDurationSeconds?: number;
  memorizeEndsAtMs?: number | null;
  actingToken?: string;
  actingClaimed?: boolean;
  actingCheatAttempts?: number;
}

export interface CommentaryItem {
  id: string;
  eventType: string;
  text: string;
  timestamp: string;
}

export interface PreflightCheckItem {
  id: string;
  label: string;
  passed: boolean;
  severity: 'error' | 'warning';
  detail?: string;
}

export interface PreflightResult {
  canStart: boolean;
  checks: PreflightCheckItem[];
  blockers: string[];
  warnings: string[];
}

export interface RoomState {
  playedProphetQuestionIds?: string[];
  playedRotatingQuestionIds?: Record<string, string[]>;
  lastPlayedMemorySceneId?: string | null;
  playedCuratedQuestionIds?: string[];
  libraryId?: string;
  lastAward?: { at: number; changes: Record<string, number>; corrected?: boolean };
  matchEndsAt?: number;
  parkedRounds?: Record<string, { round: ActiveRound; timer: TimerState; phase: GamePhase }>;
  schemaVersion: 2;
  roomCode: string;
  hostToken: string;
  buzzerToken: string;
  deckId: string;
  deckTitle: string;
  boardMode?: 'categories' | 'team_bundles' | 'category_team_matrix';
  phase: GamePhase;
  settings: MatchSettings;
  categories: DeckCategory[];
  boardTiles: BoardTileState[];
  questionPool: QuizQuestion[];
  teams: TeamState[];
  currentTurnTeamIndex: number;
  questionCounter: number;
  totalQuestions: number;
  activeRound: ActiveRound | null;
  timer: TimerState;
  scoreHistory: ScoreHistoryEntry[];
  processedActionIds: string[];
  commentary: CommentaryItem | null;
  recentCommentaryTexts: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedActiveRound {
  ownerTeamId?: string;
  orderPlay?: OrderPlay;
  roundId: string;
  questionId: string;
  categoryId: string;
  categoryName: string;
  subtopic?: string;
  difficulty: Difficulty;
  points: PointValue;
  questionType: QuestionType;
  prompt: string;
  startingLetter?: string;
  options?: string[];
  orderItems?: string[];
  hint?: string;
  answer?: string;
  acceptableAnswers?: string[];
  explanation?: string;
  imageUrl?: string;
  imageBase64?: string;
  imageCaption?: string;
  memorySecondImageUrl?: string;
  beforeImageUrls?: string[];
  afterImageUrl?: string;
  imageDisplay?: QuestionImageDisplay;
  imageSourceUrl?: string;
  answerImageUrl?: string;
  audioUrl?: string;
  audioUrls?: string[];
  audioMode?: 'solo' | 'mix';
  answerAudioUrl?: string;
  videoUrl?: string;
  sourceRef?: string;
  pageNumber?: number;
  basePoints: PointValue;
  effectivePoints: number;
  activeLifeline: LifelineType | null;
  hintRevealed: boolean;
  twoAnswersActive: boolean;
  buzzerOpen: boolean;
  buzzerQueue: BuzzerPress[];
  answered: boolean;
  winningTeamIds: string[];
  awardedDelta: number;
  isCorrectionMode: boolean;
  memoryStage?: 'MEMORIZE' | 'QUESTION';
  memorizeDurationSeconds?: number;
  memorizeEndsAtMs?: number | null;
  actingToken?: string;
  actingClaimed?: boolean;
  actingCheatAttempts?: number;
}

export interface PublicProjectorState {
  lastAward?: { at: number; changes: Record<string, number>; corrected?: boolean };
  matchEndsAt?: number;
  schemaVersion: 2;
  role: 'projector';
  roomCode: string;
  deckId: string;
  deckTitle: string;
  boardMode?: 'categories' | 'team_bundles' | 'category_team_matrix';
  phase: GamePhase;
  settings: MatchSettings;
  categories: DeckCategory[];
  boardTiles: BoardTileState[];
  teams: TeamState[];
  currentTurnTeamIndex: number;
  questionCounter: number;
  totalQuestions: number;
  activeRound: SanitizedActiveRound | null;
  timer: TimerState;
  commentary: CommentaryItem | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuzzerViewState {
  schemaVersion: 2;
  role: 'buzzer';
  roomCode: string;
  deckTitle: string;
  phase: GamePhase;
  teams: Array<{ id: string; name: string; color: string; score: number }>;
  currentTurnTeamIndex: number;
  questionCounter: number;
  activeRound: {
    roundId: string;
    categoryName: string;
    points: PointValue;
    questionType: QuestionType;
    prompt: string;
    exclusiveTeamId?: string;
    buzzerOpen: boolean;
    buzzerQueue: BuzzerPress[];
  } | null;
  timer: TimerState;
}

export interface HostViewState extends Omit<RoomState, 'hostToken' | 'buzzerToken' | 'processedActionIds'> {
  role: 'host';
  hasBackupQuestionsForActiveCategory: boolean;
}
