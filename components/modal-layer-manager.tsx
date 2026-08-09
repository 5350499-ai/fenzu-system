"use client";

import { useEffect } from "react";

const MODAL_SELECTOR = ".modal-backdrop, .attachment-modal-backdrop, .data-center-sheet-backdrop, .data-center-dialog-backdrop";

export function ModalLayerManager() {
  useEffect(() => {
    let locked = false;
    let scrollY = 0;
    let bodySnapshot = {
      position: "",
      top: "",
      left: "",
      right: "",
      width: "",
      overflow: "",
      overscrollBehavior: ""
    };
    let htmlOverflow = "";

    const lock = () => {
      if (locked) return;
      locked = true;
      scrollY = window.scrollY;
      const body = document.body;
      const html = document.documentElement;
      bodySnapshot = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
        overscrollBehavior: body.style.overscrollBehavior
      };
      htmlOverflow = html.style.overflow;
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      html.style.overflow = "hidden";
    };

    const unlock = () => {
      if (!locked) return;
      locked = false;
      const body = document.body;
      body.style.position = bodySnapshot.position;
      body.style.top = bodySnapshot.top;
      body.style.left = bodySnapshot.left;
      body.style.right = bodySnapshot.right;
      body.style.width = bodySnapshot.width;
      body.style.overflow = bodySnapshot.overflow;
      body.style.overscrollBehavior = bodySnapshot.overscrollBehavior;
      document.documentElement.style.overflow = htmlOverflow;
      window.scrollTo(0, scrollY);
    };

    const sync = () => {
      if (document.querySelector(MODAL_SELECTOR)) lock();
      else unlock();
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    sync();
    return () => {
      observer.disconnect();
      unlock();
    };
  }, []);

  return null;
}
