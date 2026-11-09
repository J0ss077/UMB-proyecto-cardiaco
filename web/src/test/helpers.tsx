// @requirement none
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { ToastProvider } from "../components/ui/Toast";

export function renderWithToasts(ui: ReactElement) {
    return render(<ToastProvider>{ui}</ToastProvider>);
}
