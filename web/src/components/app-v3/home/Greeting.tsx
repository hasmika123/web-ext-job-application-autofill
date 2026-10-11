"use client";

import { useSyncExternalStore } from "react";
import { SparkBurst } from "@kiwiply/ui";

function noopSubscribe() {
  return () => {};
}
function partOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Hero title: time-of-day greeting (the viewer's clock, decided in the browser) + the SparkBurst doodle. */
export default function Greeting({ name }: { name: string }) {
  const part = useSyncExternalStore(noopSubscribe, partOfDay, () => "Welcome back");
  return (
    <>
      <span>
        {part}, {name}!
      </span>
      <SparkBurst aria-hidden className="h-7 w-7 flex-none text-v2-amber" />
    </>
  );
}
