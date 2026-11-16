// =============================================================================
// Bekçi: Tambur "Bu işten çıkanlar" satırı A1/fire kalitesini ROZETLE gösterir
// =============================================================================
// 2026-11-16 saha isteği: "sağ taraftaki çıkan toplar bölümünde çıkan topun
// kalitesi yazmalı; fire veya a1 ise yazsın, 1. kaliteyse yazmasına gerek yok".
// Ölçülen: rozet A1'de ve fire'da çıkar, 1. kalitede çıkmaz, ETİKETİ HİÇ
// BASILMAMIŞ topta da çıkar (rozet etiket durumundan bağımsız). Katalog boşken
// rozet çizilmez (yüklenene kadar 1. kalitede yanlış rozet yanıp sönmesin).
// Negatif sonda: paneldeki rozet bloğu kaldırılınca A1/fire/etiketsiz
// beklentileri kırmızıya düşer.
// =============================================================================
import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithPaper } from '../../../test/render';
import WorkOrderOutputPanel from './WorkOrderOutputPanel';
import { nonFirstGradeBadge } from '../../../utils/qualityRole';
import type { QualityGrade, Roll } from '../../../types/models';

const mockRecent = jest.fn();
jest.mock('../../../services/tambur.service', () => ({
  tamburService: { recentOutputRolls: (...a: unknown[]) => mockRecent(...a) },
}));
jest.mock('../../../store/deviceSettingsStore', () => ({
  useDeviceSettingsStore: (sel: (s: unknown) => unknown) =>
    sel({ tamburOutputCollapsed: false, setTamburOutputCollapsed: () => undefined }),
}));

const grades = [
  { id: 'g1', code: '1.KALITE', name: '1. Kalite', color: '#10b981', role: 'FIRST', isActive: true },
  { id: 'g2', code: 'A1', name: 'A1 (Alt Kalite)', color: '#f59e0b', role: 'SECOND', isActive: true },
  { id: 'g3', code: 'FIRE', name: 'Fire', color: '#ef4444', role: 'SCRAP', isActive: true },
] as unknown as QualityGrade[];

const roll = (id: string, barcode: string, qualityGrade: string, printed: boolean) =>
  ({
    id,
    barcode,
    qualityGrade,
    initialQty: 50,
    createdAt: '2026-11-16T10:00:00.000Z',
    // Etiket durumu — rozet bunu OKUMAMALI.
    labelPrintedAt: printed ? '2026-11-16T10:00:05.000Z' : null,
    lastLabelSnapshot: printed ? { stock: true } : null,
  }) as unknown as Roll;

describe('nonFirstGradeBadge', () => {
  it('1. kalitede rozet yok, A1 ve fire rozetli, renk katalogdan', () => {
    expect(nonFirstGradeBadge(grades, '1.KALITE')).toBeNull();
    expect(nonFirstGradeBadge(grades, 'A1')).toEqual({ code: 'A1', color: '#f59e0b' });
    expect(nonFirstGradeBadge(grades, 'FIRE')).toEqual({ code: 'FIRE', color: '#ef4444' });
  });
  it('kalitesiz topta ve katalog yüklenmemişken rozet yok', () => {
    expect(nonFirstGradeBadge(grades, null)).toBeNull();
    expect(nonFirstGradeBadge([], 'A1')).toBeNull();
  });
});

describe('WorkOrderOutputPanel kalite rozeti', () => {
  beforeEach(() => {
    mockRecent.mockReset();
    mockRecent.mockResolvedValue({
      success: true,
      data: [
        roll('r-first', 'F0001', '1.KALITE', false),
        roll('r-a1-raw', 'F0002', 'A1', false),
        roll('r-fire-raw', 'F0003', 'FIRE', false),
        roll('r-a1-printed', 'F0004', 'A1', true),
      ],
      pagination: { nextCursor: null, hasMore: false, limit: 100 },
    });
  });

  it('A1 ve fire rozetli (etiketsiz olanlar dahil), 1. kalite rozetsiz', async () => {
    renderWithPaper(
      <WorkOrderOutputPanel workOrderId="wo-1" grades={grades} onPrint={jest.fn()} onUndo={jest.fn()} />,
    );
    await screen.findByText('F0001');
    expect(screen.queryByTestId('wo-output-grade-r-first')).toBeNull();
    // Etiketi HİÇ basılmamış A1 ve fire topu da rozetini taşır.
    expect(screen.getByTestId('wo-output-grade-r-a1-raw')).toBeTruthy();
    expect(screen.getByTestId('wo-output-grade-r-fire-raw')).toBeTruthy();
    expect(screen.getByTestId('wo-output-grade-r-a1-printed')).toBeTruthy();
    expect(screen.getAllByText('A1')).toHaveLength(2);
    expect(screen.getAllByText('FIRE')).toHaveLength(1);
  });

  it('katalog boşken hiçbir satır rozet almaz', async () => {
    renderWithPaper(
      <WorkOrderOutputPanel workOrderId="wo-1" grades={[]} onPrint={jest.fn()} onUndo={jest.fn()} />,
    );
    await screen.findByText('F0002');
    expect(screen.queryByTestId('wo-output-grade-r-a1-raw')).toBeNull();
    expect(screen.queryByText('A1')).toBeNull();
  });
});
