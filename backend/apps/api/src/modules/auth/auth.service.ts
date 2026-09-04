import { Injectable, UnauthorizedException, BadRequestException, ConflictException, NotFoundException, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import { PrismaService } from '../../database/prisma.service'
import { RedisService } from '../../redis/redis.service'
import { MailService } from '../mail/mail.service'
import { LoginInput, RegisterBrokerInput } from '@lp/validators'
import { UserRole } from '@lp/shared-types'

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  async login(dto: LoginInput) {
    // Check SuperAdmin first
    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: dto.email.toLowerCase() },
    })

    if (admin) {
      const isValid = await argon2.verify(admin.passwordHash, dto.password)
      if (!isValid) throw new UnauthorizedException('Invalid credentials')
      if (!admin.isActive) throw new UnauthorizedException('Account deactivated')

      const token = this.jwtService.sign({
        sub: admin.id,
        email: admin.email,
        role: UserRole.SUPER_ADMIN,
      })

      return {
        accessToken: token,
        user: { id: admin.id, email: admin.email, role: UserRole.SUPER_ADMIN },
      }
    }

    // Check Broker
    const broker = await this.prisma.broker.findUnique({
      where: { email: dto.email.toLowerCase() },
    })

    if (broker) {
      const isValid = await argon2.verify(broker.passwordHash, dto.password)
      if (!isValid) throw new UnauthorizedException('Invalid credentials')
      if (broker.status === 'PENDING') throw new UnauthorizedException('Your broker application is pending review.')
      if (broker.status === 'SUSPENDED') throw new UnauthorizedException('Account suspended')
      if (broker.status === 'REJECTED') throw new UnauthorizedException('Account application rejected')

      const token = this.jwtService.sign({
        sub: broker.id,
        email: broker.email,
        role: UserRole.BROKER,
      })

      return {
        accessToken: token,
        user: { id: broker.id, email: broker.email, role: UserRole.BROKER },
      }
    }

    throw new UnauthorizedException('Invalid credentials')
  }

  async sendOtp(email: string) {
    const emailLower = email.toLowerCase()

    // Check if email already registered
    const existing = await this.prisma.broker.findUnique({
      where: { email: emailLower },
    })
    if (existing) throw new ConflictException('Email already registered')

    // Rate limit OTP generation requests to 1 request per 60 seconds
    const rateLimitKey = `otp:ratelimit:${emailLower}`
    const isAllowed = await this.redisService.checkRateLimit(rateLimitKey, 1, 60000)
    if (!isAllowed) {
      throw new BadRequestException('Please wait 60 seconds before requesting another verification code.')
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // Store in Redis (TTL 5 minutes)
    await this.redisService.set(`otp:signup:${emailLower}`, otp, 300)
    // Clear attempts counter
    await this.redisService.del(`otp:attempts:${emailLower}`)

    // Send email using MailService
    await this.mailService.sendOtp(emailLower, otp)

    return {
      success: true,
      message: 'Verification code sent to your email.',
    }
  }

  async verifyOtp(email: string, otp: string) {
    const emailLower = email.toLowerCase()
    const storedOtp = await this.redisService.get(`otp:signup:${emailLower}`)

    if (!storedOtp) {
      throw new BadRequestException('Verification code has expired or is invalid. Please request a new code.')
    }

    if (storedOtp !== otp) {
      // Increment attempts
      const attemptsKey = `otp:attempts:${emailLower}`
      const attemptsVal = await this.redisService.get(attemptsKey)
      const attempts = attemptsVal ? parseInt(attemptsVal, 10) + 1 : 1

      if (attempts >= 5) {
        await this.redisService.del(`otp:signup:${emailLower}`)
        await this.redisService.del(attemptsKey)
        throw new BadRequestException('Too many invalid attempts. Please request a new verification code.')
      }

      await this.redisService.set(attemptsKey, attempts.toString(), 300)
      throw new BadRequestException(`Invalid verification code. ${5 - attempts} attempts remaining.`)
    }

    // Success: store verification flag (TTL 15 minutes)
    await this.redisService.set(`email_verified:${emailLower}`, 'true', 900)

    // Clear OTP keys
    await this.redisService.del(`otp:signup:${emailLower}`)
    await this.redisService.del(`otp:attempts:${emailLower}`)

    return {
      success: true,
      message: 'Email verified successfully.',
    }
  }

  async registerBroker(dto: RegisterBrokerInput) {
    const emailLower = dto.email.toLowerCase()

    // Verify email verification flag in Redis
    const isVerified = await this.redisService.get(`email_verified:${emailLower}`)
    if (isVerified !== 'true') {
      throw new BadRequestException('Email verification is required. Please verify your email first.')
    }

    const existing = await this.prisma.broker.findUnique({
      where: { email: emailLower },
    })
    if (existing) throw new ConflictException('Email already registered')

    const passwordHash = await argon2.hash(dto.password)

    const broker = await this.prisma.broker.create({
      data: {
        companyName: dto.companyName,
        contactName: dto.contactName,
        email: emailLower,
        passwordHash,
        phone: dto.phone,
        country: dto.country,
        regulatoryLicense: dto.regulatoryLicense ?? null,
        businessTaxId: dto.businessTaxId,
        entityType: dto.entityType,
        kycDocuments: dto.kycDocuments ?? [],
        agreementAccepted: dto.agreementAccepted,
        agreementAcceptedAt: new Date(),
        status: 'PENDING',
      },
    })

    // Consume verification flag
    await this.redisService.del(`email_verified:${emailLower}`)

    // Send Welcome Email
    try {
      await this.mailService.sendWelcomeEmail(broker.email, broker.companyName)
    } catch (e: any) {
      this.logger.error(`Welcome email failed to send: ${e.message}`)
    }

    return {
      id: broker.id,
      companyName: broker.companyName,
      email: broker.email,
      status: broker.status,
      message: 'Registration submitted successfully. Pending admin verification.',
    }
  }

  async checkForgotPasswordMfa(email: string) {
    const emailLower = email.toLowerCase()

    // 1. Check Broker table
    const broker = await this.prisma.broker.findUnique({
      where: { email: emailLower },
    })
    if (broker) {
      if (broker.status === 'SUSPENDED') {
        throw new BadRequestException('Your broker account is suspended. Please contact support.')
      }
      if (broker.status === 'REJECTED') {
        throw new BadRequestException('Your broker registration application was rejected.')
      }
      return { mfaEnabled: broker.mfaEnabled }
    }

    // 2. Check SuperAdmin table
    const admin = await this.prisma.superAdmin.findUnique({
      where: { email: emailLower },
    })
    if (admin) {
      if (!admin.isActive) {
        throw new BadRequestException('Your administrator account is inactive.')
      }
      return { mfaEnabled: admin.mfaEnabled }
    }

    throw new NotFoundException('Account with this email does not exist.')
  }

  async sendForgotPasswordOtp(email: string) {
    const emailLower = email.toLowerCase()

    // Verify user exists (re-run check internally)
    await this.checkForgotPasswordMfa(emailLower)

    // Rate limit OTP generation requests to 1 request per 60 seconds
    const rateLimitKey = `otp:password-reset:ratelimit:${emailLower}`
    const isAllowed = await this.redisService.checkRateLimit(rateLimitKey, 1, 60000)
    if (!isAllowed) {
      throw new BadRequestException('Please wait 60 seconds before requesting another verification code.')
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // Store in Redis (TTL 5 minutes)
    await this.redisService.set(`otp:password-reset:${emailLower}`, otp, 300)
    // Clear attempts counter
    await this.redisService.del(`otp:password-reset:attempts:${emailLower}`)

    // Send email using MailService
    await this.mailService.sendForgotPasswordOtp(emailLower, otp)

    return {
      success: true,
      message: 'Verification code sent to your email.',
    }
  }

  async resetPassword(email: string, method: '2FA' | 'EMAIL', code: string, password: string) {
    const emailLower = email.toLowerCase()

    // 1. Password strength checks
    if (!password || password.length < 12 || password.length > 128 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      throw new BadRequestException('Password must be 12-128 characters, containing uppercase, lowercase, and a number.')
    }

    // 2. Find matching account (Broker or Admin)
    const broker = await this.prisma.broker.findUnique({ where: { email: emailLower } })
    const admin = await this.prisma.superAdmin.findUnique({ where: { email: emailLower } })

    if (!broker && !admin) {
      throw new NotFoundException('Account with this email does not exist.')
    }

    // 3. Verify Code
    if (method === '2FA') {
      const isMfaEnabled = broker ? broker.mfaEnabled : admin?.mfaEnabled
      const secret = broker ? broker.mfaSecret : admin?.mfaSecret

      if (!isMfaEnabled || !secret) {
        throw new BadRequestException('2FA is not enabled on this account. Please verify via Email OTP instead.')
      }

      const { verifyTotp } = await import('../../common/utils/totp')
      const isValid = verifyTotp(code, secret)
      if (!isValid) {
        throw new BadRequestException('Invalid 2FA authorization token')
      }
    } else if (method === 'EMAIL') {
      const storedOtp = await this.redisService.get(`otp:password-reset:${emailLower}`)

      if (!storedOtp) {
        throw new BadRequestException('Verification code has expired or is invalid. Please request a new code.')
      }

      if (storedOtp !== code) {
        const attemptsKey = `otp:password-reset:attempts:${emailLower}`
        const attemptsVal = await this.redisService.get(attemptsKey)
        const attempts = attemptsVal ? parseInt(attemptsVal, 10) + 1 : 1

        if (attempts >= 5) {
          await this.redisService.del(`otp:password-reset:${emailLower}`)
          await this.redisService.del(attemptsKey)
          throw new BadRequestException('Too many invalid attempts. Please request a new verification code.')
        }

        await this.redisService.set(attemptsKey, attempts.toString(), 300)
        throw new BadRequestException(`Invalid verification code. ${5 - attempts} attempts remaining.`)
      }

      // Success: Clear OTP keys from Redis
      await this.redisService.del(`otp:password-reset:${emailLower}`)
      await this.redisService.del(`otp:password-reset:attempts:${emailLower}`)
    } else {
      throw new BadRequestException('Invalid verification method.')
    }

    // 4. Update password
    const passwordHash = await argon2.hash(password)

    if (broker) {
      await this.prisma.broker.update({
        where: { id: broker.id },
        data: { passwordHash },
      })
    } else if (admin) {
      await this.prisma.superAdmin.update({
        where: { id: admin.id },
        data: { passwordHash },
      })
    }

    return {
      success: true,
      message: 'Password changed successfully. You can now log in with your new credentials.',
    }
  }

  async refreshToken(user: { id: string; email: string; role: string }): Promise<string> {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    })
  }
}
