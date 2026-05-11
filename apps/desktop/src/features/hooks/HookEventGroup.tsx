import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HookEntry, HookEvent } from "@/lib/schemas/hooks";
import { HookEntryRow } from "./HookEntryRow";

interface Props {
  event: HookEvent;
  entries: HookEntry[];
  onChange: (next: HookEntry[]) => void;
}

export function HookEventGroup({ event, entries, onChange }: Props) {
  const { t } = useTranslation();
  // 비어 있는 event는 기본 접힌 상태로 시작
  const [expanded, setExpanded] = useState(entries.length > 0);

  const updateEntry = (idx: number, next: HookEntry) => {
    onChange(entries.map((e, i) => (i === idx ? next : e)));
  };
  const removeEntry = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };
  const addEntry = () => {
    onChange([
      ...entries,
      { matcher: "", hooks: [{ type: "command", command: "" }] },
    ]);
    setExpanded(true);
  };

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="font-mono text-sm font-medium">{event}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px]",
              entries.length > 0
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {entries.length}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t(`hooks.events.${event}`)}
          </span>
        </button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[11px]"
          onClick={addEntry}
        >
          <Plus className="size-3" />
          {t("hooks.addEntry")}
        </Button>
      </div>
      {expanded && entries.length > 0 && (
        <div className="space-y-2 border-t p-3">
          {entries.map((entry, idx) => (
            <HookEntryRow
              key={idx}
              entry={entry}
              onChange={(next) => updateEntry(idx, next)}
              onRemove={() => removeEntry(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
