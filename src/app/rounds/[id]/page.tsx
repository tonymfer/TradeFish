import { RoundDetailClient } from "../../_components/RoundDetailClient";

export default async function RoundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RoundDetailClient roundId={id} />;
}
