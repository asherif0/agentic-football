"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { invalidate } from "../../lib/data/cache";
import { useWorkspace } from "../../lib/data/hooks";
import AnnotationCollections from "../AnnotationCollections";
import Campaigns from "../Campaigns";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/primitives";
import Benchmarks from "./Benchmarks";
import ComparePanel from "./ComparePanel";
import RecordSection from "./RecordSection";
import StrategyPanel from "./StrategyPanel";
import WorkspaceData from "./WorkspaceData";
import { SECTION_GROUPS, type Section } from "./sections";
import s from "./library.module.css";

export default function LibrarySection({ section }: { section: Section }) {
  const router = useRouter(),
    params = useSearchParams(),
    { data } = useWorkspace();
  const refresh = () => {
    invalidate("workspace");
    return Promise.resolve();
  };
  let body: React.ReactNode;
  if (section.kind && section.kind !== "collections")
    body = <RecordSection kind={section.kind} />;
  else if (!data) body = <Skeleton height={320} />;
  else if (section.id === "collections")
    body = (
      <div className="legacy">
        <AnnotationCollections
          workspace={data.records}
          requestedParentId={params.get("parent")}
          refresh={refresh}
        />
      </div>
    );
  else if (section.id === "compare") body = <ComparePanel />;
  else if (section.id === "campaigns")
    body = (
      <div className="legacy">
        <StrategyPanel workspace={data.records} />
        <Campaigns
          workspace={data.records}
          requestedId={params.get("campaign")}
          onChanged={refresh}
          onReplay={(id) => router.push(`/simulate?run=${id}`)}
          onPrompt={(id) => router.push(`/prompts?prompt=${id}`)}
        />
      </div>
    );
  else if (section.id === "benchmarks") body = <Benchmarks />;
  else if (section.id === "data") body = <WorkspaceData />;
  return (
    <div className={s.layout}>
      <nav className={s.side} aria-label="Library sections">
        {SECTION_GROUPS.map((g) => (
          <div key={g.group} className={s.group}>
            <span className={`eyebrow ${s.groupLabel}`}>{g.group}</span>
            {g.items.map((item) => (
              <Link
                key={item.id}
                href={`/library/${item.id}`}
                className={s.link}
                aria-current={item.id === section.id ? "page" : undefined}
              >
                <Icon name={item.icon} size={15} />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className={s.body} data-reveal>
        {body}
      </div>
    </div>
  );
}
