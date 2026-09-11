import { cookies } from "next/headers";

function cookieValue(header: string | null, name: string): string | null {
    const prefix = `${name}=`;
    const value = header
        ?.split(";")
        .map(part => part.trim())
        .find(part => part.startsWith(prefix));
    return value ? decodeURIComponent(value.slice(prefix.length)) : null;
}

export async function getMaterialStagingActorId(request: Request): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieValue(request.headers.get("cookie"), "vos_access_token")
            || cookieStore.get("vos_access_token")?.value;
        if (!token) return null;
        const [, encodedPayload] = token.split(".");
        if (!encodedPayload) return null;
        const payload = JSON.parse(Buffer.from(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
        const actorId = Number(payload.id ?? payload.user_id ?? payload.userId ?? payload.sub);
        return Number.isSafeInteger(actorId) && actorId > 0 ? actorId : null;
    } catch {
        return null;
    }
}
