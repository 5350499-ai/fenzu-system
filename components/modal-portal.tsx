"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";

/** Renders overlays outside `.main` and above app navigation. */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setRoot(document.getElementById("app-overlay-root"));
  }, []);

  return root ? createPortal(children, root) : null;
}
