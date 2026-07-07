import {
  DraftFrontmatter,
  MediaLocation,
  PostFrontmatter,
  buildDraftPath,
  buildPostPath,
  serializeMarkdownDocument
} from "@ilm/repository";
import { AppError, Result, err, ok, validationError } from "@ilm/shared";

export type CommitFileOperation = {
  readonly path: string;
  readonly content: string;
  readonly encoding: "utf-8" | "base64";
  readonly operation?: "upsert" | "delete";
};

export type CommitManifest = {
  readonly message: string;
  readonly files: readonly CommitFileOperation[];
};

export type DraftSavePlan = {
  readonly kind: "draft-save";
  readonly draftPath: string;
  readonly commit: CommitManifest;
};

export type PublishPlan = {
  readonly kind: "publish";
  readonly draftPath?: string;
  readonly postPath: string;
  readonly commit: CommitManifest;
};

export type PublishProgressStage =
  | "idle"
  | "validating"
  | "validating-site"
  | "uploading-media"
  | "creating-commit"
  | "pushing"
  | "building"
  | "deploying"
  | "verifying-live-url"
  | "live"
  | "published"
  | "failed";

export type PublishProgress = {
  readonly stage: PublishProgressStage;
  readonly message: string;
};

export type PublishConflict = {
  readonly path: string;
  readonly reason: "remote_changed" | "missing_base_sha";
};

export type PublishResult = {
  readonly commitSha: string;
  readonly deploymentUrl?: string;
};

export type DraftSaveInput = {
  readonly slug: string;
  readonly markdown: string;
  readonly title: string;
  readonly frontmatter?: DraftFrontmatter;
  readonly media?: readonly PlannedMediaWrite[];
};

export type PublishInput = {
  readonly slug: string;
  readonly markdown: string;
  readonly title: string;
  readonly draftSlug?: string;
  readonly hasRemoteDraft?: boolean;
  readonly frontmatter?: PostFrontmatter;
  readonly media?: readonly PlannedMediaWrite[];
};

export type PlannedMediaWrite = {
  readonly location: MediaLocation;
  readonly content: string;
  readonly encoding: "base64";
};

export function createDraftSavePlan(input: DraftSaveInput): Result<DraftSavePlan, AppError> {
  if (input.markdown.trim().length === 0) {
    return err(validationError("Draft content cannot be empty"));
  }

  const draftPath = buildDraftPath(input.slug);
  const content = input.frontmatter
    ? serializeMarkdownDocument({ frontmatter: input.frontmatter, body: input.markdown })
    : input.markdown;
  return ok({
    kind: "draft-save",
    draftPath,
    commit: {
      message: `draft: save ${input.title}`,
      files: [
        { path: draftPath, content, encoding: "utf-8", operation: "upsert" },
        ...(input.media ?? []).map((media) => ({
          path: media.location.path,
          content: media.content,
          encoding: media.encoding,
          operation: "upsert" as const
        }))
      ]
    }
  });
}

export function createPublishPlan(input: PublishInput): Result<PublishPlan, AppError> {
  if (input.markdown.trim().length === 0) {
    return err(validationError("Published content cannot be empty"));
  }

  const postPath = buildPostPath(input.slug);
  const draftPath = input.draftSlug ? buildDraftPath(input.draftSlug) : undefined;
  const content = input.frontmatter
    ? serializeMarkdownDocument({ frontmatter: input.frontmatter, body: input.markdown })
    : input.markdown;
  return ok({
    kind: "publish",
    draftPath,
    postPath,
    commit: {
      message: `publish: ${input.title}`,
      files: [
        { path: postPath, content, encoding: "utf-8", operation: "upsert" },
        ...(draftPath && input.hasRemoteDraft
          ? [
              {
                path: draftPath,
                content: "",
                encoding: "utf-8" as const,
                operation: "delete" as const
              }
            ]
          : []),
        ...(input.media ?? []).map((media) => ({
          path: media.location.path,
          content: media.content,
          encoding: media.encoding,
          operation: "upsert" as const
        }))
      ]
    }
  });
}

export function validatePublishPlan(plan: PublishPlan): Result<PublishPlan, AppError> {
  if (plan.commit.files.length === 0) {
    return err(validationError("Publish plan must include at least one file"));
  }

  const postWrite = plan.commit.files.find(
    (file) => file.path === plan.postPath && file.operation !== "delete"
  );
  if (!postWrite) {
    return err(validationError("Publish plan must include the post markdown file"));
  }

  return ok(plan);
}
