export function createMarkdownChangeTracker() {
  let prevMarkdown: string | null = null;
  let ready = false;

  return {
    resetForLoad() {
      prevMarkdown = null;
      ready = false;
    },

    setBaseline(markdown: string) {
      prevMarkdown = markdown;
      ready = true;
    },

    consume(markdown: string) {
      if (!ready) {
        return null;
      }

      if (prevMarkdown !== null && prevMarkdown === markdown) {
        return null;
      }

      prevMarkdown = markdown;
      return markdown;
    },
  };
}

export function createLoadScopedRequestGate() {
  let version = 0;

  return {
    invalidate() {
      version += 1;
      return version;
    },

    issue() {
      version += 1;
      return version;
    },

    isCurrent(candidate: number) {
      return candidate === version;
    },
  };
}
