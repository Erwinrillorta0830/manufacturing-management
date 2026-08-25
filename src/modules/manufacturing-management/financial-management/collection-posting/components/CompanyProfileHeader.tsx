import { Building2, ImageOff } from "lucide-react";
import Image from "next/image";
import type { CompanyProfile, CompanyProfileStatus } from "../company-profile";

interface CompanyProfileHeaderProps {
    profile: CompanyProfile | null;
    status: CompanyProfileStatus;
    documentTitle?: string;
}

export function CompanyProfileHeader({
    profile,
    status,
    documentTitle = "Treasury Review Document",
}: CompanyProfileHeaderProps) {
    const hasProfile = status === "ready" && profile;
    const profileMessage = status === "loading"
        ? "Loading official company profile..."
        : "Official company profile is unavailable. Verify the profile before printing.";

    return (
        <div className="space-y-3 border-b-2 border-primary/20 pb-5 print:border-black">
            <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30 print:border-black">
                    {profile?.logoDataUrl ? (
                        <Image
                            src={profile.logoDataUrl}
                            alt="Company logo"
                            width={64}
                            height={64}
                            unoptimized
                            className="h-full w-full object-contain p-1"
                        />
                    ) : (
                        <ImageOff className="h-6 w-6 text-muted-foreground" aria-label="Company logo unavailable" />
                    )}
                </div>

                <div className="min-w-0 flex-1 text-center sm:text-left">
                    <p className="text-xl font-black uppercase leading-tight tracking-tight text-foreground">
                        {profile?.companyName || "Company name unavailable"}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
                        {profile?.address || "Address not provided"}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        TIN: {profile?.tin || "Not provided"}
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-primary print:text-black">
                <Building2 className="h-4 w-4" />
                {documentTitle}
            </div>

            {!hasProfile && (
                <p
                    role="status"
                    className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-amber-800 print:border-black print:bg-transparent print:text-black"
                >
                    {profileMessage}
                </p>
            )}
        </div>
    );
}
