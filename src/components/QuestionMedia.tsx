import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, X, ZoomIn } from 'lucide-react';

interface QuestionMediaProps {
  imageSrc?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  caption?: string;
  pageNumber?: number;
  compact?: boolean;
  obscured?: boolean;
  wide?: boolean;
}

export function QuestionMedia({
  imageSrc,
  sourceUrl,
  sourceLabel = 'مصدر الصورة',
  caption,
  pageNumber,
  compact = false,
  obscured = false,
  wide = false,
}: QuestionMediaProps) {
  const [zoomed, setZoomed] = useState(false);
  const [failedImage, setFailedImage] = useState<string>();

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
  if (!imageSrc || imageSrc === failedImage) return sourceLink || null;

  const altText = obscured
    ? 'شعار مموّه للتخمين'
    : caption?.trim() || 'شكل أو صورة توضيحية للسؤال';
  const needsDarkSurface =
    /\/assets\/jordan_brands_nostalgia\/JOR-MEM-LOGO-(003|026|028|075|093)\./i.test(imageSrc);
  const surfaceClass = needsDarkSurface ? 'bg-[#1E2433]' : 'bg-white';

  const modalContent =
    zoomed && !obscured && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={altText}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1F112E]/85 p-4 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full rounded-3xl border-[3px] border-[#1F112E] bg-[#FFFDF7] p-4 md:p-5 shadow-[0_8px_0_#1F112E] space-y-3"
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
                  className="inline-flex items-center gap-1 rounded-xl border-2 border-[#1F112E] bg-[#FFE5E7] px-3 py-1.5 text-xs font-black text-[#1F112E] hover:bg-[#F05B63] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>إغلاق</span>
                </button>
              </div>

              <div className={`rounded-2xl border-2 border-[#1F112E]/20 ${surfaceClass} p-3 flex items-center justify-center`}>
                <img
                  src={imageSrc}
                  referrerPolicy="no-referrer"
                  alt={altText}
                  className="max-h-[76vh] w-auto max-w-full rounded-xl object-contain"
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const imgClasses = `mx-auto w-auto max-w-full rounded-xl object-contain transition-all duration-500 ${
    compact ? 'max-h-[155px]' : wide ? 'max-h-[410px]' : 'max-h-[210px] md:max-h-[260px]'
  } ${obscured ? 'blur-[14px] scale-110 select-none pointer-events-none' : 'blur-0 scale-100'}`;

  return (
    <>
      <figure
        className={`question-media-figure mx-auto mb-3 w-full flex flex-col items-center ${wide && !compact ? 'max-w-3xl' : 'max-w-xl'}`}
        data-obscured={obscured ? 'true' : 'false'}
      >
        {obscured ? (
          <div
            aria-label="شعار مموّه قبل كشف الإجابة"
            className={`relative w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] ${surfaceClass} shadow-[0_4px_0_#1F112E] ${
              compact ? 'p-1.5' : 'p-2.5'
            }`}
          >
            <img
              src={imageSrc}
              alt={altText}
              draggable={false}
              className={imgClasses}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#1F112E]/10 via-transparent to-[#1F112E]/15 backdrop-blur-[3px]"
            />
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg border-2 border-[#1F112E] bg-[#1F112E] px-2.5 py-0.5 text-[11px] font-black text-[#FFE047] shadow-[0_2px_0_#1F112E]">
              <EyeOff className="w-3.5 h-3.5" />
              <span>شعار مموّه</span>
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setZoomed(true)}
            aria-label={`تكبير الصورة: ${altText}`}
            className={`group relative w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] ${surfaceClass} shadow-[0_4px_0_#1F112E] transition hover:-translate-y-0.5 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[#63349B] ${
              compact ? 'p-1.5' : 'p-2.5'
            }`}
          >
            <img
              src={imageSrc}
              referrerPolicy="no-referrer"
              onError={sourceUrl ? () => {
                setZoomed(false);
                setFailedImage(imageSrc);
              } : undefined}
              alt={altText}
              className={imgClasses}
            />
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg border-2 border-[#1F112E] bg-[#FFE047] px-2 py-0.5 text-[11px] font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] opacity-95 group-hover:opacity-100">
              <ZoomIn className="w-3.5 h-3.5" />
              <span>اضغط للتكبير</span>
            </span>
          </button>
        )}

        {(caption || pageNumber) && !obscured && (
          <figcaption className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-center text-xs font-bold text-[#1F112E]/80">
            {pageNumber && (
              <span className="rounded-md border border-[#1F112E]/25 bg-[#EDE7F6] px-1.5 py-0.5 text-[10px] font-black text-[#63349B] tabular-nums">
                ص {pageNumber}
              </span>
            )}
            {caption && <span>{caption}</span>}
          </figcaption>
        )}
        {sourceLink && <div className="mt-2">{sourceLink}</div>}
      </figure>
      {modalContent}
    </>
  );
}
