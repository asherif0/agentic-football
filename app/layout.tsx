import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/legacy.css";

export const metadata: Metadata = {
  title: {
    default: "Agentic Football Lab",
    template: "%s · Agentic Football Lab",
  },
  description:
    "Build multi-model five-a-side agent squads, replay matches and export the prompts that win.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Resolves the saved theme (system | light | dark) before first paint.
const themeScript = `(function(){try{var p=localStorage.getItem("afl-theme");var t=p==="light"||p==="dark"?p:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
