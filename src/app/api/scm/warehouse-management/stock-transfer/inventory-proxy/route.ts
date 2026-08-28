import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/$/, '');
  
  if (!springBase) {
    console.error('[Proxy] SPRING_API_BASE_URL is not configured');
    return NextResponse.json({ error: 'SPRING_API_BASE_URL is not configured' }, { status: 500 });
  }

  // Construct the target external URL dynamically
  const targetUrl = new URL(`${springBase}/api/mm-inventory-movements/filter`);
  
  // Forward all query parameters
  searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  // Ensure branch param is mapped correctly for Spring filter
  const branchVal = searchParams.get('branch') || searchParams.get('branchId') || searchParams.get('branch_id');
  if (branchVal) {
    targetUrl.searchParams.set('branch', branchVal);
  }

  // Extract auth token from cookies or cache
  let token = request.cookies.get('vos_access_token')?.value || request.cookies.get('springboot_token')?.value;
  if (!token) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');
      const tokenFile = path.resolve(process.cwd(), 'node_modules/.cache/vos-tokens/latest_token.txt');
      if (fs.existsSync(tokenFile)) {
        token = fs.readFileSync(tokenFile, 'utf8').trim();
      }
    } catch {
      // Ignore fallback token read
    }
  }

  console.log(`[Proxy] Target: ${targetUrl.toString()}`);
  console.log(`[Proxy] Token present: ${!!token}, Length: ${token?.length}`);
  
  if (token) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');
      const tmpDir = path.resolve(process.cwd(), 'node_modules/.cache/vos-tokens');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      fs.writeFileSync(path.join(tmpDir, 'latest_token.txt'), token);
    } catch (err) {
      console.warn('[Proxy] Safe token write skipped:', err);
    }
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(token ? { 
          'Authorization': `Bearer ${token}`,
          'Cookie': `vos_access_token=${token}`
        } : {}),
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(data);
    } else {
      const errText = await response.text();
      console.error(`[Proxy] API returned ${response.status}:`, errText);
      return NextResponse.json(
        { error: `External API returned status ${response.status}`, details: errText },
        { status: response.status }
      );
    }
  } catch (error) {
    console.error('Inventory Proxy Error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy inventory request', details: String(error) },
      { status: 500 }
    );
  }
}
