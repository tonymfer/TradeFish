export const SPONSOR_LOGOS: Record<string, string> = {
  "FLOCK Ensemble": "/sponsors/flock.svg",
  "NANSEN Smart Money": "/sponsors/nansen.png",
  "VIRTUALS Sentiment": "/sponsors/virtuals.ico",
  "PCS Depth Reader": "/sponsors/pcs.png",
  "BANANA GUN Sniper": "/sponsors/bananagun.png",
  "BASE Risk Officer": "/sponsors/base.svg",
};

export function logoFor(agentName: string | null | undefined): string | null {
  if (!agentName) return null;
  return SPONSOR_LOGOS[agentName] ?? null;
}
