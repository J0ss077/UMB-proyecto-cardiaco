// @requirement none
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";
import { Input, type InputProps } from "./Input";

// A password field with its own show/hide eye. The eye is part of the field, so the
// state is per field: showing one password never reveals another.
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type" | "trailing">>((props, ref) => {
    const [visible, setVisible] = useState(false);
    return (
        <Input
            {...props}
            ref={ref}
            type={visible ? "text" : "password"}
            trailing={
                <button
                    type="button"
                    onClick={() => setVisible((current) => !current)}
                    aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={visible}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-subtle hover:bg-muted"
                >
                    {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
            }
        />
    );
});
PasswordInput.displayName = "PasswordInput";
