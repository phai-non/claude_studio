import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  discoverMcpTools,
  type ConfiguredMcpServer,
  type DiscoveryResult,
} from "@/lib/tauri";

interface Props {
  server: ConfiguredMcpServer;
  projectPath?: string;
  onPick: (toolName: string) => void;
}

export function McpServerGroup({ server, projectPath, onPick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [autoDiscover, setAutoDiscover] = useState(false);

  const query = useQuery<DiscoveryResult>({
    queryKey: ["mcp-tools", server.name, projectPath],
    queryFn: () => discoverMcpTools(server.name, projectPath),
    enabled: autoDiscover,
    staleTime: 1000 * 60 * 30, // 30분 캐시
    retry: false,
  });

  const tools = query.data?.tools ?? [];
  const error = query.data?.error ?? (query.error ? String(query.error) : null);
  const wildcard = `mcp__${server.name}__*`;

  const toggle = () => {
    setExpanded((v) => !v);
    if (!autoDiscover && server.kind === "stdio") setAutoDiscover(true);
  };

  return (
    <div className="rounded-md border bg-background/50">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="font-mono text-xs font-medium">{server.name}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {server.kind}
        </span>
        {query.isFetching && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
        {!query.isFetching && tools.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {tools.length} tools
          </span>
        )}
        {error && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            error
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t px-2 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Badge
              variant="outline"
              className="cursor-pointer font-mono text-[10px]"
              title="와일드카드: 이 서버의 모든 툴을 허용"
              onClick={() => onPick(wildcard)}
            >
              + {wildcard}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                setAutoDiscover(true);
                void query.refetch();
              }}
              disabled={server.kind !== "stdio"}
              title={
                server.kind !== "stdio"
                  ? "HTTP 서버 introspection은 v1.1"
                  : "이 서버를 spawn해서 tools/list 호출"
              }
            >
              <Search className="size-3" />
              {tools.length > 0 || error ? "다시" : "툴 조회"}
            </Button>
          </div>

          {server.command_preview && (
            <div className="mb-2 truncate font-mono text-[10px] text-muted-foreground">
              $ {server.command_preview}
            </div>
          )}

          {error && (
            <div className="mb-2 rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
              {error}
            </div>
          )}

          {tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tools.map((tool) => {
                const fullName = `mcp__${server.name}__${tool.name}`;
                return (
                  <Badge
                    key={tool.name}
                    variant="secondary"
                    className={cn(
                      "cursor-pointer font-mono text-[10px]",
                    )}
                    title={tool.description ?? fullName}
                    onClick={() => onPick(fullName)}
                  >
                    + {tool.name}
                  </Badge>
                );
              })}
            </div>
          )}

          {!query.isFetching && tools.length === 0 && !error && (
            <div className="text-[11px] text-muted-foreground">
              {autoDiscover
                ? "툴이 없거나 응답하지 않았습니다."
                : "‘툴 조회’를 누르면 서버를 spawn해서 실제 툴 목록을 가져옵니다."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
