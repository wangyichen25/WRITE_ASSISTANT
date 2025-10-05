import DiffMatchPatch from "diff-match-patch";

const dmp = new DiffMatchPatch();

type ApplyPatchParams = {
  chapterText: string;
  selectionStart: number;
  selectionEnd: number;
  originalSlice: string;
  replacement: string;
};

export type PatchResult = {
  updatedText: string;
  success: boolean;
};

export function applySelectionPatch({
  chapterText,
  selectionStart,
  selectionEnd,
  originalSlice,
  replacement,
}: ApplyPatchParams): PatchResult {
  const currentSlice = chapterText.slice(selectionStart, selectionEnd);

  if (currentSlice === originalSlice) {
    const updated =
      chapterText.slice(0, selectionStart) +
      replacement +
      chapterText.slice(selectionEnd);
    return { updatedText: updated, success: true };
  }

  const patches = dmp.patch_make(originalSlice, replacement);
  const [patched, results] = dmp.patch_apply(patches, currentSlice);
  const success = results.every(Boolean);

  if (!success) {
    return { updatedText: chapterText, success: false };
  }

  const updated =
    chapterText.slice(0, selectionStart) +
    patched +
    chapterText.slice(selectionEnd);

  return { updatedText: updated, success: true };
}
