import { Controller, Post, Body, Res, Req, HttpCode, HttpStatus, Get, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common'
import { Response, Request } from 'express'
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { LoginSchema, RegisterBrokerSchema } from '@lp/validators'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { LoginInput, RegisterBrokerInput } from '@lp/validators'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AuthUser } from '@lp/shared-types'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname } from 'path'
import * as fs from 'fs'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login (SuperAdmin / Broker)' })
  @SwaggerResponse({ status: 200, description: 'Login successful' })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginInput,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ) {
    const result = await this.authService.login(dto)

    const isSecure = request.secure || request.headers['x-forwarded-proto'] === 'https'
    const isProduction = process.env.NODE_ENV === 'production'
    const useSecureCookie = !!(isSecure || isProduction)
    const cookieName = useSecureCookie ? '__Host-access_token' : 'access_token'

    // Set HttpOnly cookie
    response.cookie(cookieName, result.accessToken, {
      httpOnly: true,
      secure: useSecureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: 20 * 60 * 1000, // 20 minutes
    })

    // Clean up potentially stale cookie of the other type
    if (useSecureCookie) {
      response.clearCookie('access_token', { path: '/' })
    } else {
      response.clearCookie('__Host-access_token', { path: '/', secure: true, httpOnly: true })
    }

    return { user: result.user }
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token (extends active session)' })
  async refresh(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const newToken = await this.authService.refreshToken(user)
    const isSecure = request.secure || request.headers['x-forwarded-proto'] === 'https'
    const isProduction = process.env.NODE_ENV === 'production'
    const useSecureCookie = !!(isSecure || isProduction)
    const cookieName = useSecureCookie ? '__Host-access_token' : 'access_token'

    response.cookie(cookieName, newToken, {
      httpOnly: true,
      secure: useSecureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: 20 * 60 * 1000, // 20 minutes
    })

    return { ok: true }
  }

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send email verification OTP' })
  async sendOtp(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email address is required')
    }
    return this.authService.sendOtp(body.email)
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email OTP' })
  async verifyOtp(@Body() body: { email: string; otp: string }) {
    if (!body.email || !body.otp) {
      throw new BadRequestException('Email and OTP code are required')
    }
    return this.authService.verifyOtp(body.email, body.otp)
  }

  @Post('forgot-password/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check forgot-password account and 2FA status' })
  async checkForgotPasswordMfa(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email address is required')
    }
    return this.authService.checkForgotPasswordMfa(body.email)
  }

  @Post('forgot-password/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password-reset email OTP' })
  async sendForgotPasswordOtp(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException('Email address is required')
    }
    return this.authService.sendForgotPasswordOtp(body.email)
  }

  @Post('forgot-password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset account password verify code/2FA' })
  async resetPassword(
    @Body() body: { email: string; method: '2FA' | 'EMAIL'; code: string; password?: string },
  ) {
    if (!body.email || !body.method || !body.code || !body.password) {
      throw new BadRequestException('Email, method, code, and password are required')
    }
    return this.authService.resetPassword(body.email, body.method, body.code, body.password)
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Broker self-registration' })
  async register(@Body(new ZodValidationPipe(RegisterBrokerSchema)) dto: RegisterBrokerInput) {
    return this.authService.registerBroker(dto)
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = './uploads/kyc'
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
          }
          cb(null, uploadDir)
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
          const ext = extname(file.originalname)
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`)
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new BadRequestException('Only PDF, PNG, and JPEG files are allowed.'), false)
        }
      },
    }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload KYC Document' })
  async uploadKycDoc(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }
    return {
      name: file.originalname,
      key: `kyc/${file.filename}`,
      mimeType: file.mimetype,
      uploadedAt: new Date().toISOString(),
    }
  }

  @Post('exit-impersonate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exit broker impersonation and restore admin session' })
  async exitImpersonate(
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ) {
    const adminToken = request.cookies?.['admin_access_token']
    if (!adminToken) {
      throw new BadRequestException('No active impersonation session found')
    }

    const isSecure = request.secure || request.headers['x-forwarded-proto'] === 'https'
    const isProduction = process.env.NODE_ENV === 'production'
    const useSecureCookie = !!(isSecure || isProduction)
    const cookieName = useSecureCookie ? '__Host-access_token' : 'access_token'

    // Restore the admin token to the main cookie
    response.cookie(cookieName, adminToken, {
      httpOnly: true,
      secure: useSecureCookie,
      sameSite: 'lax',
      path: '/',
      maxAge: 20 * 60 * 1000, // 20 minutes
    })

    // Clear cookies
    response.clearCookie('admin_access_token', { path: '/' })
    response.clearCookie('is_impersonating', { path: '/' })

    return { success: true }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and clear session cookie' })
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('__Host-access_token', { path: '/', secure: true, httpOnly: true })
    response.clearCookie('access_token', { path: '/', secure: false, httpOnly: true })
    return { message: 'Logged out successfully' }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: AuthUser) {
    return { user }
  }
}
