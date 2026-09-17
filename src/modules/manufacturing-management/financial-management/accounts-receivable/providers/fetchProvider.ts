import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

const COOKIE_KEY = 'springboot_token';

export async function getToken(request?: NextRequest): Promise<string | null> {
  if (request && request.cookies) {
    return request.cookies.get(COOKIE_KEY)?.value || null;
  }
  try {
    const cookieStore = await cookies();
    return cookieStore.get(COOKIE_KEY)?.value || null;
  } catch {
    return null;
  }
}

export function setToken(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_KEY, token, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day
  });
}