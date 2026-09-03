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

const ARCHIVE = /^(zip|tar|gz|tgz|bz2|xz|rar|7z)$/;
const PROSE = /^(txt|md|markdown|log|doc|docx|rtf)$/;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function previewKind(contentType: string, filename: string): PreviewKind {
  const type = contentType.toLowerCase();
  const ext = extensionOf(filename);
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("image/") || ext === "svg") return "image";
  if (type.startsWith("text/") || type === "application/json" || type.includes("javascript")) {
    return "text";
  }
  return TEXT_EXTENSIONS.has(ext) ? "text" : "download";
}

function iconKey(contentType: string, filename: string): IconKey {
  const type = contentType.toLowerCase();
  const ext = extensionOf(filename);
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("image/") || ext === "svg") return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (ext === "json" || type === "application/json") return "json";
  if (ext === "csv" || ext === "tsv" || ext === "xls" || ext === "xlsx") return "sheet";
  if (ext === "ppt" || ext === "pptx" || ext === "key") return "slides";
  if (ARCHIVE.test(ext)) return "archive";
  if (PROSE.test(ext)) return "text";
  return TEXT_EXTENSIONS.has(ext) ? "code" : "generic";
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
  return ICON[iconKey(contentType, filename)];
}

/** "PDF document", "PNG image", "DOCX file" — the download card's subtitle. */
export function typeLabel(contentType: string, filename: string): string {
  const ext = extensionOf(filename);
  const type = contentType.toLowerCase();
  if (type === "application/pdf" || ext === "pdf") return "PDF document";
  if (type.startsWith("image/") || ext === "svg") return `${ext.toUpperCase() || "Image"} image`;
  if (type.startsWith("video/")) return `${ext.toUpperCase() || "Video"} video`;
  if (type.startsWith("audio/")) return `${ext.toUpperCase() || "Audio"} audio`;
  if (ARCHIVE.test(ext)) return `${ext.toUpperCase()} archive`;
  return ext === "" ? "File" : `${ext.toUpperCase()} file`;
}
