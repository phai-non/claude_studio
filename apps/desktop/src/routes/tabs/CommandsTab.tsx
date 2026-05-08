import { useOutletContext } from "react-router-dom";
import { CommandEditor } from "@/features/commands/CommandEditor";
import type { WorkspaceContext } from "../Workspace";

export function CommandsTab() {
  const { projectPath, refreshSummary } = useOutletContext<WorkspaceContext>();
  return (
    <CommandEditor projectPath={projectPath} refreshSummary={refreshSummary} />
  );
}
