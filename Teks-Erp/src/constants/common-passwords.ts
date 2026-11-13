// =============================================================================
// Yaygın / tahmin edilir parola listesi — `password-policy.helper.ts` okur.
// =============================================================================
// Kullanıcı kararı 2026-11-13: yeni ve sıfırlanan parolalar yaygın listede
// OLAMAZ; liste repoda küçük bir sabit dosyadır (yeni npm paketi YOK).
//
// ⚠️ Değerler NORMALİZE yazılır: küçük harf, Türkçe harf ASCII'ye katlanmış
// (ç→c ğ→g ı→i ö→o ş→s ü→u), harf/rakam dışı karakter yok. Karşılaştırma da
// aynı normalizasyondan geçtiği için "Adnan.Şahin" ile "adnansahin" aynı satırı
// bulur. Liste sondaki/baştaki rakamlar ayıklanmış GÖVDEYLE de karşılaştırılır
// ("galatasaray1905" → "galatasaray"), yani yıl/sayı ekli varyantları buraya
// tek tek yazmak gerekmez.
//
// Düz diziler (1234567890, abcdefghij) ve klavye sıraları (qwertyuiop) burada
// değil helper'daki dizi kuralındadır.
// =============================================================================

export const COMMON_PASSWORDS: readonly string[] = [
  // ── Dünya genelinde en sık görülenler ──────────────────────────────────────
  "password", "passw0rd", "p4ssw0rd", "parolapassword", "iloveyou", "welcome", "letmein",
  "monkey", "dragon", "football", "baseball", "basketball", "sunshine", "princess", "master",
  "shadow", "superman", "batman", "michael", "jennifer", "jordan", "trustno1", "starwars",
  "pokemon", "whatever", "freedom", "computer", "internet", "changeme", "default", "secret",
  "qwerty", "qwertz", "azerty", "asdfgh", "zxcvbn", "qazwsx", "1q2w3e", "1q2w3e4r",
  "1q2w3e4r5t", "1q2w3e4r5t6y", "1qaz2wsx", "zaq12wsx", "q1w2e3r4", "q1w2e3r4t5",
  "abc", "abcd", "abc123", "aa123456", "test", "testtest", "tester", "testing", "guest",
  "root", "toor", "user", "username", "demo", "login", "pass", "temp", "temporary",
  "admin", "administrator", "adminadmin", "sysadmin", "superuser", "manager", "support",
  "office", "company", "hello", "hellohello", "loveyou", "lovely", "flower", "summer",
  "winter", "spring", "autumn", "google", "facebook", "instagram", "microsoft", "apple",
  "samsung", "android", "windows", "linux", "mypassword", "yourpassword", "nopassword",
  "newpassword", "oldpassword", "passpass", "access", "accessdenied", "blahblah",

  // ── Türkiye'de sık görülenler ─────────────────────────────────────────────
  "sifre", "sifrem", "sifreniz", "sifresifre", "parola", "parolam", "gizli", "gizlisifre",
  "yenisifre", "eskisifre", "sifreyok", "bilmiyorum", "unuttum", "deneme", "denemeler",
  "galatasaray", "cimbom", "cimbombom", "fenerbahce", "fener", "besiktas", "karakartal",
  "trabzonspor", "trabzon", "bursaspor", "goztepe", "kartal", "aslan", "kanarya",
  "istanbul", "ankara", "izmir", "bursa", "antalya", "adana", "konya", "gaziantep",
  "kayseri", "denizli", "turkiye", "turkey", "ataturk", "mustafakemal", "bismillah",
  "allah", "elhamdulillah", "mashallah", "inshallah", "seviyorum", "seniseviyorum",
  "askim", "askimsin", "sevgilim", "canim", "canimsin", "bebegim", "hayatim", "kalbim",
  "annem", "babam", "kardesim", "ailem", "merhaba", "selam", "sanane", "hayat", "yildiz",
  "gunes", "ayyildiz", "mehmet", "mustafa", "ahmet", "ali", "ayse", "fatma", "emine",
  "hatice", "zeynep", "elif", "yusuf", "murat", "kemal", "hasan", "huseyin", "ibrahim",
  "ismail", "osman", "omer", "emre", "burak", "serkan", "volkan", "ozan", "deniz",
  "asdasd", "asdasdasd", "qweqwe", "qweasd", "qweasdzxc", "asdfasdf", "zxczxc",

  // ── Bu kurulum ve sektörü — tahmini en kolay sözcükler ─────────────────────
  "adnan", "sahin", "adnansahin", "sahinadnan", "adnansahintekstil", "sahintekstil",
  "adnantekstil", "tekserp", "teksu", "teks", "tekstil", "tekstilerp", "erp", "erpsistemi",
  "kumas", "kumasci", "iplik", "dokuma", "orme", "boyahane", "boya", "apre", "konfeksiyon",
  "fabrika", "fabrikam", "atolye", "uretim", "depo", "depocu", "sevkiyat", "sevk", "kalite",
  "kontrol", "kalitekontrol", "tambur", "kursun", "fason", "cuval", "siparis", "musteri",
  "cari", "irsaliye", "fatura", "muhasebe", "finans", "satis", "satin", "satinalma",
  "yonetici", "yonetim", "mudur", "patron", "sahip", "operator", "personel", "isci",
  "calisan", "kullanici", "misafir", "sistem", "sunucu", "server", "panel", "tablet",
  "bilgisayar", "magaza", "firma", "sirket", "ofis", "vardiya", "makine", "tezgah",
];
