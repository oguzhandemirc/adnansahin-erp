/**
 * BEKÇİ — `apiClient` yolu `/api/` ile BAŞLAMAZ.
 *
 * `apiClient`in taban adresi (`constants/api.ts` → `API_URL`, Ayarlar'dan
 * girilen adres de dahil: `store/baseUrlStore.ts`) ZATEN `/api` ile biter.
 * Yol `'/api/scan/series'` yazılırsa istek `GET /api/api/scan/series` olur ve
 * 404 döner. Saha vakası (2026-11-15, 1.0.17): okutma seri tablosu her girişten
 * sonra 404 aldı, tablet sessizce YEDEK tabloya düştü — hata yalnız sunucu
 * log'unda görünüyordu.
 *
 * Tarama TS AST ile: `apiClient.<yöntem>(yol, …)` çağrısının ilk argümanı ve
 * `apiClient.request({ url })` nesnesinin `url` alanı; düz metin, şablon metin
 * ve şablonun BAŞ parçası okunur. Test dosyaları taranmaz (sahte yol kurarlar).
 *
 * ⭐ NEGATİF SONDA (2026-11-15, ölçüldü): `scanSeries.service.ts`te yol
 *    `'/api/scan/series'`e geri çevrilince ❌1 (bulgu `scanSeries.service.ts`);
 *    geri alındı, temiz ağaçta yeşil. Aşağıdaki "sonda" vakası aynı tespiti
 *    her koşuda sentetik kaynakla da kanıtlar (dedektör körleşirse kırmızı).
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '..');
const YONTEMLER = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request']);
const YASAK = /^\/?api(\/|$)/;

function kaynakDosyalari(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...kaynakDosyalari(p));
    else if (/\.(ts|tsx)$/.test(ent.name) && !/\.test\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

/** Düz metin / şablon metnin SABİT baş parçası; çözülemiyorsa null. */
function basMetin(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text;
  return null;
}

function urlAlani(obj: ts.Expression): ts.Expression | null {
  if (!ts.isObjectLiteralExpression(obj)) return null;
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'url') return p.initializer;
  }
  return null;
}

/** Körlük zemini: kaç `apiClient` yolu OKUNDU (çözülebilen sabit metin). */
let okunanYol = 0;

/** Kaynak metinde `/api/` önekli `apiClient` yollarını bulur (satır numarasıyla). */
export function cifteApiBul(dosyaAdi: string, kaynak: string): string[] {
  const sf = ts.createSourceFile(dosyaAdi, kaynak, ts.ScriptTarget.Latest, true);
  const bulgular: string[] = [];
  const ziyaret = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'apiClient' &&
      YONTEMLER.has(node.expression.name.text) &&
      node.arguments.length > 0
    ) {
      const ilk = node.arguments[0];
      const yolDugumu = node.expression.name.text === 'request' ? urlAlani(ilk) : ilk;
      const metin = yolDugumu ? basMetin(yolDugumu) : null;
      if (metin !== null) okunanYol += 1;
      if (metin !== null && YASAK.test(metin)) {
        const satir = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        bulgular.push(`${dosyaAdi}:${satir} → '${metin}'`);
      }
    }
    ts.forEachChild(node, ziyaret);
  };
  ziyaret(sf);
  return bulgular;
}

describe('apiClient yolu /api/ ile başlamaz (taban adres zaten /api ile biter)', () => {
  it('src altında hiçbir apiClient çağrısı /api/ önekli yol kullanmaz', () => {
    okunanYol = 0;
    const bulgular = kaynakDosyalari(SRC).flatMap((f) =>
      cifteApiBul(path.relative(SRC, f), fs.readFileSync(f, 'utf8')),
    );
    expect(bulgular).toEqual([]);
    // Körlük zemini: "0 bulgu" ile "hiç bakılmadı" ayrımı. 2026-11-15 ölçümü
    // ~200 çağrı; dedektör apiClient'i tanımaz hâle gelirse sayı çöker.
    expect(okunanYol).toBeGreaterThan(100);
  });

  it('sonda: dedektör bilinen hatalı biçimlerin hepsini yakalar', () => {
    const kaynak = [
      "apiClient.get<{ a: 1 }>('/api/scan/series');",
      'apiClient.post(`/api/destek/talepler/${id}/kapat`);',
      "apiClient.request({ method: 'GET', url: 'api/x' });",
      "apiClient.get('/scan/series');",
      "apiClient.get(`/destek/talepler/${id}`);",
      "other.get('/api/discovery/identity');",
    ].join('\n');
    expect(cifteApiBul('sonda.ts', kaynak)).toHaveLength(3);
  });
});
