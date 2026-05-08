import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { isTauri } from "@/lib/tauri";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, Terminal as TerminalIcon } from "lucide-react";

interface PtyDataEvent {
  session_id: string;
  chunk: string;
}

interface PtyExitEvent {
  session_id: string;
}

interface Props {
  projectPath: string;
}

export function TerminalView({ projectPath }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<UnlistenFn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!isTauri()) {
      setError("터미널은 Tauri 환경에서만 동작합니다.");
      return;
    }

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
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(containerRef.current);
    requestAnimationFrame(() => fit.fit());

    xtermRef.current = term;
    fitRef.current = fit;

    let cleaned = false;

    const start = async () => {
      try {
        setRunning(true);
        const cols = term.cols;
        const rows = term.rows;
        const sessionId: string = await invoke("pty_open", {
          cwd: projectPath,
          program: "claude",
          args: [],
          cols,
          rows,
        });
        sessionRef.current = sessionId;

        const unData = await listen<PtyDataEvent>("pty:data", (e) => {
          if (e.payload.session_id === sessionId) {
            term.write(e.payload.chunk);
          }
        });
        const unExit = await listen<PtyExitEvent>("pty:exit", (e) => {
          if (e.payload.session_id === sessionId) {
            term.write("\r\n\x1b[90m[claude exited]\x1b[0m\r\n");
            sessionRef.current = null;
            setRunning(false);
          }
        });
        unlistenRef.current.push(unData, unExit);

        term.onData((data) => {
          if (sessionRef.current) {
            void invoke("pty_write", {
              sessionId: sessionRef.current,
              data,
            });
          }
        });
      } catch (e) {
        if (!cleaned) {
          setError(String(e));
          term.write(
            `\r\n\x1b[31m${t("terminal.noBinary")}\x1b[0m\r\n${e}\r\n`,
          );
        }
      }
    };

    void start();

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
      const sessionId = sessionRef.current;
      if (sessionId) {
        void invoke("pty_resize", {
          sessionId,
          cols: term.cols,
          rows: term.rows,
        });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      cleaned = true;
      window.removeEventListener("resize", onResize);
      for (const un of unlistenRef.current) un();
      unlistenRef.current = [];
      const sessionId = sessionRef.current;
      if (sessionId) {
        void invoke("pty_close", { sessionId });
      }
      sessionRef.current = null;
      term.dispose();
      xtermRef.current = null;
    };
  }, [projectPath, t]);

  const restart = async () => {
    if (!xtermRef.current) return;
    const term = xtermRef.current;
    if (sessionRef.current) {
      await invoke("pty_close", { sessionId: sessionRef.current });
    }
    term.clear();
    setError(null);
    setRunning(true);
    try {
      const sessionId: string = await invoke("pty_open", {
        cwd: projectPath,
        program: "claude",
        args: [],
        cols: term.cols,
        rows: term.rows,
      });
      sessionRef.current = sessionId;
    } catch (e) {
      setError(String(e));
      setRunning(false);
    }
  };

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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <TerminalIcon className="size-4" />
          {t("terminal.title")}
          {running && (
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
              running
            </span>
          )}
        </h3>
        <Button size="sm" variant="ghost" onClick={() => void restart()}>
          <RotateCcw className="size-3" />
          재시작
        </Button>
      </div>
      <div className="relative flex-1 bg-[#0b0b0b] p-2">
        <div ref={containerRef} className="h-full w-full" />
        {error && (
          <div className="absolute right-3 top-3 max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
