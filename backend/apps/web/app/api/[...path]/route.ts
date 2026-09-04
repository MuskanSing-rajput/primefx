import { NextRequest } from 'next/server'
import { proxyToAPI } from '@/lib/bff/proxy'

type RouteContext = {
  params: Promise<{ path: string[] }>
}

async function handleRoute(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  const pathString = path ? path.join('/') : ''
  return proxyToAPI(request, pathString)
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleRoute(request, context)
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleRoute(request, context)
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleRoute(request, context)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleRoute(request, context)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleRoute(request, context)
}
