// Cariler sekmesinin kendi yığını: liste → cari kartı · yeni müşteri (alttan), sekme çubuğu altta kalır.
import { Stack } from "expo-router";
import { useGezinme } from "../../../../src/ui/hareket/gezinme";
import { useTokens } from "../../../../src/ui/theme-context";

// Kök ilk beyan edilir: beyan edilen ekran listenin başına geçer; kök beyansızken sekmeye ilk dokunuş "yeni" formunu açıyordu.
export const unstable_settings = { initialRouteName: "index" };

export default function CustomersStack() {
  const t = useTokens();
  const g = useGezinme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, ...g.yigin }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="yeni" options={g.modal} />
    </Stack>
  );
}
