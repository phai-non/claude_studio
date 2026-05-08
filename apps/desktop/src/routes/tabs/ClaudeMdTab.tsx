import { useOutletContext } from "react-router-dom";
import { ClaudeMdEditor } from "@/features/claude-md/ClaudeMdEditor";
import type { WorkspaceContext } from "../Workspace";

export function ClaudeMdTab() {
  const { projectPath, refreshSummary } = useOutletContext<WorkspaceContext>();
  return (
    <ClaudeMdEditor
      projectPath={projectPath}
      refreshSummary={refreshSummary}
    />
  );
}
