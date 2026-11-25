import { memo, useState } from 'react';
import { Shield } from 'lucide-react';
type Club = { name: string; logoUrl?: string; hidden?: boolean };

const ClubBadge = memo(function ClubBadge({ club, compact }: { club: Club; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = compact ? 'h-10 md:h-12' : 'h-14 md:h-[76px]';
  if (club.hidden) return <div aria-label="النادي المفقود" className={size + ' flex items-center justify-center text-4xl md:text-5xl font-black text-[#63349B]'}>؟</div>;
  return <div className={size + ' flex items-center justify-center w-full'}>
    {club.logoUrl && !failed ? <img src={club.logoUrl} alt="" decoding="async" loading="eager" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-full max-w-[86%] object-contain select-none" /> : <Shield aria-hidden="true" className="h-8 w-8 text-[#A786CE]" />}
  </div>;
});

export const CareerTimeline = memo(function CareerTimeline({ clubs, compact = false }: { clubs: Club[]; compact?: boolean }) {
  const columns = Math.min(clubs.length, clubs.length >= 9 ? 5 : 4);
  return <div data-testid="career-timeline" dir="rtl" className="w-full min-w-0 rounded-2xl border-[3px] border-[#1F112E] bg-[#38214E] p-2.5 md:p-4 shadow-[0_5px_0_#1F112E]">
    <div className="mb-2 text-center font-display font-black text-[#FFE047] text-base md:text-xl">مسيرة اللاعب</div>
    <div className="grid gap-1.5 md:gap-2" style={{gridTemplateColumns:'repeat('+columns+', minmax(0, 1fr))'}}>
      {clubs.map((club, index) => <div key={index+'-'+club.name} className={'relative flex min-w-0 flex-col items-center justify-center rounded-xl border-2 border-[#20152E] px-1 py-1.5 ' + (club.hidden ? 'bg-[#FFE047]' : 'bg-[#FFF9E9]')}>
        <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-[#63349B] text-[10px] font-black text-white">{index+1}</span>
        <ClubBadge club={club} compact={compact} />
        <span className="mt-1 min-h-[2.2em] flex items-center justify-center text-center text-[11px] leading-tight md:text-sm font-black text-[#20152E] break-words">{club.hidden ? 'النادي المفقود' : club.name}</span>
      </div>)}
    </div>
    <div className="mt-2 text-center text-[10px] md:text-xs font-bold text-[#E6D8F7]">محطات مختارة • من الأقدم للأحدث</div>
  </div>;
});
