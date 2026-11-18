interface GameLogoProps {
  size?: 'sm' | 'md' | 'lg';
  dark?: boolean;
  className?: string;
}

export function GameLogo({ size = 'md', dark = false, className = '' }: GameLogoProps) {
  const width = { sm: 'w-32', md: 'w-64', lg: 'w-[min(85vw,470px)]' }[size];
  return <img src="/brand/match-logo.jpeg"
    alt="يمكن هاي — YEMKEN HAY" width="470" height="170" className={`inline-block h-auto max-w-full ${width} ${className}`} />;
}
