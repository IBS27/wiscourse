// Canvas content types are unreliable for source code — a `.c` arrives as
// `application/octet-stream` — so the extension gets the final say.

import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export type PreviewKind = "pdf" | "image" | "text" | "download";

type IconKey =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "json"
  | "sheet"
  | "slides"
  | "archive"
  | "code"
  | "text"
  | "generic";

/** Plain-text and source extensions worth showing inline. */
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "log", "json", "yml", "yaml", "xml",
  "html", "c", "h", "cpp", "cc", "hpp", "cs", "java", "py", "js", "jsx", "ts",
  "tsx", "go", "rs", "rb", "php", "swift", "kt", "sh", "bash", "zsh", "sql",
  "css", "scss", "r", "m", "pl", "lua", "toml", "ini", "cfg", "make", "mk",
]);

const IMAGE = /^(png|jpe?g|gif|webp|avif|bmp|ico|tiff?|svg)$/;
const ARCHIVE = /^(zip|tar|gz|tgz|bz2|xz|rar|7z)$/;
const PROSE = /^(txt|md|markdown|log|doc|docx|rtf)$/;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function previewKind(contentType: string, filename: string): PreviewKind {
  const { kind, text } = classifyFile(contentType, filename);
  if (kind === "pdf" || kind === "image") return kind;
  return text ? "text" : "download";
}

function classifyFile(contentType: string, filename: string): { kind: IconKey; text: boolean; ext: string } {
  const type = contentType.toLowerCase();
  const ext = extensionOf(filename);
  const text = type.startsWith("text/") || type === "application/json" ||
    type.includes("javascript") || TEXT_EXTENSIONS.has(ext);
  const kind: IconKey = type === "application/pdf" || ext === "pdf" ? "pdf"
    : type.startsWith("image/") || IMAGE.test(ext) ? "image"
    : type.startsWith("video/") ? "video"
    : type.startsWith("audio/") ? "audio"
    : ext === "json" || type === "application/json" ? "json"
    : /^(csv|tsv|xls|xlsx)$/.test(ext) ? "sheet"
    : /^(ppt|pptx|key)$/.test(ext) ? "slides"
    : ARCHIVE.test(ext) ? "archive"
    : PROSE.test(ext) ? "text"
    : TEXT_EXTENSIONS.has(ext) ? "code" : "generic";
  return { kind, text, ext };
}

const ICON: Record<IconKey, LucideIcon> = {
  pdf: FileText,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  json: FileJson,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  generic: File,
};

/** The one file-type icon lookup: every surface that draws a file uses this. */
export function fileIcon(contentType: string, filename: string): LucideIcon {
  return ICON[classifyFile(contentType, filename).kind];
}

/** "PDF document", "PNG image", "DOCX file" — the download card's subtitle. */
export function typeLabel(contentType: string, filename: string): string {
  const { kind, ext } = classifyFile(contentType, filename);
  if (kind === "pdf") return "PDF document";
  if (kind === "image") return `${ext.toUpperCase() || "Image"} image`;
  if (kind === "video") return `${ext.toUpperCase() || "Video"} video`;
  if (kind === "audio") return `${ext.toUpperCase() || "Audio"} audio`;
  if (kind === "archive") return `${ext.toUpperCase()} archive`;
  return ext === "" ? "File" : `${ext.toUpperCase()} file`;
}
