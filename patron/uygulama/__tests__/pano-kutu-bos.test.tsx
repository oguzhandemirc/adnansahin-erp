// Pano kutusu: fabrikanın henüz göndermediği özet (404) HATA değil BOŞ durumdur — benzeticide gerçek bulutta
// dört kutu "Alınamadı · dokun, yeniden dene" gösteriyordu, öbür ekranlar aynı 404'te "henüz gelmedi" diyordu.
import { render, screen } from "@testing-library/react-native";

const mockPlain = { get: async () => null, set: async () => undefined, remove: async () => undefined };
jest.mock("../src/state/store", () => ({ plainStore: mockPlain, secretStore: mockPlain, legacyPlainStore: null }));
import type { Router } from "expo-router";
import type { Remote } from "../src/state/useRemote";
import { KUTU_CIZICI, type KutuBaglami } from "../src/ui/pano/KutuCizici";
import type { Snapshot } from "../src/api/wire";

const uzak = (g: Partial<Remote<Snapshot>>): Remote<Snapshot> => ({
  data: null, error: null, notFound: false, loading: false, refreshing: false, stale: false, offline: false, savedAt: null, reload: () => undefined, ...g,
});
const baglam = (r: Remote<Snapshot>): KutuBaglami => ({ anlik: { "ozet.uretim": r }, liste: {}, donem: "bugun", router: { push: jest.fn() } as unknown as Router, permissions: [] });

describe("pano kutusu boş/hata ayrımı", () => {
  it("404 (henüz gönderilmedi) → boş durum, yeniden dene YOK", () => {
    render(<>{KUTU_CIZICI.uretim(baglam(uzak({ error: "Bulunamadı", notFound: true })))}</>);
    expect(screen.getByText("Fabrikadan henüz gelmedi")).toBeTruthy();
    expect(screen.queryByText(/Alınamadı/)).toBeNull();
  });
  it("gerçek hata (5xx/ağ) → yeniden dene", () => {
    render(<>{KUTU_CIZICI.uretim(baglam(uzak({ error: "Sunucu hatası" })))}</>);
    expect(screen.getByText(/Alınamadı/)).toBeTruthy();
  });
});
