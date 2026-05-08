import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { WelcomeRoute } from "@/routes/Welcome";
import { WorkspaceRoute } from "@/routes/Workspace";
import { SettingsRoute } from "@/routes/Settings";
import { AgentsTab } from "@/routes/tabs/AgentsTab";
import { CommandsTab } from "@/routes/tabs/CommandsTab";
import { ClaudeMdTab } from "@/routes/tabs/ClaudeMdTab";
import { MarketplaceTab } from "@/routes/tabs/MarketplaceTab";
import { TerminalTab } from "@/routes/tabs/TerminalTab";
import { applyTheme, useSettingsStore } from "@/store/project";

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <Routes>
      <Route path="/" element={<WelcomeRoute />} />
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="/project/:path" element={<WorkspaceRoute />}>
        <Route index element={<Navigate to="agents" replace />} />
        <Route path="agents" element={<AgentsTab />} />
        <Route path="commands" element={<CommandsTab />} />
        <Route path="claude-md" element={<ClaudeMdTab />} />
        <Route path="marketplace" element={<MarketplaceTab />} />
        <Route path="terminal" element={<TerminalTab />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
