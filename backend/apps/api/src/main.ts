import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { NestExpressApplication } from '@nestjs/platform-express'
import helmet from 'helmet'
import * as compression from 'compression'
import * as cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { LoggingInterceptor } from './common/interceptors/logging.interceptor'
import { ConfigService } from '@nestjs/config'
import * as path from 'path'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  })

  const configService = app.get(ConfigService)
  const port = configService.get<number>('PORT', 3001)
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
  const nodeEnv = configService.get<string>('NODE_ENV', 'development')

  // ─── Security Headers ─────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    }),
  )

  // ─── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  })

  // ─── Middleware ───────────────────────────────────────────────────────────
  app.use(compression())
  app.use(cookieParser())

  // ─── API Prefix ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1')

  // ─── Static Assets ────────────────────────────────────────────────────────
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/api/v1/uploads',
  })

  // ─── Global Pipes ─────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // ─── Global Filters ───────────────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter())

  // ─── Global Interceptors ──────────────────────────────────────────────────
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor())

  // ─── Swagger (Development Only) ───────────────────────────────────────────
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('LP Platform API')
      .setDescription('Independent Liquidity Provider Platform API v1')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('__Host-access_token')
      .addTag('auth', 'Authentication & Authorization')
      .addTag('brokers', 'Broker Management')
      .addTag('wallet', 'Wallet & Credit Operations')
      .addTag('symbols', 'Trading Symbols')
      .addTag('pricing', 'Pricing Profiles')
      .addTag('clients', 'Client Management')
      .addTag('trading', 'Order Execution & Positions')
      .addTag('execution', 'Execution Accounts')
      .addTag('admin', 'Admin Operations')
      .addTag('reports', 'Reporting')
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    })
  }

  await app.listen(port, '127.0.0.1')
  console.log(`🚀 LP Platform API running at http://127.0.0.1:${port}`)
  console.log(`📄 API Docs: http://127.0.0.1:${port}/api/docs`)
}

bootstrap()
