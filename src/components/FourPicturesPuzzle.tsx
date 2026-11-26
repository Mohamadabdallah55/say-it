import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

export function FourPicturesPuzzle({images, letters, wordLength, compact = false}: {images: string[]; letters: string[]; wordLength?: number; compact?: boolean}) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  return (
    <section dir="rtl" data-testid="four-pictures-puzzle" className="mx-auto mb-3 flex w-full flex-col items-center gap-3">
      <div className={`grid grid-cols-2 gap-2 w-full ${compact ? 'max-w-[min(52vh,22rem)]' : 'max-w-[min(48vh,28rem)]'}`}>
        {images.map((src, i) => (
          <button key={src} type="button" aria-label={`تكبير الصورة ${i+1}`} onClick={() => { if (failed[src]) setFailed(v => ({...v, [src]: false})); else setZoom(i); }} className="relative aspect-square overflow-hidden rounded-xl border-2 border-[#1F112E] bg-white shadow-[0_2px_0_#1F112E] cursor-zoom-in">
            {failed[src] ? <span className="grid h-full w-full place-items-center bg-slate-100 px-2 text-sm text-slate-600">تعذر تحميل الصورة</span> : <img src={src} alt={`الصورة ${i+1}`} className="h-full w-full object-contain" loading="eager" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(v => ({...v, [src]: true}))} />}
            <span className="absolute left-1.5 top-1.5 rounded-full border border-[#1F112E] bg-[#5C2E91] p-1.5 text-white"><Maximize2 size={14}/></span>
          </button>
        ))}
      </div>
      {letters.length === 14 && (
        <div data-testid="four-pictures-letter-bank" className="grid w-full max-w-sm grid-cols-7 gap-1.5">
          {letters.map((letter,i) => <span key={i} className="grid aspect-square place-items-center rounded-lg border-2 border-[#1F112E] bg-white font-display text-lg font-black text-[#1F112E] shadow-[0_2px_0_#1F112E]">{letter}</span>)}
        </div>
      )}
      {wordLength && <div data-testid="four-pictures-word-length" className="w-full max-w-sm rounded-xl border-2 border-[#1F112E] bg-[#FFE047] px-3 py-2 text-sm font-black text-[#1F112E] shadow-[0_2px_0_#1F112E]">الكلمة تتكون من {wordLength} حروف</div>}
      {zoom !== null && createPortal(
        <dialog ref={node => { if(node && !node.open) node.showModal(); }} onCancel={() => setZoom(null)} onClose={() => setZoom(null)} onClick={e => { if(e.target === e.currentTarget) setZoom(null); }} className="fixed inset-0 m-auto max-h-[95vh] max-w-[95vw] overflow-hidden rounded-2xl border-2 border-[#1F112E] bg-white p-3 backdrop:bg-black/80">
          <div className="relative">
            <img src={images[zoom]} alt={`الصورة ${zoom+1} مكبرة`} className="max-h-[85vh] max-w-[88vw] object-contain" />
            <button autoFocus type="button" aria-label="إغلاق الصورة" onClick={() => setZoom(null)} className="absolute left-2 top-2 rounded-full bg-[#5C2E91] p-2 text-white"><X size={22}/></button>
          </div>
        </dialog>, document.body)}
    </section>
  );
}
