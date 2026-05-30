import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  isTauri,
  ptyClose,
  ptyOpen,
  ptyResize,
  ptyWrite,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  RotateCcw,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

interface PtyDataEvent {
  session_id: string;
  chunk: string;
}

interface PtyExitEvent {
  session_id: string;
}

export type TerminalSessionStatus =
  | "starting"
  | "running"
  | "exited"
  | "error";

export interface TerminalSession {
  id: string;
  title: string;
  status: TerminalSessionStatus;
  createdAt: number;
}

interface Props {
  projectPath: string;
  active: boolean;
}

function createTerminalSession(index: number): TerminalSession {
  return {
    id: `terminal-${index}`,
    title: `Claude ${index}`,
    status: "starting",
    createdAt: Date.now(),
  };
}

function isLiveStatus(status: TerminalSessionStatus) {
  return status === "starting" || status === "running";
}

export function TerminalView({ projectPath, active }: Props) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<TerminalSession[]>(() => [
    createTerminalSession(1),
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    "terminal-1",
  );
  const [restartSignals, setRestartSignals] = useState<Record<string, number>>(
    {},
  );
  const nextSessionNumberRef = useRef(2);

  const updateSessionStatus = useCallback(
    (sessionId: string, status: TerminalSessionStatus) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId ? { ...session, status } : session,
        ),
      );
    },
    [],
  );

  const addSession = useCallback(() => {
    const nextIndex = nextSessionNumberRef.current;
    nextSessionNumberRef.current += 1;
    const session = createTerminalSession(nextIndex);
    setSessions((current) => [...current, session]);
    setActiveSessionId(session.id);
  }, []);

  const closeSession = useCallback(
    (session: TerminalSession) => {
      if (
        isLiveStatus(session.status) &&
        !window.confirm(`${session.title} 세션을 종료할까요?`)
      ) {
        return;
      }

      const nextSessions = sessions.filter((item) => item.id !== session.id);
      const removedIndex = sessions.findIndex((item) => item.id === session.id);
      const fallbackSession =
        nextSessions[Math.max(0, removedIndex - 1)] ?? nextSessions[0] ?? null;

      setSessions(nextSessions);
      setRestartSignals((current) => {
        const { [session.id]: _removed, ...rest } = current;
        return rest;
      });
      if (activeSessionId === session.id) {
        setActiveSessionId(fallbackSession?.id ?? null);
      }
    },
    [activeSessionId, sessions],
  );

  const restartActiveSession = useCallback(() => {
    if (!activeSessionId) return;
    setRestartSignals((current) => ({
      ...current,
      [activeSessionId]: (current[activeSessionId] ?? 0) + 1,
    }));
  }, [activeSessionId]);

  const activeSession = sessions.find(
    (session) => session.id === activeSessionId,
  );
  const runningCount = sessions.filter((session) =>
    isLiveStatus(session.status),
  ).length;

  if (!isTauri()) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            터미널은 Tauri 환경에서만 동작합니다.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <TerminalIcon className="size-4" />
          {t("terminal.title")}
          {runningCount > 0 && (
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
              {runningCount} running
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={restartActiveSession}
            disabled={!activeSession}
            title="현재 Claude 세션 재시작"
          >
            <RotateCcw className="size-3" />
            재시작
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={addSession}
            aria-label="새 Claude 세션"
            title="새 Claude 세션"
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        className="flex min-h-0 items-center gap-1 overflow-x-auto border-b bg-muted/30 px-2 py-1"
      >
        {sessions.map((session) => {
          const selected = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              className={cn(
                "group flex h-8 min-w-32 max-w-52 items-center rounded text-xs transition-colors",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveSessionId(session.id)}
                className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    session.status === "running" && "bg-emerald-500",
                    session.status === "starting" && "bg-amber-500",
                    session.status === "exited" && "bg-muted-foreground/60",
                    session.status === "error" && "bg-destructive",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
              </button>
              <button
                type="button"
                aria-label={`${session.title} 닫기`}
                title={`${session.title} 닫기`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeSession(session);
                }}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 transition-colors hover:bg-muted hover:text-foreground group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0b0b0b]">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center bg-background">
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                열린 Claude 세션이 없습니다.
              </p>
              <Button onClick={addSession} aria-label="새 Claude 세션">
                <Plus className="size-4" />새 Claude 세션
              </Button>
            </div>
          </div>
        ) : (
          sessions.map((session) => (
            <TerminalSessionPane
              key={session.id}
              session={session}
              projectPath={projectPath}
              active={active && session.id === activeSessionId}
              restartSignal={restartSignals[session.id] ?? 0}
              noBinaryMessage={t("terminal.noBinary")}
              onStatusChange={updateSessionStatus}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TerminalSessionPaneProps {
  session: TerminalSession;
  projectPath: string;
  active: boolean;
  restartSignal: number;
  noBinaryMessage: string;
  onStatusChange: (sessionId: string, status: TerminalSessionStatus) => void;
}

function TerminalSessionPane({
  session,
  projectPath,
  active,
  restartSignal,
  noBinaryMessage,
  onStatusChange,
}: TerminalSessionPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const closePtyRef = useRef<(() => Promise<void>) | null>(null);
  const startPtyRef = useRef<(() => Promise<void>) | null>(null);
  const lastRestartSignalRef = useRef(restartSignal);
  const noBinaryMessageRef = useRef(noBinaryMessage);
  const statusChangeRef = useRef(onStatusChange);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    noBinaryMessageRef.current = noBinaryMessage;
  }, [noBinaryMessage]);

  useEffect(() => {
    statusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#0b0b0b",
        foreground: "#e7e7e7",
        cursor: "#e7e7e7",
      },
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(container);

    xtermRef.current = term;
    fitRef.current = fit;

    let cleaned = false;
    const unlisteners: UnlistenFn[] = [];
    const dataDisposable = term.onData((data) => {
      const sid = sessionRef.current;
      if (sid) void ptyWrite(sid, data);
    });

    const refit = () => {
      if (cleaned) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      const sid = sessionRef.current;
      if (sid && term.cols > 0 && term.rows > 0) {
        void ptyResize(sid, term.cols, term.rows);
      }
    };

    const ro = new ResizeObserver(() => refit());
    ro.observe(container);

    const closePty = async () => {
      const sid = sessionRef.current;
      if (!sid) return;
      sessionRef.current = null;
      try {
        await ptyClose(sid);
      } catch {
        /* 이미 종료된 PTY는 재시작/정리 흐름을 막지 않는다. */
      }
    };

    const startPty = async () => {
      try {
        setError(null);
        statusChangeRef.current(session.id, "starting");
        await new Promise((resolve) =>
          requestAnimationFrame(() => resolve(null)),
        );
        try {
          fit.fit();
        } catch {
          /* hidden or not measurable yet; active effect will retry */
        }

        const ptySessionId = await ptyOpen({
          cwd: projectPath,
          program: "claude",
          args: [],
          cols: Math.max(term.cols, 80),
          rows: Math.max(term.rows, 24),
        });
        if (cleaned) {
          void ptyClose(ptySessionId);
          return;
        }
        sessionRef.current = ptySessionId;
        statusChangeRef.current(session.id, "running");

        refit();
      } catch (e) {
        if (!cleaned) {
          const message = String(e);
          setError(message);
          statusChangeRef.current(session.id, "error");
          term.write(
            `\r\n\x1b[31m${noBinaryMessageRef.current}\x1b[0m\r\n${message}\r\n`,
          );
        }
      }
    };

    closePtyRef.current = closePty;
    startPtyRef.current = startPty;

    void (async () => {
      const unData = await listen<PtyDataEvent>("pty:data", (event) => {
        if (event.payload.session_id === sessionRef.current) {
          term.write(event.payload.chunk);
        }
      });
      if (cleaned) {
        unData();
        return;
      }
      unlisteners.push(unData);
      const unExit = await listen<PtyExitEvent>("pty:exit", (event) => {
        if (event.payload.session_id === sessionRef.current) {
          term.write("\r\n\x1b[90m[claude exited]\x1b[0m\r\n");
          sessionRef.current = null;
          statusChangeRef.current(session.id, "exited");
        }
      });
      if (cleaned) {
        unExit();
        return;
      }
      unlisteners.push(unExit);
      await startPty();
    })();

    return () => {
      cleaned = true;
      ro.disconnect();
      dataDisposable.dispose();
      for (const unlisten of unlisteners) unlisten();
      closePtyRef.current = null;
      startPtyRef.current = null;
      const sid = sessionRef.current;
      if (sid) void ptyClose(sid);
      sessionRef.current = null;
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [projectPath, session.id]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const term = xtermRef.current;
      const fit = fitRef.current;
      if (!term || !fit) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      const sid = sessionRef.current;
      if (sid && term.cols > 0 && term.rows > 0) {
        void ptyResize(sid, term.cols, term.rows);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    if (restartSignal === lastRestartSignalRef.current) return;
    lastRestartSignalRef.current = restartSignal;
    void (async () => {
      await closePtyRef.current?.();
      xtermRef.current?.clear();
      setError(null);
      await startPtyRef.current?.();
    })();
  }, [restartSignal]);

  return (
    <div
      className={cn(
        "absolute inset-0 w-full h-full",
        active
          ? "opacity-100 pointer-events-auto"
          : "invisible pointer-events-none",
      )}
      aria-hidden={!active}
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {error && (
        <div className="absolute right-3 top-3 max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
