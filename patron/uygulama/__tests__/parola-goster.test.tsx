// Parola alanındaki göz düğmesi: varsayılan gizli, dokununca görünür, tekrar dokununca gizli.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Field } from "../src/ui/kit";

describe("Field parola göz düğmesi", () => {
  it("varsayılan gizli; göz düğmesi gösterir ve gizler", () => {
    render(<Field label="Parola" value="gizli1234" onChangeText={() => {}} secureTextEntry testID="parola" />);
    expect(screen.getByTestId("parola").props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText("Parolayı göster"));
    expect(screen.getByTestId("parola").props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByLabelText("Parolayı gizle"));
    expect(screen.getByTestId("parola").props.secureTextEntry).toBe(true);
  });

  it("parola olmayan alanda göz düğmesi yok", () => {
    render(<Field label="Kullanıcı adı" value="" onChangeText={() => {}} testID="ad" />);
    expect(screen.queryByLabelText("Parolayı göster")).toBeNull();
  });
});
