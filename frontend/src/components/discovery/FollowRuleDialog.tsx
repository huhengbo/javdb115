import { Check, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { actorLabel, FOLLOW_TAG_OPTIONS, imgUrl } from '../../lib/javdb';
import type { ActorRef } from '../../lib/javdb';

type Props = {
  readonly actor: ActorRef;
  readonly initialTagIds: string[];
  readonly onClose: () => void;
  readonly onSave: (tagIds: string[], tagNames: string[]) => Promise<void>;
};

export function FollowRuleDialog({ actor, initialTagIds, onClose, onSave }: Props) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagIds);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedTagIds(initialTagIds);
  }, [initialTagIds]);

  const selectedTagNames = useMemo(
    () =>
      FOLLOW_TAG_OPTIONS.filter((option) => selectedTagIds.includes(option.id)).map(
        (option) => option.name
      ),
    [selectedTagIds]
  );

  async function save() {
    if (selectedTagIds.length === 0) {
      setError('至少选择一个标签');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(selectedTagIds, selectedTagNames);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function toggle(tagId: string) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId]
    );
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-end bg-black/60 sm:items-center sm:justify-center">
      <div className="w-full rounded-t-2xl bg-white p-4 sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">关注演员标签</h2>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-mist p-3">
          {actor.avatar_url ? (
            <img
              alt={actor.name}
              className="h-14 w-14 rounded-lg object-cover"
              src={imgUrl(actor.avatar_url)}
            />
          ) : (
            <span className="h-14 w-14 rounded-lg bg-slate-200" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{actorLabel(actor.name)}</p>
            <p className="mt-1 text-xs text-slate-500">已选标签需同时命中</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FOLLOW_TAG_OPTIONS.map((option) => {
            const selected = selectedTagIds.includes(option.id);
            return (
              <button
                className={`flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm ${
                  selected
                    ? 'border-brand bg-brand text-white'
                    : 'border-line bg-white text-slate-600'
                }`}
                key={option.id}
                onClick={() => toggle(option.id)}
                type="button"
              >
                {selected ? <Check size={14} /> : null}
                {option.name}
              </button>
            );
          })}
        </div>
        {error ? <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="min-h-11 rounded-md border border-line px-3 text-sm font-medium text-ink"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand px-3 text-sm font-medium text-white disabled:opacity-60"
            disabled={saving}
            onClick={save}
            type="button"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : null}
            保存规则
          </button>
        </div>
      </div>
    </div>
  );
}
