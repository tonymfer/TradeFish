import { AgentProfileClient } from "../../_components/AgentProfileClient";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AgentProfileClient agentId={id} />;
}
