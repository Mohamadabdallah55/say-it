import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
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
  X,
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
    isBootstrapAdmin,
    signingIn,
    authError,
    totalPlayedCount,
    signInWithGoogle,
    signOutUser,
    clearAuthError,
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
    <header className="game-top-nav w-full bg-[#1C0A2B] border-b-[3px] border-[#12061D] py-2.5 sticky top-0 z-40">
      <div className="lobby-shell flex flex-wrap items-center justify-between gap-3">
        {/* Group 1 (RTL Right): التنقل — Brand Logo & Primary Navigation */}
        <nav aria-label="التنقل الرئيسي" className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onHome();
            }}
            title="العودة إلى الرئيسية"
            aria-label="العودة إلى الرئيسية - يمكن هاي"
            className="cursor-pointer shrink-0 rounded-xl overflow-hidden hover:scale-[1.03] transition-transform min-h-[44px] flex items-center"
          >
            <GameLogo size="sm" variant="badge" className="!w-24 sm:!w-28" />
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              onStartQuick();
            }}
            title="بدء مسابقة جديدة"
            className="game-btn-3d bg-[#FFE047] text-[#1F112E] px-4 min-h-[44px] rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 fill-current" />
            <span>ابدأ مسابقة</span>
          </button>

          <span aria-hidden="true" className="hidden md:block h-7 w-px bg-white/20 mx-0.5" />

          <div className="flex items-center gap-1.5">
            {onBack && activePage !== 'title' && (
              <button
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  onBack();
                }}
                aria-label="رجوع"
                title="رجوع"
                className="game-btn-3d group relative bg-[#FFFDF7] text-[#1F112E] w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
                <span className="pointer-events-none absolute top-full mt-1.5 px-2 py-0.5 rounded-lg bg-[#1F112E] text-white text-[11px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  رجوع
                </span>
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
              className={`game-btn-3d group relative w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                activePage === 'title' ? 'bg-[#FFE047] text-[#1F112E]' : 'bg-[#FFFDF7] text-[#1F112E]'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="pointer-events-none absolute top-full mt-1.5 px-2 py-0.5 rounded-lg bg-[#1F112E] text-white text-[11px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                الرئيسية
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onStartQuick();
              }}
              aria-label="إعداد اللوحة"
              title="إعداد اللوحة"
              className={`game-btn-3d group relative w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                activePage === 'lobby' ? 'bg-[#FFE047] text-[#1F112E]' : 'bg-[#FFFDF7] text-[#1F112E]'
              }`}
            >
              <Play className="w-4 h-4 fill-current rotate-180" />
              <span className="pointer-events-none absolute top-full mt-1.5 px-2 py-0.5 rounded-lg bg-[#1F112E] text-white text-[11px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                إعداد اللوحة
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onOpenLibrary();
              }}
              aria-label="بنك الأسئلة والمكتبة"
              title="بنك الأسئلة والمكتبة"
              className={`game-btn-3d group relative w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                activePage === 'library' ? 'bg-[#FFE047] text-[#1F112E]' : 'bg-[#FFFDF7] text-[#1F112E]'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="pointer-events-none absolute top-full mt-1.5 px-2 py-0.5 rounded-lg bg-[#1F112E] text-white text-[11px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                المكتبة
              </span>
            </button>
          </div>
        </nav>

        {/* Group 2 & 3 (RTL Left): الأدوات + الحساب */}
        <div className="game-top-tools flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Group 2: الأدوات */}
          <div role="group" aria-label="أدوات المسابقة" className="game-top-tool-buttons flex flex-wrap items-center gap-1.5 sm:gap-2">
            <GameAssistantBot triggerVariant="icon" />

            {onToggleSound && (
              <button
                type="button"
                onClick={onToggleSound}
                aria-label={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
                title={soundEnabled ? 'كتم الصوت' : 'تفعيل الصوت'}
                className="game-btn-3d group relative bg-[#FFFDF7] text-[#1F112E] w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
              >
                {soundEnabled ? (
                  <Volume2 className="w-5 h-5 text-[#00A86B]" />
                ) : (
                  <VolumeX className="w-5 h-5 text-[#F05B63]" />
                )}
                <span className="pointer-events-none absolute top-full mt-1.5 px-2 py-0.5 rounded-lg bg-[#1F112E] text-white text-[11px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                  {soundEnabled ? 'الصوت مفعّل' : 'الصوت مكتوم'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onOpenSavedMatches();
              }}
              title="المباريات المحفوظة"
              className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-3.5 min-h-[44px] rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <FolderArchive className="w-4 h-4 text-[#63349B]" />
              <span className="hidden md:inline">المباريات</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                onOpenPdfStudio();
              }}
              title="تحويل درس PDF إلى أسئلة"
              className={`game-btn-3d px-3.5 min-h-[44px] rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activePage === 'pdf_studio'
                  ? 'bg-[#FFE047] text-[#1F112E]'
                  : 'bg-[#FFFDF7] text-[#1F112E]'
              }`}
            >
              <FileText className="w-4 h-4 text-[#00A86B]" />
              <span className="hidden sm:inline">حوّل درس PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenAdmin}
                aria-label="لوحة المسؤول والمتحكمين"
                title="لوحة المسؤول لإدارة الفئات والأسئلة والحسابات المتحكمة"
                className={`game-btn-3d px-3.5 min-h-[44px] rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activePage === 'admin'
                    ? 'bg-[#FFE047] text-[#1F112E]'
                    : 'bg-[#63349B] text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden lg:inline">لوحة المسؤول</span>
              </button>
            )}
          </div>

          <span aria-hidden="true" className="hidden sm:block h-7 w-px bg-white/20" />

          {/* Group 3: الحساب */}
          <div ref={menuRef} className="relative">
            {!authReady ? (
              <div className="w-11 h-11 rounded-xl bg-white/15 animate-pulse" aria-hidden="true" />
            ) : !user ? (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => {
                  soundFX.playClick();
                  signInWithGoogle();
                }}
                title="تسجيل الدخول بحساب جوجل لحفظ التقدم"
                className="game-btn-3d bg-[#00A86B] text-white px-4 min-h-[44px] rounded-xl font-display font-black text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
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
                  title={user.displayName || 'حسابي'}
                  className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] pl-3 pr-2 min-h-[44px] rounded-xl flex items-center gap-2 cursor-pointer max-w-[180px]"
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
                  <span className="font-display font-black text-xs sm:text-sm truncate hidden sm:inline">
                    {user.displayName?.split(' ')[0] || 'حسابي'}
                  </span>
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="game-account-menu absolute left-0 mt-2 w-64 rounded-2xl bg-[#FFFDF7] border-[2.5px] border-[#1F112E] shadow-[0_6px_0_#1F112E] p-3.5 space-y-3 z-50 text-right"
                  >
                    <div className="space-y-1 border-b border-[#1F112E]/10 pb-2.5">
                      <p className="font-display font-black text-sm text-[#1F112E] truncate">
                        {user.displayName || 'حساب لاعب'}
                      </p>
                      <p className="text-[11px] font-bold text-[#1F112E]/60 truncate" dir="ltr">
                        {user.email}
                      </p>
                      {isAdmin && (
                        <div className="pt-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#EFE4FF] border border-[#63349B]/30 text-[11px] font-display font-black text-[#4B1D7E]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>
                              {isBootstrapAdmin ? 'الحساب المتحكم الأساسي' : 'حساب متحكم مفعّل'}
                            </span>
                          </span>
                        </div>
                      )}
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
                        className="w-full game-btn-3d bg-[#FFE047] text-[#1F112E] px-3 min-h-[44px] rounded-xl font-display font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>لوحة المسؤول والمتحكمين</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        soundFX.playClick();
                        setMenuOpen(false);
                        signOutUser();
                      }}
                      className="w-full rounded-xl border-2 border-[#1F112E]/20 hover:bg-[#FFE5E7] text-[#DC2626] px-3 min-h-[44px] font-display font-black text-xs flex items-center justify-center gap-2 cursor-pointer transition"
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

      {authError && (
        <div className="lobby-shell mt-2.5">
          <div
            role="alert"
            className="rounded-xl bg-[#FFE5E7] border-2 border-[#F05B63] text-[#991B1B] px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold shadow-[0_3px_0_#12061D]"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#DC2626]" />
              <span className="leading-snug">{authError}</span>
            </div>
            <button
              type="button"
              onClick={clearAuthError}
              aria-label="إغلاق تنبيه تسجيل الدخول"
              className="p-1 rounded-lg hover:bg-[#DC2626]/10 text-[#991B1B] shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
