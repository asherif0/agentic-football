import { AppShell } from "../components/shell/AppShell";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
