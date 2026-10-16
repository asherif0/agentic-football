"use client";
import { useState } from "react";
import { Button } from "./primitives";
import { toast } from "../../lib/toast";

export function CopyButton({
  text,
  label = "Copy",
  copied = "Copied",
  variant = "outline",
  size = "md",
}: {
  text: string | (() => string);
  label?: string;
  copied?: string;
  variant?: "primary" | "solid" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      icon={done ? "check" : "copy"}
      onClick={() =>
        navigator.clipboard
          .writeText(typeof text === "function" ? text() : text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          })
          .catch(() =>
            toast("Clipboard unavailable here. Use Download instead.", "error"),
          )
      }
    >
      {done ? copied : label}
    </Button>
  );
}
