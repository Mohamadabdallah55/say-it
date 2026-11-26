import type { LifelineType, MatchSettings } from './types';

const VALID_CARDS = new Set<LifelineType>([
  'double_points', 'pit', 'two_answers', 'silence', 'show_cards',
  'second_chance', 'buzzer_challenge', 'swap_question', 'hint',
]);

export function cardsForTeam(settings: Partial<MatchSettings>, teamId?: string): LifelineType[] | undefined {
  if (settings.teamCards) return (teamId && settings.teamCards[teamId]) || [];
  return settings.cards;
}

export function validateCardSelections(settings: Partial<MatchSettings> | undefined, teamIds: string[]): string | undefined {
  const validate = (cards: unknown) => {
    if (!Array.isArray(cards) || cards.some(card => !VALID_CARDS.has(card)) || new Set(cards).size !== cards.length)
      return 'اختيار البطاقات غير صالح.';
    if (cards.includes('hint') && cards.includes('swap_question')) return 'اختر شنّص أو ألو فقط لكل فريق.';
    return undefined;
  };
  if (!settings) return;
  if (settings.teamCards !== undefined) {
    if (!settings.teamCards || typeof settings.teamCards !== 'object' || Array.isArray(settings.teamCards) ||
        Object.keys(settings.teamCards).length !== teamIds.length ||
        teamIds.some(id => !Object.prototype.hasOwnProperty.call(settings.teamCards, id))) {
      return 'حدّد بطاقات كل فريق قبل بدء المباراة.';
    }
    for (const id of teamIds) {
      const error = validate(settings.teamCards[id]);
      if (error) return error;
    }
    return;
  }
  return settings.cards === undefined ? undefined : validate(settings.cards);
}
