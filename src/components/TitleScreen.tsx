import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, FileText, FolderArchive, Play, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { soundFX } from '../utils/sound';
import { GameLogo } from './GameLogo';
import { GameAssistantBot } from './GameAssistantBot';

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
          <span className="font-display font-bold text-sm text-[#291B40]">يمكن هاي</span>
        </div>

        <div className="flex items-center gap-2">
          <GameAssistantBot compact />
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
      </div>

      {/* Main Hero */}
      <main className="w-full max-w-5xl flex flex-col items-center text-center z-10 my-auto py-4">
        <div className="relative flex items-center justify-center w-full mb-5">
          <div className="show-marquee">
            <div className="marquee-orbit" aria-hidden="true"><i>200</i><i>400</i><i>600</i></div>
            <motion.div initial={introSkipped ? false : { y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <GameLogo size="lg" dark />
            </motion.div>
          </div>
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
          ارفع درس PDF، راجع فئاته وأسئلته، واجمع الفرق حول لوحة واحدة.
        </p>

        {/* Primary Action Cluster */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenPdfStudio();
            }}
            className="game-btn-3d sm:col-span-2 bg-[#00B978] text-white font-display font-black text-xl md:text-2xl py-4 px-6 rounded-2xl flex items-center justify-center gap-3 cursor-pointer"
          >
            <FileText className="w-7 h-7" />
            <span>حوّل درس PDF إلى مسابقة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onStartQuick();
            }}
            className="game-btn-3d bg-[#7042A1] text-white font-display font-extrabold text-lg py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Play className="w-5 h-5" />
            <span>جرّب مباراة جاهزة</span>
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
