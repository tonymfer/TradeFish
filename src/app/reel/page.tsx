import { ReelClient } from "@/components/ReelClient";

/**
 * /reel — settled-round highlights as a presentation reel.
 *
 * Server component: just mounts the client. The client owns the
 * /api/highlights fetch, auto-cycle timer, keyboard nav, and pause-
 * on-hover behavior. Empty/loading states live there too.
 */
export default function ReelPage() {
  return (
    <main className="reel-page">
      <ReelClient />
    </main>
  );
}
