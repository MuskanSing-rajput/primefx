import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env['API_BASE_URL'] ?? 'http://127.0.0.1:3001/api/v1'

/**
 * Generic BFF proxy — forwards requests to the backend API
 * Strips internal implementation details from responses
 */
export async function proxyToAPI(
  request: NextRequest,
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<NextResponse> {
  try {
    const cleanBase = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
    const cleanPath = path.startsWith('/') ? path.slice(1) : path
    const url = new URL(`${cleanBase}/${cleanPath}`)

    // Forward query parameters
    const searchParams = request.nextUrl.searchParams
    searchParams.forEach((value, key) => url.searchParams.set(key, value))

    const method = options?.method ?? request.method

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Cookie: request.headers.get('cookie') ?? '',
      'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader) headers['Authorization'] = authHeader

    const init: RequestInit = {
      method,
      headers,
    }

    if (options?.body) {
      init.body = JSON.stringify(options.body)
    } else if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const bodyText = await request.text()
        if (bodyText) init.body = bodyText
      } catch {
        // Body reading error fallback
      }
    }

    const res = await fetch(url.toString(), init)

    const data = (await res.json()) as unknown
    const response = NextResponse.json(data, { status: res.status })

    // Forward Set-Cookie headers
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
