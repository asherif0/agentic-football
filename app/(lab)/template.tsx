"use client";
import { useRef } from "react";
import { gsap, useGSAP, reducedMotion } from "../lib/motion";

// The first render is server HTML that is already visible; animating it would
// flash. Only client-side navigations get the entrance stagger.
let hydrated = false;

export default function Template({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!hydrated) {
        hydrated = true;
        return;
      }
      if (reducedMotion()) return;
      const items = ref.current?.querySelectorAll("[data-reveal]");
      if (items?.length)
        gsap.from(items, {
          y: 14,
          autoAlpha: 0,
          duration: 0.55,
          stagger: 0.05,
          ease: "power3.out",
          clearProps: "transform,opacity,visibility",
        });
    },
    { scope: ref },
  );
  return <div ref={ref}>{children}</div>;
}
