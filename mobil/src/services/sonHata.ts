// Son API hatası — destek talebinin bağlamına "varsa son hata" olarak girer.
// Yalnız bellekte tutulur (diske yazılmaz). İçerik: yöntem + YOL (sorgu atılır)
// + durum + Türkçe mesaj; istek gövdesi, başlık ve token ASLA girmez.
// Destek uçlarının kendi hataları kaydedilmez (talep "destek açılamadı"yı
// bildirmek için açılmaz; asıl sorunun izini ezmesin).
import type { SonHata } from '../screens/Destek/destekBaglam';
import { yalnizYol } from '../screens/Destek/destekBaglam';

let son: SonHata | null = null;

export function sonHataKaydet(p: {
  method: string | undefined;
  url: string | undefined;
  status: SonHata['status'];
  message: string;
}): void {
  const path = yalnizYol(p.url);
  if (path.includes('/destek/')) return;
  son = {
    at: new Date().toISOString(),
    method: (p.method ?? 'GET').toUpperCase(),
    path,
    status: p.status,
    message: p.message,
  };
}

export function sonHata(): SonHata | null {
  return son;
}
