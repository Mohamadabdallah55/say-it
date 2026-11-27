import { PlatformGameMascot } from './PlatformGameMascot';
export function ChallengeGameLogo({game}:{game:'thirty'|'khalf'|'codenames'|'horouf'|'drawing'|'words'}) {
  if(game==='words')return <PlatformGameMascot game="words" className="platform-stage-mascot"/>;
  if(game==='drawing')return <PlatformGameMascot game="drawing" className="platform-stage-mascot"/>;
  if(game==='thirty')return <div className="ca-brand-logo ca-brand-thirty-mascot"><img src="/brand/games/30s-stopwatch.svg" alt="شعار تحدي الثلاثين" width={520} height={500} decoding="async"/></div>;
  if(game==='khalf')return <div className="ca-brand-logo ca-brand-khalf"><img src="/brand/games/khalf-mascot.svg" alt="" width={280} height={260} decoding="async"/><strong>خلف خلاف!</strong></div>;
  if(game==='codenames')return <div className="ca-brand-logo ca-brand-code"><img src="/brand/games/codenames-logo.svg" alt="CODE NAMES" width={500} height={112} decoding="async"/></div>;
  return <div className="ca-brand-logo ca-brand-horouf" aria-label="حروف مع النخبة"><strong>حروف</strong><span>مع</span><b>النخبة</b></div>;
}
