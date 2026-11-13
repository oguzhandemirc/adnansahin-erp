import { moduleVisible, visibleCards, visibleModules } from "../src/lib/access";
import { canCancel, resultText } from "../src/lib/inbox";

const keys = (p: string[]) => visibleModules(p).map((m) => m.key);

describe("izin görünürlüğü (istemci yalnız gizler)", () => {
  it("izinsiz hesap yalnız pano + bildirimler + profil görür", () => {
    expect(keys(["bulut:oturum"])).toEqual(["pano", "bildirimler", "profil"]);
  });
  it("satış şablonu: dışa aktarım YOK, gelen kutusu VAR", () => {
    const k = keys(["bulut:oturum", "bulut:ozet:oku", "bulut:siparis:oku", "bulut:sevkiyat:oku", "bulut:uretim:oku", "bulut:stok:oku", "bulut:rapor:oku", "bulut:cari:oku", "bulut:siparis:yaz", "bulut:cari:yaz"]);
    expect(k).toContain("gelen-kutusu");
    expect(k).not.toContain("disa-aktar");
  });
  it("dışa aktarım yalnız yöneticiye; hesap yönetimi ekranı YOK (hesap fabrikanın malı)", () => {
    expect(moduleVisible(["bulut:hesap:yonet"], "disa-aktar")).toBe(true);
    expect(moduleVisible(["bulut:siparis:oku"], "disa-aktar")).toBe(false);
    expect(keys(["bulut:oturum", "bulut:hesap:yonet"])).toEqual(["pano", "disa-aktar", "bildirimler", "profil"]);
  });
  it("pano kartı gereken izinlerin HEPSİNİ ister", () => {
    expect(visibleCards(["bulut:siparis:oku"]).map((c) => c.projection)).toEqual([]);
    expect(visibleCards(["bulut:ozet:oku", "bulut:siparis:oku"]).map((c) => c.projection)).toEqual(["ozet.siparis"]);
  });
});

describe("gelen kutusu kuralları", () => {
  it("iptal yalnız BEKLIYOR ve yazar", () => {
    expect(canCancel({ durum: "BEKLIYOR", hesapAdi: "A" }, { ad: "B", admin: false })).toBe(true);
    expect(canCancel({ durum: "ISLENIYOR", hesapAdi: "A" }, { ad: "A", admin: false })).toBe(false);
    expect(canCancel({ durum: "BEKLIYOR", hesapAdi: "A" }, { ad: "B", admin: true })).toBe(false);
    expect(canCancel({ durum: "BEKLIYOR", hesapAdi: "A" }, { ad: "A", admin: true })).toBe(true);
  });
  it("sonuç özeti", () => {
    expect(resultText({ belgeNo: "SP-12" })).toBe("Fabrika no: SP-12");
    expect(resultText({ kod: "CARI_YOK" })).toBe("Kod: CARI_YOK");
    expect(resultText(null)).toBeNull();
  });
});
