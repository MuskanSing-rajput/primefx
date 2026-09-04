import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'An unexpected error occurred'
    let errors: Record<string, string[]> | undefined

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>
        message = (resp['message'] as string) ?? message
        // Validation errors from class-validator
        if (Array.isArray(resp['message'])) {
          errors = { validation: resp['message'] as string[] }
          message = 'Validation failed'
        }
      }
    }

    // Log internal errors with full details (never expose to user)
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} [${status}]`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    } else {
      this.logger.warn(`${request.method} ${request.url} [${status}] ${message}`)
    }

    // Never expose SQL errors, stack traces, or internal details
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    })
  }
}
