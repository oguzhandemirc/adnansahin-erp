import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { agoLabel } from "../Clients/clients-utils";
import { deviceLabel, deviceTypeLabel, isBehindLatest } from "./connected-devices-utils";
import type { ActiveSession, SessionDeviceType } from "./service";

const stamp = (iso: string): string =>
  new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });

interface Props {
  session: ActiveSession;
  latest: Map<SessionDeviceType, string>;
  /** Sunucu saati — göreli zaman istemci saatine değil buna göre. */
  now: string;
}

/** Tek satırlık sıkı oturum satırı; türünün en yüksek sürümünden gerideyse hafif uyarı zemini. */
export function SessionRow({ session: s, latest, now }: Props) {
  const behind = isBehindLatest(s, latest);
  const top = latest.get(s.deviceType);
  return (
    <TableRow className={cn("text-sm", behind && "bg-warning/10 hover:bg-warning/15")}>
      <TableCell className="whitespace-nowrap py-1.5">
        <span className="font-medium">{s.user.fullName ?? s.user.username}</span>
        <span className="ml-1.5 text-xs text-muted-foreground">{s.user.username}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5">
        {deviceLabel(s)}
        {s.machineName && <span className="ml-1.5 text-xs text-muted-foreground">{s.machineName}</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5">{deviceTypeLabel(s.deviceType)}</TableCell>
      <TableCell className="whitespace-nowrap py-1.5 tabular-nums">
        {s.clientVersion ? (
          <span className={cn(behind && "font-medium text-warning")} title={behind ? `En yeni: ${top}` : undefined}>
            {s.clientVersion}
          </span>
        ) : (
          <span className="text-muted-foreground" title="İstemci sürümünü bildirmedi">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5" title={s.lastSeenAt ? stamp(s.lastSeenAt) : undefined}>
        {s.lastSeenAt ? agoLabel(s.lastSeenAt, now) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap py-1.5 tabular-nums text-muted-foreground">
        {stamp(s.startedAt)}
      </TableCell>
    </TableRow>
  );
}
