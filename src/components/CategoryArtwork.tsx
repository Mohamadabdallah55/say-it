import { memo, useState } from 'react';
import type { CategoryIconKey } from '../game/types';
import { getCategoryCardArt, getUploadedCategoryArt } from '../utils/gameAssets';

interface CategoryArtworkProps {
  categoryId?: string;
  coverImageUrl?: string;
  iconKey: CategoryIconKey;
  accentColor: string;
  topic?: string;
  coverage?: string[];
}

export const CategoryArtwork = memo(function CategoryArtwork({
  categoryId = '',
  coverImageUrl,
  iconKey,
  accentColor,
  topic = '',
  coverage = [],
}: CategoryArtworkProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const subject = topic.replace(/[\u064B-\u065F]/g, '');
  const waterMotif = ['تبخر', 'تكاثف', 'هطول', 'جريان', 'تسرب'].find((word) => subject.includes(word));
  const uploadedArt = getUploadedCategoryArt(categoryId);
  const artSrc = uploadedArt || coverImageUrl || getCategoryCardArt(categoryId, iconKey);

  if (waterMotif && !uploadedArt && !coverImageUrl) {
    return (
      <div className="lesson-illustration" style={{ backgroundColor: accentColor }} aria-hidden="true">
        <svg viewBox="0 0 260 110" fill="none" stroke="#342545" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="131" cy="51" r="46" fill="#fff3d5" stroke="none" opacity=".38" />
          {waterMotif === 'تبخر' && (
            <>
              <circle cx="168" cy="25" r="17" fill="#ffdb55" />
              <path d="M58 83q18-9 36 0t36 0 36 0 36 0v14H58z" fill="#64cbe2" />
              <path d="M98 72q12-11 1-20t2-21m26 37q12-11 1-20t2-21m23 43q10-8 5-17" stroke="#fff6db" strokeWidth="6" />
            </>
          )}
          {(waterMotif === 'تكاثف' || waterMotif === 'هطول') && (
            <>
              <path d="M71 58q-8-24 16-25 10-32 36-14 24-18 41 8 26-3 27 18 3 15-18 15z" fill="#fff5dc" />
              {waterMotif === 'تكاثف' ? (
                <g fill="#74cbe3">
                  <circle cx="111" cy="78" r="5" />
                  <circle cx="125" cy="74" r="8" />
                  <circle cx="150" cy="78" r="11" />
                </g>
              ) : (
                <path d="m95 70-8 13m31-13-9 16m33-14-9 16m34-17-8 14" stroke="#206988" strokeWidth="6" />
              )}
            </>
          )}
          {waterMotif === 'جريان' && (
            <>
              <path d="m39 88 49-54 30 19 23-30 74 65z" fill="#dfac70" />
              <path d="M139 43q-24 18-1 21t-29 12q-22 6 5 18h37q-42-12-7-20 23-7 5-13t-10-18z" fill="#85d9e8" />
            </>
          )}
          {waterMotif === 'تسرب' && (
            <>
              <path d="M55 54q38-12 75 0t75 0v42H55z" fill="#d5a76d" />
              <path d="M55 83q40-10 75 0t75-3v16H55z" fill="#77cce1" />
              <path d="m96 21-6 13m35-14-7 15m35-13-7 14m-35 15v20m-6-6 6 6 5-6m32-13v23m-6-6 6 6 6-6" stroke="#236480" />
            </>
          )}
        </svg>
      </div>
    );
  }

  return (
    <div
      className="relative w-full aspect-[4/3] max-h-48 rounded-t-[13px] overflow-hidden border-b-[2.5px] border-[#1F112E] flex items-center justify-center"
      style={{ backgroundColor: accentColor }}
    >
      {coverage.length > 0 && (
        <div className="lesson-concepts" aria-hidden="true">
          {coverage
            .filter(Boolean)
            .slice(0, 2)
            .map((term, i) => (
              <span key={i}>{term}</span>
            ))}
        </div>
      )}

      {!imgFailed ? (
        <>
          {!imgLoaded && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-white/15 animate-pulse"
            />
          )}
          <img
            src={artSrc}
            loading="lazy"
            decoding="async"
            alt={topic || 'صورة الفئة'}
            referrerPolicy="no-referrer"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
            className={`w-full h-full object-cover select-none transition-opacity duration-200 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        <span className="font-display font-black text-2xl text-white drop-shadow-[0_2px_0_#1F112E] px-3 text-center">
          {topic.slice(0, 18)}
        </span>
      )}
    </div>
  );
});
