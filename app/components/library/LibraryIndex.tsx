"use client";
import Link from "next/link";
import { useWorkspace } from "../../lib/data/hooks";
import { Icon } from "../ui/Icon";
import { SECTION_GROUPS } from "./sections";
import s from "./library.module.css";

export default function LibraryIndex() {
  const { data } = useWorkspace();
  return (
    <div className={s.groups}>
      {SECTION_GROUPS.map((g) => (
        <section key={g.group} data-reveal>
          <h2 className="eyebrow">{g.group}</h2>
          <div className={s.grid}>
            {g.items.map((item) => (
              <Link
                key={item.id}
                href={`/library/${item.id}`}
                className={s.card}
              >
                <span className={s.cardIcon}>
                  <Icon name={item.icon} size={17} />
                </span>
                <span className={s.cardTitle}>
                  {item.label}
                  {item.kind && data && (
                    <span className={s.count}>
                      {data.records[item.kind].length}
                    </span>
                  )}
                </span>
                <span className={s.cardBlurb}>{item.blurb}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
