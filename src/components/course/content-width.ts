/**
 * One content width for every course tab: 1080px of content on the 24px
 * gutters (1128px with them), left-aligned. Past it, a row's trailing meta
 * would drift away from the title it belongs to.
 */
export const COURSE_CONTENT = "w-full max-w-[1128px]";

/** The Files list beside its folder tree, so tree + list stop at COURSE_CONTENT. */
export const COURSE_FILES_LIST = "max-w-[864px] xl:max-w-[840px]";
