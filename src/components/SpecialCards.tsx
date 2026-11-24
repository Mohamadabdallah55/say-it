import { LIFELINE_META, PRE_QUESTION_LIFELINES } from '../game/pdfValidation';
import type { LifelineType } from '../game/types';
import { PowerCardIcon } from './PowerCardIcon';

const PRE_QUESTION_CARDS: Array<{ key: LifelineType; title: string; rule: string }> = [
  { key: 'silence', title: 'صمت', rule: LIFELINE_META.silence.description },
  { key: 'show_cards', title: 'افرد أوراقك', rule: LIFELINE_META.show_cards.description },
  { key: 'two_answers', title: 'إجابتان', rule: 'لديك فرصتان للإجابة' },
  { key: 'pit', title: 'الحفرة', rule: 'اطرح نقاطك من جميع الخصوم' },
  { key: 'double_points', title: 'نقاط مضاعفة', rule: 'ضاعف نقاط هذا السؤال' },
  {
    key: 'second_chance',
    title: 'فرصة ثانية',
    rule: 'محاولة إضافية مع +15 ثانية',
  },
  {
    key: 'buzzer_challenge',
    title: 'تحدي الجرس',
    rule: LIFELINE_META.buzzer_challenge.description,
  },
];

export function SpecialCards({
  team,
  categoryName,
  categoryColor,
  host,
  used,
  allowed,
  choose,
  skip,
}: {
  used: LifelineType[];
  allowed?: LifelineType[];
  team: string;
  categoryName?: string;
  categoryColor?: string;
  host: boolean;
  canSwap?: boolean;
  choose: (key: LifelineType) => void;
  skip: () => void;
}) {
  const visibleCards = PRE_QUESTION_CARDS.filter(
    (c) =>
      PRE_QUESTION_LIFELINES.includes(c.key) &&
      (!allowed || allowed.includes(c.key)),
  );

  return (
    <section className="round-scene lifeline-stage mx-auto w-full max-w-[760px] space-y-4 py-2 text-center">
      {categoryName && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-xl border-[2.5px] border-[#1F112E] bg-[#FAF7EE] px-4 py-1.5 font-display font-black text-sm md:text-base text-[#1F112E] shadow-[0_3px_0_#1F112E]">
            <span
              className="h-3 w-3 rounded-full border border-[#1F112E]/40"
              style={{ backgroundColor: categoryColor || '#00A86B' }}
            />
            <span>{categoryName}</span>
          </span>
        </div>
      )}

      <div className="rounded-2xl border-[2.5px] border-[#1F112E] bg-[#FAF7EE] p-5 md:p-8 shadow-[0_5px_0_#1F112E] space-y-6">
        <div className="space-y-1">
          <h1 className="font-display font-black text-2xl md:text-3xl text-[#1F112E]">
            هل تريد استخدام بطاقة خاصة؟
          </h1>
          <p className="text-xs font-bold text-[#1F112E]/65">
            صاحب الدور · {team}
          </p>
        </div>

        <div
          className={`round-card-picker grid gap-3 md:gap-4 ${
            visibleCards.length <= 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : visibleCards.length === 4
                ? 'grid-cols-2 sm:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-3'
          }`}
        >
          {visibleCards.map((card) => {
            const spent = used.includes(card.key);
            return (
              <button
                type="button"
                key={card.key}
                disabled={!host || spent}
                onClick={() => choose(card.key)}
                className={`rounded-2xl border-2 border-[#1F112E] bg-white p-4 md:p-5 flex flex-col items-center justify-center text-center gap-2 transition ${
                  spent
                    ? 'opacity-45 cursor-not-allowed'
                    : host
                      ? 'shadow-[0_3px_0_#1F112E] hover:-translate-y-0.5 hover:bg-[#FFFDF5] cursor-pointer'
                      : 'cursor-default'
                }`}
              >
                <PowerCardIcon card={card.key} />
                <strong className="font-display font-black text-lg text-[#1F112E]">
                  {card.title}
                </strong>
                <small className="text-xs font-bold text-[#1F112E]/70 leading-snug">
                  {spent ? 'استخدمها الفريق' : card.rule}
                </small>
              </button>
            );
          })}
        </div>

        {host ? (
          <button
            type="button"
            aria-label="تخطِّ البطاقة ومتابعة السؤال"
            onClick={skip}
            className="game-btn-3d w-full rounded-2xl border-[2.5px] border-[#1F112E] bg-[#2C1844] hover:bg-[#3B215A] py-3.5 text-white font-display font-black text-lg md:text-xl shadow-[0_4px_0_#140A20] cursor-pointer"
          >
            تخطِّ
          </button>
        ) : (
          <p className="text-sm font-bold text-[#1F112E]/70">بانتظار اختيار المشرف...</p>
        )}
      </div>
    </section>
  );
}
