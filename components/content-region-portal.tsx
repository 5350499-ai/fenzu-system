"use client";

import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";

/** Renders a content-region sheet inside the App Shell main-content grid cell. */
export function ContentRegionPortal({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setRoot(document.getElementById("app-content-overlay-root"));
  }, []);

  return root ? createPortal(children, root) : null;
}
