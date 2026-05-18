import { Loader2, Play, RefreshCw, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { client } from '../api';
import { ActorDetailSheet } from '../components/discovery/ActorDetailSheet';
import { ConfirmDialog } from '../components/discovery/ConfirmDialog';
import { FollowRuleDialog } from '../components/discovery/FollowRuleDialog';
import { MovieDetailSheet } from '../components/discovery/MovieDetailSheet';
import { MoviePoster } from '../components/MoviePoster';
import { actorLabel, imgUrl, type ActorRef } from '../lib/javdb';
import { formatDateTime } from '../lib/tasks';
import type { Follow, FollowCheckResult } from '../types';

type SelectedMovie = {
  readonly id: string;
  readonly parentActor: ActorRef | null;
};

type SelectedActor = {
  readonly actor: ActorRef;
  readonly parentMovie: SelectedMovie | null;
};

export function FollowingPage() {
  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<FollowCheckResult | null>(null);
  const [editingFollow, setEditingFollow] = useState<Follow | null>(null);
  const [deletingFollow, setDeletingFollow] = useState<Follow | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<SelectedMovie | null>(null);
  const [selectedActor, setSelectedActor] = useState<SelectedActor | null>(null);

  const followByActorId = useMemo(
    () => Object.fromEntries(follows.map((follow) => [follow.actor_external_id, follow])),
    [follows]
  );

  useEffect(() => {
    void loadFollows();
  }, []);

  async function loadFollows() {
    setLoading(true);
    try {
      setFollows(await client.follows());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheck(followId: number) {
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await client.checkFollow(followId);
      setSelectedCheck(result);
      await loadFollows();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function handleCheckAll() {
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await client.checkAllFollows();
      const newCount = result.reduce((total, item) => total + item.new_count, 0);
      setMessage(`已检查 ${result.length} 条关注规则，发现 ${newCount} 部基线后的新作品`);
      await loadFollows();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function handleToggle(follow: Follow) {
    await client.updateFollow(follow.id, { enabled: !follow.enabled });
    await loadFollows();
  }

  async function handleDelete(followId: number) {
    await client.deleteFollow(followId);
    if (selectedCheck?.follow_id === followId) {
      setSelectedCheck(null);
    }
    setDeletingFollow(null);
    await loadFollows();
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
    await loadFollows();
  }

  async function updateFollowTags(follow: Follow, tagIds: string[], tagNames: string[]) {
    await client.updateFollow(follow.id, {
      selected_tag_ids: tagIds,
      selected_tag_names: tagNames
    });
    await loadFollows();
  }

  function openActor(actor: ActorRef, parentMovieId?: string) {
    setSelectedMovie(null);
    setSelectedActor({
      actor,
      parentMovie: parentMovieId ? { id: parentMovieId, parentActor: selectedMovie?.parentActor ?? null } : null
    });
  }

  function closeActor() {
    const parentMovie = selectedActor?.parentMovie ?? null;
    setSelectedActor(null);
    if (parentMovie) {
      setSelectedMovie(parentMovie);
    }
  }

  function openMovie(movieId: string, parentActor: ActorRef | null = null) {
    setSelectedActor(null);
    setSelectedMovie({ id: movieId, parentActor });
  }

  function closeMovie() {
    const parentActor = selectedMovie?.parentActor ?? null;
    setSelectedMovie(null);
    if (parentActor) {
      setSelectedActor({ actor: parentActor, parentMovie: null });
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={16} />
        加载中...
      </p>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">关注</h1>
        <button
          className="flex min-h-10 items-center gap-1 rounded-md bg-brand px-3 text-sm text-white"
          disabled={checking}
          onClick={handleCheckAll}
          type="button"
        >
          {checking ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          检查全部
        </button>
      </div>
      {message ? <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p> : null}
      {selectedCheck ? (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-ink">{selectedCheck.actor_name} · {selectedCheck.new_count} 部基线后新作品</h2>
              <p className="mt-1 text-xs text-slate-500">{selectedCheck.selected_tag_names.join(' · ')}</p>
            </div>
            <button className="text-xs text-slate-400" onClick={() => setSelectedCheck(null)} type="button">关闭</button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {selectedCheck.movies.map((movie) => (
              <button className="text-left" key={movie.id} onClick={() => openMovie(movie.id)} type="button">
                <MoviePoster alt={movie.number} src={movie.thumb_url} />
                <p className="mt-1 text-xs font-medium text-ink">{movie.number}</p>
                <p className="line-clamp-2 text-xs text-slate-500">{movie.title}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {follows.length === 0 ? (
          <p className="rounded-lg border border-line bg-white p-4 text-sm text-slate-500">
            还没有关注演员。可以从发现、排行或作品详情里进入演员页，再选择用于搜索作品的标签。
          </p>
        ) : null}
        {follows.map((follow) => (
          <article
            className={`rounded-lg border bg-white p-4 ${
              follow.enabled ? 'border-line' : 'border-slate-200 opacity-60'
            }`}
            key={follow.id}
          >
            <button className="flex w-full items-center gap-3 text-left" onClick={() => openActor(toActorRef(follow))} type="button">
              {follow.actor_avatar_url ? (
                <img alt={follow.actor_name} className="h-12 w-12 rounded object-cover" src={imgUrl(follow.actor_avatar_url)} />
              ) : (
                <span className="h-12 w-12 rounded bg-slate-100" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-ink">{actorLabel(follow.actor_name)}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {follow.latest_count} 部基线后新作品 · 更新 {formatDateTime(follow.updated_at)}
                </p>
              </div>
            </button>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {follow.selected_tag_names.map((tagName) => (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600" key={tagName}>
                  {tagName}
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <button className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line text-xs" disabled={checking} onClick={() => handleCheck(follow.id)} type="button">
                <Play size={14} />
                检查
              </button>
              <button className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-line text-xs" onClick={() => setEditingFollow(follow)} type="button">
                <Tags size={14} />
                标签
              </button>
              <button className="min-h-11 rounded-md border border-line text-xs" onClick={() => handleToggle(follow)} type="button">
                {follow.enabled ? '停用' : '启用'}
              </button>
              <button className="flex min-h-11 items-center justify-center rounded-md border border-line text-danger" onClick={() => setDeletingFollow(follow)} type="button" aria-label={`删除关注 ${follow.actor_name}`}>
                <Trash2 size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {editingFollow ? (
        <FollowRuleDialog
          actor={toActorRef(editingFollow)}
          initialTagIds={editingFollow.selected_tag_ids}
          onClose={() => setEditingFollow(null)}
          onSave={(tagIds, tagNames) => updateFollowTags(editingFollow, tagIds, tagNames)}
        />
      ) : null}
      {deletingFollow ? (
        <ConfirmDialog
          title="删除关注"
          description={
            <p>
              确认删除 {actorLabel(deletingFollow.actor_name)} 的关注规则？已记录的基线和新作计数也会一起移除。
            </p>
          }
          confirmLabel="删除"
          onCancel={() => setDeletingFollow(null)}
          onConfirm={() => handleDelete(deletingFollow.id)}
        />
      ) : null}
      {selectedMovie ? (
        <MovieDetailSheet movieId={selectedMovie.id} onClose={closeMovie} onOpenActor={openActor} />
      ) : null}
      {selectedActor ? (
        <ActorDetailSheet
          actor={selectedActor.actor}
          follow={followByActorId[selectedActor.actor.id] ?? null}
          onClose={closeActor}
          onOpenMovie={openMovie}
          onSaveFollow={saveFollow}
        />
      ) : null}
    </section>
  );
}

function toActorRef(follow: Follow): ActorRef {
  return {
    id: follow.actor_external_id,
    name: follow.actor_name,
    avatar_url: follow.actor_avatar_url ?? '',
    profile_url: follow.actor_profile_url
  };
}
