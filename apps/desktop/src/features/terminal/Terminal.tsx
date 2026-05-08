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
    const container = containerRef.current;
    if (!container) return;
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
    let sessionId: string | null = null;

    /** 컨테이너 크기에 맞춰 xterm fit + PTY 리사이즈 */
    const refit = () => {
      if (cleaned) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      const cols = term.cols;
      const rows = term.rows;
      const sid = sessionRef.current;
      if (sid && cols > 0 && rows > 0) {
        void invoke("pty_resize", { sessionId: sid, cols, rows });
      }
    };

    // ResizeObserver: 컨테이너가 실제로 레이아웃된 뒤 호출되며,
    // 탭 전환·창 크기 변화·초기 마운트 모두 한 경로로 처리한다.
    const ro = new ResizeObserver(() => refit());
    ro.observe(container);

    const start = async () => {
      try {
        // 컨테이너 레이아웃이 안정될 때까지 한 프레임 대기
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        try {
          fit.fit();
        } catch {
          /* container not measurable yet — ResizeObserver will retry */
        }
        const cols = Math.max(term.cols, 80);
        const rows = Math.max(term.rows, 24);

        setRunning(true);
        const id: string = await invoke("pty_open", {
          cwd: projectPath,
          program: "claude",
          args: [],
          cols,
          rows,
        });
        if (cleaned) {
          // 마운트 해제 직후 응답이 와도 안전하게 닫는다
          void invoke("pty_close", { sessionId: id });
          return;
        }
        sessionId = id;
        sessionRef.current = id;

        const unData = await listen<PtyDataEvent>("pty:data", (e) => {
          if (e.payload.session_id === id) term.write(e.payload.chunk);
        });
        const unExit = await listen<PtyExitEvent>("pty:exit", (e) => {
          if (e.payload.session_id === id) {
            term.write("\r\n\x1b[90m[claude exited]\x1b[0m\r\n");
            sessionRef.current = null;
            setRunning(false);
          }
        });
        unlistenRef.current.push(unData, unExit);

        term.onData((data) => {
          const sid = sessionRef.current;
          if (sid) void invoke("pty_write", { sessionId: sid, data });
        });

        // PTY가 열린 직후 한 번 더 리사이즈를 강제해 첫 프레임 폭을 맞춘다
        refit();
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

    return () => {
      cleaned = true;
      ro.disconnect();
      for (const un of unlistenRef.current) un();
      unlistenRef.current = [];
      const sid = sessionId ?? sessionRef.current;
      if (sid) void invoke("pty_close", { sessionId: sid });
      sessionRef.current = null;
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [projectPath, t]);

  const restart = async () => {
    if (!xtermRef.current || !fitRef.current) return;
    const term = xtermRef.current;
    const fit = fitRef.current;
    if (sessionRef.current) {
      await invoke("pty_close", { sessionId: sessionRef.current });
      sessionRef.current = null;
    }
    term.clear();
    setError(null);
    setRunning(true);
    try {
      try {
        fit.fit();
      } catch {
        /* noop */
      }
      const cols = Math.max(term.cols, 80);
      const rows = Math.max(term.rows, 24);
      const id: string = await invoke("pty_open", {
        cwd: projectPath,
        program: "claude",
        args: [],
        cols,
        rows,
      });
      sessionRef.current = id;
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
    <div className="flex h-full min-h-0 flex-col">
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
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0b0b0b]">
        <div ref={containerRef} className="absolute inset-0" />
        {error && (
          <div className="absolute right-3 top-3 max-w-md rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
