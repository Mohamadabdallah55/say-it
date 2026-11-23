import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, ImageOff, X, ZoomIn } from 'lucide-react';

export type MediaOrientation = 'landscape' | 'portrait' | 'square';

interface QuestionMediaProps {
  imageSrc?: string;
  srcSet?: string;
  sizes?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  caption?: string;
  pageNumber?: number;
  compact?: boolean;
  obscured?: boolean;
  wide?: boolean;
  variant?: 'question' | 'answer';
  onOrientationDetected?: (orientation: MediaOrientation) => void;
}

export function QuestionMedia({
  imageSrc,
  srcSet,
  sizes = '(max-width: 1024px) 92vw, 60vw',
  sourceUrl,
  sourceLabel = 'مصدر الصورة',
  caption,
  pageNumber,
  compact = false,
  obscured = false,
  wide = false,
  variant = 'question',
  onOrientationDetected,
}: QuestionMediaProps) {
  const [zoomed, setZoomed] = useState(false);
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(undefined);
  const [failedImage, setFailedImage] = useState<string | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const reportOrientation = useCallback(
    (img: HTMLImageElement) => {
      if (!onOrientationDetected || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      const ratio = img.naturalWidth / img.naturalHeight;
      if (ratio > 1.15) onOrientationDetected('landscape');
      else if (ratio < 0.85) onOrientationDetected('portrait');
      else onOrientationDetected('square');
    },
    [onOrientationDetected],
  );

  useEffect(() => {
    setFailedImage(undefined);
    const el = imgRef.current;
    if (imageSrc && el && el.complete && el.naturalWidth > 0) {
      setLoadedSrc(imageSrc);
      reportOrientation(el);
    } else {
      setLoadedSrc(undefined);
    }
  }, [imageSrc, reportOrientation]);

  useEffect(() => {
    if (obscured && zoomed) {
      setZoomed(false);
    }
  }, [obscured, zoomed]);

  useEffect(() => {
    if (!zoomed) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zoomed]);

  const sourceLink = sourceUrl && (
    <a className="text-xs font-bold underline" href={sourceUrl} target="_blank" rel="noreferrer">
      {sourceLabel}
    </a>
  );

  if (!imageSrc) return sourceLink || null;

  const isFailed = imageSrc === failedImage;
  const isLoaded = imageSrc === loadedSrc;
  const altText = obscured
    ? 'شعار مموّه للتخمين'
    : caption?.trim() || (variant === 'answer' ? 'صورة توضيحية للإجابة' : 'شكل أو صورة توضيحية للسؤال');
  const needsDarkSurface =
    /\/assets\/jordan_brands_nostalgia\/JOR-MEM-LOGO-(003|026|028|075|093)\./i.test(imageSrc);
  const surfaceClass = needsDarkSurface ? 'bg-[#1E2433]' : 'question-media-stage';

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoadedSrc(imageSrc);
    reportOrientation(e.currentTarget);
  };

  const modalContent =
    zoomed && !obscured && !isFailed && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={altText}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[#1F112E]/88 p-4 sm:p-6 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-5xl w-full rounded-3xl border-[3px] border-[#1F112E] bg-[#FFFDF7] p-4 md:p-6 shadow-[0_8px_0_#1F112E] space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-black text-[#63349B]">
                  {pageNumber && (
                    <span className="rounded-lg border-2 border-[#1F112E] bg-[#FFE047] px-2.5 py-0.5 text-[#1F112E] tabular-nums">
                      صفحة {pageNumber}
                    </span>
                  )}
                  {caption && <span className="text-sm font-bold text-[#1F112E]">{caption}</span>}
                </div>

                <button
                  type="button"
                  onClick={() => setZoomed(false)}
                  aria-label="إغلاق عرض الصورة المكبرة"
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1F112E] bg-[#FFE5E7] px-3.5 min-h-[44px] text-xs sm:text-sm font-black text-[#1F112E] hover:bg-[#F05B63] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>إغلاق</span>
                </button>
              </div>

              <div className={`rounded-2xl border-2 border-[#1F112E]/20 ${surfaceClass} p-3 flex items-center justify-center`}>
                <img
                  src={imageSrc}
                  srcSet={srcSet}
                  sizes="92vw"
                  referrerPolicy="no-referrer"
                  alt={altText}
                  className="max-h-[78vh] w-auto max-w-full rounded-xl object-contain"
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  // Answer images keep full prominence (>= question images) rather than shrinking awkwardly
  const heightConstraint =
    variant === 'answer'
      ? 'max-h-[62vh]'
      : compact
        ? 'max-h-[38vh]'
        : wide
          ? 'max-h-[68vh]'
          : 'max-h-[64vh]';

  const imgClasses = `mx-auto w-auto h-auto max-w-full rounded-xl object-contain transition-opacity duration-200 ${heightConstraint} ${
    obscured ? 'blur-[14px] scale-110 select-none pointer-events-none' : 'blur-0 scale-100'
  } ${!isLoaded && !isFailed ? 'opacity-0' : 'opacity-100'}`;

  return (
    <>
      <figure
        className={`question-media-figure mx-auto w-full ${
          variant === 'answer'
            ? 'max-w-3xl my-2'
            : wide
              ? 'max-w-4xl'
              : 'max-w-3xl'
        } flex flex-col items-center`}
        data-obscured={obscured ? 'true' : 'false'}
      >
        {isFailed ? (
          <div className="w-full rounded-2xl border-[2.5px] border-[#1F112E] bg-[#F2ECE0] p-6 flex flex-col items-center justify-center gap-2 text-center shadow-[0_4px_0_#1F112E]">
            <ImageOff className="w-8 h-8 text-[#1F112E]/50" />
            <span className="font-display font-black text-sm text-[#1F112E]/80">
              تعذر تحميل الصورة التوضيحية
            </span>
            {caption && (
              <span className="text-xs font-bold text-[#1F112E]/60">{caption}</span>
            )}
          </div>
        ) : obscured ? (
          <div
            aria-label="شعار مموّه قبل كشف الإجابة"
            className={`relative w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] ${surfaceClass} shadow-[0_4px_0_#1F112E] p-3 flex items-center justify-center min-h-[180px]`}
          >
            {!isLoaded && (
              <div
                aria-hidden="true"
                className="absolute inset-3 rounded-xl bg-[#1F112E]/10 animate-pulse"
              />
            )}
            <img
              ref={imgRef}
              src={imageSrc}
              srcSet={srcSet}
              sizes={sizes}
              loading="eager"
              decoding="async"
              alt={altText}
              draggable={false}
              onLoad={handleImageLoad}
              onError={() => setFailedImage(imageSrc)}
              className={imgClasses}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#1F112E]/10 via-transparent to-[#1F112E]/15 backdrop-blur-[3px]"
            />
            <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-lg border-2 border-[#1F112E] bg-[#1F112E] px-3 py-1 text-xs font-black text-[#FFE047] shadow-[0_2px_0_#1F112E]">
              <EyeOff className="w-3.5 h-3.5" />
              <span>شعار مموّه</span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            aria-label={`تكبير الصورة: ${altText}`}
            className={`group relative w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] ${surfaceClass} shadow-[0_4px_0_#1F112E] transition hover:-translate-y-0.5 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[#63349B] flex flex-col items-center justify-center gap-2 p-2.5 sm:p-3.5 ${
              !isLoaded ? 'min-h-[190px]' : ''
            }`}
          >
            {!isLoaded && (
              <div
                aria-hidden="true"
                className="absolute inset-3 rounded-xl bg-[#1F112E]/10 animate-pulse pointer-events-none"
              />
            )}
            <img
              ref={imgRef}
              src={imageSrc}
              srcSet={srcSet}
              sizes={sizes}
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={handleImageLoad}
              onError={() => {
                setZoomed(false);
                setFailedImage(imageSrc);
              }}
              alt={altText}
              className={imgClasses}
            />
            <span className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-3 py-1 text-xs font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] opacity-95 group-hover:opacity-100">
              <ZoomIn className="w-3.5 h-3.5" />
              <span>اضغط للتكبير</span>
            </span>
          </button>
        )}

        {(caption || pageNumber) && !obscured && (
          <figcaption
            className={`mt-2 flex flex-wrap items-center justify-center gap-1.5 text-center text-xs font-bold ${
              variant === 'answer' ? 'text-white/90' : 'text-[#1F112E]/80'
            }`}
          >
            {pageNumber && (
              <span className="rounded-md border border-[#1F112E]/25 bg-[#EDE7F6] px-1.5 py-0.5 text-[10px] font-black text-[#63349B] tabular-nums">
                ص {pageNumber}
              </span>
            )}
            {caption && <span>{caption}</span>}
          </figcaption>
        )}
        {sourceLink && <div className="mt-1.5">{sourceLink}</div>}
      </figure>
      {modalContent}
    </>
  );
}
