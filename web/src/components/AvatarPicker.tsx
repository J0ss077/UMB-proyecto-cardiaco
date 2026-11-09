// @requirement RF-01
import { Camera, Trash2, Upload, User } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { canvasRenderer, type PhotoRenderer } from "../lib/photoRenderer";
import { PhotoEditor } from "./PhotoEditor";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export function initialsOf(fullName: string): string {
    return fullName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}

// Round avatar with a camera menu: upload or change, crop in the editor, or remove the photo.
// The parent saves the result; a null value means "remove the photo".
export function AvatarPicker({
    fullName,
    avatar,
    busy = false,
    onChange,
    renderer = canvasRenderer,
}: {
    fullName: string;
    avatar: string | null;
    busy?: boolean;
    onChange: (avatar: string | null) => Promise<void> | void;
    renderer?: PhotoRenderer;
}) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [picked, setPicked] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);

    function onPicked(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!PHOTO_TYPES.includes(file.type)) {
            setError("Elige una imagen JPEG, PNG o WebP.");
            return;
        }
        if (file.size > PHOTO_MAX_BYTES) {
            setError("La imagen pesa más de 10 MB.");
            return;
        }
        setError(null);
        setPicked(file);
    }

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-muted bg-primary-soft text-3xl font-medium text-primary">
                    {avatar ? (
                        <img src={avatar} alt="Foto de perfil" className="h-full w-full object-cover" />
                    ) : fullName ? (
                        <span aria-hidden="true">{initialsOf(fullName)}</span>
                    ) : (
                        <User className="h-10 w-10" aria-hidden="true" />
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Cambiar foto"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    disabled={busy}
                    onClick={() => setMenuOpen((open) => !open)}
                    className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow hover:bg-primary/90"
                >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                </button>
                {menuOpen ? (
                    <div role="menu" className="absolute left-1/2 top-full z-10 mt-2 w-48 -translate-x-1/2 rounded-card border border-border bg-background p-1 text-left shadow-lg">
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setMenuOpen(false);
                                input.current?.click();
                            }}
                            className="flex w-full items-center gap-2 rounded-field px-3 py-2 text-sm hover:bg-muted"
                        >
                            <Upload className="h-4 w-4" aria-hidden="true" />
                            {avatar ? "Cambiar foto" : "Subir foto"}
                        </button>
                        {avatar ? (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setMenuOpen(false);
                                    void onChange(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-field px-3 py-2 text-sm text-critical hover:bg-muted"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                Quitar foto
                            </button>
                        ) : null}
                    </div>
                ) : null}
                <input
                    ref={input}
                    data-testid="avatar-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    tabIndex={-1}
                    className="hidden"
                    aria-label="Elegir archivo de foto"
                    onChange={onPicked}
                />
            </div>
            {error ? (
                <p role="alert" className="text-sm text-critical">
                    {error}
                </p>
            ) : null}
            {picked ? (
                <PhotoEditor
                    file={picked}
                    renderer={renderer}
                    onApply={async (dataUrl) => {
                        setPicked(null);
                        await onChange(dataUrl);
                    }}
                    onCancel={() => setPicked(null)}
                />
            ) : null}
        </div>
    );
}
