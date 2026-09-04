let isRedirecting = false

/**
 * Global session expiration & unauthorized response handler.
 * Prevents multiple concurrent redirects when multiple queries fail at once.
 */
export function handleUnauthorized(reason = 'expired') {
  if (typeof window === 'undefined' || isRedirecting) return
  isRedirecting = true

  // Do not loop redirect if user is already on auth pages
  if (
    window.location.pathname.startsWith('/login') ||
    window.location.pathname.startsWith('/register')
  ) {
    isRedirecting = false
    return
  }

  try {
    sessionStorage.clear()
  } catch {
    // Ignore storage clear errors
  }

  const currentPath = window.location.pathname
  const redirectUrl = `/login?reason=${encodeURIComponent(reason)}&from=${encodeURIComponent(currentPath)}`
  window.location.href = redirectUrl
}

/**
 * Unified fetch wrapper that automatically catches 401 Unauthorized status codes
 * and triggers session cleanup & login redirection.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const options: RequestInit = {
    credentials: 'include',
    ...init,
  }

  const response = await fetch(input, options)

  if (response.status === 401) {
    handleUnauthorized('expired')
  }

  return response
}
