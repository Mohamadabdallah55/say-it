import type { LifelineType } from '../game/types';
import { LIFELINE_CARD_ART } from '../utils/gameAssets';

export function PowerCardIcon({ card, small = false }: { card: LifelineType; small?: boolean }) {
  // Keep the existing Shannes artwork and the other unsupported card assets.
  if (!['double_points', 'pit', 'two_answers', 'silence', 'hint', 'show_cards'].includes(card)) {
    return (
      <img
        src={LIFELINE_CARD_ART[card]}
        alt=""
        className={small ? 'h-6 w-6 object-contain' : 'h-14 w-full object-contain select-none'}
      />
    );
  }
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true"
      className={small ? 'h-6 w-6 shrink-0' : 'h-14 w-14 max-w-full select-none'}
      strokeLinecap="round" strokeLinejoin="round">
      {card === 'double_points' && <>
        <path d="M18 22C8 18 5 23 7 32l10 5-8 4 14 6M46 22c10-4 13 1 11 10l-10 5 8 4-14 6" fill="#dce6df" stroke="#718b83" strokeWidth="1.5"/>
        <g transform="rotate(22 32 32)">
          <rect x="17" y="11" width="30" height="41" rx="5" fill="#8ba693" stroke="#536d60" strokeWidth="1.6"/>
          <rect x="20" y="14" width="24" height="35" rx="3" fill="#dbe3c7" stroke="#718b68" strokeWidth="1.3"/>
          <path d="M18 25h28v12H18z" fill="#f8e2a3" stroke="#a28c51" strokeWidth="1.2"/>
          <text x="32" y="34" textAnchor="middle" fontSize="10" fontWeight="900" fill="#695525">×2</text>
        </g>
      </>}
      {card === 'pit' && <>
        <ellipse cx="34" cy="47" rx="23" ry="9" fill="#74513c"/>
        <ellipse cx="34" cy="46" rx="15" ry="5" fill="#392d2a"/>
        <path d="M40 43l-9-7m-5 11l5-11" stroke="#be9a70" strokeWidth="3"/>
        <path d="M15 43L40 14" stroke="#6f5845" strokeWidth="5"/>
        <path d="M10 42l11 10 10-12-9-8z" fill="#9aa3a5" stroke="#626f74" strokeWidth="1.5"/>
        <path d="M36 12l7-6 8 7-7 7z" fill="#ffd45d" stroke="#b58b31" strokeWidth="2"/>
      </>}
      {card === 'two_answers' && <>
        {[4,34].map((x,i)=><g key={x} transform={`translate(${x} 0)`}>
          <path d="M5 29c0-4 5-6 9-5 3-3 9-1 10 2 4 1 5 4 4 8l-3 8-13 3-7-7z" fill="#fff3df" stroke="#f06c76" strokeWidth="2.5"/>
          <path d="M11 28v8m6-10v10m6-8v7M8 38l5 2" stroke="#f06c76" strokeWidth="2"/>
          <path d="M9 44l-1 4m14-5 2 4" stroke="#f06c76" strokeWidth="2"/>
        </g>)}
      </>}
      {card === 'silence' && <>
        <path d="M32 7c-4 11-21 21-21 35a21 21 0 0 0 42 0C53 28 36 18 32 7z" fill="#80d7dc" stroke="#56aeb8" strokeWidth="2"/>
        <path d="M16 37c0-7 7-14 10-16" stroke="#c7f6f4" strokeWidth="4" opacity=".8"/>
        <circle cx="25" cy="36" r="2.3" fill="#344c55"/><circle cx="40" cy="36" r="2.3" fill="#344c55"/>
        <path d="M28 44h8" stroke="#344c55" strokeWidth="2.3"/>
        <path d="M32 40v8" stroke="#fff0d3" strokeWidth="3"/>
      </>}
      {card === 'hint' && <>
        <circle cx="32" cy="32" r="27" fill="#d7efe7"/>
        <circle cx="32" cy="32" r="21" fill="#56c7a9"/>
        <path d="M24 17c-5 2-7 5-4 12 3 8 8 14 17 18 6 3 10 0 11-5l-9-6-4 4c-5-3-8-6-10-11l4-4z" fill="#fffdf0"/>
      </>}
      {card === 'show_cards' && <>
        <circle cx="32" cy="32" r="27" fill="#f3e4c8" stroke="#bdab8d" strokeWidth="1.5"/>
        <rect x="30" y="14" width="21" height="34" rx="5" transform="rotate(20 40 31)" fill="#e7a29a" stroke="#ab706a" strokeWidth="1.3"/>
        <rect x="12" y="17" width="23" height="34" rx="5" transform="rotate(-20 24 34)" fill="#fff3d8" stroke="#ad9d7b" strokeWidth="1.3"/>
        <path d="M19 32l5 4 7-10" stroke="#6caa96" strokeWidth="2.5"/>
        <path d="M39 25l5 6m0-7l-5 8" stroke="#fff3d8" strokeWidth="2"/>
      </>}
    </svg>
  );
}
