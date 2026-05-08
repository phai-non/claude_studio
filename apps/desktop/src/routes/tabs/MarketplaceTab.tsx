import { useOutletContext } from "react-router-dom";
import { MarketplaceGallery } from "@/features/marketplace/MarketplaceGallery";
import type { WorkspaceContext } from "../Workspace";

export function MarketplaceTab() {
  const { projectPath, refreshSummary } = useOutletContext<WorkspaceContext>();
  return (
    <MarketplaceGallery
      projectPath={projectPath}
      refreshSummary={refreshSummary}
    />
  );
}
