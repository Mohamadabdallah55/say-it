import type { CategoryIconKey } from '../game/types';

interface CategoryArtworkProps {
  iconKey: CategoryIconKey;
  accentColor: string;
}

export function CategoryArtwork({ iconKey, accentColor }: CategoryArtworkProps) {
  return (
    <div
      className="relative w-full h-32 rounded-t-[13px] overflow-hidden border-b-[3px] border-[#291B40] flex items-center justify-center"
      style={{ backgroundColor: accentColor }}
    >
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, #FFFFFF 0, #FFFFFF 18%, transparent 19%), radial-gradient(circle at 82% 78%, #291B40 0, #291B40 24%, transparent 25%)',
        }}
      />

      {iconKey === 'general' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <circle cx="60" cy="45" r="32" fill="#FFD95A" stroke="#291B40" strokeWidth="4" />
          <ellipse cx="60" cy="45" rx="14" ry="32" fill="none" stroke="#291B40" strokeWidth="3" />
          <line x1="28" y1="45" x2="92" y2="45" stroke="#291B40" strokeWidth="3" />
          <circle cx="88" cy="22" r="11" fill="#FFF9E9" stroke="#291B40" strokeWidth="3.5" />
          <text x="88" y="27" textAnchor="middle" fontSize="14" fontWeight="900" fill="#291B40">؟</text>
        </svg>
      )}

      {iconKey === 'science' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <path d="M48 16H72V34L88 66C90 71 86 76 80 76H40C34 76 30 71 32 66L48 34V16Z" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" strokeLinejoin="round" />
          <path d="M38 56H82L85 66C86 70 83 72 80 72H40C37 72 34 70 35 66L38 56Z" fill="#00B978" />
          <rect x="44" y="11" width="32" height="7" rx="3.5" fill="#FFD95A" stroke="#291B40" strokeWidth="3.5" />
          <circle cx="54" cy="48" r="4" fill="#FFD95A" stroke="#291B40" strokeWidth="2" />
          <circle cx="66" cy="40" r="3" fill="#FFF9E9" stroke="#291B40" strokeWidth="2" />
        </svg>
      )}

      {iconKey === 'history' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <path d="M24 72H96V78H24V72Z" fill="#FFD95A" stroke="#291B40" strokeWidth="3.5" />
          <path d="M30 28L60 12L90 28H30Z" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" strokeLinejoin="round" />
          <rect x="36" y="28" width="10" height="44" fill="#FFF9E9" stroke="#291B40" strokeWidth="3.5" />
          <rect x="55" y="28" width="10" height="44" fill="#FFF9E9" stroke="#291B40" strokeWidth="3.5" />
          <rect x="74" y="28" width="10" height="44" fill="#FFF9E9" stroke="#291B40" strokeWidth="3.5" />
        </svg>
      )}

      {iconKey === 'arabic' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <rect x="22" y="16" width="76" height="58" rx="12" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" />
          <text x="60" y="55" textAnchor="middle" fontFamily="Cairo, sans-serif" fontSize="34" fontWeight="900" fill="#7042A1">
            ض
          </text>
          <path d="M84 14L96 26L74 48L62 36L84 14Z" fill="#FFD95A" stroke="#291B40" strokeWidth="3" />
        </svg>
      )}

      {iconKey === 'puzzles' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <circle cx="60" cy="39" r="22" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" />
          <path d="M51 60H69L66 74H54L51 60Z" fill="#7042A1" stroke="#291B40" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M60 25V39L69 45" stroke="#F05B63" strokeWidth="4" strokeLinecap="round" />
          <line x1="28" y1="38" x2="20" y2="38" stroke="#FFF9E9" strokeWidth="4" strokeLinecap="round" />
          <line x1="92" y1="38" x2="100" y2="38" stroke="#FFF9E9" strokeWidth="4" strokeLinecap="round" />
        </svg>
      )}

      {iconKey === 'sports' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <path d="M40 18H80V38C80 51 71 60 60 60C49 60 40 51 40 38V18Z" fill="#FFD95A" stroke="#291B40" strokeWidth="4" />
          <path d="M40 24H28C28 38 34 44 40 44" fill="none" stroke="#FFF9E9" strokeWidth="4" strokeLinecap="round" />
          <path d="M80 24H92C92 38 86 44 80 44" fill="none" stroke="#FFF9E9" strokeWidth="4" strokeLinecap="round" />
          <rect x="54" y="60" width="12" height="11" fill="#FFD95A" stroke="#291B40" strokeWidth="3.5" />
          <rect x="42" y="71" width="36" height="8" rx="4" fill="#FFF9E9" stroke="#291B40" strokeWidth="3.5" />
        </svg>
      )}

      {iconKey === 'islamic' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <path d="M26 26L60 16L94 26V66L60 76L26 66V26Z" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" strokeLinejoin="round" />
          <line x1="60" y1="16" x2="60" y2="76" stroke="#291B40" strokeWidth="3.5" />
          <path d="M45 36C40 38 38 44 41 49C44 54 50 54 53 50C47 51 43 44 45 36Z" fill="#00B978" stroke="#291B40" strokeWidth="2.5" />
          <circle cx="77" cy="43" r="6" fill="#FFD95A" stroke="#291B40" strokeWidth="2.5" />
        </svg>
      )}

      {iconKey === 'geography' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <path d="M24 68L48 32L66 56L80 40L98 68H24Z" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" strokeLinejoin="round" />
          <circle cx="84" cy="24" r="10" fill="#FFD95A" stroke="#291B40" strokeWidth="3.5" />
        </svg>
      )}

      {iconKey === 'tech' && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <rect x="28" y="20" width="64" height="44" rx="8" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" />
          <path d="M48 36L40 42L48 48M72 36L80 42L72 48M63 33L57 51" stroke="#7042A1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="44" y="68" width="32" height="7" rx="3.5" fill="#FFD95A" stroke="#291B40" strokeWidth="3" />
        </svg>
      )}

      {(iconKey === 'pdf' || iconKey === 'skills') && (
        <svg viewBox="0 0 120 90" className="w-28 h-24 drop-shadow-[0_4px_0_rgba(41,27,64,0.45)]" aria-hidden="true">
          <rect x="30" y="14" width="48" height="62" rx="8" fill="#FFF9E9" stroke="#291B40" strokeWidth="4" />
          <line x1="40" y1="32" x2="68" y2="32" stroke="#7042A1" strokeWidth="4" strokeLinecap="round" />
          <line x1="40" y1="44" x2="68" y2="44" stroke="#291B40" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="40" y1="56" x2="58" y2="56" stroke="#291B40" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="80" cy="58" r="14" fill="#FFD95A" stroke="#291B40" strokeWidth="3.5" />
          <path d="M80 48L83 55L90 58L83 61L80 68L77 61L70 58L77 55L80 48Z" fill="#7042A1" />
        </svg>
      )}
    </div>
  );
}
