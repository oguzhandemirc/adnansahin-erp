import { Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { topicAllOn, type TopicSection } from "./model";

interface Props {
  sections: TopicSection[];
  selected: ReadonlySet<string>;
  disabled?: boolean;
  onToggleKind: (kind: string, on: boolean) => void;
  onToggleTopic: (section: TopicSection, on: boolean) => void;
}

/** Sağ sütun: konu başlıklı tür listesi; kilitli (veri izni yok) satır nedenini yazar ve değiştirilemez. */
export function KindTopicList({ sections, selected, disabled, onToggleKind, onToggleTopic }: Props) {
  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const allOn = topicAllOn(selected, section);
        const hasOpen = section.rows.some((r) => r.lockedReason === null);
        return (
          <section key={section.key} aria-label={section.label} className="rounded-lg border">
            <header className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
              <h3 className="text-sm font-semibold">{section.label}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || !hasOpen}
                onClick={() => onToggleTopic(section, !allOn)}
              >
                {allOn ? "Hepsini kapat" : "Hepsini aç"}
              </Button>
            </header>
            <ul className="divide-y">
              {section.rows.map((row) => {
                const locked = row.lockedReason !== null;
                return (
                  <li key={row.kind} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">{row.label}</p>
                      {locked && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden />
                          {row.lockedReason}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={!locked && selected.has(row.kind)}
                      disabled={disabled || locked}
                      onCheckedChange={(on) => onToggleKind(row.kind, on)}
                      aria-label={row.label}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
