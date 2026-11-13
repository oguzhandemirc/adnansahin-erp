// Fason ekranı (soru-cevap tasarımı §4.3, "Fasonda ne var?"): Üretim › "Fasonda" satırından açılır. Rakamlar
// fabrikanın `fason-acik` anlığıdır; termin/gecikme yoktur.
import { Screen } from "../../../src/ui/Frame";
import { SubcontractOpenSection } from "../../../src/ui/fason/FasonCards";

export default function Subcontract() {
  return (
    <Screen title="Fason" module="uretim">
      <SubcontractOpenSection />
    </Screen>
  );
}
