export function conflictDialogCopy(hasDeleteCandidate: boolean) {
  if (hasDeleteCandidate) {
    return {
      description:
        "You can keep the deleted version, restore the note version currently shown, or merge the current draft into a new snapshot.",
      title: "Resolve this note conflict",
    };
  }

  return {
    description:
      "You can publish the version currently shown or merge the current draft into a new snapshot.",
    title: "Choose how to resolve this conflict",
  };
}
