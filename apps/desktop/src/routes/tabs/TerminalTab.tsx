import { useOutletContext } from "react-router-dom";
import { TerminalView } from "@/features/terminal/Terminal";
import type { WorkspaceContext } from "../Workspace";

export function TerminalTab() {
  const { projectPath } = useOutletContext<WorkspaceContext>();
  return <TerminalView projectPath={projectPath} />;
}
