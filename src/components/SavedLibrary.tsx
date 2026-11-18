import { useEffect, useState } from 'react';
import {
  BookOpen,
  Download,
  Edit3,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import type { QuizDeck, TeamState } from '../game/types';
import { TopNavHeader } from './TopNavHeader';

interface SavedRoomSummary {
  roomCode: string;
  deckTitle: string;
  phase: string;
  teams: TeamState[];
  questionCounter: number;
  totalQuestions: number;
  updatedAt: string;
  hostToken: string;
}

interface SavedLibraryProps {
  mode: 'decks' | 'matches';
  decks: QuizDeck[];
  rooms: SavedRoomSummary[];
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onStartQuick?: () => void;
  onOpenPdfStudio?: () => void;
  onBack: () => void;
  onSelectDeckToPlay: (deckId: string) => void;
  onEditDeckInStudio: (deck: QuizDeck) => void;
  onDecksChanged: (decks: QuizDeck[]) => void;
  onResumeRoom: (roomCode: string, hostToken: string) => void;
}

export function SavedLibrary({
  mode,
  decks,
  rooms,
  soundEnabled = true,
  onToggleSound,
  onStartQuick,
  onOpenPdfStudio,
  onBack,
  onSelectDeckToPlay,
  onEditDeckInStudio,
  onDecksChanged,
  onResumeRoom,
}: SavedLibraryProps) {
  const [tab, setTab] = useState<'decks' | 'matches'>(mode);

  useEffect(() => {
    setTab(mode);
  }, [mode]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    payload: unknown;
    existingId: string;
    existingTitle: string;
  } | null>(null);

  const handleImportJson = async (file: File) => {
    setImportError(null);
    setImportNotice(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const candidateId = payload?.deck?.id || payload?.id;
      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, replaceExistingId: candidateId }),
      });
      const data = await res.json();
      if (res.status === 409 && data.requiresConfirmation) {
        setPendingOverwrite({
          payload,
          existingId: candidateId,
          existingTitle: data.existingTitle,
        });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'تعذر استيراد الملف.');

      const listRes = await fetch('/api/decks');
      const listData = await listRes.json();
      if (listData.decks) onDecksChanged(listData.decks);
      setImportNotice(`تم استيراد «${data.deck.title}» (${data.report.importedCount} سؤالًا).`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'ملف JSON غير صالح.');
    }
  };

  const confirmImportAction = async (overwrite: boolean) => {
    if (!pendingOverwrite) return;
    try {
      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: pendingOverwrite.payload,
          replaceExistingId: overwrite ? pendingOverwrite.existingId : undefined,
          confirmOverwrite: overwrite,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر الاستيراد.');
      const listRes = await fetch('/api/decks');
      const listData = await listRes.json();
      if (listData.decks) onDecksChanged(listData.decks);
      setPendingOverwrite(null);
      setImportNotice(`تم استيراد البنك «${data.deck.title}» بنجاح.`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'فشل الاستيراد.');
    }
  };

  const handleDeleteDeck = async (deckId: string) => {
    const res = await fetch(`/api/decks/${deckId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.decks) {
      onDecksChanged(data.decks);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#240E35]">
      <TopNavHeader
        activePage="library"
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onHome={onBack}
        onBack={onBack}
        onStartQuick={() => (onStartQuick ? onStartQuick() : onBack())}
        onOpenPdfStudio={() => (onOpenPdfStudio ? onOpenPdfStudio() : onBack())}
        onOpenLibrary={() => setTab('decks')}
        onOpenSavedMatches={() => setTab('matches')}
      />

      <main className="flex-1 w-full game-pattern-bg px-4 py-6">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="shannes-step-badge shrink-0">{tab === 'decks' ? 'بنوك' : 'حفظ'}</span>
              <h1 className="font-display font-black text-2xl md:text-3xl text-[#1F112E]">
                {tab === 'decks' ? 'مكتبة بنوك الأسئلة' : 'المباريات المحفوظة'}
              </h1>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTab('decks')}
                className={`game-btn-3d px-5 py-2 rounded-xl font-display font-black text-sm cursor-pointer ${
                  tab === 'decks' ? 'bg-[#63349B] text-white' : 'bg-[#FFFDF7] text-[#1F112E]'
                }`}
              >
                بنوك الأسئلة ({decks.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('matches')}
                className={`game-btn-3d px-5 py-2 rounded-xl font-display font-black text-sm cursor-pointer ${
                  tab === 'matches' ? 'bg-[#63349B] text-white' : 'bg-[#FFFDF7] text-[#1F112E]'
                }`}
              >
                المباريات المحفوظة ({rooms.length})
              </button>
            </div>
          </div>

        {tab === 'decks' && (
          <>
            <div className="shannes-panel p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#63349B]" />
                <div>
                  <h2 className="font-display font-black text-lg text-[#1F112E]">استيراد وتصدير عبر USB (JSON)</h2>
                  <p className="text-xs font-medium text-[#1F112E]/75">
                    انقل بنوك الأسئلة بين أجهزة المدرسة بدون إنترنت بصيغة يمكن هاي v2
                  </p>
                </div>
              </div>

              <label className="game-btn-3d bg-[#FFD95A] text-[#291B40] px-4 py-2 rounded-xl font-black text-sm flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>استيراد ملف JSON</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImportJson(f);
                  }}
                />
              </label>
            </div>

            {importError && (
              <div className="bg-[#FFE5E7] border-2 border-[#F05B63] rounded-xl p-3 font-bold text-sm">
                {importError}
              </div>
            )}
            {importNotice && (
              <div className="bg-[#E8F8F2] border-2 border-[#00B978] rounded-xl p-3 font-bold text-sm">
                {importNotice}
              </div>
            )}

            {pendingOverwrite && (
              <div className="game-card-frame rounded-2xl p-4 bg-[#FFF2CD] space-y-3">
                <p className="font-bold text-sm">
                  يوجد بنك بنفس المعرّف بعنوان «{pendingOverwrite.existingTitle}». ماذا تفضل؟
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => confirmImportAction(false)}
                    className="game-btn-3d bg-[#00B978] text-white px-4 py-1.5 rounded-xl font-black text-xs cursor-pointer"
                  >
                    استيراد كبنك جديد
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmImportAction(true)}
                    className="game-btn-3d bg-[#F05B63] text-white px-4 py-1.5 rounded-xl font-black text-xs cursor-pointer"
                  >
                    استبدال البنك الحالي
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingOverwrite(null)}
                    className="game-btn-3d bg-white px-4 py-1.5 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {decks.map((deck) => (
                <div key={deck.id} className="game-card-frame rounded-2xl p-5 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-black bg-[#EDE7F6] text-[#7042A1] px-2.5 py-0.5 rounded-md">
                        {deck.sourceType === 'starter'
                          ? 'افتراضي'
                          : deck.sourceType === 'pdf'
                            ? 'مولّد من PDF'
                            : 'مستورد'}
                      </span>
                      <span className="text-xs font-black tabular-nums">
                        {deck.categories.length} فئات • {deck.questions.filter((q) => q.status === 'approved').length} سؤال
                      </span>
                    </div>
                    <h3 className="font-display font-black text-xl mb-1">{deck.title}</h3>
                    <p className="text-xs font-medium text-[#291B40]/75">{deck.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectDeckToPlay(deck.id)}
                      className="game-btn-3d flex-1 bg-[#00B978] text-white py-2 px-3 rounded-xl font-display font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>العب</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditDeckInStudio(deck)}
                      className="game-btn-3d bg-white text-[#291B40] py-2 px-3 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>مراجعة</span>
                    </button>
                    <a
                      href={`/api/decks/${deck.id}/export`}
                      className="game-btn-3d bg-[#FFD95A] text-[#291B40] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center"
                      title="تصدير JSON"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {deck.sourceType !== 'starter' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDeck(deck.id)}
                        className="game-btn-3d bg-[#FFE5E7] text-[#F05B63] py-2 px-2.5 rounded-xl cursor-pointer"
                        title="حذف البنك"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'matches' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rooms.length === 0 ? (
              <div className="game-card-frame rounded-2xl p-8 md:col-span-2 text-center font-bold">
                لا توجد مباريات محفوظة حاليًا. ابدأ مباراة جديدة وستُحفظ تلقائيًا هنا.
              </div>
            ) : (
              rooms.map((r) => (
                <div key={r.roomCode} className="game-card-frame rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-black text-lg">{r.deckTitle}</span>
                    <span className="font-display font-black text-sm bg-[#FFD95A] border border-[#291B40] px-2.5 py-0.5 rounded-lg">
                      {r.roomCode}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.teams.map((t) => (
                      <span
                        key={t.id}
                        className="text-xs font-black text-white px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.name}: {t.score}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#291B40]/15">
                    <span className="text-xs font-bold text-[#291B40]/70">
                      التقدم: {r.questionCounter} / {r.totalQuestions}
                    </span>
                    <button
                      type="button"
                      onClick={() => onResumeRoom(r.roomCode, r.hostToken)}
                      className="game-btn-3d bg-[#7042A1] text-white px-4 py-1.5 rounded-xl font-black text-xs cursor-pointer"
                    >
                      استكمال إدارة المباراة
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
