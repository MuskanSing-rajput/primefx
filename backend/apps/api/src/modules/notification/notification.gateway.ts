import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WS_NAMESPACES, WS_EVENTS } from '@lp/constants'
import { PrismaService } from '../../database/prisma.service'

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: WS_NAMESPACES.PRICES,
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name)

  constructor(private readonly prisma: PrismaService) {}

  @WebSocketServer()
  server!: Server

  async handleConnection(client: Socket) {
    const apiKey = (client.handshake.query.apiKey as string) || (client.handshake.headers['x-api-key'] as string)
    if (!apiKey) {
      this.logger.warn(`Connection attempt rejected: Missing API Key for client ${client.id}`)
      client.disconnect(true)
      return
    }

    try {
      const credential = await this.prisma.brokerApiCredential.findUnique({
        where: { apiKey },
        include: { broker: true },
      })

      if (!credential || !credential.isActive || credential.broker.status !== 'APPROVED') {
        this.logger.warn(`Connection attempt rejected: Invalid or inactive API Key for client ${client.id}`)
        client.disconnect(true)
        return
      }

      client.data = { brokerId: credential.brokerId }
      // Join the broker's private room — all markup-applied prices will be sent here
      client.join(`broker:${credential.brokerId}`)
      this.logger.log(`Broker "${credential.broker.companyName}" connected to WebSocket prices: ${client.id}`)
    } catch (err) {
      this.logger.error(`Error during connection authentication: ${err}`)
      client.disconnect(true)
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from WebSocket prices: ${client.id}`)
  }

  @SubscribeMessage(WS_EVENTS.SUBSCRIBE_PRICES)
  handleSubscribePrices(
    @ConnectedSocket() client: Socket,
    @MessageBody() symbols: string[],
  ) {
    if (Array.isArray(symbols)) {
      symbols.forEach((symbol) => client.join(`price:${symbol}`))
      return { event: 'subscribed', symbols }
    }
  }

  // Broadcast price update to all connected clients & symbol room
  broadcastPriceUpdate(symbol: string, bid: string, ask: string) {
    if (!this.server) return
    const spread = (parseFloat(ask) - parseFloat(bid)).toFixed(5)
    const payload = {
      symbol,
      bid,
      ask,
      spread,
      timestamp: Date.now(),
    }
    this.server.emit(WS_EVENTS.PRICE_UPDATE, payload)
    this.server.to(`price:${symbol}`).emit(WS_EVENTS.PRICE_UPDATE, payload)
  }

  // Broadcast position PnL update to a broker's room
  broadcastPositionUpdate(brokerId: string, positionId: string, floatingPnl: string, currentPrice: string) {
    if (!this.server) return
    this.server.to(`broker:${brokerId}`).emit(WS_EVENTS.POSITION_UPDATE, {
      positionId,
      floatingPnl,
      currentPrice,
      timestamp: Date.now(),
    })
  }

  // Broadcast LP-markup-applied price to a specific broker's room.
  // This is the authoritative price the CRM should use.
  broadcastBrokerPrice(
    brokerId: string,
    symbol: string,
    bid: string,
    ask: string,
    rawBid: string,
    rawAsk: string,
    markupPips: number,
  ) {
    if (!this.server) return
    const spread = (parseFloat(ask) - parseFloat(bid)).toFixed(5)
    const rawSpread = (parseFloat(rawAsk) - parseFloat(rawBid)).toFixed(5)
    this.server.to(`broker:${brokerId}`).emit(WS_EVENTS.PRICE_UPDATE, {
      symbol,
      bid,
      ask,
      spread,
      rawBid,
      rawAsk,
      rawSpread,
      markupPips,
      timestamp: Date.now(),
    })
  }
}
