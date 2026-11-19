import { useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  Crown,
  FileText,
  FolderArchive,
  Play,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { soundFX } from '../utils/sound';
import { GameLogo } from './GameLogo';
import { TopNavHeader } from './TopNavHeader';

interface TitleScreenProps {
  onStartQuick: () => void;
  onOpenPdfStudio: () => void;
  onOpenLibrary: () => void;
  onOpenSavedMatches: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

const SHOWCASE_SAMPLES = [
  {
    category: 'رياضة',
    prompt: 'كم عدد لاعبي الفريق الواحد داخل ملعب كرة القدم؟',
    answer: '11 لاعبًا',
  },
  {
    category: 'التاريخ الإسلامي',
    prompt: 'في أي سنة هجرية وقع صلح الحديبية بين المسلمين وقريش؟',
    answer: 'السنة السادسة للهجرة',
  },
  {
    category: 'علوم',
    prompt: 'ما الغاز الذي تمتصه النباتات للقيام بعملية البناء الضوئي؟',
    answer: 'ثاني أكسيد الكربون',
  },
];

export function TitleScreen({
  onStartQuick,
  onOpenPdfStudio,
  onOpenLibrary,
  onOpenSavedMatches,
  soundEnabled,
  onToggleSound,
}: TitleScreenProps) {
  const [sampleIdx, setSampleIdx] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(true);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  const currentSample = SHOWCASE_SAMPLES[sampleIdx];

  const handleToggleSampleAnswer = () => {
    soundFX.playReveal();
    setAnswerRevealed((prev) => !prev);
  };

  const handleNextSample = () => {
    soundFX.playClick();
    setSampleIdx((prev) => (prev + 1) % SHOWCASE_SAMPLES.length);
    setAnswerRevealed(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#240E35] flex flex-col justify-between">
      {/* Unified Dark Plum Top Navbar */}
      <TopNavHeader
        activePage="title"
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onHome={() => {}}
        onStartQuick={onStartQuick}
        onOpenPdfStudio={onOpenPdfStudio}
        onOpenLibrary={onOpenLibrary}
        onOpenSavedMatches={onOpenSavedMatches}
      />

      {/* Expanded Golden Halftone Banner + Bottom Mode Switcher */}
      <div className="flex-1 flex flex-col items-center justify-between px-2.5 sm:px-4 lg:px-6 py-2.5 sm:py-4 gap-3.5">
        <div className="w-full max-w-[1520px] flex-1 flex flex-col justify-between hero-halftone-stage border-[3px] border-[#1F112E] rounded-[28px] shadow-[0_8px_0_#12061D] p-5 sm:p-8 lg:px-12 lg:py-9">
          {/* Clean Top Corner Control inside Banner (matching reference screenshot) */}
          <div className="flex items-center justify-start mb-3">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onOpenLibrary();
              }}
              className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-4 py-1.5 rounded-xl font-display font-black text-xs sm:text-sm whitespace-nowrap cursor-pointer"
            >
              أسئلة وفرق
            </button>
          </div>

          {/* 2-Column Hero Split */}
          <main className="my-auto grid grid-cols-1 lg:grid-cols-12 items-center gap-8 lg:gap-12 py-2 sm:py-4">
            {/* RTL Right Column: Mascot Logo + Tagline + Exact Two Buttons */}
            <div className="lg:col-span-6 flex flex-col items-center text-center space-y-6">
              <motion.div
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="w-full flex justify-center"
              >
                <GameLogo size="lg" variant="hero" className="lg:!w-[min(90vw,520px)]" />
              </motion.div>

              <h1 className="font-display font-black text-xl sm:text-2xl md:text-[30px] text-[#1F112E] leading-snug">
                فرق، وفئات، ومنافسة على شاشة واحدة.
              </h1>

              <div className="flex flex-wrap items-center justify-center gap-3.5 w-full max-w-md pt-1">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    onStartQuick();
                  }}
                  className="game-btn-purple flex-1 min-w-[175px] font-display font-black text-lg sm:text-xl py-3.5 px-7 rounded-2xl flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer"
                >
                  <span>ابدأ اللعب</span>
                  <Play className="w-4 h-4 fill-current rotate-180" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setShowHowToPlay(true);
                  }}
                  className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] font-display font-black text-base sm:text-lg py-3.5 px-6 rounded-2xl whitespace-nowrap cursor-pointer"
                >
                  كيف تلعب؟
                </button>
              </div>
            </div>

            {/* RTL Left Column: Scoreboard Strip + Tilted Question Showcase Card */}
            <div className="lg:col-span-6 flex flex-col items-center justify-center gap-6">
              {/* Sample Team Score Pills */}
              <div className="flex flex-wrap items-center justify-center gap-3.5 w-full">
                <div className="bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-4 py-2 shadow-[0_4px_0_#1F112E] flex items-center gap-3 text-sm sm:text-base font-black text-[#1F112E]">
                  <span className="flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-[#63349B]" />
                    <span>ملك التشخيص</span>
                  </span>
                  <span className="font-display text-base sm:text-lg tabular-nums text-[#63349B]">300</span>
                </div>

                <div className="relative bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-4 py-2 shadow-[0_4px_0_#1F112E] flex items-center gap-3 text-sm sm:text-base font-black text-[#1F112E]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-[#F05B63] border border-[#1F112E] inline-block" />
                    <span>خليها ع الله</span>
                  </span>
                  <span className="font-display text-base sm:text-lg tabular-nums text-[#1F112E]">250</span>
                  <span
                    aria-hidden="true"
                    className="hidden sm:grid place-items-center w-7 h-7 rounded-full bg-[#63349B] text-white border-2 border-[#1F112E] font-display font-black text-sm shadow-[0_2px_0_#1F112E] -mt-6 -ml-5"
                  >
                    ؟
                  </span>
                </div>
              </div>

              {/* Clean Tilted Cream Card with Purple Stack Shadow */}
              <div className="relative w-full max-w-[490px] pt-3 pb-4">
                <div className="relative bg-[#FFFDF7] border-[2.5px] border-[#1F112E] rounded-[24px] px-6 pt-8 pb-6 sm:px-8 shadow-[6px_7px_0_#6A3BA4] lg:-rotate-1 hover:rotate-0 transition-transform duration-200 text-center space-y-5">
                  {/* Overlapping Category Pill Tab (top right) */}
                  <span className="absolute -top-4 right-5 bg-[#FFE047] border-2 border-[#1F112E] rounded-xl px-4 py-1 font-display font-black text-xs sm:text-sm text-[#1F112E] shadow-[0_3px_0_#1F112E]">
                    {currentSample.category}
                  </span>

                  {/* Subtle corner sample switcher */}
                  <button
                    type="button"
                    onClick={handleNextSample}
                    aria-label="معاينة سؤال آخر"
                    title="معاينة سؤال آخر"
                    className="absolute top-3 left-3 w-7 h-7 rounded-lg border border-[#1F112E]/25 bg-[#F2ECE0] hover:bg-[#FFE047] flex items-center justify-center text-[#1F112E] transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  <p className="font-display font-black text-xl sm:text-[26px] text-[#1F112E] leading-relaxed min-h-[4rem] flex items-center justify-center pt-1">
                    {currentSample.prompt}
                  </p>

                  <button
                    type="button"
                    onClick={handleToggleSampleAnswer}
                    className="game-btn-purple w-full rounded-xl px-5 py-3 flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <span className="font-display font-bold text-xs sm:text-sm text-white/90 px-1.5 shrink-0">
                      الإجابة
                    </span>
                    <span className="h-5 w-[1.5px] bg-white/30 shrink-0" aria-hidden="true" />
                    <span className="flex-1 font-display font-black text-base sm:text-xl leading-tight text-[#FFE047] text-center">
                      {answerRevealed ? currentSample.answer : 'اضغط لكشف الإجابة'}
                    </span>
                  </button>
                </div>

                {/* Peeking mini deck accents under the showcase card (matching reference style) */}
                <div
                  aria-hidden="true"
                  className="hidden sm:flex items-center justify-between px-4 -mt-3 relative z-10 pointer-events-none"
                >
                  <span className="inline-flex items-center gap-1.5 bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-1 shadow-[0_3px_0_#1F112E] -rotate-6 text-xs sm:text-sm font-black text-[#63349B]">
                    <span className="w-5 h-5 rounded-full bg-[#63349B] text-white grid place-items-center text-[10px]">
                      15
                    </span>
                    <span>سؤال</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-[#FFFDF7] border-2 border-[#1F112E] rounded-xl px-3 py-1 shadow-[0_3px_0_#1F112E] rotate-6 text-xs sm:text-sm font-black text-[#00A86B]">
                    <span>PDF</span>
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          </main>
          <div className="hidden lg:block h-2" aria-hidden="true" />
        </div>

        {/* Bottom Dark-Plum Mode Switcher Dock (matching reference bottom bar) */}
        <nav
          aria-label="أوضاع المسابقة والأدوات"
          className="w-full max-w-[1520px] flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 pb-1"
        >
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onStartQuick();
            }}
            className="game-btn-3d bg-[#5B2D91] text-[#FFE047] !border-[#FFE047] px-5 py-2.5 rounded-xl font-display font-black text-sm cursor-pointer"
          >
            يمكن هاي
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenPdfStudio();
            }}
            className="game-btn-3d bg-[#1D7D5B] text-white px-5 py-2.5 rounded-xl font-display font-black text-sm flex items-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>حوّل درس PDF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenLibrary();
            }}
            className="game-btn-3d bg-[#1B5194] text-white px-5 py-2.5 rounded-xl font-display font-black text-sm flex items-center gap-2 cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>بنك الأسئلة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenSavedMatches();
            }}
            className="game-btn-3d bg-[#95202B] text-white px-5 py-2.5 rounded-xl font-display font-black text-sm flex items-center gap-2 cursor-pointer"
          >
            <FolderArchive className="w-4 h-4" />
            <span>المباريات وبنوك USB</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setShowHowToPlay(true);
            }}
            className="game-btn-3d bg-[#ECE4D4] text-[#1F112E] px-5 py-2.5 rounded-xl font-display font-black text-sm cursor-pointer"
          >
            كيف تلعب؟
          </button>
        </nav>
      </div>

      {/* How To Play Modal */}
      {showHowToPlay && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-to-play-title"
          onClick={() => setShowHowToPlay(false)}
        >
          <div
            className="game-card-frame rounded-3xl p-6 max-w-lg w-full space-y-4 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="how-to-play-title" className="font-display font-black text-2xl text-[#1F112E]">
                كيف تلعب «يمكن هاي»؟
              </h2>
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="bg-white border-2 border-[#1F112E] rounded-xl p-1.5 cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-3 text-sm font-bold text-[#1F112E]/90">
              <li className="bg-[#F2ECE0] border-2 border-[#1F112E] rounded-2xl p-3.5">
                <span className="font-display font-black text-[#63349B] block mb-0.5">
                  1. أضف الفرق واختر الفئات أو ارفع درس PDF
                </span>
                حدد أسماء وألوان الفرق (2–4 فرق)، واختر الفئات الجاهزة أو ارفع ملف الدرس لتوليد لوحة أسئلة متكاملة.
              </li>
              <li className="bg-[#F2ECE0] border-2 border-[#1F112E] rounded-2xl p-3.5">
                <span className="font-display font-black text-[#00A86B] block mb-0.5">
                  2. افتح الأسئلة بالتناوب (200 / 400 / 600)
                </span>
                كل فريق يختار خانة من اللوحة على شاشة العرض أمام الصف مع مؤقت تفاعلي واضح.
              </li>
              <li className="bg-[#F2ECE0] border-2 border-[#1F112E] rounded-2xl p-3.5">
                <span className="font-display font-black text-[#F05B63] block mb-0.5">
                  3. استخدم البطاقات الخاصة واجمع النقاط
                </span>
                فعّل بطاقات «نقاط مضاعفة» و«الحفرة» و«إجابتان» و«فرصة ثانية» لزيادة الحماس حتى إعلان الفائز!
              </li>
            </ol>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="game-btn-3d bg-white text-[#1F112E] px-4 py-2 rounded-xl font-bold text-sm cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHowToPlay(false);
                  onStartQuick();
                }}
                className="game-btn-purple px-5 py-2 rounded-xl font-display font-black text-sm cursor-pointer"
              >
                ابدأ اللعب الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
