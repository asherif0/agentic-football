import "./globals.css";
import "./lab-theme.css";
export const metadata = {
  title: "Agentic Football Lab",
  description: "Formation-aware tactical research and agent evaluation",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
