import type { Metadata } from "next";
import SquadView from "../../components/squad/SquadView";

export const metadata: Metadata = { title: "Squad" };

export default function SquadPage() {
  return <SquadView />;
}
