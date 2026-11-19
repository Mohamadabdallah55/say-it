import type { LifelineType } from '../game/types';
import { LIFELINE_CARD_ART } from '../utils/gameAssets';

export function PowerCardIcon({ card, small = false }: { card: LifelineType; small?: boolean }) {
  return (
    <img
      src={LIFELINE_CARD_ART[card]}
      alt=""
      className={small ? 'h-6 w-6 object-contain' : 'h-14 w-full object-contain select-none'}
    />
  );
}
