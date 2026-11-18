import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn } from 'lucide-react';

interface QuestionMediaProps {
  imageSrc?: string;
  caption?: string;
  pageNumber?: number;
  compact?: boolean;
}

export function QuestionMedia({
  imageSrc,
  caption,
  pageNumber,
  compact = false,
}: QuestionMediaProps) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!zoomed) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zoomed]);

  if (!imageSrc) return null;

  const altText = caption?.trim() || 'شكل أو صورة توضيحية للسؤال';

  const modalContent =
    zoomed && typeof document !== 'undefined'
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

              <div className="rounded-2xl border-2 border-[#1F112E]/20 bg-white p-2 flex items-center justify-center">
                <img
                  src={imageSrc}
                  alt={altText}
                  className="max-h-[76vh] w-auto max-w-full rounded-xl object-contain"
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <figure className="question-media-figure mx-auto mb-3 w-full max-w-xl flex flex-col items-center">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label={`تكبير الصورة: ${altText}`}
          className={`group relative w-full overflow-hidden rounded-2xl border-[2.5px] border-[#1F112E] bg-white shadow-[0_4px_0_#1F112E] transition hover:-translate-y-0.5 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-[#63349B] ${
            compact ? 'p-1.5' : 'p-2.5'
          }`}
        >
          <img
            src={imageSrc}
            alt={altText}
            className={`mx-auto w-auto max-w-full rounded-xl object-contain ${
              compact ? 'max-h-[155px]' : 'max-h-[210px] md:max-h-[260px]'
            }`}
          />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-lg border-2 border-[#1F112E] bg-[#FFE047] px-2 py-0.5 text-[11px] font-black text-[#1F112E] shadow-[0_2px_0_#1F112E] opacity-95 group-hover:opacity-100">
            <ZoomIn className="w-3.5 h-3.5" />
            <span>اضغط للتكبير</span>
          </span>
        </button>

        {(caption || pageNumber) && (
          <figcaption className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-center text-xs font-bold text-[#1F112E]/80">
            {pageNumber && (
              <span className="rounded-md border border-[#1F112E]/25 bg-[#EDE7F6] px-1.5 py-0.5 text-[10px] font-black text-[#63349B] tabular-nums">
                ص {pageNumber}
              </span>
            )}
            {caption && <span>{caption}</span>}
          </figcaption>
        )}
      </figure>
      {modalContent}
    </>
  );
}

