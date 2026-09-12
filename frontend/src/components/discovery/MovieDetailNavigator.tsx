import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { client } from '../../api';
import { useDetailHistory } from '../../lib/useDetailHistory';
import type { ActorRef } from '../../lib/javdb';
import type { Follow } from '../../types';
import { ActorDetailSheet } from './ActorDetailSheet';
import { MovieDetailSheet } from './MovieDetailSheet';

type Props = {
  readonly scope: string;
  readonly children: (openMovie: (movieId: string) => void) => ReactNode;
};

export function MovieDetailNavigator({ scope, children }: Props) {
  const [follows, setFollows] = useState<Follow[]>([]);
  const {
    selectedMovie,
    selectedActor,
    activeOverlayKind,
    openMovie,
    closeMovie,
    openActor,
    closeActor
  } = useDetailHistory(scope);
  const followByActorId = useMemo(
    () => Object.fromEntries(
      follows
        .filter((follow) => follow.type !== 'movie')
        .map((follow) => [follow.actor_external_id, follow])
    ),
    [follows]
  );

  useEffect(() => {
    void refreshFollows();
  }, []);

  async function refreshFollows() {
    try {
      setFollows(await client.follows());
    } catch {
      setFollows([]);
    }
  }

  async function saveFollow(actor: ActorRef, tagIds: string[], tagNames: string[]) {
    await client.createFollow({
      actor_external_id: actor.id,
      actor_name: actor.name,
      actor_profile_url: actor.profile_url ?? `https://javdb.com/actors/${actor.id}`,
      actor_avatar_url: actor.avatar_url,
      selected_tag_ids: tagIds,
      selected_tag_names: tagNames
    });
    await refreshFollows();
  }

  return (
    <>
      {children((movieId) => openMovie(movieId))}
      {selectedMovie ? (
        <MovieDetailSheet
          isTop={activeOverlayKind === 'movie'}
          movieId={selectedMovie.id}
          onClose={closeMovie}
          onOpenActor={openActor}
          onOpenMovie={(movieId) => openMovie(movieId, selectedMovie.parentActor)}
        />
      ) : null}
      {selectedActor ? (
        <ActorDetailSheet
          actor={selectedActor.actor}
          follow={followByActorId[selectedActor.actor.id] ?? null}
          isTop={activeOverlayKind === 'actor'}
          onClose={closeActor}
          onOpenMovie={openMovie}
          onSaveFollow={saveFollow}
        />
      ) : null}
    </>
  );
}
