import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  FileText,
  FolderArchive,
  Home,
  LogIn,
  LogOut,
  Play,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAccount } from '../context/AccountContext';
import { soundFX } from '../utils/sound';
import { GameAssistantBot } from './GameAssistantBot';
import { GameLogo } from './GameLogo';

interface TopNavHeaderProps {
  activePage: 'title' | 'lobby' | 'pdf_studio' | 'library' | 'admin';
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onHome: () => void;
  onBack?: () => void;
  onStartQuick: () => void;
  onOpenPdfStudio: () => void;
  onOpenLibrary: () => void;
  onOpenSavedMatches: () => void;
  onOpenAdmin?: () => void;
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
  onOpenAdmin,
}: TopNavHeaderProps) {
  const {
    user,
    authReady,
    isAdmin,
    signingIn,
    totalPlayedCount,
    signInWithGoogle,
    signOutUser,
  } = useAccount();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const handleOpenAdmin = () => {
    soundFX.playClick();
    setMenuOpen(false);
    if (onOpenAdmin) {
      onOpenAdmin();
    } else {
      window.dispatchEvent(new CustomEvent('yh:open-admin'));
    }
  };

  const userInitial = (user?.displayName || user?.email || 'ل').trim().charAt(0).toUpperCase();

  return (
    <header className="w-full bg-[#1C0A2B] border-b-[3px] border-[#12061D] px-3 sm:px-6 py-2.5 sticky top-0 z-40">
      <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* RTL Right: Brand Badge + Primary Nav Icons */}
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

            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenAdmin}
                aria-label="لوحة المسؤول"
                title="لوحة المسؤول لإدارة الفئات والأسئلة"
                className={`game-btn-3d px-3 h-9 rounded-xl font-display font-black text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activePage === 'admin'
                    ? 'bg-[#FFE047] text-[#1F112E]'
                    : 'bg-[#63349B] text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden md:inline">لوحة المسؤول</span>
              </button>
            )}
          </div>
        </div>

        {/* RTL Left: Quick PDF Studio, Saved Matches & Account Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onOpenSavedMatches();
            }}
            className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer hidden md:flex"
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
            className={`game-btn-3d px-3 py-1.5 rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activePage === 'pdf_studio'
                ? 'bg-[#FFE047] text-[#1F112E]'
                : 'bg-[#FFFDF7] text-[#1F112E]'
            }`}
          >
            <FileText className="w-4 h-4 text-[#00A86B]" />
            <span className="hidden sm:inline">حوّل درس PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>

          {/* Google Account Trigger */}
          <div ref={menuRef} className="relative">
            {!authReady ? (
              <div className="w-9 h-9 rounded-xl bg-white/15 animate-pulse" aria-hidden="true" />
            ) : !user ? (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => {
                  soundFX.playClick();
                  signInWithGoogle();
                }}
                className="game-btn-3d bg-[#00A86B] text-white px-3.5 py-1.5 rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>{signingIn ? 'جارٍ الدخول...' : 'دخول جوجل'}</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playClick();
                    setMenuOpen((prev) => !prev);
                  }}
                  aria-expanded={menuOpen}
                  aria-label="حسابي"
                  className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] pl-2.5 pr-1.5 py-1 rounded-xl flex items-center gap-2 cursor-pointer max-w-[170px]"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'حسابي'}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full border-2 border-[#1F112E] object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-[#63349B] text-white border-2 border-[#1F112E] font-display font-black text-xs flex items-center justify-center shrink-0">
                      {userInitial}
                    </span>
                  )}
                  <span className="font-display font-black text-xs truncate hidden sm:inline">
                    {user.displayName?.split(' ')[0] || 'حسابي'}
                  </span>
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-2 w-64 rounded-2xl bg-[#FFFDF7] border-[2.5px] border-[#1F112E] shadow-[0_6px_0_#1F112E] p-3.5 space-y-3 z-50 text-right"
                  >
                    <div className="space-y-0.5 border-b border-[#1F112E]/10 pb-2.5">
                      <p className="font-display font-black text-sm text-[#1F112E] truncate">
                        {user.displayName || 'حساب لاعب'}
                      </p>
                      <p className="text-[11px] font-bold text-[#1F112E]/60 truncate" dir="ltr">
                        {user.email}
                      </p>
                      <div className="pt-1 flex items-center justify-between text-xs font-bold text-[#1F112E]/80">
                        <span>الأسئلة المستهلكة</span>
                        <span className="font-display font-black text-[#00A86B] tabular-nums">
                          {totalPlayedCount} سؤال
                        </span>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={handleOpenAdmin}
                        className="w-full game-btn-3d bg-[#FFE047] text-[#1F112E] px-3 py-2 rounded-xl font-display font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>فتح لوحة المسؤول</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        setMenuOpen(false);
                        signOutUser();
                      }}
                      className="w-full rounded-xl border-2 border-[#1F112E]/20 hover:bg-[#FFE5E7] text-[#DC2626] px-3 py-2 font-display font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>تسجيل الخروج</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
