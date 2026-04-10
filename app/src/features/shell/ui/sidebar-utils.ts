export const SIDEBAR_CHILD_INDENT_PX = 12;
export const SIDEBAR_ITEM_ICON_CLASS_NAME =
  "text-sidebar-item-icon size-4 shrink-0";
export const SIDEBAR_TAG_ICON_CLASS_NAME =
  "text-sidebar-tag-icon size-4 shrink-0";
export const SIDEBAR_ITEM_STATUS_ICON_CLASS_NAME =
  "text-sidebar-item-icon/80 size-3 shrink-0 fill-current";
export const SIDEBAR_COLLAPSE_TRANSITION = {
  duration: 0.26,
  ease: [0.22, 1, 0.36, 1] as const,
};

export function sidebarItemClasses(isActive: boolean, isFocused?: boolean) {
  let stateClass: string;
  if (isActive && isFocused) {
    stateClass = "bg-sidebar-active-focus";
  } else if (isActive) {
    stateClass = "bg-sidebar-muted/80";
  } else {
    stateClass = "";
  }
  return `text-sidebar-foreground flex w-full cursor-default items-center gap-3 rounded-md px-2.5 py-1 text-left text-sm outline-none ring-0 transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${stateClass}`;
}

export function focusSidebarRow(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      element.scrollIntoView({
        block: "nearest",
      });
      element.focus({ preventScroll: true });
    });
  });
}

export function ancestorSidebarTagPaths(path: string) {
  const segments = path.split("/");
  const ancestors: string[] = [];

  for (let depth = 1; depth < segments.length; depth += 1) {
    ancestors.push(segments.slice(0, depth).join("/"));
  }

  return ancestors;
}
