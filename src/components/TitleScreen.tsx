import { useState } from 'react';
import { FileText, FolderOpen, History, Volume2, VolumeX } from 'lucide-react';
interface TitleScreenProps {
  onStartQuick: () => void;
  onOpenPdfStudio: () => void;
  onOpenLibrary: () => void;
  onOpenSavedMatches: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function TitleScreen({
  onStartQuick,
  onOpenPdfStudio,
  onOpenLibrary,
  onOpenSavedMatches,
  soundEnabled,
  onToggleSound,
}: TitleScreenProps) {
  const [help, setHelp] = useState(false);
  return <main className="show-home" dir="rtl">
    <nav className="show-nav"><strong>يمكن هاي</strong><span>YEMKEN HAY</span>
      <button onClick={onToggleSound} aria-label={soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}>{soundEnabled ? <Volume2/> : <VolumeX/>}</button>
      <button onClick={()=>setHelp(true)} aria-label="مساعد يمكن هاي"><img src="/brand/helper.png" alt=""/></button>
    </nav>
    <div className="show-banner"><img src="/brand/banner.jpeg" alt="يمكن هاي · فرق وفئات ومنافسة على شاشة واحدة"/>
      <div className="banner-actions"><button onClick={onStartQuick}>ابدأ اللعب</button><button onClick={()=>setHelp(true)}>كيف تُلعب؟</button></div>
    </div>
    <nav className="lesson-nav"><button onClick={onOpenPdfStudio}><FileText/> حضّر درس PDF</button><button onClick={onOpenLibrary}><FolderOpen/> بنوك الدروس</button><button onClick={onOpenSavedMatches}><History/> مبارياتي</button></nav>
    {help && <dialog open className="guide-dialog" aria-label="كيف تُلعب؟"><img src="/brand/helper.png" alt=""/><h2>كيف تُلعب؟</h2><p>حمّل الدرس وراجع أسئلته، بعدها سمّوا الفرق. اختاروا فئة وقيمة من اللوحة. بعد كشف الإجابة، المشرف بيسجّل النقاط للفريق اللي جاوب صح. أعلى مجموع بيفوز.</p><button onClick={()=>setHelp(false)}>فهمنا</button></dialog>}
  </main>;
}
