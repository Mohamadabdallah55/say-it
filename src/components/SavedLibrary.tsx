import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CloudDownload,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Play,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  Upload,
} from 'lucide-react';
import { sanitizeDeckForExport } from '../game/pdfValidation';
import {
  DEFAULT_REMOTE_DECKS_BASE_URL,
  type RecoveredDeckRecord,
} from '../game/remoteDecks';
import type { QuizDeck, TeamState } from '../game/types';
import type { RemoteSyncProgress, RemoteSyncSummary } from '../utils/remoteDeckSync';
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
  recoveredMetaById?: Record<string, RecoveredDeckRecord>;
  recoveredRecords?: RecoveredDeckRecord[];
  hiddenDeckIds?: string[];
  remoteBaseUrl?: string;
  syncingRemote?: boolean;
  syncProgress?: RemoteSyncProgress | null;
  syncSummary?: RemoteSyncSummary | null;
  onManualRemoteSync?: () => Promise<void> | void;
  onSaveRemoteBaseUrl?: (url: string) => Promise<{ valid: boolean; baseUrl?: string; error?: string }>;
  onToggleDeckHidden?: (deckId: string, hidden: boolean) => Promise<void> | void;
  onMarkDeckSeen?: (deckId: string) => void;
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
  recoveredMetaById = {},
  recoveredRecords = [],
  hiddenDeckIds = [],
  remoteBaseUrl = DEFAULT_REMOTE_DECKS_BASE_URL,
  syncingRemote = false,
  syncProgress = null,
  syncSummary = null,
  onManualRemoteSync,
  onSaveRemoteBaseUrl,
  onToggleDeckHidden,
  onMarkDeckSeen,
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

  const [remoteSettingsOpen, setRemoteSettingsOpen] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState(remoteBaseUrl);
  const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
  const [baseUrlSavedNotice, setBaseUrlSavedNotice] = useState<string | null>(null);
  const [showHiddenDecks, setShowHiddenDecks] = useState(false);

  useEffect(() => {
    setBaseUrlInput(remoteBaseUrl);
  }, [remoteBaseUrl]);

  const hiddenRecoveredDecks = useMemo(() => {
    const visibleIds = new Set(decks.map((d) => d.id));
    const hiddenSet = new Set(hiddenDeckIds);
    return recoveredRecords
      .filter((r) => hiddenSet.has(r.id) && !visibleIds.has(r.id))
      .map((r) => r.deck);
  }, [decks, recoveredRecords, hiddenDeckIds]);

  const displayedDecks = useMemo(
    () => (showHiddenDecks ? [...decks, ...hiddenRecoveredDecks] : decks),
    [decks, hiddenRecoveredDecks, showHiddenDecks],
  );

  const handleSaveBaseUrl = async () => {
    if (!onSaveRemoteBaseUrl) return;
    setBaseUrlError(null);
    setBaseUrlSavedNotice(null);
    const res = await onSaveRemoteBaseUrl(baseUrlInput);
    if (!res.valid) {
      setBaseUrlError(res.error || 'رابط المجلد غير صالح.');
      return;
    }
    setBaseUrlSavedNotice('تم حفظ رابط المصدر بنجاح.');
  };

  const handleResetDefaultBaseUrl = async () => {
    if (!onSaveRemoteBaseUrl) return;
    setBaseUrlError(null);
    setBaseUrlSavedNotice(null);
    setBaseUrlInput(DEFAULT_REMOTE_DECKS_BASE_URL);
    const res = await onSaveRemoteBaseUrl(DEFAULT_REMOTE_DECKS_BASE_URL);
    if (res.valid) {
      setBaseUrlSavedNotice('تمت استعادة الرابط الافتراضي.');
    }
  };

  const handleExportRecoveredDeck = (deck: QuizDeck) => {
    const clean = sanitizeDeckForExport(deck);
    const blob = new Blob([JSON.stringify(clean, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yemken-hay-${deck.id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
    if (recoveredMetaById[deckId]) return;
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

            {/* Automatic Remote Bank Sync & Recovery Panel */}
            <div className="shannes-panel p-4 space-y-3" data-testid="remote-sync-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CloudDownload className="w-5 h-5 text-[#00A86B] shrink-0" />
                  <div>
                    <h2 className="font-display font-black text-lg text-[#1F112E]">
                      الاسترداد التلقائي للبنوك
                    </h2>
                    <p className="text-xs font-medium text-[#1F112E]/75">
                      مزامنة تلقائية لبنوك الأسئلة الرسمية وصورها وحفظها محليًا للعمل بدون إنترنت
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {hiddenRecoveredDecks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHiddenDecks((prev) => !prev)}
                      className={`game-btn-3d px-3.5 py-2 rounded-xl font-display font-black text-xs flex items-center gap-1.5 cursor-pointer ${
                        showHiddenDecks
                          ? 'bg-[#63349B] text-white'
                          : 'bg-[#FFFDF7] text-[#1F112E]'
                      }`}
                    >
                      {showHiddenDecks ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>
                        {showHiddenDecks
                          ? `إخفاء المخفية (${hiddenRecoveredDecks.length})`
                          : `عرض المخفية (${hiddenRecoveredDecks.length})`}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setBaseUrlError(null);
                      setBaseUrlSavedNotice(null);
                      setRemoteSettingsOpen((prev) => !prev);
                    }}
                    aria-expanded={remoteSettingsOpen}
                    className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-3.5 py-2 rounded-xl font-display font-black text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings2 className="w-4 h-4 text-[#63349B]" />
                    <span>إعدادات المصدر</span>
                  </button>

                  <button
                    type="button"
                    data-testid="manual-remote-sync-btn"
                    disabled={syncingRemote}
                    onClick={() => onManualRemoteSync?.()}
                    className="game-btn-3d bg-[#00A86B] text-white px-4 py-2 rounded-xl font-display font-black text-sm flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncingRemote ? 'animate-spin' : ''}`} />
                    <span>{syncingRemote ? 'جارٍ الاسترداد...' : 'استرداد البنوك'}</span>
                  </button>
                </div>
              </div>

              {remoteSettingsOpen && (
                <div className="rounded-2xl bg-[#F2ECE0] border-2 border-[#1F112E]/15 p-3.5 space-y-2.5">
                  <label
                    htmlFor="remote-decks-base-url"
                    className="block font-display font-black text-xs text-[#1F112E]"
                  >
                    الرابط الأساسي لمجلد البنوك (Base URL يحتوي index.json)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      id="remote-decks-base-url"
                      type="url"
                      dir="ltr"
                      value={baseUrlInput}
                      onChange={(e) => {
                        setBaseUrlInput(e.target.value);
                        setBaseUrlError(null);
                        setBaseUrlSavedNotice(null);
                      }}
                      placeholder={DEFAULT_REMOTE_DECKS_BASE_URL}
                      className="flex-1 min-w-[240px] bg-[#FFFDF7] border-2 border-[#1F112E] focus:border-[#63349B] rounded-xl px-3 py-2 font-mono text-xs text-[#1F112E] outline-none"
                    />
                    <button
                      type="button"
                      data-testid="save-remote-url-btn"
                      onClick={handleSaveBaseUrl}
                      className="game-btn-3d bg-[#63349B] text-white px-4 py-2 rounded-xl font-display font-black text-xs cursor-pointer"
                    >
                      حفظ الرابط
                    </button>
                    <button
                      type="button"
                      onClick={handleResetDefaultBaseUrl}
                      className="game-btn-3d bg-[#FFFDF7] text-[#1F112E] px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>الافتراضي</span>
                    </button>
                  </div>
                  {baseUrlError && (
                    <p className="text-xs font-bold text-[#B91C1C]">{baseUrlError}</p>
                  )}
                  {baseUrlSavedNotice && (
                    <p className="text-xs font-bold text-[#065F46]">{baseUrlSavedNotice}</p>
                  )}
                </div>
              )}

              {syncingRemote && syncProgress && (
                <div
                  data-testid="remote-sync-progress"
                  className="rounded-xl bg-[#F2ECE0] border border-[#1F112E]/20 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-black text-[#1F112E]">
                    <span>{syncProgress.currentLabel}</span>
                    <span className="tabular-nums" dir="ltr">
                      {syncProgress.percent}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-white border border-[#1F112E]/30 overflow-hidden">
                    <div
                      className="h-full bg-[#00A86B] transition-all duration-200"
                      style={{ width: `${Math.max(4, Math.min(100, syncProgress.percent))}%` }}
                    />
                  </div>
                </div>
              )}

              {syncSummary && !syncingRemote && (
                <div
                  data-testid="remote-sync-summary"
                  role="status"
                  className={`rounded-xl border-2 px-3.5 py-2.5 text-xs sm:text-sm font-bold ${
                    syncSummary.ok
                      ? 'bg-[#E8F8F2] border-[#00B978] text-[#065F46]'
                      : 'bg-[#FFF2CD] border-[#E59A00] text-[#78350F]'
                  }`}
                >
                  {syncSummary.message}
                </div>
              )}
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
              {displayedDecks.map((deck) => {
                const recoveredMeta = recoveredMetaById[deck.id];
                const isRecoveredOfficial = Boolean(recoveredMeta);
                const isHidden = hiddenDeckIds.includes(deck.id);

                return (
                  <div
                    key={deck.id}
                    data-testid={`library-deck-${deck.id}`}
                    className={`game-card-frame rounded-2xl p-5 flex flex-col justify-between gap-4 ${
                      isHidden ? 'opacity-75' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-[11px] font-black px-2.5 py-0.5 rounded-md ${
                              isRecoveredOfficial
                                ? 'bg-[#065F46] text-white'
                                : 'bg-[#EDE7F6] text-[#7042A1]'
                            }`}
                          >
                            {isRecoveredOfficial
                              ? 'رسمي'
                              : deck.sourceType === 'starter'
                                ? 'افتراضي'
                                : deck.sourceType === 'pdf'
                                  ? 'مولّد من PDF'
                                  : 'مستورد'}
                          </span>

                          {recoveredMeta?.isNew && (
                            <span
                              data-testid={`deck-new-badge-${deck.id}`}
                              className="text-[11px] font-black bg-[#FFE047] text-[#1F112E] border border-[#1F112E] px-2 py-0.5 rounded-md"
                            >
                              جديد
                            </span>
                          )}

                          {isHidden && (
                            <span className="text-[11px] font-black bg-[#E5E7EB] text-[#374151] px-2 py-0.5 rounded-md">
                              مخفي
                            </span>
                          )}
                        </div>

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
                        onClick={() => {
                          onMarkDeckSeen?.(deck.id);
                          onSelectDeckToPlay(deck.id);
                        }}
                        className="game-btn-3d flex-1 bg-[#00B978] text-white py-2 px-3 rounded-xl font-display font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>العب</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onMarkDeckSeen?.(deck.id);
                          onEditDeckInStudio(deck);
                        }}
                        className="game-btn-3d bg-white text-[#291B40] py-2 px-3 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>مراجعة</span>
                      </button>
                      {isRecoveredOfficial ? (
                        <button
                          type="button"
                          onClick={() => handleExportRecoveredDeck(deck)}
                          className="game-btn-3d bg-[#FFD95A] text-[#291B40] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center cursor-pointer"
                          title="تصدير JSON"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      ) : (
                        <a
                          href={`/api/decks/${deck.id}/export`}
                          className="game-btn-3d bg-[#FFD95A] text-[#291B40] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center"
                          title="تصدير JSON"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      {isRecoveredOfficial ? (
                        <button
                          type="button"
                          data-testid={`hide-deck-btn-${deck.id}`}
                          onClick={() => onToggleDeckHidden?.(deck.id, !isHidden)}
                          className="game-btn-3d bg-[#F2ECE0] text-[#1F112E] py-2 px-2.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                          title={isHidden ? 'إظهار البنك' : 'إخفاء البنك'}
                        >
                          {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          <span>{isHidden ? 'إظهار' : 'إخفاء'}</span>
                        </button>
                      ) : (
                        deck.sourceType !== 'starter' && (
                          <button
                            type="button"
                            data-testid={`delete-deck-btn-${deck.id}`}
                            onClick={() => handleDeleteDeck(deck.id)}
                            className="game-btn-3d bg-[#FFE5E7] text-[#F05B63] py-2 px-2.5 rounded-xl cursor-pointer"
                            title="حذف البنك"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
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
