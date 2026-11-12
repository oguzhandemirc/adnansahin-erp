import { useQuery } from "@tanstack/react-query";
import { useIsTabActive } from "@/components/layout/tabs/tab-active";
import { fetchActiveSessions } from "./service";

export const ACTIVE_SESSIONS_QUERY_KEY = "active-sessions";
const REFRESH_MS = 30_000;

/**
 * Açık oturumlar — 30 sn'de bir tazelenir, YALNIZ sekme aktifken: pasif
 * sekmeler mount kalır ve yoklama arka planda süresiz koşardı.
 */
export function useActiveSessions() {
  const isTabActive = useIsTabActive();
  return useQuery({
    queryKey: [ACTIVE_SESSIONS_QUERY_KEY],
    queryFn: fetchActiveSessions,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: isTabActive ? REFRESH_MS : false,
  });
}
