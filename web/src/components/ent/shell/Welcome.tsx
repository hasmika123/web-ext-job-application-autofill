"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** "Good morning, Sarah!": the part of day is the viewer's clock, decided in the browser (the server snapshot is a plain "Welcome back"). */
export default function Welcome({ name }: { name: string }) {
  const part = useSyncExternalStore(noopSubscribe, partOfDay, () => "Welcome back");
  return (
    <span data-welcome>
      {part}, {name}!
    </span>
  );
}
