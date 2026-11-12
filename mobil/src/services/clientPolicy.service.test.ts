// =============================================================================
// BEKÇİ: istemci sürüm politikası — SÜRÜM EKSENİ + KOŞULLU KİLİT
// =============================================================================
// ⚠️ Buradaki hataların ikisi de sahada geri dönüşü pahalı:
//  · Fazla gevşek → eski tablet yeni backend'e yazmaya devam eder, alan
//    SESSİZCE düşer (bu kapının var olma sebebi).
//  · Fazla sıkı → tablet kilitlenir ama güncellemeyi indiremez; ÇIKIŞI OLMAYAN
//    bir üretim durması olur. Mobilde bu risk masaüstünden yüksek, çünkü cihaz
//    çevrimdışı çalışabiliyor.
// =============================================================================

import {
  kilitlenmeliMi,
  politikaDegerlendir,
  surumKarsilastir,
  type IstemciPolitikasi,
} from './clientPolicy.service';

jest.mock('./api', () => ({ apiClient: { get: jest.fn() } }));

const POL: IstemciPolitikasi = { minVersion: '2.9.8', currentVersion: '2.9.8' };

describe('surumKarsilastir', () => {
  it('SAYISAL karşılaştırır — sözlüksel olsaydı 2.9.10 < 2.9.9 çıkardı', () => {
    expect(surumKarsilastir('2.9.10', '2.9.9')).toBe(1);
    expect('2.9.10' > '2.9.9').toBe(false); // yanlış cevabın kanıtı
  });
  it('eşitlik ve eksik hane', () => {
    expect(surumKarsilastir('2.9.8', '2.9.8')).toBe(0);
    expect(surumKarsilastir('3', '2.9.9')).toBe(1);
  });
});

describe('politikaDegerlendir — APK ekseni', () => {
  it('eski APK eskidir', () => {
    expect(politikaDegerlendir({ politika: POL, apkSurumu: '2.9.7' }))
      .toEqual({ eski: true, sebep: 'apk' });
  });
  it('eşit/yeni APK eski değildir', () => {
    expect(politikaDegerlendir({ politika: POL, apkSurumu: '2.9.8' }).eski)
      .toBe(false);
    expect(politikaDegerlendir({ politika: POL, apkSurumu: '3.0.0' }).eski)
      .toBe(false);
  });
});

describe('politikaDegerlendir — paket tarihi ekseni YOK', () => {
  it('sunucu minPaketTarihi gönderse de yok sayılır', () => {
    const eskiSunucu = { ...POL, minPaketTarihi: '2099-01-01T00:00:00.000Z' } as IstemciPolitikasi;
    expect(politikaDegerlendir({ politika: eskiSunucu, apkSurumu: '2.9.8' }))
      .toEqual({ eski: false, sebep: null });
  });
});

describe('FAIL-OPEN', () => {
  it('politika yoksa tablet ESKİ sayılmaz', () => {
    expect(politikaDegerlendir({ politika: null, apkSurumu: '1.0.0' }).eski)
      .toBe(false);
  });
});

describe('kilitlenmeliMi — KOŞULLU kilit', () => {
  const eski = { eski: true, sebep: 'apk' as const };

  it('düzeltme hazırsa ve kuyruk boşsa kilitler', () => {
    expect(kilitlenmeliMi({ durum: eski, duzeltmeHazir: true, bekleyenYazim: 0 })).toBe(true);
  });

  it('⚠️ düzeltme İNDİRİLEMİYORSA KİLİTLEMEZ', () => {
    // İnternetsiz tablet: kilitlense çıkışı olmayan bir üretim durması olurdu.
    expect(kilitlenmeliMi({ durum: eski, duzeltmeHazir: false, bekleyenYazim: 0 })).toBe(false);
  });

  it('⚠️ gönderilmemiş kayıt varken KİLİTLEMEZ', () => {
    expect(kilitlenmeliMi({ durum: eski, duzeltmeHazir: true, bekleyenYazim: 3 })).toBe(false);
  });

  it('eski değilse hiçbir koşulda kilitlemez', () => {
    expect(kilitlenmeliMi({
      durum: { eski: false, sebep: null }, duzeltmeHazir: true, bekleyenYazim: 0,
    })).toBe(false);
  });
});
