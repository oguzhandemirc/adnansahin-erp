// "Diğer" sekmesi: üstte hesap kartı (→ Profil), sonra sekmeye sığmayan bölümler gruplu, tam genişlik TEK satırlık
// liste (simge karesi + ad + ok). İzinsiz bölüm/grup çizilmez (`moduleVisible`; ör. finans izni yoksa Finans satırı da
// yok). Gönderdiklerim satırında bekleyen sayısı YOK (kayıt onay beklemez); yalnız okunmamış RET sayısı rozetle.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { MODULES, moduleNavTitle, moduleVisible } from "../../../src/lib/access";
import { rozetMetni, useOkunmamisRet } from "../../../src/state/okunmamis-ret";
import { useSession } from "../../../src/state/session";
import { Avatar } from "../../../src/ui/diger/parts";
import { FacilityName, Screen } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { MODULE_ICON } from "../../../src/ui/icons";
import { ListeBlogu, ListeSatiri, Rozet } from "../../../src/ui/ortak";
import { RoleBadge } from "../../../src/ui/RoleBadge";
import { MORE_GROUPS } from "../../../src/ui/tabs";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { DOMAIN_TONE, FONT_SCALE, space, typography } from "../../../src/ui/tokens";


export default function More() {
  const { permissions, facility } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const hesap = facility?.hesap;
  const okunmamis = useOkunmamisRet();
  const retRozeti = rozetMetni(okunmamis);
  const gruplar = MORE_GROUPS.map((g) => ({ ...g, mods: g.modules.filter((k) => moduleVisible(permissions, k)).map((k) => MODULES.find((m) => m.key === k)!) })).filter((g) => g.mods.length > 0);

  return (
    <Screen title="Diğer" back={false} subtitle={<FacilityName />}>
      <KademeliGiris sira={0}>
        <Basilabilir
          accessibilityLabel={`Profil: ${hesap?.ad ?? ""}`}
          onPress={() => router.push("/profil" as never)}
          style={s.hesap}
          basiliZemin={t.color.pressed}
          testID="diger-hesap"
        >
          <Avatar name={hesap?.ad} permissions={permissions} size={48} />
          <View style={s.esnek}>
            <Text style={s.ad} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{hesap?.ad ?? "Hesabım"}</Text>
            {hesap?.eposta ? <Text style={s.eposta} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{hesap.eposta}</Text> : null}
          </View>
          <RoleBadge permissions={permissions} testID="diger-rol" />
          <Ionicons name="chevron-forward" size={16} color={t.color.textMuted} />
        </Basilabilir>
      </KademeliGiris>
      {gruplar.map((g, gi) => (
        <KademeliGiris key={g.title} sira={gi + 1}>
          <ListeBlogu baslik={g.title} testID={`grup-${g.title}`}>
            {g.mods.map((m, i) => (
              <ListeSatiri
                key={m.key}
                birincil={moduleNavTitle(m.key)}
                icon={MODULE_ICON[m.key].icon}
                ton={DOMAIN_TONE[MODULE_ICON[m.key].domain]}
                ayrac={i > 0}
                rozet={m.key === "gelen-kutusu" && retRozeti ? <Rozet label={retRozeti} tone="danger" testID="gelen-okunmamis" /> : undefined}
                accessibilityLabel={m.key === "gelen-kutusu" && retRozeti ? `${moduleNavTitle(m.key)}, ${okunmamis} okunmamış hata` : moduleNavTitle(m.key)}
                onPress={() => router.push(m.route as never)}
                testID={`menu-${m.key}`}
              />
            ))}
          </ListeBlogu>
        </KademeliGiris>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  hesap: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.m,
    padding: space.l,
    backgroundColor: t.color.card,
    borderRadius: t.radius.card,
    borderWidth: 1,
    borderColor: t.color.cardBorder,
    marginTop: space.s,
    ...t.shadow.card,
  },
  esnek: { flex: 1, minWidth: 0 },
  ad: { ...typography.title3, color: t.color.text },
  eposta: { ...typography.label, color: t.color.textMuted, marginTop: 2 },
}));
