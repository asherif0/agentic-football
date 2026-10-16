import { simRepo, sameOrigin } from "../../../lib/simulation/server";
import {
  improvementRepository,
  profileKey,
} from "../../../lib/improvement/persistence";
import { controlCampaign } from "../../../lib/improvement/engine";
import { snapshotForProfile } from "../../../lib/improvement/local-team";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const repo = simRepo(),
      body = await req.json(),
      db = improvementRepository(repo);
    const config = snapshotForProfile(repo, body.profile, body.teamId);
    if (config.provider === "mock")
      throw new Error("Fixture profiles cannot deploy real active teams");
    if (!body.reason?.trim())
      throw new Error("Give a reason for this team change");
    return Response.json(
      repo.db.transaction(() => {
        const active = db.changeActive(
          profileKey(config),
          body.teamId,
          body.expectedRevision,
          body.reason,
          {
            actor: "human",
            action: body.action === "rollback" ? "rollback" : "override",
          },
        );
        for (const c of db
          .campaigns()
          .filter(
            (c) =>
              c.manifest.profile === body.profile &&
              ["running", "review"].includes(c.status),
          ))
          controlCampaign(repo, c.id, "pause");
        return active;
      })(),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
