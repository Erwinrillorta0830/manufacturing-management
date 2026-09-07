import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function handleApiError(error: unknown, defaultMessage = "Internal server error") {
  console.error("API Error:", error);

  if (error instanceof ZodError) {
    const zodError = error as unknown as { errors: Array<{ path: (string | number)[], message: string }> };
    const messages = zodError.errors.map((e: { path: (string | number)[], message: string }) => `${e.path.join(".")}: ${e.message}`);
    return NextResponse.json(
      { error: "Validation failed", details: messages },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    // Determine if it's a known operational error that should return a 400 or a 500
    // (We could improve this based on custom Error classes in the future)
    const isUnauthorized = error.message.toLowerCase().includes("unauthorized");
    const status = isUnauthorized ? 401 : 500;
    
    return NextResponse.json(
      { error: error.message || defaultMessage },
      { status }
    );
  }

  return NextResponse.json(
    { error: defaultMessage },
    { status: 500 }
  );
}
