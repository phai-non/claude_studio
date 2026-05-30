import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryRouter,
  RouterProvider,
} from "react-router-dom";
import { WorkspaceRoute } from "@/routes/Workspace";
import { TerminalTab } from "@/routes/tabs/TerminalTab";
import { TerminalView } from "../Terminal";

type PtyPayload = { session_id: string; chunk?: string };
type PtyListener = (event: { payload: PtyPayload }) => void;

const { ptyListeners, invokeMock, listenMock, xtermInstances, MockXTerm } =
  vi.hoisted(() => {
    class MockXTerm {
      cols = 80;
      rows = 24;
      writes: string[] = [];
      dataHandlers: Array<(data: string) => void> = [];

      loadAddon = vi.fn();
      open = vi.fn();
      write = vi.fn((chunk: string) => {
        this.writes.push(chunk);
      });
      clear = vi.fn();
      dispose = vi.fn();
      onData = vi.fn((handler: (data: string) => void) => {
        this.dataHandlers.push(handler);
        return { dispose: vi.fn() };
      });

      constructor() {
        xtermInstances.push(this);
      }
    }

    const ptyListeners = new Map<string, Set<PtyListener>>();
    const xtermInstances: MockXTerm[] = [];

    return {
      ptyListeners,
      invokeMock: vi.fn(),
      listenMock: vi.fn(),
      xtermInstances,
      MockXTerm,
    };
  });

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: PtyListener) => listenMock(event, handler),
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: MockXTerm,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {},
}));

function emitPty(event: string, payload: PtyPayload) {
  for (const listener of ptyListeners.get(event) ?? []) {
    listener({ payload });
  }
}

function renderWithRouter(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/project/:path",
        element: <WorkspaceRoute />,
        children: [
          { path: "terminal", element: <TerminalTab /> },
          { path: "agents", element: <div>Agents content</div> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  };
  window.confirm = vi.fn(() => true);
  global.ResizeObserver = class {
    observe = vi.fn();
    disconnect = vi.fn();
  } as unknown as typeof ResizeObserver;

  let ptyCount = 0;
  ptyListeners.clear();
  xtermInstances.length = 0;
  invokeMock.mockReset();
  listenMock.mockReset();
  invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
    if (command === "ensure_claude_dir") return Promise.resolve();
    if (command === "read_project_summary") {
      return Promise.resolve({
        path: args?.path,
        has_claude_dir: true,
        agents: [],
        commands: [],
        has_claude_md: false,
      });
    }
    if (command === "pty_open") {
      ptyCount += 1;
      return Promise.resolve(`session-${ptyCount}`);
    }
    if (
      command === "pty_write" ||
      command === "pty_resize" ||
      command === "pty_close"
    ) {
      return Promise.resolve();
    }
    return Promise.resolve();
  });
  listenMock.mockImplementation((event: string, handler: PtyListener) => {
    if (!ptyListeners.has(event)) ptyListeners.set(event, new Set());
    ptyListeners.get(event)!.add(handler);
    return Promise.resolve(() => {
      ptyListeners.get(event)?.delete(handler);
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Terminal tabs", () => {
  it("keeps the Claude session alive when leaving and returning to the workspace terminal tab", async () => {
    renderWithRouter("/project/%2Ftmp%2Fdemo/terminal");

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "pty_open",
        expect.objectContaining({ cwd: "/tmp/demo", program: "claude" }),
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "workspace.tabs.agents" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Agents content")).toBeTruthy();
    });

    expect(invokeMock).not.toHaveBeenCalledWith(
      "pty_close",
      expect.objectContaining({ sessionId: "session-1" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "workspace.tabs.terminal" }),
    );

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "pty_open"),
      ).toHaveLength(1);
    });
  });

  it("opens independent Claude sessions for new terminal tabs and routes output by session id", async () => {
    render(<TerminalView projectPath="/tmp/demo" active />);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "pty_open"),
      ).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "새 Claude 세션" }));

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "pty_open"),
      ).toHaveLength(2);
    });

    emitPty("pty:data", { session_id: "session-1", chunk: "first" });
    emitPty("pty:data", { session_id: "session-2", chunk: "second" });

    expect(xtermInstances[0]?.writes).toContain("first");
    expect(xtermInstances[0]?.writes).not.toContain("second");
    expect(xtermInstances[1]?.writes).toContain("second");
    expect(xtermInstances[1]?.writes).not.toContain("first");
  });

  it("requires confirmation before closing a running Claude tab", async () => {
    render(<TerminalView projectPath="/tmp/demo" active />);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "pty_open"),
      ).toHaveLength(1);
    });

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Claude 1 닫기" }));

    expect(invokeMock).not.toHaveBeenCalledWith(
      "pty_close",
      expect.objectContaining({ sessionId: "session-1" }),
    );

    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Claude 1 닫기" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_close", {
        sessionId: "session-1",
      });
    });
  });

  it("restarts the active Claude session and routes output to the replacement pty", async () => {
    render(<TerminalView projectPath="/tmp/demo" active />);

    await waitFor(() => {
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "pty_open"),
      ).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "재시작" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("pty_close", {
        sessionId: "session-1",
      });
      expect(
        invokeMock.mock.calls.filter(([command]) => command === "pty_open"),
      ).toHaveLength(2);
    });

    expect(xtermInstances[0]?.clear).toHaveBeenCalled();

    emitPty("pty:data", { session_id: "session-1", chunk: "old output" });
    emitPty("pty:data", { session_id: "session-2", chunk: "new output" });

    expect(xtermInstances[0]?.writes).not.toContain("old output");
    expect(xtermInstances[0]?.writes).toContain("new output");
  });
});
