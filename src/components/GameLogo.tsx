interface GameLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function GameLogo({ size = 'md', className = '' }: GameLogoProps) {
  const dims =
    size === 'lg'
      ? 'w-full max-w-[500px]'
      : size === 'sm'
        ? 'w-44'
        : 'w-72';

  return (
    <div className={`inline-flex flex-col items-center select-none ${dims} ${className}`}>
      <svg
        viewBox="0 0 520 175"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-[0_6px_0_#291B40]"
        role="img"
        aria-label="شعار لعبة سؤال النخبة"
      >
        {/* Tilted gold quiz points card behind plaque */}
        <g transform="translate(18, 20) rotate(-9)">
          <rect
            x="0"
            y="0"
            width="92"
            height="116"
            rx="15"
            fill="#FFF9E9"
            stroke="#291B40"
            strokeWidth="5"
          />
          <rect x="12" y="14" width="68" height="22" rx="7" fill="#00B978" stroke="#291B40" strokeWidth="3" />
          <text
            x="46"
            y="30"
            textAnchor="middle"
            fill="#FFF9E9"
            fontFamily="Cairo, sans-serif"
            fontWeight="900"
            fontSize="13"
          >
            600
          </text>
          <rect x="12" y="45" width="68" height="22" rx="7" fill="#279ED6" stroke="#291B40" strokeWidth="3" />
          <text
            x="46"
            y="61"
            textAnchor="middle"
            fill="#FFF9E9"
            fontFamily="Cairo, sans-serif"
            fontWeight="900"
            fontSize="13"
          >
            400
          </text>
          <rect x="12" y="76" width="68" height="22" rx="7" fill="#FFD95A" stroke="#291B40" strokeWidth="3" />
          <text
            x="46"
            y="92"
            textAnchor="middle"
            fill="#291B40"
            fontFamily="Cairo, sans-serif"
            fontWeight="900"
            fontSize="13"
          >
            200
          </text>
        </g>

        {/* Main stage banner plaque */}
        <path
          d="M104 22C104 12.0589 112.059 4 122 4H470C479.941 4 488 12.0589 488 22V112C488 121.941 479.941 130 470 130H262L224 162L230 130H122C112.059 130 104 121.941 104 112V22Z"
          fill="#7042A1"
          stroke="#291B40"
          strokeWidth="6"
          strokeLinejoin="round"
        />
        <path
          d="M122 12H470C475.523 12 480 16.4772 480 22V112C480 117.523 475.523 122 470 122H122C116.477 122 112 117.523 112 112V22C112 16.4772 116.477 12 122 12Z"
          stroke="#9B6AD2"
          strokeWidth="2.5"
        />

        {/* Arabic Title inside plaque with generous horizontal breathing room */}
        <text
          x="296"
          y="80"
          textAnchor="middle"
          fill="#FFD95A"
          stroke="#291B40"
          strokeWidth="7"
          paintOrder="stroke fill"
          fontFamily="Cairo, sans-serif"
          fontWeight="900"
          fontSize="44"
        >
          سؤال النخبة
        </text>

        {/* Emerald crown/star gleam */}
        <g transform="translate(466, 8)">
          <path
            d="M16 0L20.5 11.5L32 16L20.5 20.5L16 32L11.5 20.5L0 16L11.5 11.5L16 0Z"
            fill="#00B978"
            stroke="#291B40"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </g>

        {/* Question mark badge */}
        <g transform="translate(82, 8)">
          <circle cx="16" cy="16" r="16" fill="#FFD95A" stroke="#291B40" strokeWidth="3.5" />
          <text
            x="16"
            y="22"
            textAnchor="middle"
            fill="#291B40"
            fontFamily="Cairo, sans-serif"
            fontWeight="900"
            fontSize="19"
          >
            ؟
          </text>
        </g>
      </svg>
    </div>
  );
}
