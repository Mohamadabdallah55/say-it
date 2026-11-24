function ThirtyLogo() {
  return (
    <span className="ca-thirty-mark" aria-label="تحدي الـ30 ثانية">
      <span className="ca-thirty-mark__badge" dir="ltr">
        <svg className="ca-thirty-mark__eyes" viewBox="0 0 42 18" width="32" height="14" aria-hidden="true">
          <ellipse cx="13" cy="9" rx="7.5" ry="7.5" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.4" />
          <ellipse cx="29" cy="9" rx="7.5" ry="7.5" fill="#FFF9ED" stroke="#29183E" strokeWidth="2.4" />
          <circle cx="14.5" cy="9.5" r="3.4" fill="#29183E" />
          <circle cx="27.5" cy="9.5" r="3.4" fill="#29183E" />
          <circle cx="15.7" cy="8.2" r="1.2" fill="#FFF9ED" />
          <circle cx="28.7" cy="8.2" r="1.2" fill="#FFF9ED" />
        </svg>
        <span className="ca-thirty-mark__number">30</span>
      </span>
      <span className="ca-thirty-mark__words">
        <b>تحدّي</b>
        <small>ثانية</small>
      </span>
    </span>
  );
}

export function ChallengeGameLogo({game}:{game:'thirty'|'khalf'|'codenames'|'horouf'}) {
  if(game==='thirty')return <div className="ca-brand-logo ca-brand-thirty"><ThirtyLogo/></div>;
  if(game==='khalf')return <div className="ca-brand-logo ca-brand-khalf"><img src="/brand/games/khalf-mascot.svg" alt="" width={280} height={260} decoding="async"/><strong>خلف خلاف!</strong></div>;
  if(game==='codenames')return <div className="ca-brand-logo ca-brand-code"><img src="/brand/games/codenames-logo.svg" alt="CODE NAMES" width={500} height={112} decoding="async"/></div>;
  return <div className="ca-brand-logo ca-brand-horouf" aria-label="حروف مع النخبة"><strong>حروف</strong><span>مع</span><b>النخبة</b></div>;
}
