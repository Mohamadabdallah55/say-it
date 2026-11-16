import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, FileText, FolderArchive, Play, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { soundFX } from '../utils/sound';
import { GameLogo } from './GameLogo';

interface TitleScreenProps {
  onStartQuick: () => void;
  onOpenPdfStudio: () => void;
  onOpenLibrary: () => void;
  onOpenSavedMatches: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function TitleScreen({
  onStartQuick,
  onOpenPdfStudio,
  onOpenLibrary,
  onOpenSavedMatches,
  soundEnabled,
  onToggleSound,
}: TitleScreenProps) {
  const [introSkipped, setIntroSkipped] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setIntroSkipped(true), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-screen w-full game-pattern-bg flex flex-col items-center justify-between px-4 py-6 md:py-10 relative overflow-hidden"
      onClick={() => !introSkipped && setIntroSkipped(true)}
    >
      {/* Top minimal utility bar */}
      <div className="w-full max-w-6xl flex items-center justify-between z-10">
        <div className="inline-flex items-center gap-2 bg-[#FFF9E9] border-[2.5px] border-[#291B40] rounded-xl px-3.5 py-1.5 shadow-[0_3px_0_#291B40]">
          <Sparkles className="w-4 h-4 text-[#7042A1]" />
          <span className="font-display font-bold text-sm text-[#291B40]">مكتبة ألعاب النخبة</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSound();
          }}
          className="game-btn-3d bg-[#FFF9E9] text-[#291B40] px-3.5 py-1.5 rounded-xl flex items-center gap-2 text-sm font-bold cursor-pointer"
          aria-label={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-[#00B978]" /> : <VolumeX className="w-4 h-4 text-[#F05B63]" />}
          <span>{soundEnabled ? 'الصوت مفعّل' : 'صامت'}</span>
        </button>
      </div>

      {/* Main Hero */}
      <main className="w-full max-w-5xl flex flex-col items-center text-center z-10 my-auto py-4">
        <div className="relative flex items-center justify-center w-full mb-5">
          {/* Decorative animated quiz category tier card (left) */}
          <motion.div
            initial={introSkipped ? false : { opacity: 0, x: -40, rotate: -14 }}
            animate={{ opacity: 1, x: 0, rotate: -10 }}
            transition={{ duration: 0.45 }}
            className="hidden lg:flex flex-col w-44 game-card-frame-sm rounded-2xl p-3 text-right -ml-6 select-none animate-float-slow"
          >
            <span className="text-[11px] font-bold bg-[#279ED6] text-white px-2 py-0.5 rounded-md w-fit mb-2">
              علوم واكتشافات
            </span>
            <p className="font-display font-black text-sm text-[#291B40] mb-2">لوحة النقاط</p>
            <div className="space-y-1.5 font-display font-black text-xs">
              <div className="bg-[#FFD95A] border-2 border-[#291B40] rounded-md px-2 py-1 text-center">200 • سهل</div>
              <div className="bg-[#7042A1] text-white border-2 border-[#291B40] rounded-md px-2 py-1 text-center">400 • متوسط</div>
              <div className="bg-[#00B978] text-white border-2 border-[#291B40] rounded-md px-2 py-1 text-center">600 • صعب</div>
            </div>
          </motion.div>

          {/* Official Quiz Show Logo */}
          <motion.div
            initial={introSkipped ? false : { scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="z-10"
          >
            <GameLogo size="lg" />
          </motion.div>

          {/* Decorative animated quiz challenge card (right) */}
          <motion.div
            initial={introSkipped ? false : { opacity: 0, x: 40, rotate: 14 }}
            animate={{ opacity: 1, x: 0, rotate: 10 }}
            transition={{ duration: 0.45 }}
            className="hidden lg:flex flex-col w-44 game-card-frame-sm rounded-2xl p-3 text-right -mr-6 select-none animate-float-slow"
          >
            <span className="text-[11px] font-bold bg-[#F05B63] text-white px-2 py-0.5 rounded-md w-fit mb-2">
              تحدّي الفرق
            </span>
            <p className="font-display font-black text-sm text-[#291B40] mb-2">وسائل مساعدة</p>
            <div className="space-y-1 text-xs font-bold text-[#291B40]">
              <div className="bg-[#EDE7F6] rounded-md px-2 py-1">نقاط مضاعفة ×2</div>
              <div className="bg-[#E8F8F2] rounded-md px-2 py-1">تلميح ذكي</div>
              <div className="bg-[#FFF2CD] rounded-md px-2 py-1">تحدي الجرس</div>
            </div>
          </motion.div>
        </div>

        <motion.p
          initial={introSkipped ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="font-display font-black text-2xl md:text-3xl text-[#291B40] mb-2"
        >
          «اختار الفئة... وورّينا شطارتك!»
        </motion.p>

        <p className="max-w-2xl text-base md:text-lg font-medium text-[#291B40]/85 mb-8">
          مسابقة أسئلة وفئات جماعية للفصول والنشاطات: لوحة 5 فئات × 3 مستويات (200 / 400 / 600)،
          وسائل مساعدة، جرس اختياري، وتحويل أي درس PDF إلى مسابقة جاهزة خلال دقائق.
        </p>

        {/* Primary Action Cluster */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onStartQuick();
            }}
            className="game-btn-3d sm:col-span-2 bg-[#00B978] text-white font-display font-black text-xl md:text-2xl py-4 px-6 rounded-2xl flex items-center justify-center gap-3 cursor-pointer"
          >
            <Play className="w-7 h-7 fill-current" />
            <span>يلا نلعب! (مباراة جاهزة)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenPdfStudio();
            }}
            className="game-btn-3d bg-[#7042A1] text-white font-display font-extrabold text-lg py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <FileText className="w-5 h-5" />
            <span>حوّل درس PDF إلى مسابقة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenLibrary();
            }}
            className="game-btn-3d bg-[#279ED6] text-white font-display font-extrabold text-lg py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <BookOpen className="w-5 h-5" />
            <span>العب من بنك جاهز</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenSavedMatches();
            }}
            className="game-btn-3d sm:col-span-2 bg-[#FFF9E9] text-[#291B40] font-display font-bold text-base py-3 px-5 rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
          >
            <FolderArchive className="w-5 h-5 text-[#7042A1]" />
            <span>المباريات المحفوظة وبنوك USB</span>
          </button>
        </div>
      </main>

      <footer className="text-center text-xs md:text-sm font-bold text-[#291B40]/75 z-10">
        مناسب لـ 12–15 طالبًا • بروجكتر واحد + جوال للمشرف • بدون هواتف للطلاب
      </footer>
    </div>
  );
}
