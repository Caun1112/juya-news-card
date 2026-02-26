import type { GeneratedContent } from '../types';
import { DEFAULT_ICON_FALLBACK, normalizeIconToken, splitIconCandidates } from './icon-mapping';

export type IconMappingApplyOptions = {
  fallbackIcon?: string;
  cdnIcons?: Iterable<string>;
};

export function resolveIconName(
  rawIcon: unknown,
  options: { fallbackIcon?: string; cdnIconSet?: Set<string> } = {},
): string {
  const fallbackIcon = normalizeIconToken(options.fallbackIcon, DEFAULT_ICON_FALLBACK);
  const candidates = splitIconCandidates(rawIcon);
  if (candidates.length === 0) return fallbackIcon;

  if (options.cdnIconSet && options.cdnIconSet.size > 0) {
    const matched = candidates.find((candidate) => options.cdnIconSet?.has(candidate));
    return matched || fallbackIcon;
  }

  return candidates[0] || fallbackIcon;
}

export function applyIconMappingToContent(
  content: GeneratedContent,
  options: IconMappingApplyOptions = {},
): GeneratedContent {
  const fallbackIcon = normalizeIconToken(options.fallbackIcon, DEFAULT_ICON_FALLBACK);
  const cdnIconSet = options.cdnIcons ? new Set(options.cdnIcons) : undefined;

  return {
    ...content,
    cards: content.cards.map((card) => ({
      ...card,
      icon: resolveIconName(card.icon, {
        fallbackIcon,
        cdnIconSet,
      }),
    })),
  };
}
