import { useCallback, useEffect, useState } from 'react';
import { BuzzerScreen } from './components/BuzzerScreen';
import { GameArena } from './components/GameArena';
import { LobbySetup } from './components/LobbySetup';
import { PdfStudio } from './components/PdfStudio';
import { SavedLibrary } from './components/SavedLibrary';
import { TitleScreen } from './components/TitleScreen';
import type { ClientRole, QuizDeck, TeamState } from './game/types';
import { soundFX } from './utils/sound';

type ViewScreen =
  | { name: 'title' }
  | { name: 'lobby'; preselectDeckId?: string }
  | { name: 'pdf_studio'; editDeck?: QuizDeck | null }
  | { name: 'library'; mode: 'decks' | 'matches' }
  | { name: 'arena'; roomCode: string; role: 'host' | 'projector'; token?: string }
  | { name: 'buzzer'; roomCode: string; token: string };

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

export default function App() {
  const [screen, setScreen] = useState<ViewScreen>({ name: 'title' });
  const [decks, setDecks] = useState<QuizDeck[]>([]);
  const [rooms, setRooms] = useState<SavedRoomSummary[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const refreshDecksAndRooms = useCallback(async () => {
    try {
      const dRes = await fetch('/api/decks');
      const rRes = await fetch('/api/rooms');
      const dData = await dRes.json();
      const rData = await rRes.json();
      if (dData.decks) setDecks(dData.decks);
      if (rData.rooms) setRooms(rData.rooms.flatMap((room: SavedRoomSummary) => {
        const hostToken = room.hostToken || localStorage.getItem('yh-host-' + room.roomCode);
        return hostToken ? [{ ...room, hostToken }] : [];
      }));
    } catch {
      // ignore initial offline error
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const role = params.get('role') as ClientRole | null;
    const token = params.get('token') || undefined;
    const autostart = params.get('autostart');

    if (!room) refreshDecksAndRooms();
    if (room) {
      if (role === 'host' && token) localStorage.setItem('yh-host-' + room.toUpperCase(), token);
      if (role === 'buzzer' && token) {
        setScreen({ name: 'buzzer', roomCode: room.toUpperCase(), token });
      } else {
        setScreen({
          name: 'arena',
          roomCode: room.toUpperCase(),
          role: role === 'host' ? 'host' : 'projector',
          token,
        });
      }
    } else if (autostart === '1') {
      setScreen({ name: 'lobby' });
    }
  }, [refreshDecksAndRooms]);

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

  const exitToHome = () => {
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
    refreshDecksAndRooms();
    setScreen({ name: 'title' });
  };

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
        initialDeckId={screen.preselectDeckId}
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
        onDeckSaved={() => refreshDecksAndRooms()}
        onPlayDeck={(deckId) => {
          refreshDecksAndRooms();
          setScreen({ name: 'lobby', preselectDeckId: deckId });
        }}
      />
    );
  }

  if (screen.name === 'library') {
    return (
      <SavedLibrary
        mode={screen.mode}
        decks={decks}
        rooms={rooms}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onStartQuick={() => setScreen({ name: 'lobby' })}
        onOpenPdfStudio={() => setScreen({ name: 'pdf_studio', editDeck: null })}
        onBack={() => setScreen({ name: 'title' })}
        onSelectDeckToPlay={(deckId) => setScreen({ name: 'lobby', preselectDeckId: deckId })}
        onEditDeckInStudio={(deck) => setScreen({ name: 'pdf_studio', editDeck: deck })}
        onDecksChanged={(nextDecks) => setDecks(nextDecks)}
        onResumeRoom={(roomCode, hostToken) => handleRoomCreated({ roomCode, hostToken, buzzerToken: '' })}
      />
    );
  }

  return (
    <TitleScreen
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
