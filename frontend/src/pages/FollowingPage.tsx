import { Loader2, MoreHorizontal, RefreshCw, Tags, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { client } from '../api';
import { ActorDetailSheet } from '../components/discovery/ActorDetailSheet';
import { ConfirmDialog } from '../components/discovery/ConfirmDialog';
import { FollowRuleDialog } from '../components/discovery/FollowRuleDialog';
import { MovieDetailSheet } from '../components/discovery/MovieDetailSheet';
import { MoviePoster } from '../components/MoviePoster';
import { EmptyState, InlineAlert, SectionHeader } from '../components/ui';
import { actorLabel, imgUrl, type ActorRef } from '../lib/javdb';
import { formatDateTime } from '../lib/tasks';
import { useDetailHistory } from '../lib/useDetailHistory';
import type { Follow, FollowCheckResult } from '../types';

export function FollowingPage() {
  const [follows, setFollows] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [busyFollowIds, setBusyFollowIds] = useState<Set<number>>(new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<FollowCheckResult | null>(null);
  const [editingFollow, setEditingFollow] = useState<Follow | null>(null);
  const [deletingFollow, setDeletingFollow] = useState<Follow | null>(null);
  const actorFollows = useMemo(() => follows.filter((follow) => follow.type !== 'movie'), [follows]);
  const movieFollows = useMemo(() => follows.filter((follow) => follow.type === 'movie'), [follows]);
  const followByActorId = useMemo(() => Object.fromEntries(actorFollows.map((follow) => [follow.actor_external_id, follow])), [actorFollows]);
  const { selectedMovie, selectedActor, activeOverlayKind, openMovie, closeMovie, openActor, closeActor } = useDetailHistory('following');

  useEffect(() => { void loadFollows(true); }, []);

  async function loadFollows(initial = false) {
    if (initial) setLoading(true);
    try {
      setFollows(await client.follows());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (initial) setLoading(false);
    }
  }

  async function handleCheck(followId: number) {
    if (checking) return;
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await client.checkFollow(followId);
      setSelectedCheck(result);
      await loadFollows(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function handleCheckAll() {
    if (checking) return;
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await client.checkAllFollows();
      const newCount = result.reduce((total, item) => total + item.new_count, 0);
      setMessage(`已检查 ${result.length} 条关注，发现 ${newCount} 部新作品`);
      await loadFollows(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function handleToggle(follow: Follow) {
    if (busyFollowIds.has(follow.id)) return;
    setFollowBusy(follow.id, true);
    setError(null);
    try {
      await client.updateFollow(follow.id, { enabled: !follow.enabled });
      setFollows((current) => current.map((item) => item.id === follow.id ? { ...item, enabled: !item.enabled } : item));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFollowBusy(follow.id, false);
    }
  }

  async function handleDelete(followId: number) {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await client.deleteFollow(followId);
      if (selectedCheck?.follow_id === followId) setSelectedCheck(null);
      setFollows((current) => current.filter((follow) => follow.id !== followId));
      setDeletingFollow(null);
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveFollow(actor: ActorRef, tagIds: string[], tagNames: string[]) {
    await client.createFollow({ actor_external_id: actor.id, actor_name: actor.name, actor_profile_url: actor.profile_url ?? `https://javdb.com/actors/${actor.id}`, actor_avatar_url: actor.avatar_url, selected_tag_ids: tagIds, selected_tag_names: tagNames });
    await loadFollows(false);
  }

  async function updateFollowTags(follow: Follow, tagIds: string[], tagNames: string[]) {
    await client.updateFollow(follow.id, { selected_tag_ids: tagIds, selected_tag_names: tagNames });
    setEditingFollow(null);
    await loadFollows(false);
  }

  function setFollowBusy(id: number, busy: boolean) {
    setBusyFollowIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  }

  if (loading) return <FollowingSkeleton />;

  return (
    <section>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{actorFollows.length} 位演员 · {movieFollows.length} 个作品</p>
        <button aria-label="检查全部关注" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50" disabled={checking} onClick={() => void handleCheckAll()} type="button">
          {checking ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
        </button>
      </div>
      {message ? <InlineAlert className="mt-2" tone="success">{message}</InlineAlert> : null}
      {error ? <InlineAlert className="mt-2" tone="danger">{error}</InlineAlert> : null}

      {selectedCheck ? (
        <section className="mt-5">
          <SectionHeader title={`${selectedCheck.actor_name} · ${selectedCheck.new_count} 部新作品`} trailing={<button className="min-h-11 px-1 text-sm text-slate-500" onClick={() => setSelectedCheck(null)} type="button">关闭</button>} />
          {selectedCheck.selected_tag_names.length ? <p className="mt-1 text-xs text-slate-400">{selectedCheck.selected_tag_names.join(' · ')}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">{selectedCheck.movies.map((movie) => <button className="text-left" key={movie.id} onClick={() => openMovie(movie.id)} type="button"><MoviePoster alt={movie.number} className="rounded-lg" src={movie.thumb_url} /><p className="mt-2 text-sm font-semibold text-ink">{movie.number}</p><p className="line-clamp-2 text-[13px] text-slate-500">{movie.title}</p></button>)}</div>
        </section>
      ) : null}

      <div className="mt-5 space-y-6">
        {follows.length === 0 ? <EmptyState title="还没有关注内容" description="可从发现、排行或详情页添加关注。" /> : null}
        {movieFollows.length > 0 ? <FollowSection title="作品订阅" follows={movieFollows} busyFollowIds={busyFollowIds} movie onDelete={(follow) => { setDeleteError(null); setDeletingFollow(follow); }} onOpen={(follow) => openMovie(follow.actor_external_id)} onToggle={(follow) => void handleToggle(follow)} /> : null}
        {actorFollows.length > 0 ? <FollowSection title="演员关注" follows={actorFollows} busyFollowIds={busyFollowIds} checking={checking} onCheck={(follow) => void handleCheck(follow.id)} onDelete={(follow) => { setDeleteError(null); setDeletingFollow(follow); }} onEdit={setEditingFollow} onOpen={(follow) => openActor(toActorRef(follow))} onToggle={(follow) => void handleToggle(follow)} /> : null}
      </div>

      {editingFollow ? <FollowRuleDialog actor={toActorRef(editingFollow)} initialTagIds={editingFollow.selected_tag_ids} onClose={() => setEditingFollow(null)} onSave={(tagIds, tagNames) => updateFollowTags(editingFollow, tagIds, tagNames)} /> : null}
      {deletingFollow ? <ConfirmDialog busy={deleteBusy} danger title={deletingFollow.type === 'movie' ? '删除作品订阅' : '删除关注'} description={<div className="space-y-2"><p>{deletingFollow.type === 'movie' ? `确认删除作品订阅 ${deletingFollow.actor_name}？` : `确认删除 ${actorLabel(deletingFollow.actor_name)} 的关注规则？`}</p>{deleteError ? <p className="rounded-md bg-red-50 p-2 text-xs text-danger" role="alert">{deleteError}</p> : null}</div>} confirmLabel="删除" onCancel={() => { if (!deleteBusy) setDeletingFollow(null); }} onConfirm={() => void handleDelete(deletingFollow.id)} /> : null}
      {selectedMovie ? <MovieDetailSheet isTop={activeOverlayKind === 'movie'} movieId={selectedMovie.id} onClose={closeMovie} onOpenActor={openActor} onOpenMovie={(movieId) => openMovie(movieId, selectedMovie.parentActor)} /> : null}
      {selectedActor ? <ActorDetailSheet actor={selectedActor.actor} follow={followByActorId[selectedActor.actor.id] ?? null} isTop={activeOverlayKind === 'actor'} onClose={closeActor} onOpenMovie={openMovie} onSaveFollow={saveFollow} /> : null}
    </section>
  );
}

type FollowSectionProps = {
  readonly title: string;
  readonly follows: Follow[];
  readonly busyFollowIds: Set<number>;
  readonly movie?: boolean;
  readonly checking?: boolean;
  readonly onCheck?: (follow: Follow) => void;
  readonly onDelete: (follow: Follow) => void;
  readonly onEdit?: (follow: Follow) => void;
  readonly onOpen: (follow: Follow) => void;
  readonly onToggle: (follow: Follow) => void;
};

function FollowSection(props: FollowSectionProps) {
  return (
    <section>
      <SectionHeader title={props.title} />
      <div className="quiet-list mt-2">
        {props.follows.map((follow) => (
          <FollowRow
            key={follow.id}
            checking={props.checking}
            disabled={props.busyFollowIds.has(follow.id)}
            follow={follow}
            movie={props.movie}
            onCheck={props.onCheck ? () => props.onCheck?.(follow) : undefined}
            onDelete={() => props.onDelete(follow)}
            onEdit={props.onEdit ? () => props.onEdit?.(follow) : undefined}
            onOpen={() => props.onOpen(follow)}
            onToggle={() => props.onToggle(follow)}
          />
        ))}
      </div>
    </section>
  );
}

function FollowRow(props: { readonly checking?: boolean; readonly disabled: boolean; readonly follow: Follow; readonly movie?: boolean; readonly onCheck?: () => void; readonly onDelete: () => void; readonly onEdit?: () => void; readonly onOpen: () => void; readonly onToggle: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const follow = props.follow;
  return (
    <article className={`quiet-list-item relative py-3 ${follow.enabled ? '' : 'opacity-55'}`}>
      <div className="flex items-center gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={props.onOpen} type="button">
          {props.movie ? <MoviePoster alt={follow.actor_name} className="h-16 w-12 shrink-0 rounded-md" src={follow.actor_avatar_url} /> : follow.actor_avatar_url ? <img alt={follow.actor_name} className="h-12 w-12 shrink-0 rounded-lg object-cover" decoding="async" loading="lazy" src={imgUrl(follow.actor_avatar_url)} /> : <span className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{props.movie ? follow.actor_name : actorLabel(follow.actor_name)}</span>
            <span className="mt-1 block truncate text-xs text-slate-400">{props.movie ? formatDateTime(follow.updated_at) : `${follow.latest_count} 部新作品 · ${formatDateTime(follow.updated_at)}`}</span>
            {follow.selected_tag_names.length ? <span className="mt-1 block truncate text-xs text-slate-500">{follow.selected_tag_names.join(' · ')}</span> : null}
          </span>
        </button>
        {!props.movie ? <button aria-label={`检查 ${follow.actor_name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50" disabled={props.checking || props.disabled} onClick={props.onCheck} type="button"><RefreshCw className={props.checking ? 'animate-spin' : ''} size={16} /></button> : null}
        <button aria-expanded={menuOpen} aria-label={`更多操作 ${follow.actor_name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" onClick={() => setMenuOpen((value) => !value)} type="button"><MoreHorizontal size={18} /></button>
      </div>
      {menuOpen ? <div className="ml-[3.75rem] mt-2 grid gap-1 border-l border-line pl-3">{!props.movie ? <button className="flex min-h-11 items-center gap-2 text-left text-sm text-ink" onClick={() => { setMenuOpen(false); props.onEdit?.(); }} type="button"><Tags size={15} />编辑标签</button> : null}<button className="min-h-11 text-left text-sm text-ink disabled:opacity-50" disabled={props.disabled} onClick={() => { setMenuOpen(false); props.onToggle(); }} type="button">{follow.enabled ? '停用' : '启用'}</button><button className="flex min-h-11 items-center gap-2 text-left text-sm text-danger" onClick={() => { setMenuOpen(false); props.onDelete(); }} type="button"><Trash2 size={15} />删除</button></div> : null}
    </article>
  );
}

function FollowingSkeleton() {
  return <div className="quiet-list" aria-live="polite">{Array.from({ length: 5 }, (_, index) => <div className="quiet-list-item flex gap-3 py-3" key={index}><div className="h-12 w-12 animate-pulse rounded-lg bg-slate-100" /><div className="flex-1"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" /><div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-100" /></div></div>)}</div>;
}

function toActorRef(follow: Follow): ActorRef {
  return { id: follow.actor_external_id, name: follow.actor_name, avatar_url: follow.actor_avatar_url ?? '', profile_url: follow.actor_profile_url };
}
