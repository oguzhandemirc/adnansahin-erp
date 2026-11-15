// =============================================================================
// loginInput — sayısal vs harfli parola alanı temizleyicileri (K bulgusu 2026-09-18)
// =============================================================================
// NEGATİF SONDA: harfli parola sayısal temizleyiciden geçerse alfasayısal parola bozulur ve giriş
// reddedilir — gerçek cihazda "_yNh6z91473t" ABC klavyeyle yazıldı, `\D` süzmesi "91473"e indirdi,
// sunucu "Geçersiz kullanıcı adı veya şifre" verdi (2026-09-18 tablet provası).
// =============================================================================
import fs from 'fs';
import path from 'path';
import { sanitizeAlphaInput, sanitizeCompactLoginInput, sanitizeNumericInput } from './loginInput';

describe('sanitizeNumericInput — hızlı-PIN / sayısal parola', () => {
  it('yalnız rakam bırakır ve cap uygular', () => {
    expect(sanitizeNumericInput('12a34', 6)).toBe('1234');
    expect(sanitizeNumericInput('_yNh6z91473t', 32)).toBe('691473'); // harfleri düşürür (SAYISAL alan bilerek)
    expect(sanitizeNumericInput('123456789', 6)).toBe('123456');
    expect(sanitizeNumericInput('', 6)).toBe('');
  });
});

describe('sanitizeAlphaInput — harfli (ABC) parola', () => {
  it('⭐ alfasayısal parolayı OLDUĞU GİBİ korur (rakam SÜZMEZ), yalnız cap uygular', () => {
    expect(sanitizeAlphaInput('_yNh6z91473t', 32)).toBe('_yNh6z91473t');
    expect(sanitizeAlphaInput('Aa1!.-_@', 32)).toBe('Aa1!.-_@');
    expect(sanitizeAlphaInput('0123456789', 32)).toBe('0123456789'); // salt rakam da bozulmaz
  });
  it('cap uzunluğu keser', () => {
    expect(sanitizeAlphaInput('abcdefghij', 4)).toBe('abcd');
  });
});

// Canlı bulgu 2026-11-16 (el terminali 480x800, saha ≤ 1.0.18): compact düzende ABC↔123 geçişi yok,
// görünmez giriş alanı `\D` ile süzüyordu → "3716489Ser_" "3716489" olarak gidiyor, sunucu 401.
describe('sanitizeCompactLoginInput — telefon / el terminali görünmez giriş alanı', () => {
  it('⭐ liste+şifre kipinde harfli parola DEĞİŞMEDEN geçer', () => {
    expect(sanitizeCompactLoginInput('3716489Ser_', true, 32)).toBe('3716489Ser_');
    expect(sanitizeCompactLoginInput('_yNh6z91473t', true, 32)).toBe('_yNh6z91473t');
    expect(sanitizeCompactLoginInput('abcdef', true, 4)).toBe('abcd'); // uzunluk sınırı kalır
  });
  it('salt-PIN kipinde harf yine atılır, 6 hane sınırı kalır', () => {
    expect(sanitizeCompactLoginInput('12a34b', false, 6)).toBe('1234');
    expect(sanitizeCompactLoginInput('1234567', false, 6)).toBe('123456');
  });
});

// Bekçi: ekranın görünmez giriş alanı (`handlePinChange`) karar verici temizleyiciyi kullanmalı;
// yeniden `sanitizeNumericInput`e dönerse harfli parola el terminalinde yine düşer.
describe('LoginScreen handlePinChange — compact düzen temizleyicisi', () => {
  it('⭐ handlePinChange gövdesi sanitizeCompactLoginInput kullanır, sanitizeNumericInput kullanmaz', () => {
    const src = fs.readFileSync(path.join(__dirname, 'LoginScreen.tsx'), 'utf8');
    const start = src.indexOf('const handlePinChange = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('[submitPinByMethod]', start);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toContain('sanitizeCompactLoginInput(');
    expect(body).not.toContain('sanitizeNumericInput(');
  });
});
