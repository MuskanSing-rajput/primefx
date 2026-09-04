import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protected paths
  const isProtectedPath = pathname.startsWith('/admin') || pathname.startsWith('/broker')

  if (isProtectedPath) {
    const token =
      request.cookies.get('__Host-access_token')?.value ||
      request.cookies.get('access_token')?.value

    if (!token) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('reason', 'expired')

      // Sanitize redirect URL to relative paths only (Open Redirect defense)
      if (pathname.startsWith('/admin') || pathname.startsWith('/broker')) {
        loginUrl.searchParams.set('from', pathname)
      }

      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/broker/:path*'],
}
