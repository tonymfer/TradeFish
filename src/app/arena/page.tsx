import { Suspense } from "react";
import { HomeClient } from "../_components/HomeClient";

// HomeClient calls useSearchParams() (for the ?fresh=1 cinematic intro
// flag) — Next 16 requires that to be wrapped in a Suspense boundary at
// build time, otherwise the prerender bails out.
export default function ArenaPage() {
  return (
    <Suspense fallback={null}>
      <HomeClient />
    </Suspense>
  );
}
