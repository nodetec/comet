import { type ReactNode } from "react";
import { motion } from "framer-motion";

import {
  SIDEBAR_CHILD_INDENT_PX,
  SIDEBAR_COLLAPSE_TRANSITION,
} from "@/features/sidebar-pane/ui/sidebar-utils";

export function SidebarIndentedContent({
  indentLevel,
  children,
}: {
  indentLevel: number;
  children: ReactNode;
}) {
  return (
    <div
      className="w-full"
      style={{ paddingLeft: `${indentLevel * SIDEBAR_CHILD_INDENT_PX}px` }}
    >
      {children}
    </div>
  );
}

export function SidebarRowContent({
  chevron,
  icon,
  label,
  status,
}: {
  chevron?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-[1.25rem_1rem_minmax(0,1fr)_1rem] items-center gap-3">
      <span className="flex size-5 shrink-0 items-center justify-center">
        {chevron}
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="flex min-w-0 items-center leading-none">
        <span className="block min-w-0 translate-y-px truncate">{label}</span>
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {status}
      </span>
    </div>
  );
}

export function SidebarCollapse({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      animate={
        open
          ? {
              height: "auto",
              opacity: 1,
              visibility: "visible",
            }
          : {
              height: 0,
              opacity: 0,
              transitionEnd: {
                visibility: "hidden",
              },
            }
      }
      className="overflow-hidden"
      initial={false}
      style={{
        visibility: open ? "visible" : "hidden",
      }}
      transition={SIDEBAR_COLLAPSE_TRANSITION}
    >
      {children}
    </motion.div>
  );
}
