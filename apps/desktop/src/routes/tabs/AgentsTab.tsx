import { useOutletContext } from "react-router-dom";
import { AgentEditor } from "@/features/agents/AgentEditor";
import type { WorkspaceContext } from "../Workspace";

export function AgentsTab() {
  const { projectPath, refreshSummary } = useOutletContext<WorkspaceContext>();
  return (
    <AgentEditor projectPath={projectPath} refreshSummary={refreshSummary} />
  );
}
