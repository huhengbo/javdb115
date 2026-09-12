import { Film, Loader2, MoreHorizontal, Play, RefreshCw, Tags, Trash2 } from 'lucide-react';
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
      setMessage(`已检查 ${result.length} 条演员关注规则，发现 ${newCount} 部基线后的新作品`);
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
      setFollows((current) => current.map((item) => item.id === follow.id ? { ...item, enabled: !follow.enabled } : item));
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
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm text-slate-500">{actorFollows.length} 位演员 · {movieFollows.length} 个作品订阅</p></div>
        <button className="flex min-h-11 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-white disabled:opacity-60" disabled={checking} onClick={() => void handleCheckAll()} type="button">{checking ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}{checking ? '检查中' : '检查全部'}</button>
      </div>
      {message ? <InlineAlert className="mt-3" tone="success">{message}</InlineAlert> : null}
      {error ? <InlineAlert className="mt-3" tone="danger">{error}</InlineAlert> : null}
      {selectedCheck ? (
        <section className="mt-5">
          <SectionHeader title={`${selectedCheck.actor_name} · ${selectedCheck.new_count} 部新作品`} description={selectedCheck.selected_tag_names.join(' · ')} trailing={<button className="min-h-11 px-2 text-sm text-slate-500" onClick={() => setSelectedCheck(null)} type="button">关闭</button>} />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{selectedCheck.movies.map((movie) => <button className="rounded-xl bg-white p-1.5 text-left shadow-sm" key={movie.id} onClick={() => openMovie(movie.id)} type="button"><MoviePoster alt={movie.number} className="rounded-lg" src={movie.thumb_url} /><p className="mt-2 px-1 text-sm font-semibold text-ink">{movie.number}</p><p className="line-clamp-2 px-1 pb-1 text-[13px] text-slate-500">{movie.title}</p></button>)}</div>
        </section>
      ) : null}
      <div className="mt-5 space-y-5">
        {follows.length === 0 ? <EmptyState title="还没有关注内容" description="从发现、排行或详情页关注演员，或订阅具体作品。" /> : null}
        {movieFollows.length > 0 ? <section><SectionHeader title="作品订阅" /><div className="mt-3 space-y-2">{movieFollows.map((follow) => <FollowCard key={follow.id} disabled={busyFollowIds.has(follow.id)} follow={follow} movie onDelete={() => { setDeleteError(null); setDeletingFollow(follow); }} onOpen={() => openMovie(follow.actor_external_id)} onToggle={() => void handleToggle(follow)} />)}</div></section> : null}
        {actorFollows.length > 0 ? <section><SectionHeader title="演员关注" description="卡片保留高频检查，其余操作收进更多菜单" /><div className="mt-3 space-y-2">{actorFollows.map((follow) => <FollowCard key={follow.id} checking={checking} disabled={busyFollowIds.has(follow.id)} follow={follow} onCheck={() => void handleCheck(follow.id)} onDelete={() => { setDeleteError(null); setDeletingFollow(follow); }} onEdit={() => setEditingFollow(follow)} onOpen={() => openActor(toActorRef(follow))} onToggle={() => void handleToggle(follow)} />)}</div></section> : null}
      </div>
      {editingFollow ? <FollowRuleDialog actor={toActorRef(editingFollow)} initialTagIds={editingFollow.selected_tag_ids} onClose={() => setEditingFollow(null)} onSave={(tagIds, tagNames) => updateFollowTags(editingFollow, tagIds, tagNames)} /> : null}
      {deletingFollow ? <ConfirmDialog busy={deleteBusy} danger title={deletingFollow.type === 'movie' ? '删除作品订阅' : '删除关注'} description={<div className="space-y-2"><p>{deletingFollow.type === 'movie' ? `确认删除作品订阅 ${deletingFollow.actor_name}？` : `确认删除 ${actorLabel(deletingFollow.actor_name)} 的关注规则？已记录的基线和新作计数也会一起移除。`}</p>{deleteError ? <p className="rounded-md bg-red-50 p-2 text-xs text-danger" role="alert">{deleteError}</p> : null}</div>} confirmLabel="删除" onCancel={() => { if (!deleteBusy) setDeletingFollow(null); }} onConfirm={() => void handleDelete(deletingFollow.id)} /> : null}
      {selectedMovie ? <MovieDetailSheet isTop={activeOverlayKind === 'movie'} movieId={selectedMovie.id} onClose={closeMovie} onOpenActor={openActor} onOpenMovie={(movieId) => openMovie(movieId, selectedMovie.parentActor)} /> : null}
      {selectedActor ? <ActorDetailSheet actor={selectedActor.actor} follow={followByActorId[selectedActor.actor.id] ?? null} isTop={activeOverlayKind === 'actor'} onClose={closeActor} onOpenMovie={openMovie} onSaveFollow={saveFollow} /> : null}
    </section>
  );
}

function FollowCard(props: { readonly checking?: boolean; readonly disabled: boolean; readonly follow: Follow; readonly movie?: boolean; readonly onCheck?: () => void; readonly onDelete: () => void; readonly onEdit?: () => void; readonly onOpen: () => void; readonly onToggle: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const follow = props.follow;
  return (
    <article className={`relative rounded-xl bg-white p-3 shadow-sm ring-1 ring-line ${follow.enabled ? '' : 'opacity-60'}`}>
      <button className="flex w-full items-center gap-3 pr-1 text-left" onClick={props.onOpen} type="button">
        {props.movie ? <MoviePoster alt={follow.actor_name} className="h-16 w-12 shrink-0 rounded-lg" src={follow.actor_avatar_url} /> : follow.actor_avatar_url ? <img alt={follow.actor_name} className="h-12 w-12 shrink-0 rounded-xl object-cover" decoding="async" loading="lazy" src={imgUrl(follow.actor_avatar_url)} /> : <span className="h-12 w-12 shrink-0 rounded-xl bg-slate-100" />}
        <div className="min-w-0 flex-1">{props.movie ? <div className="flex items-center gap-1 text-xs text-slate-400"><Film size={14} />作品订阅</div> : null}<h3 className="mt-0.5 line-clamp-2 font-semibold text-ink">{props.movie ? follow.actor_name : actorLabel(follow.actor_name)}</h3><p className="mt-1 text-xs text-slate-400">{props.movie ? `更新 ${formatDateTime(follow.updated_at)}` : `${follow.latest_count} 部新作品 · ${formatDateTime(follow.updated_at)}`}</p></div>
      </button>
      {follow.selected_tag_names.length ? <div className="mt-2 flex flex-wrap gap-1.5">{follow.selected_tag_names.map((tagName) => <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500" key={tagName}>{tagName}</span>)}</div> : null}
      <div className="mt-3 flex gap-2">
        {!props.movie ? <button className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-50 text-sm font-medium text-brand disabled:opacity-50" disabled={props.checking || props.disabled} onClick={props.onCheck} type="button"><Play size={15} />检查</button> : <button className="min-h-11 flex-1 rounded-xl bg-slate-50 text-sm font-medium text-ink" onClick={props.onOpen} type="button">查看详情</button>}
        <button aria-expanded={menuOpen} aria-label={`更多操作 ${follow.actor_name}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-500" onClick={() => setMenuOpen((value) => !value)} type="button"><MoreHorizontal size={18} /></button>
      </div>
      {menuOpen ? <div className="mt-2 grid gap-1 rounded-xl bg-slate-50 p-1.5">{!props.movie ? <button className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-ink" onClick={() => { setMenuOpen(false); props.onEdit?.(); }} type="button"><Tags size={16} />编辑标签</button> : null}<button className="min-h-11 rounded-lg px-3 text-left text-sm text-ink disabled:opacity-50" disabled={props.disabled} onClick={() => { setMenuOpen(false); props.onToggle(); }} type="button">{follow.enabled ? '停用' : '启用'}</button><button className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-danger" onClick={() => { setMenuOpen(false); props.onDelete(); }} type="button"><Trash2 size={16} />删除</button></div> : null}
    </article>
  );
}

function FollowingSkeleton() {
  return <div className="space-y-3" aria-live="polite">{Array.from({ length: 4 }, (_, index) => <div className="flex gap-3 rounded-xl bg-white p-3" key={index}><div className="h-12 w-12 animate-pulse rounded-xl bg-slate-100" /><div className="flex-1"><div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" /><div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-100" /></div></div>)}</div>;
}

function toActorRef(follow: Follow): ActorRef {
  return { id: follow.actor_external_id, name: follow.actor_name, avatar_url: follow.actor_avatar_url ?? '', profile_url: follow.actor_profile_url };
}
