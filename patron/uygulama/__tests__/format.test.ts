import { formatAgo, formatCountPossessive, formatDate, formatDateTime, formatMoney, formatNumber, formatSince } from "../src/lib/format";
import { formatValue, humanize, recordTitle, scalarEntries } from "../src/lib/present";
import { DEFAULT_FACTORY_TIMEZONE, setFactoryTimezone } from "../src/lib/factory-time";

describe("TR biçimleri", () => {
  it("sayı + iyelik eki okunuştaki son kelimeye uyar", () => {
    const cases: Array<[number, string]> = [
      [0, "0'ı"], [1, "1'i"], [2, "2'si"], [3, "3'ü"], [4, "4'ü"], [5, "5'i"], [6, "6'sı"], [7, "7'si"], [8, "8'i"], [9, "9'u"],
      [10, "10'u"], [12, "12'si"], [18, "18'i"], [20, "20'si"], [30, "30'u"], [40, "40'ı"], [50, "50'si"], [60, "60'ı"],
      [70, "70'i"], [80, "80'i"], [90, "90'ı"], [100, "100'ü"], [1000, "1.000'i"], [1500, "1.500'ü"], [2_000_000, "2.000.000'u"],
    ];
    for (const [n, want] of cases) expect(formatCountPossessive(n)).toBe(want);
    expect(formatCountPossessive(undefined)).toBe("—");
  });
  it("sayılar nokta binlik, virgül ondalık", () => {
    expect(formatNumber(1234567.891)).toBe("1.234.567,89");
    expect(formatNumber("1250.5")).toBe("1.250,5");
    expect(formatNumber(12, 0)).toBe("12");
    expect(formatNumber(-3.5)).toBe("-3,5");
    expect(formatNumber("abc")).toBe("—");
    expect(formatMoney("10.5", "USD")).toBe("10,5 $");
  });
  it("para: simge her tutarın yanında, döviz ayrı; bilinmeyen döviz kodu olduğu gibi (çevrim/aritmetik yok)", () => {
    expect(formatMoney("1234.5", "TRY")).toBe("1.234,5 ₺");
    expect(formatMoney("1234.5")).toBe("1.234,5 ₺");
    expect(formatMoney("99.90", "EUR")).toBe("99,9 €");
    expect(formatMoney(-12, "USD")).toBe("-12 $");
    expect(formatMoney("5", "GBP")).toBe("5 GBP");
    expect(formatMoney(null, "USD")).toBe("—");
    // Fabrikanın ondalık dizisi kayıpsız basılır (iki haneye yuvarlama yalnız gösterim).
    expect(formatMoney("1000000.00", "TRY")).toBe("1.000.000 ₺");
  });
  it("tarih fabrika gününde (UTC+3)", () => {
    expect(formatDate("2026-09-29T22:30:00Z")).toBe("30.09.2026");
    expect(formatDateTime("2026-09-29T10:05:00Z")).toBe("29.09.2026 13:05");
    expect(formatDate("2026-09-29")).toBe("29.09.2026");
    expect(formatDate(null)).toBe("—");
  });
  it("göreli süre", () => {
    const now = Date.parse("2026-09-29T10:00:00Z");
    expect(formatAgo("2026-09-29T09:59:30Z", now)).toBe("az önce");
    expect(formatAgo("2026-09-29T09:48:00Z", now)).toBe("12 dk önce");
    expect(formatAgo("2026-09-29T07:00:00Z", now)).toBe("3 sa önce");
  });
  it("eşitleme göstergesinin kısa süresi: şimdi / dk / saat / gün sınırları", () => {
    const now = Date.parse("2026-09-29T10:00:00Z");
    const once = (ms: number) => formatSince(new Date(now - ms).toISOString(), now);
    expect(once(0)).toBe("şimdi");
    expect(once(59_999)).toBe("şimdi");
    expect(once(60_000)).toBe("1 dk önce");
    expect(once(59 * 60_000 + 59_000)).toBe("59 dk önce");
    expect(once(60 * 60_000)).toBe("1 saat önce");
    expect(once(36 * 60 * 60_000)).toBe("36 saat önce");
    expect(once(47 * 60 * 60_000 + 59 * 60_000)).toBe("47 saat önce");
    expect(once(48 * 60 * 60_000)).toBe("2 gün önce");
    expect(once(71 * 60 * 60_000)).toBe("2 gün önce");
    expect(once(72 * 60 * 60_000)).toBe("3 gün önce");
    // Saat kayması (gelecek damga) "şimdi"; damga yok/bozuk → "—".
    expect(formatSince(new Date(now + 120_000).toISOString(), now)).toBe("şimdi");
    expect(formatSince(null, now)).toBe("—");
    expect(formatSince("bozuk", now)).toBe("—");
  });
});

describe("jenerik sunum", () => {
  it("alan adı okunur başlık olur", () => {
    expect(humanize("toplamMetre")).toBe("Toplam metre");
    expect(humanize("iptalTarihi")).toBe("İptal tarihi");
  });
  it("değerler alana göre biçimlenir; kimlik alanı gizlenir", () => {
    expect(formatValue("cikisTarihi", "2026-09-29T10:05:00Z")).toBe("29.09.2026 13:05");
    expect(formatValue("toplamMetre", "1250.50")).toBe("1.250,5");
    expect(formatValue("aktif", true)).toBe("Evet");
    expect(formatValue("durum", "ISLENDI")).toBe("İşlendi");
    const e = scalarEntries({ id: "x", cariKartId: "y", ad: "A", adet: 3, alt: { a: 1 } });
    expect(e.map((x) => x.key)).toEqual(["ad", "adet"]);
    expect(recordTitle({ sevkNo: "SV-1" })).toBe("SV-1");
    expect(recordTitle(null)).toBe("Kayıt");
  });
});

describe("tesis saat dilimi (ANLIK tesis.saatDilimi)", () => {
  it("seçilen dilimde basılır, telefonun diliminde değil; takvim günü dilimsiz kalır", () => {
    try {
      expect(setFactoryTimezone("America/New_York")).toBe(true);
      expect(formatDateTime("2026-09-29T10:05:00Z")).toBe("29.09.2026 06:05");
      expect(formatDate("2026-09-30T02:30:00Z")).toBe("29.09.2026");
      expect(formatDate("2026-09-29")).toBe("29.09.2026");
    } finally {
      setFactoryTimezone(DEFAULT_FACTORY_TIMEZONE);
    }
  });
});
