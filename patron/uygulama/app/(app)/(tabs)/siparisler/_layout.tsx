// Siparişler sekmesinin kendi yığını: liste → yeni sipariş, sekme çubuğu altta kalır.
import { Stack } from "expo-router";
import { useGezinme } from "../../../../src/ui/hareket/gezinme";
import { useTokens } from "../../../../src/ui/theme-context";

export default function OrdersStack() {
  const t = useTokens();
  const g = useGezinme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, ...g.yigin }}>
      <Stack.Screen name="yeni" options={g.modal} />
    </Stack>
  );
}
