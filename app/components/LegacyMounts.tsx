"use client";
// Temporary bridges that mount pre-revamp views on the new routes while each
// page is rebuilt. Removed once every route has its new view.
import { useRouter } from "next/navigation";
import { useWorkspace } from "../lib/data/hooks";
import Analytics from "./Analytics";
import PrepareWorkspace from "./PrepareWorkspace";
import PromptBrowser from "./PromptBrowser";
import { Skeleton } from "./ui/primitives";

function useW() {
  return useWorkspace().data?.records;
}
export function LegacySquad() {
  const w = useW(),
    router = useRouter();
  if (!w) return <Skeleton height={320} />;
  return (
    <div className="legacy">
      <PrepareWorkspace
        workspace={w}
        onContinue={() => router.push("/simulate")}
        onPositions={() => router.push("/simulate")}
      />
    </div>
  );
}
export function LegacyAnalytics() {
  const w = useW(),
    router = useRouter();
  if (!w) return <Skeleton height={320} />;
  return (
    <div className="legacy">
      <Analytics
        workspace={w}
        onReplay={(id) => router.push(`/simulate?run=${id}`)}
      />
    </div>
  );
}
export function LegacyPrompts() {
  const w = useW(),
    router = useRouter();
  if (!w) return <Skeleton height={320} />;
  return (
    <div className="legacy">
      <PromptBrowser
        workspace={w}
        family="all"
        requestedId={null}
        onRevise={() => router.push("/library/teams")}
        onEvidenceRevise={(p) =>
          router.push(`/library/collections?parent=${p.id}`)
        }
        onRequestHandled={() => {}}
        onCreate={() => {}}
        onCampaign={(id) => router.push(`/library/campaigns?campaign=${id}`)}
      />
    </div>
  );
}
