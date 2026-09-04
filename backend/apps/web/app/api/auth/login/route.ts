import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3001/api/v1'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as unknown

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward real client IP for rate limiting
        'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json() as unknown

    const response = NextResponse.json(data, { status: res.status })

    // Forward Set-Cookie headers from backend (HttpOnly auth cookies)
    const setCookieHeader = res.headers.get('set-cookie')
    if (setCookieHeader) {
      response.headers.set('set-cookie', setCookieHeader)
    }

    return response
  } catch {
    return NextResponse.json(
      { success: false, message: 'Gateway error' },
      { status: 502 },
    )
  }
}
