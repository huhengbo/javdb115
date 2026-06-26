export type ActorTagOption = {
  readonly id: string;
  readonly name: string;
};

export type ActorSortOption = {
  readonly value: number;
  readonly label: string;
};

export type ActorRef = {
  readonly id: string;
  readonly name: string;
  readonly avatar_url: string;
  readonly profile_url?: string;
};

const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * 1024;
const BYTES_PER_GB = BYTES_PER_MB * 1024;
const IMAGE_PROXY_PREFIXES = [
  ['https://tp.cmastd.com/', '/api/img/tp.cmastd.com/'],
  ['https://tp.spfcas.com/', '/api/img/tp.spfcas.com/'],
  ['https://c0.jdbstatic.com/', '/api/img/c0.jdbstatic.com/']
] as const;

export const FOLLOW_TAG_OPTIONS: readonly ActorTagOption[] = [
  { id: '0', name: '有码' },
  { id: '1', name: '无码' },
  { id: 'p', name: '可播放' },
  { id: 'm', name: '含磁链' },
  { id: 'c', name: '含字幕' },
  { id: 's', name: '单体作品' }
] as const;

export const ACTOR_SORT_OPTIONS: readonly ActorSortOption[] = [
  { value: 0, label: '发布日期倒序' },
  { value: 1, label: '评分倒序' },
  { value: 2, label: '热度倒序' },
  { value: 3, label: '想看人数倒序' },
  { value: 4, label: '看过人数倒序' }
] as const;

export function imgUrl(url: string): string {
  if (!url) {
    return '';
  }
  for (const [sourcePrefix, proxyPrefix] of IMAGE_PROXY_PREFIXES) {
    if (url.startsWith(sourcePrefix)) {
      return `${proxyPrefix}${url.slice(sourcePrefix.length)}`;
    }
  }
  return url;
}

export function formatMagnetSize(sizeMb: number): string {
  const bytes = sizeMb * BYTES_PER_MB;
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(0)} MB`;
  }
  if (bytes >= BYTES_PER_KB) {
    return `${(bytes / BYTES_PER_KB).toFixed(0)} KB`;
  }
  return `${bytes.toFixed(0)} B`;
}

export function actorLabel(name: string, fallback?: string): string {
  return name.trim() || fallback || '未知演员';
}

export function tagNameById(tagId: string): string {
  const found = FOLLOW_TAG_OPTIONS.find((option) => option.id === tagId);
  return found?.name ?? tagId;
}
