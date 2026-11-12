import { SummarySection } from "./SummarySection";
import { CustomerSummaryStrip } from "./CustomerSummaryStrip";
import { OpenOrdersTable, OrderProfileTable, RecentOrdersTable, ReturnsTable, ShipmentsTable } from "./CustomerSummaryTables";
import { SUMMARY_LIMIT } from "./customerSummaryService";
import { useCustomerSummaryAccess, useCustomerSummaryQueries } from "./useCustomerSummary";

/** Liste ekranını bu cari süzgeciyle açan yol (filtre adları liste ekranlarının URL sözleşmesi). */
export function summaryPaths(customerId: string) {
  const c = `filter[customerId]=${encodeURIComponent(customerId)}`;
  return {
    orders: `/operations/orders?${c}`,
    openOrders: `/operations/orders?${c}&filter[status]=PENDING,APPROVED,PARTIAL_SHIPPED`,
    shipments: `/operations/shipments?${c}&filter[status]=DISPATCHED`,
    returns: `/operations/returns?${c}`,
    orderProfile: `/reports/customer/order-profile?customerId=${encodeURIComponent(customerId)}`,
  };
}

/**
 * Cari kartı "Özet" sekmesi — yalnız kayıtlı caride, sekme ilk açıldığında çeker
 * (Radix `TabsContent` pasif sekmeyi bağlamaz). İzni olmayan bölüm hiç çizilmez.
 */
export function CustomerSummaryTab({ customerId }: { customerId: string }) {
  const access = useCustomerSummaryAccess();
  const q = useCustomerSummaryQueries(customerId, access);
  const p = summaryPaths(customerId);
  const last = `son ${SUMMARY_LIMIT}`;
  const orders = q.orders.data?.data ?? [];
  const open = q.open.data?.data ?? [];
  const shipments = q.shipments.data?.data ?? [];
  const returns = q.returns.data?.data ?? [];
  const profile = q.profile.data?.data ?? [];

  return (
    <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1" data-testid="customer-summary">
      <CustomerSummaryStrip access={access} q={q} />
      {access.orders && (
        <SummarySection title="Son siparişler" note={last} query={q.orders} empty={orders.length === 0} seeAllPath={access.link.orders ? p.orders : undefined}>
          <RecentOrdersTable rows={orders} />
        </SummarySection>
      )}
      {access.shipping && (
        <SummarySection title="Açık siparişler" query={q.open} empty={open.length === 0} seeAllPath={access.link.orders ? p.openOrders : undefined}>
          <OpenOrdersTable orders={open} />
        </SummarySection>
      )}
      {access.shipping && (
        <SummarySection title="Sevk edilenler" note={`${last} · brüt`} query={q.shipments} empty={shipments.length === 0} seeAllPath={access.link.shipping ? p.shipments : undefined}>
          <ShipmentsTable rows={shipments} />
        </SummarySection>
      )}
      {access.returns && (
        <SummarySection title="İadeler" note={last} query={q.returns} empty={returns.length === 0} seeAllPath={access.link.returns ? p.returns : undefined}>
          <ReturnsTable rows={returns} />
        </SummarySection>
      )}
      {access.orderProfile && (
        <SummarySection title="En çok alınan" note="tüm zamanlar" query={q.profile} empty={profile.length === 0} seeAllPath={p.orderProfile}>
          <OrderProfileTable rows={profile} />
        </SummarySection>
      )}
    </div>
  );
}
