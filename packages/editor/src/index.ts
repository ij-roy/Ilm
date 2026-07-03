export type OutlineItem = {
  readonly level: 1 | 2 | 3;
  readonly title: string;
  readonly anchor: string;
};

export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()!-]/g, " ")
    .trim();
  return text.length === 0 ? 0 : text.split(/\s+/).length;
}

export function estimateReadingTimeMinutes(markdown: string, wordsPerMinute = 225): number {
  return Math.max(1, Math.ceil(countWords(markdown) / wordsPerMinute));
}

export function extractOutline(markdown: string): OutlineItem[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => /^(#{1,3})\s+(.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => {
      const title = match[2] ?? "";
      return {
        level: (match[1]?.length ?? 1) as 1 | 2 | 3,
        title,
        anchor: title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      };
    });
}

export type LocalDraftSnapshot = {
  readonly repositoryId: string;
  readonly draftPath: string;
  readonly markdown: string;
  readonly updatedAt: string;
};

export function isLocalDraftNewer(local: LocalDraftSnapshot, remoteUpdatedAt?: string): boolean {
  if (!remoteUpdatedAt) return true;
  return new Date(local.updatedAt).getTime() > new Date(remoteUpdatedAt).getTime();
}
