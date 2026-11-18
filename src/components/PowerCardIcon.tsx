import { Banknote, BellRing, Hand, Phone, Shovel, TimerReset } from 'lucide-react';
import type { LifelineType } from '../game/types';
import { GameLogo } from './GameLogo';

const symbols = {
  double_points: [Banknote, '#598653'],
  pit: [Shovel, '#99622f'],
  two_answers: [Hand, '#d74e64'],
  hint: [Phone, '#118d74'],
  second_chance: [TimerReset, '#ac7525'],
  buzzer_challenge: [BellRing, '#6951a0'],
} as const;

export function PowerCardIcon({ card, small = false }: { card: LifelineType; small?: boolean }) {
  if (card === 'swap_question') {
    return <span aria-hidden="true"><GameLogo variant="badge" className={small ? '!w-10' : '!w-20'} /></span>;
  }
  const [Symbol, color] = symbols[card];
  return <span aria-hidden="true" className="inline-flex items-center justify-center" style={{ color }}>
    <Symbol size={small ? 22 : 36} strokeWidth={2.3} />
    {card === 'two_answers' && <Symbol size={small ? 18 : 28} strokeWidth={2.3} />}
  </span>;
}
