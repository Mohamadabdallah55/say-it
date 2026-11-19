import { useState } from 'react';

interface GameLogoProps {
  size?: 'sm' | 'md' | 'lg';
  dark?: boolean;
  variant?: 'badge' | 'hero';
  className?: string;
}

const LOGO_ASSET_PATH = '/assets/aistudio/Yomken_Hai_Quiz_Mascot_Logo_caf57bc2.png';

export function GameLogo({
  size = 'md',
  variant,
  className = '',
}: GameLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedVariant = variant ?? (size === 'lg' ? 'hero' : 'badge');

  const sizeClass = {
    sm: 'w-28 sm:w-32',
    md: 'w-56 sm:w-64',
    lg: 'w-[min(90vw,460px)]',
  }[size];

  if (imgFailed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-2xl bg-[#FFD95A] border-[2.5px] border-[#291B40] px-4 py-2 font-display font-black text-[#291B40] shadow-[0_4px_0_#291B40] ${className}`}
      >
        يمكن هاي — YEMKEN HAY
      </span>
    );
  }

  if (resolvedVariant === 'hero') {
    return (
      <div className={`relative inline-flex items-center justify-center ${sizeClass} ${className}`}>
        <img
          src={LOGO_ASSET_PATH}
          alt="شعار مسابقة يمكن هاي"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-auto block select-none"
          style={{
            WebkitMaskImage:
              'radial-gradient(ellipse 74% 72% at 50% 50%, #000 44%, rgba(0,0,0,0.45) 66%, transparent 88%)',
            maskImage:
              'radial-gradient(ellipse 74% 72% at 50% 50%, #000 44%, rgba(0,0,0,0.45) 66%, transparent 88%)',
          }}
        />
      </div>
    );
  }

  return (
    <img
      src="/brand/header-mascot.png"
      alt="يمكن هاي"
      onError={() => setImgFailed(true)}
      className={`inline-block h-auto object-contain select-none ${sizeClass} ${className}`}
    />
  );
}
