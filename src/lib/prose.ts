// Reading styles shared by Canvas HTML and the assistant's answers.

export const PROSE = [
  "text-[14px] leading-[1.6] text-ink",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:mb-3",
  "[&_h1]:mt-6 [&_h1]:mb-[6px] [&_h1]:text-[17px] [&_h1]:font-semibold [&_h1]:tracking-[-0.02em]",
  "[&_h2]:mt-6 [&_h2]:mb-[6px] [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:tracking-[-0.01em]",
  "[&_h3]:mt-5 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-semibold",
  "[&_h4]:mt-4 [&_h4]:mb-1 [&_h4]:text-[13.5px] [&_h4]:font-semibold [&_h4]:text-ink-2",
  "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-[3px] [&_li>ul]:mb-0 [&_li>ol]:mb-0",
  "[&_strong]:font-semibold [&_b]:font-semibold",
  "[&_code]:rounded-[4px] [&_code]:bg-chip [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-[12.5px]",
  "[&_pre]:mb-[14px] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line",
  "[&_pre]:bg-sunken [&_pre]:px-[14px] [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-[12.5px] [&_pre]:leading-[1.55]",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12.5px]",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3 [&_blockquote]:text-ink-2",
  "[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md",
  "[&_video]:my-2 [&_video]:h-auto [&_video]:max-w-full [&_video]:rounded-md",
  "[&_[data-table-wrap]]:mb-3 [&_[data-table-wrap]]:overflow-x-auto",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]",
  "[&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-[6px] [&_th]:text-left [&_th]:font-medium [&_th]:text-ink-2",
  "[&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-[6px] [&_td]:align-top",
  "[&_hr]:my-5 [&_hr]:border-line",
].join(" ");

// Dotted underline stays inside wiscourse; solid plus a ↗ leaves it.
const LINK = "text-c underline decoration-c/45 underline-offset-[3px] hover:decoration-c";
export const INTERNAL_LINK = `${LINK} decoration-dotted`;
export const EXTERNAL_LINK = `${LINK} decoration-solid`;
