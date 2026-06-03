import { useCallback, useEffect, useState } from 'react';
import type { ActorRef } from './javdb';

export type SelectedMovie = {
  readonly id: string;
  readonly parentActor: ActorRef | null;
};

export type SelectedActor = {
  readonly actor: ActorRef;
  readonly parentMovie: SelectedMovie | null;
};

export type ActiveOverlayKind = 'movie' | 'actor' | null;

type DetailOverlay =
  | { readonly kind: 'movie'; readonly payload: SelectedMovie }
  | { readonly kind: 'actor'; readonly payload: SelectedActor };

type DetailHistoryState = {
  readonly __javdb115DetailHistory: true;
  readonly scope: string;
  readonly overlay: DetailOverlay | null;
};

const DETAIL_HISTORY_MARKER = '__javdb115DetailHistory';

function isDetailHistoryState(state: unknown, scope: string): state is DetailHistoryState {
  return Boolean(
    state &&
      typeof state === 'object' &&
      DETAIL_HISTORY_MARKER in state &&
      (state as Record<string, unknown>)[DETAIL_HISTORY_MARKER] === true &&
      (state as Record<string, unknown>).scope === scope
  );
}

function createHistoryState(scope: string, overlay: DetailOverlay | null): DetailHistoryState {
  return { __javdb115DetailHistory: true, scope, overlay };
}

function normalizeActor(actor: ActorRef): ActorRef {
  return {
    ...actor,
    profile_url: actor.profile_url ?? `https://javdb.com/actors/${actor.id}`
  };
}

export function useDetailHistory(scope: string) {
  const [selectedMovie, setSelectedMovie] = useState<SelectedMovie | null>(null);
  const [selectedActor, setSelectedActor] = useState<SelectedActor | null>(null);
  const [activeOverlayKind, setActiveOverlayKind] = useState<ActiveOverlayKind>(null);

  const applyOverlay = useCallback((overlay: DetailOverlay | null) => {
    if (!overlay) {
      setSelectedMovie(null);
      setSelectedActor(null);
      setActiveOverlayKind(null);
      return;
    }
    if (overlay.kind === 'movie') {
      setSelectedActor((current) => actorBackingLayer(current, overlay.payload.parentActor));
      setSelectedMovie(overlay.payload);
      setActiveOverlayKind('movie');
      return;
    }
    setSelectedMovie((current) => movieBackingLayer(current, overlay.payload.parentMovie));
    setSelectedActor(overlay.payload);
    setActiveOverlayKind('actor');
  }, []);

  const pushOverlay = useCallback(
    (overlay: DetailOverlay) => {
      window.history.pushState(createHistoryState(scope, overlay), '');
      applyOverlay(overlay);
    },
    [applyOverlay, scope]
  );

  useEffect(() => {
    const currentState = window.history.state;
    if (!isDetailHistoryState(currentState, scope)) {
      window.history.replaceState(createHistoryState(scope, null), '');
      return;
    }
    applyOverlay(currentState.overlay);
  }, [applyOverlay, scope]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (!isDetailHistoryState(event.state, scope)) {
        setSelectedMovie(null);
        setSelectedActor(null);
        setActiveOverlayKind(null);
        return;
      }
      applyOverlay(event.state.overlay);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyOverlay, scope]);

  const openMovie = useCallback(
    (movieId: string, parentActor: ActorRef | null = null) => {
      pushOverlay({ kind: 'movie', payload: { id: movieId, parentActor } });
    },
    [pushOverlay]
  );

  const closeMovie = useCallback(() => {
    window.history.back();
  }, []);

  const openActor = useCallback(
    (actor: ActorRef, parentMovieId?: string) => {
      pushOverlay({
        kind: 'actor',
        payload: {
          actor: normalizeActor(actor),
          parentMovie: parentMovieId ? { id: parentMovieId, parentActor: selectedMovie?.parentActor ?? null } : null
        }
      });
    },
    [pushOverlay, selectedMovie]
  );

  const closeActor = useCallback(() => {
    window.history.back();
  }, []);

  return {
    selectedMovie,
    selectedActor,
    activeOverlayKind,
    openMovie,
    closeMovie,
    openActor,
    closeActor
  };
}

function actorBackingLayer(
  current: SelectedActor | null,
  parentActor: ActorRef | null
): SelectedActor | null {
  if (!parentActor) {
    return null;
  }
  if (current?.actor.id === parentActor.id) {
    return current;
  }
  return { actor: normalizeActor(parentActor), parentMovie: null };
}

function movieBackingLayer(
  current: SelectedMovie | null,
  parentMovie: SelectedMovie | null
): SelectedMovie | null {
  if (!parentMovie) {
    return null;
  }
  if (current?.id === parentMovie.id) {
    return current;
  }
  return parentMovie;
}
