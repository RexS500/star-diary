"use client";

import { useEffect, useRef, useState } from "react";
import type { AppRefreshResult } from "./app-refresh";
import {
  PULL_REFRESH_THRESHOLD_PX,
  pullDirection,
  pullReady,
  resistedPullDistance,
  type PullDirection,
} from "./pull-to-refresh-logic";

type PullPhase = "idle" | "pulling" | "ready" | "refreshing" | "success" | "error";
type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const BLOCKED_TARGETS = [
  "input",
  "textarea",
  "select",
  "button",
  "option",
  "[contenteditable='true']",
  "[role='dialog']",
  "[role='listbox']",
  ".modal",
  ".modal-back",
  ".main-navigation",
  "[data-no-pull-refresh]",
].join(",");

function standalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

function pageIsAtTop() {
  return window.scrollY <= 0 && (document.scrollingElement?.scrollTop || 0) <= 0;
}

function blockedTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(BLOCKED_TARGETS));
}

function phaseLabel(phase: PullPhase) {
  if (phase === "ready") return "放開更新";
  if (phase === "refreshing") return "更新中…";
  if (phase === "success") return "已更新";
  if (phase === "error") return "更新失敗，請再試一次";
  return "下拉更新";
}

export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<AppRefreshResult> }) {
  const [distance, setDistance] = useState(0);
  const [phase, setPhase] = useState<PullPhase>("idle");
  const onRefreshRef = useRef(onRefresh);
  const phaseRef = useRef<PullPhase>("idle");
  const settleTimerRef = useRef<number | null>(null);

  const changePhase = (next: PullPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!standalonePwa()) return;
    let tracking = false;
    let startX = 0;
    let startY = 0;
    let direction: PullDirection = "pending";

    const reset = () => {
      tracking = false;
      direction = "pending";
      setDistance(0);
      changePhase("idle");
    };
    const settle = (next: "success" | "error") => {
      changePhase(next);
      setDistance(PULL_REFRESH_THRESHOLD_PX);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(reset, next === "success" ? 650 : 1100);
    };
    const refresh = async () => {
      if (phaseRef.current === "refreshing") return;
      changePhase("refreshing");
      setDistance(PULL_REFRESH_THRESHOLD_PX);
      try {
        const result = await onRefreshRef.current();
        if (result.status === "cancelled") return reset();
        settle(result.status === "success" ? "success" : "error");
      } catch {
        settle("error");
      }
    };
    const touchStart = (event: TouchEvent) => {
      if (phaseRef.current === "refreshing" || event.touches.length !== 1 || !pageIsAtTop() || blockedTarget(event.target)) return;
      const touch = event.touches[0];
      tracking = true;
      direction = "pending";
      startX = touch.clientX;
      startY = touch.clientY;
    };
    const touchMove = (event: TouchEvent) => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (direction === "pending") direction = pullDirection(deltaX, deltaY);
      if (direction === "horizontal") {
        tracking = false;
        return;
      }
      if (direction !== "vertical") return;
      if (deltaY <= 0 || !pageIsAtTop()) return reset();
      event.preventDefault();
      const nextDistance = resistedPullDistance(deltaY);
      setDistance(nextDistance);
      changePhase(pullReady(nextDistance) ? "ready" : "pulling");
    };
    const touchEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (direction === "vertical" && phaseRef.current === "ready") void refresh();
      else reset();
    };

    document.addEventListener("touchstart", touchStart, { passive: true });
    document.addEventListener("touchmove", touchMove, { passive: false });
    document.addEventListener("touchend", touchEnd, { passive: true });
    document.addEventListener("touchcancel", touchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", touchStart);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchend", touchEnd);
      document.removeEventListener("touchcancel", touchEnd);
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    };
  }, []);

  const visible = phase !== "idle" || distance > 0;
  const progress = Math.min(100, Math.round(distance / PULL_REFRESH_THRESHOLD_PX * 100));
  return <aside
    className={`pull-refresh-indicator is-${phase}`}
    aria-hidden={!visible}
    aria-live="polite"
    style={{ transform: `translate3d(-50%, ${Math.round(distance) - 78}px, 0)` }}
  >
    <span className="pull-refresh-icon" aria-hidden="true">
      {phase === "success" ? "✓" : phase === "refreshing" ? "" : "↻"}
    </span>
    <span>
      <strong>{phaseLabel(phase)}</strong>
      <small>{phase === "pulling" || phase === "ready" ? `${progress}%` : "星星日記"}</small>
    </span>
    <i><b style={{ width: `${progress}%` }}/></i>
  </aside>;
}
