import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { BuzzerScreen } from './components/BuzzerScreen';
import { GameArena } from './components/GameArena';
import { LobbySetup } from './components/LobbySetup';
import { SilentActingScreen } from './components/SilentActingScreen';
import { TitleScreen } from './components/TitleScreen';
import {
  DEFAULT_REMOTE_DECKS_BASE_URL,
  mergeDecksWithRecovered,
  type RecoveredDeckRecord,
} from './game/remoteDecks';
import type { ClientRole, QuizDeck, TeamState } from './game/types';
import {
  dismissRecoveredDeckNewBadge,
  loadHydratedRecoveredState,
  syncRemoteDecks,
  toggleRecoveredDeckVisibility,
  updateRemoteBaseUrl,
  type RemoteSyncProgress,
  type RemoteSyncSummary,
} from './utils/remoteDeckSync';
import { soundFX } from './utils/sound';

// Large tools are fetched only when opened, not when joining or starting a quiz.
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const PdfStudio = lazy(() => import('./components/PdfStudio').then(m => ({ default: m.PdfStudio })));
const SavedLibrary = lazy(() => import('./components/SavedLibrary').then(m => ({ default: m.SavedLibrary })));

const DrawingImpostor = lazy(() => import('./components/DrawingImpostor').then(m => ({ default: m.DrawingImpostor })));

type ViewScreen =
  | { name: 'title' }
  | { name: 'drawing' }
  | { name: 'lobby'; preselectDeckId?: string; approvedLesson?: QuizDeck; initialCategoryId?: string; initialClassic?: boolean }
  | { name: 'pdf_studio'; editDeck?: QuizDeck | null }
  | { name: 'library'; mode: 'decks' | 'matches' }
  | { name: 'admin' }
  | { name: 'arena'; roomCode: string; role: 'host' | 'projector'; token?: string }
  | { name: 'buzzer'; roomCode: string; token: string }
  | { name: 'act'; roomCode: string; token: string };

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

function AppContent() {
  const [screen, setScreen] = useState<ViewScreen>({ name: 'title' });
  const [serverDecks, setServerDecks] = useState<QuizDeck[]>([]);
  const [recoveredRecords, setRecoveredRecords] = useState<RecoveredDeckRecord[]>([]);
  const [hiddenDeckIds, setHiddenDeckIds] = useState<string[]>([]);
  const [remoteBaseUrl, setRemoteBaseUrl] = useState<string>(DEFAULT_REMOTE_DECKS_BASE_URL);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [syncProgress, setSyncProgress] = useState<RemoteSyncProgress | null>(null);
  const [syncSummary, setSyncSummary] = useState<RemoteSyncSummary | null>(null);
  const [rooms, setRooms] = useState<SavedRoomSummary[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const decks = useMemo(
    () => mergeDecksWithRecovered(serverDecks, recoveredRecords, hiddenDeckIds),
    [serverDecks, recoveredRecords, hiddenDeckIds],
  );

  const recoveredMetaById = useMemo(() => {
    const map: Record<string, RecoveredDeckRecord> = {};
    for (const rec of recoveredRecords) {
      map[rec.id] = rec;
    }
    return map;
  }, [recoveredRecords]);

  const applyRemoteState = useCallback(
    (remote: {
      baseUrl: string;
      hiddenDeckIds: string[];
      records: RecoveredDeckRecord[];
    }) => {
      setRemoteBaseUrl(remote.baseUrl);
      setHiddenDeckIds(remote.hiddenDeckIds);
      setRecoveredRecords(remote.records);
    },
    [],
  );

  const refreshDecksAndRooms = useCallback(async () => {
    try {
      const [dRes, rRes] = await Promise.all([fetch('/api/decks'), fetch('/api/rooms')]);
      const dData = await dRes.json();
      const rData = await rRes.json();
      if (dData.decks) setServerDecks(dData.decks);
      if (rData.rooms) {
        setRooms(
          rData.rooms.flatMap((room: SavedRoomSummary) => {
            const hostToken = room.hostToken || localStorage.getItem('yh-host-' + room.roomCode);
            return hostToken ? [{ ...room, hostToken }] : [];
          }),
        );
      }
    } catch {
      // ignore initial offline error
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const mode = params.get('mode');
    const role = params.get('role') as ClientRole | null;
    const token = params.get('token') || undefined;
    const autostart = params.get('autostart');

    if (!room) {
      refreshDecksAndRooms();
      // Hydrate offline IndexedDB recovered decks immediately without blocking UI
      loadHydratedRecoveredState()
        .then((cachedState) => {
          applyRemoteState(cachedState);
        })
        .catch(() => {});
    }

    if (room) {
      if (role === 'host' && token) localStorage.setItem('yh-host-' + room.toUpperCase(), token);
      if (mode === 'act' && token) {
        setScreen({ name: 'act', roomCode: room.toUpperCase(), token });
      } else if (role === 'buzzer' && token) {
        setScreen({ name: 'buzzer', roomCode: room.toUpperCase(), token });
      } else {
        setScreen({
          name: 'arena',
          roomCode: room.toUpperCase(),
          role: role === 'host' ? 'host' : 'projector',
          token,
        });
      }
    } else if (params.get('drawing') === '1') {
      setScreen({ name: 'drawing' });
    } else if (autostart === '1') {
      setScreen({ name: 'lobby' });
    }

    const onOpenAdmin = () => setScreen({ name: 'admin' });
    window.addEventListener('yh:open-admin', onOpenAdmin);
    return () => window.removeEventListener('yh:open-admin', onOpenAdmin);
  }, [refreshDecksAndRooms, applyRemoteState]);

  // Automatic recovery is only a fallback for external/custom banks.
  // Official categories now come directly from the server catalog.
  useEffect(() => {
    if (!['title', 'lobby', 'library'].includes(screen.name) || syncingRemote || remoteBaseUrl === DEFAULT_REMOTE_DECKS_BASE_URL) return;
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      syncRemoteDecks({ force: false }).then(({ state }) => {
        if (!cancelled) applyRemoteState(state);
      }).catch(() => {});
    };
    // Do not repeatedly download images or fight with a manual recovery.
    const timer = window.setTimeout(refresh, 1200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [screen.name, syncingRemote, remoteBaseUrl, applyRemoteState]);

  const handleManualRemoteSync = useCallback(async () => {
    if (syncingRemote) return;
    setSyncingRemote(true);
    setSyncProgress({
      completed: 0,
      total: 1,
      percent: 5,
      currentLabel: 'بدء فحص البنوك...',
    });
    setSyncSummary(null);
    try {
      const { summary, state } = await syncRemoteDecks({
        force: true,
        onProgress: (p) => setSyncProgress(p),
      });
      applyRemoteState(state);
      setSyncSummary(summary);
    } catch {
      setSyncSummary({
        ok: false,
        addedCount: 0,
        updatedCount: 0,
        skippedInvalidQuestionsCount: 0,
        failedDecksCount: 0,
        offlineOrSkipped: false,
        message: 'تعذر إكمال استرداد البنوك حاليًا.',
      });
    } finally {
      setSyncingRemote(false);
    }
  }, [syncingRemote, applyRemoteState]);

  const handleSaveRemoteBaseUrl = useCallback(async (rawUrl: string) => {
    const res = await updateRemoteBaseUrl(rawUrl);
    if (res.valid && res.baseUrl) {
      setRemoteBaseUrl(res.baseUrl);
    }
    return res;
  }, []);

  const handleToggleDeckHidden = useCallback(async (deckId: string, hidden: boolean) => {
    const nextHidden = await toggleRecoveredDeckVisibility(deckId, hidden);
    setHiddenDeckIds(nextHidden);
  }, []);

  const handleMarkDeckSeen = useCallback((deckId: string) => {
    setRecoveredRecords((prev) =>
      prev.map((rec) => (rec.id === deckId && rec.isNew ? { ...rec, isNew: false } : rec)),
    );
    dismissRecoveredDeckNewBadge(deckId).catch(() => {});
  }, []);

  const rememberDeck = (deck: QuizDeck) => {
    setServerDecks((current) => [deck, ...current.filter((item) => item.id !== deck.id)]);
  };

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      soundFX.enabled = next;
      return next;
    });
  };

  const handleRoomCreated = (data: {
    roomCode: string;
    hostToken: string;
    buzzerToken: string;
  }) => {
    const url = new URL(window.location.href);
    localStorage.setItem('yh-host-' + data.roomCode, data.hostToken);
    url.searchParams.set('room', data.roomCode);
    url.searchParams.set('role', 'host');
    url.searchParams.set('token', data.hostToken);
    window.history.replaceState({}, '', url.toString());

    refreshDecksAndRooms();
    setScreen({
      name: 'arena',
      roomCode: data.roomCode,
      role: 'host',
      token: data.hostToken,
    });
  };

  useEffect(()=>{if(screen.name!=='arena'&&screen.name!=='buzzer'&&screen.name!=='act')soundFX.enabled=soundEnabled;},[screen.name,soundEnabled]);

  const exitToHome = () => {
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
    refreshDecksAndRooms();
    setScreen({ name: 'title' });
  };

  if (screen.name === 'drawing') return <DrawingImpostor onBack={exitToHome} />;

  if (screen.name === 'admin') {
    return (
      <AdminPanel
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onBack={() => setScreen({ name: 'title' })}
        onStartQuick={() => setScreen({ name: 'lobby' })}
        onOpenPdfStudio={() => setScreen({ name: 'pdf_studio', editDeck: null })}
        onOpenLibrary={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'library', mode: 'decks' });
        }}
        onOpenSavedMatches={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'library', mode: 'matches' });
        }}
      />
    );
  }

  if (screen.name === 'act') {
    return <SilentActingScreen roomCode={screen.roomCode} token={screen.token} />;
  }

  if (screen.name === 'buzzer') {
    return <BuzzerScreen roomCode={screen.roomCode} token={screen.token} />;
  }

  if (screen.name === 'arena') {
    return (
      <GameArena
        roomCode={screen.roomCode}
        role={screen.role}
        token={screen.token}
        onExitToHome={exitToHome}
        onNewGame={() => {
          const url = new URL(window.location.href);
          url.search = '';
          window.history.replaceState({}, '', url.toString());
          setScreen({ name: 'lobby' });
        }}
      />
    );
  }

  if (screen.name === 'lobby') {
    return (
      <LobbySetup
        decks={decks}
        recoveredMetaById={recoveredMetaById}
        onMarkDeckSeen={handleMarkDeckSeen}
        initialDeckId={screen.preselectDeckId}
        initialCategoryId={screen.initialCategoryId}
        initialClassic={screen.initialClassic}
        approvedLesson={screen.approvedLesson}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onBack={() => setScreen({ name: 'title' })}
        onGoToPdfStudio={(deckId) => {
          const found = decks.find((d) => d.id === deckId) ?? null;
          setScreen({ name: 'pdf_studio', editDeck: found });
        }}
        onOpenLibrary={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'library', mode: 'decks' });
        }}
        onOpenSavedMatches={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'library', mode: 'matches' });
        }}
        onRoomCreated={handleRoomCreated}
      />
    );
  }

  if (screen.name === 'pdf_studio') {
    return (
      <PdfStudio
        initialDeck={screen.editDeck}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onStartQuick={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'lobby' });
        }}
        onOpenLibrary={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'library', mode: 'decks' });
        }}
        onOpenSavedMatches={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'library', mode: 'matches' });
        }}
        onBack={() => {
          refreshDecksAndRooms();
          setScreen({ name: 'title' });
        }}
        onDeckSaved={rememberDeck}
        onPlayDeck={(lesson) => {
          setScreen({ name: 'lobby', preselectDeckId: lesson.id, approvedLesson: lesson });
        }}
      />
    );
  }

  if (screen.name === 'library') {
    return (
      <SavedLibrary
        mode={screen.mode}
        decks={decks}
        recoveredMetaById={recoveredMetaById}
        recoveredRecords={recoveredRecords}
        hiddenDeckIds={hiddenDeckIds}
        remoteBaseUrl={remoteBaseUrl}
        syncingRemote={syncingRemote}
        syncProgress={syncProgress}
        syncSummary={syncSummary}
        onManualRemoteSync={handleManualRemoteSync}
        onSaveRemoteBaseUrl={handleSaveRemoteBaseUrl}
        onToggleDeckHidden={handleToggleDeckHidden}
        onMarkDeckSeen={handleMarkDeckSeen}
        rooms={rooms}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onStartQuick={() => setScreen({ name: 'lobby' })}
        onOpenPdfStudio={() => setScreen({ name: 'pdf_studio', editDeck: null })}
        onBack={() => setScreen({ name: 'title' })}
        onSelectDeckToPlay={(deckId) => setScreen({ name: 'lobby', preselectDeckId: deckId })}
        onEditDeckInStudio={(deck) => setScreen({ name: 'pdf_studio', editDeck: deck })}
        onDecksChanged={(nextServerDecks) => setServerDecks(nextServerDecks)}
        onResumeRoom={(roomCode, hostToken) => handleRoomCreated({ roomCode, hostToken, buzzerToken: '' })}
      />
    );
  }

  return (
    <TitleScreen
      challenge={{decks,recoveredMetaById,savedMatchCount:rooms.length,onPickCategory:(id)=>setScreen({name:'lobby',initialCategoryId:id}),onStartClassic:()=>setScreen({name:'lobby',initialClassic:true})}}
      soundEnabled={soundEnabled}
      onToggleSound={toggleSound}
      onStartQuick={() => setScreen({ name: 'lobby' })}
      onOpenPdfStudio={() => setScreen({ name: 'pdf_studio', editDeck: null })}
      onOpenLibrary={() => {
        refreshDecksAndRooms();
        setScreen({ name: 'library', mode: 'decks' });
      }}
      onOpenSavedMatches={() => {
        refreshDecksAndRooms();
        setScreen({ name: 'library', mode: 'matches' });
      }}
    />
  );
}

export default function App() {
  return <Suspense fallback={<div className="min-h-screen game-pattern-bg flex items-center justify-center p-4" role="status"><div className="game-card-frame rounded-2xl p-4 font-display font-black">جارٍ تحميل الصفحة...</div></div>}><AppContent /></Suspense>;
}
