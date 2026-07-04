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

import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const ImageUploadExtension = Extension.create({
  name: "imageUpload",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("imageUpload"),
        props: {
          handleDrop(view, event, slice, moved) {
            if (
              !moved &&
              event.dataTransfer &&
              event.dataTransfer.files &&
              event.dataTransfer.files.length > 0
            ) {
              const file = event.dataTransfer.files[0];
              if (!file.type.startsWith("image/")) return false;

              event.preventDefault();
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const customEvent = new CustomEvent("ilm:upload-image", {
                detail: { file, pos: coords?.pos ?? view.state.selection.from }
              });
              window.dispatchEvent(customEvent);
              return true;
            }
            return false;
          },
          handlePaste(view, event, slice) {
            if (
              event.clipboardData &&
              event.clipboardData.files &&
              event.clipboardData.files.length > 0
            ) {
              const file = event.clipboardData.files[0];
              if (!file.type.startsWith("image/")) return false;

              event.preventDefault();
              const customEvent = new CustomEvent("ilm:upload-image", {
                detail: { file, pos: view.state.selection.from }
              });
              window.dispatchEvent(customEvent);
              return true;
            }
            return false;
          }
        }
      })
    ];
  }
});

export const defaultEditorExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3]
    }
  }),
  Image,
  Link.configure({
    openOnClick: false
  }),
  Placeholder.configure({
    placeholder: "Write your next masterpiece..."
  }),
  Markdown,
  ImageUploadExtension
];
