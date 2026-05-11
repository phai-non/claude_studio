import { useOutletContext } from "react-router-dom";
import { HooksEditor } from "@/features/hooks/HooksEditor";
import type { WorkspaceContext } from "../Workspace";

export function HooksTab() {
  const { projectPath } = useOutletContext<WorkspaceContext>();
  return <HooksEditor projectPath={projectPath} />;
}
