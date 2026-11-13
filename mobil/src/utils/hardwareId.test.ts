// Donanım özeti sözleşmesi (2026-11-13; ana ürün PR #163 testinin uyarlaması):
// §1 saf HMAC Node crypto ile bayt-eşit (RFC 4231 vektörü + rastgele girdiler, çok baytlı UTF-8)
// §2 domain vektörü backend `test_cihaz_kalici_tanima` §7 sabitiyle AYNI
// §3 Android dışı / ANDROID_ID okunamaz / boş / kurulum kimliği yok → null (hw gönderilmez)
// §4 announce gövdesi: özet yoksa bugünkü gövdeyle AYNI; varsa yalnız `hw` eklenir, ham değer yok
// Negatif sonda (B, (bu commit)): HMAC iç dolgusu 0x36 → 0x37 yapılınca 5/9 ❌ (§1, §2, §3a, §4a; md5 ile geri alındı).
import { createHmac } from 'crypto';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { hmacSha256Hex, utf8Bytes } from '../lib/hmac-sha256';
import { computeHwDigest, getHardwareDigest } from './hardwareId';
import { buildAnnounceBody } from '../services/device.service';

jest.mock('expo-application', () => ({ getAndroidId: jest.fn() }));
jest.mock('../store/baseUrlStore', () => ({
  getPinnedInstallationId: jest.fn(async () => '00000000-0000-4000-8000-000000000001'),
  getCurrentBaseUrl: jest.fn(() => 'http://127.0.0.1:4000/api'),
}));
jest.mock('../services/api', () => ({ apiClient: { post: jest.fn(), get: jest.fn() } }));

const getAndroidId = Application.getAndroidId as jest.Mock;
const setOs = (os: string) => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });

const VEKTOR = {
  installationId: '00000000-0000-4000-8000-000000000001',
  ham: '9774d56d682e549c',
  ozet: 'b1c0721db73f7297afbeadaddff6de68c62f572cc68d36c9a0de087600dea9c7',
};

beforeEach(() => {
  setOs('android');
  getAndroidId.mockReset().mockReturnValue(VEKTOR.ham);
});

describe('§1 saf HMAC-SHA256', () => {
  it('RFC 4231 test 2 ("Jefe")', () => {
    expect(hmacSha256Hex(utf8Bytes('Jefe'), 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });
  it('Node crypto ile bayt-eşit (uzun anahtar, çok baytlı UTF-8)', () => {
    const girdiler: [string, string][] = [
      ['k'.repeat(100), 'ileti'],
      ['şğüİı-anahtar', 'tekserp/cihaz-donanim/v1\nANDROID_ID\nçalışkan'],
      ['', ''],
      ['a', 'x'.repeat(200)],
    ];
    for (const [k, m] of girdiler) {
      expect(hmacSha256Hex(utf8Bytes(k), m)).toBe(createHmac('sha256', k).update(m, 'utf8').digest('hex'));
    }
  });
});

describe('§2 domain vektörü', () => {
  it('backend computeHwDigest ile aynı sabit', () => {
    expect(computeHwDigest(VEKTOR.installationId, 'ANDROID_ID', VEKTOR.ham)).toBe(VEKTOR.ozet);
  });
});

describe('§3 özet gönderilmeyen durumlar', () => {
  it('android + kurulum kimliği → özet', () => {
    expect(getHardwareDigest(VEKTOR.installationId)).toEqual({ v: 1, kaynak: 'ANDROID_ID', ozet: VEKTOR.ozet });
  });
  it('android dışı → null', () => {
    setOs('ios');
    expect(getHardwareDigest(VEKTOR.installationId)).toBeNull();
  });
  it('ANDROID_ID fırlatır / boş → null', () => {
    getAndroidId.mockImplementation(() => {
      throw new Error('yok');
    });
    expect(getHardwareDigest(VEKTOR.installationId)).toBeNull();
    getAndroidId.mockReset().mockReturnValue('  ');
    expect(getHardwareDigest(VEKTOR.installationId)).toBeNull();
  });
  it('kurulum kimliği yok → null (anahtarsız özet gönderilmez)', () => {
    expect(getHardwareDigest(null)).toBeNull();
    expect(getHardwareDigest('  ')).toBeNull();
  });
});

describe('§4 announce gövdesi', () => {
  it('özet varsa yalnız hw eklenir, ham değer gövdede yok', async () => {
    const body = await buildAnnounceBody({ deviceId: 'yerel-1234' });
    expect(body).toEqual({ deviceId: 'yerel-1234', hw: { v: 1, kaynak: 'ANDROID_ID', ozet: VEKTOR.ozet } });
    expect(JSON.stringify(body)).not.toContain(VEKTOR.ham);
  });
  it('özet hesaplanamazsa gövde bugünküyle AYNI', async () => {
    setOs('ios');
    expect(await buildAnnounceBody({ deviceId: 'yerel-1234', name: 'T' })).toEqual({ deviceId: 'yerel-1234', name: 'T' });
  });
});
