import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { getProductImageUrl, uploadProductImage } from "../../../finished-goods/services/product-image";

/* The file preview is served by the app API with a query-string file id. */
/* eslint-disable @next/next/no-img-element */

interface ProductImageFieldProps {
    value?: string | null;
    onChange: (value: string | null) => void;
    label?: string;
}

export function ProductImageField({ value, onChange, label = "Product Image (Optional)" }: ProductImageFieldProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setUploading(true);
        try {
            onChange(await uploadProductImage(file));
        } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Failed to upload product image.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-1">
            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">{label}</label>
            <div className="flex items-center gap-2 rounded-lg border bg-background p-1.5 min-h-12">
                {value ? (
                    <>
                        <img
                            src={getProductImageUrl(value)}
                            alt="Product preview"
                            className="h-10 w-10 rounded-md border object-cover"
                        />
                        <span className="min-w-0 flex-1 truncate text-[10px] text-emerald-700">Image uploaded</span>
                        <button
                            type="button"
                            onClick={() => onChange(null)}
                            className="rounded-md p-1 text-rose-600 hover:bg-rose-500/10"
                            aria-label="Remove product image"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </>
                ) : (
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        <span>{uploading ? "Uploading..." : "Choose PNG, JPG, or WEBP"}</span>
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            disabled={uploading}
                            onChange={event => {
                                void handleFileChange(event.target.files?.[0]);
                                event.currentTarget.value = "";
                            }}
                        />
                    </label>
                )}
            </div>
            {error && <p className="text-[10px] text-rose-600">{error}</p>}
        </div>
    );
}
