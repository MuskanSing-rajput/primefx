import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { TicketPriority, TicketStatus, MessageSenderType } from '@prisma/client'

export interface CreateTicketDto {
  subject: string
  category: string
  priority?: TicketPriority
  message: string
}

export interface AddMessageDto {
  content: string
}

export interface UpdateTicketDto {
  status?: TicketStatus
  priority?: TicketPriority
}

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── BROKER METHODS ────────────────────────────────────────────────────────

  /**
   * Raises a new support ticket for a broker
   */
  async createTicket(brokerId: string, dto: CreateTicketDto) {
    if (!dto.subject || !dto.message) {
      throw new BadRequestException('Subject and message are required')
    }

    const count = await this.prisma.supportTicket.count()
    const ticketNumber = `TK-${1000 + count + 1}`

    const broker = await this.prisma.broker.findUnique({
      where: { id: brokerId },
      select: { companyName: true },
    })

    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          ticketNumber,
          brokerId,
          subject: dto.subject,
          category: dto.category || 'GENERAL',
          priority: dto.priority || TicketPriority.MEDIUM,
          status: TicketStatus.OPEN,
          lastMessageAt: new Date(),
          hasUnreadBrokerReply: true,
          hasUnreadAdminReply: false,
        },
      })

      const message = await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: MessageSenderType.BROKER,
          senderId: brokerId,
          senderName: broker?.companyName || 'Broker',
          content: dto.message,
        },
      })

      return {
        ticket,
        message,
      }
    })
  }

  /**
   * Get all tickets for a specific broker
   */
  async getBrokerTickets(brokerId: string, status?: string) {
    const where: any = { brokerId }
    if (status && status !== 'ALL') {
      where.status = status as TicketStatus
    }

    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    const openCount = await this.prisma.supportTicket.count({ where: { brokerId, status: { in: ['OPEN', 'IN_PROGRESS'] } } })
    const resolvedCount = await this.prisma.supportTicket.count({ where: { brokerId, status: 'RESOLVED' } })

    return {
      tickets,
      stats: {
        openCount,
        resolvedCount,
        total: tickets.length,
      },
    }
  }

  /**
   * Get full ticket details & conversation thread for a broker
   */
  async getBrokerTicketDetails(brokerId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, brokerId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found')
    }

    return ticket
  }

  /**
   * Add a broker reply to a ticket thread
   */
  async addBrokerMessage(brokerId: string, ticketId: string, dto: AddMessageDto) {
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('Message content cannot be empty')
    }

    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, brokerId },
      include: { broker: { select: { companyName: true } } },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found')
    }

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: {
          ticketId,
          senderType: MessageSenderType.BROKER,
          senderId: brokerId,
          senderName: ticket.broker.companyName,
          content: dto.content.trim(),
        },
      })

      // Re-open ticket if it was resolved/closed
      const newStatus = ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED
        ? TicketStatus.OPEN
        : ticket.status

      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: newStatus,
          lastMessageAt: new Date(),
          hasUnreadBrokerReply: true,
          hasUnreadAdminReply: false,
        },
      })

      return message
    })
  }

  /**
   * Broker marks ticket as resolved
   */
  async resolveBrokerTicket(brokerId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, brokerId },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found')
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    })
  }

  // ─── ADMIN METHODS ─────────────────────────────────────────────────────────

  /**
   * Get all tickets across all brokers for Super Admin
   */
  async getAllTickets(params: {
    status?: string
    priority?: string
    brokerId?: string
    search?: string
  }) {
    const where: any = {}
    if (params.status && params.status !== 'ALL') {
      where.status = params.status as TicketStatus
    }
    if (params.priority && params.priority !== 'ALL') {
      where.priority = params.priority as TicketPriority
    }
    if (params.brokerId && params.brokerId !== 'ALL') {
      where.brokerId = params.brokerId
    }
    if (params.search) {
      where.OR = [
        { ticketNumber: { contains: params.search, mode: 'insensitive' } },
        { subject: { contains: params.search, mode: 'insensitive' } },
        { broker: { companyName: { contains: params.search, mode: 'insensitive' } } },
      ]
    }

    const [tickets, openCount, urgentCount, resolvedCount] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          broker: { select: { id: true, companyName: true, email: true } },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.supportTicket.count({ where: { priority: 'URGENT', status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      this.prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
    ])

    return {
      tickets,
      stats: {
        openCount,
        urgentCount,
        resolvedCount,
        total: tickets.length,
      },
    }
  }

  /**
   * Get full ticket thread for Super Admin
   */
  async getAdminTicketDetails(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        broker: { select: { id: true, companyName: true, email: true, phone: true, country: true, regulatoryLicense: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found')
    }

    return ticket
  }

  /**
   * Super Admin reply to ticket
   */
  async addAdminMessage(adminId: string, ticketId: string, dto: AddMessageDto) {
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('Message content cannot be empty')
    }

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found')
    }

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: {
          ticketId,
          senderType: MessageSenderType.ADMIN,
          senderId: adminId,
          senderName: 'Super Admin Support',
          content: dto.content.trim(),
        },
      })

      // Auto-transition to IN_PROGRESS if ticket was OPEN
      const newStatus = ticket.status === TicketStatus.OPEN ? TicketStatus.IN_PROGRESS : ticket.status

      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: newStatus,
          lastMessageAt: new Date(),
          hasUnreadAdminReply: true,
          hasUnreadBrokerReply: false,
        },
      })

      return message
    })
  }

  /**
   * Super Admin update status or priority
   */
  async updateTicketStatus(ticketId: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found')
    }

    const data: any = {}
    if (dto.status) {
      data.status = dto.status
      if (dto.status === TicketStatus.RESOLVED) {
        data.resolvedAt = new Date()
      }
    }
    if (dto.priority) {
      data.priority = dto.priority
    }

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data,
    })
  }

  /**
   * Super Admin delete support ticket
   */
  async deleteTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    })

    if (!ticket) {
      throw new NotFoundException('Support ticket not found')
    }

    await this.prisma.supportTicket.delete({
      where: { id: ticketId },
    })

    return { success: true, message: 'Ticket deleted successfully' }
  }

  /**
   * Mark a support ticket's admin replies as read by the broker
   */
  async markBrokerTicketAsRead(brokerId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, brokerId },
    })
    if (!ticket) throw new NotFoundException('Support ticket not found')

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { hasUnreadAdminReply: false },
    })
  }

  /**
   * Mark a support ticket's broker replies as read by the admin
   */
  async markAdminTicketAsRead(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    })
    if (!ticket) throw new NotFoundException('Support ticket not found')

    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { hasUnreadBrokerReply: false },
    })
  }
}
