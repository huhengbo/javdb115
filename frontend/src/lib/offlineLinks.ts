export type OfflineLinkType = 'magnet' | 'ed2k';

export type OfflineTextSegment = {
  readonly text: string;
  readonly url?: string;
  readonly type?: OfflineLinkType;
};

const OFFLINE_LINK_PATTERN = /magnet:\?xt=urn:btih:[A-Za-z0-9]{32,40}(?:&[^\s<>"'，。；！？”’】）]*)?|ed2k:\/\/\|file\|[^\r\n]*?\|\//giu;

export function splitOfflineLinks(content: string): OfflineTextSegment[] {
  if (!content) return [{ text: '' }];

  const segments: OfflineTextSegment[] = [];
  const pattern = new RegExp(OFFLINE_LINK_PATTERN.source, OFFLINE_LINK_PATTERN.flags);
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > cursor) segments.push({ text: content.slice(cursor, match.index) });
    const url = match[0];
    segments.push({
      text: url,
      url,
      type: url.toLowerCase().startsWith('magnet:') ? 'magnet' : 'ed2k'
    });
    cursor = match.index + url.length;
  }

  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  return segments.length > 0 ? segments : [{ text: content }];
}
