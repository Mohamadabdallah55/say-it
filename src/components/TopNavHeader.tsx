import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderArchive,
  Home,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundFX } from '../utils/sound';
import { GameAssistantBot } from './GameAssistantBot';
import { GameLogo } from './GameLogo';

interface TopNavHeaderProps {
  activePage: 'title' | 'lobby' | 'pdf_studio' | 'library';
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onHome: () => void;
  onBack?: () => void;
  onStartQuick: () => void;
  onOpenPdfStudio: () => void;
  onOpenLibrary: () => void;
  onOpenSavedMatches: () => void;
}

export function TopNavHeader({
  activePage,
  soundEnabled = true,
  onToggleSound,
  onHome,
  onBack,
  onStartQuick,
  onOpenPdfStudio,
  onOpenLibrary,
  onOpenSavedMatches,
}: TopNavHeaderProps) {
  return (
    <header className="w-full bg-[#1C0A2B] border-b-[3px] border-[#12061D] px-3 sm:px-6 py-2.5 sticky top-0 z-40">
      <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* RTL Right: Brand Badge + Primary Nav Icons (matching original top bar) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onHome();
            }}
            aria-label="العودة إلى الرئيسية - يمكن هاي"
            className="cursor-pointer shrink-0 rounded-xl overflow-hidden hover:scale-[1.03] transition-transform"
          >
            <GameLogo size="sm" variant="badge" className="!w-24 sm:!w-28" />
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onStartQuick();
            }}
            className="game-btn-3d bg-[#FFE047] text-[#1F112E] px-3.5 py-1.5 rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            <span>ابدأ مسابقة</span>
          </button>

          <div className="flex items-center gap-1.5">
            <GameAssistantBot triggerVariant="icon" />

            {onToggleSound && (
              <button
                type="button"
                onClick={onToggleSound}
                aria-label={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
                title={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
                className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-[#00A86B]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-[#F05B63]" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onHome();
              }}
              aria-label="الشاشة الرئيسية"
              title="الشاشة الرئيسية"
              className={`game-btn-3d w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                activePage === 'title' ? 'bg-[#FFE047] text-[#1F112E]' : 'bg-[#FFFDF7] text-[#1F112E]'
              }`}
            >
              <Home className="w-4 h-4" />
            </button>

            {onBack && activePage !== 'title' && (
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  onBack();
                }}
                aria-label="رجوع"
                title="رجوع"
                className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onStartQuick();
              }}
              aria-label="إعداد اللوحة"
              title="إعداد اللوحة"
              className={`game-btn-3d w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                activePage === 'lobby' ? 'bg-[#FFE047] text-[#1F112E]' : 'bg-[#FFFDF7] text-[#1F112E]'
              }`}
            >
              <Play className="w-4 h-4 fill-current rotate-180" />
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onOpenLibrary();
              }}
              aria-label="بنك الأسئلة والمكتبة"
              title="بنك الأسئلة والمكتبة"
              className={`game-btn-3d w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                activePage === 'library' ? 'bg-[#FFE047] text-[#1F112E]' : 'bg-[#FFFDF7] text-[#1F112E]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* RTL Left: Quick PDF Studio & Saved Matches Pills */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenSavedMatches();
            }}
            className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer hidden sm:flex"
          >
            <FolderArchive className="w-3.5 h-3.5 text-[#63349B]" />
            <span>المباريات</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenPdfStudio();
            }}
            className={`game-btn-3d px-3.5 py-1.5 rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activePage === 'pdf_studio'
                ? 'bg-[#FFE047] text-[#1F112E]'
                : 'bg-[#FFFDF7] text-[#1F112E]'
            }`}
          >
            <FileText className="w-4 h-4 text-[#00A86B]" />
            <span>حوّل درس PDF</span>
          </button>
        </div>
      </div>
    </header>
  );
}
