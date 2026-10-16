import { createStore } from "../lib/store";
const store = createStore();
const row = store.db
  .prepare("SELECT owner,heartbeat FROM sim_worker WHERE id=1")
  .get() as { owner: string; heartbeat: number } | undefined;
store.db.close();
if (row && Date.now() - row.heartbeat < 5000) {
  const pid = Number(row.owner.split(":")[0]);
  if (!Number.isInteger(pid) || pid <= 1)
    throw new Error("Legacy worker: stop the worker process manually once.");
  process.kill(pid, "SIGTERM");
  console.log("Local simulation worker stop requested.");
} else console.log("No live local simulation worker found.");
