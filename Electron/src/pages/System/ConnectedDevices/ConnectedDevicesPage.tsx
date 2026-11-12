import { AlertTriangle, TabletSmartphone } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell, PageBody } from "@/components/layout/PageShell";
import { RefreshButton } from "@/components/RefreshButton";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTIVE_SESSIONS_QUERY_KEY, useActiveSessions } from "./hooks";
import { latestVersionByType, versionSummary } from "./connected-devices-utils";
import { SessionRow } from "./SessionRow";
import { VersionStrip } from "./VersionStrip";

/**
 * Bağlı Cihazlar — açık oturumlar: kim, hangi cihazda, hangi uygulama sürümüyle.
 * Kaynak oturum tablosudur (sunucu yeniden başlasa da kalır); "son görülme"
 * dakikada bir tazelenen bir damgadır, canlı bağlantı göstergesi değildir.
 */
export function ConnectedDevicesPage() {
  const q = useActiveSessions();
  const data = q.data;
  const sessions = data?.sessions ?? [];
  const latest = latestVersionByType(sessions);

  return (
    <PageShell>
      <PageHeader
        title="Bağlı Cihazlar"
        description="Açık oturumlar ve kullandıkları uygulama sürümü — 30 sn'de bir tazelenir."
        actions={
          <RefreshButton queryKey={[ACTIVE_SESSIONS_QUERY_KEY]} successMessage="Cihaz listesi yenilendi" />
        }
      />

      <PageBody className="space-y-3 p-6">
        {q.isError && (
          <Callout tone="danger" icon={AlertTriangle} title="Liste alınamadı">
            Sunucuya ulaşılamıyor. "Yenile" ile tekrar deneyin.
          </Callout>
        )}

        {data && sessions.length > 0 && <VersionStrip buckets={versionSummary(sessions)} total={sessions.length} />}

        {data?.truncated && (
          <Callout tone="muted" title="Liste kısaltıldı">
            Son görülen {data.limit} oturum gösteriliyor.
          </Callout>
        )}

        {data && sessions.length === 0 ? (
          <EmptyState
            icon={TabletSmartphone}
            title="Açık oturum yok"
            description="Şu an oturumu açık bir panel, tablet ya da tarayıcı bulunmuyor."
          />
        ) : (
          data && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="[&>th]:whitespace-nowrap">
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>Cihaz</TableHead>
                    <TableHead>Uygulama</TableHead>
                    <TableHead>Sürüm</TableHead>
                    <TableHead>Son görülme</TableHead>
                    <TableHead>Oturum başlangıcı</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <SessionRow key={s.id} session={s} latest={latest} now={data.now} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        )}
      </PageBody>
    </PageShell>
  );
}
