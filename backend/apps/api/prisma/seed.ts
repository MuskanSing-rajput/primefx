import { PrismaClient, SymbolCategory, OrderSide, OrderType, OrderStatus, PositionStatus, TransactionType, TransactionStatus, CreditAction, Currency } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Cleaning existing database data...')
  
  // Clean in correct dependency order
  await prisma.auditLog.deleteMany()
  await prisma.systemSetting.deleteMany()
  await prisma.position.deleteMany()
  await prisma.order.deleteMany()
  await prisma.tradingClient.deleteMany()
  await prisma.profileSymbolOverride.deleteMany()
  await prisma.pricingProfile.deleteMany()
  await prisma.brokerApiCredential.deleteMany()
  await prisma.walletTransaction.deleteMany()
  await prisma.creditLog.deleteMany()
  await prisma.wallet.deleteMany()
  await prisma.broker.deleteMany()
  await prisma.executionAccount.deleteMany()

  console.log('🌱 Seeding rich database sample data...')

  // 1. Create Super Admin
  const adminEmail = 'admin@primeliquidfx.com'
  const adminPassword = 'admin_password_123'
  const passwordHash = await argon2.hash(adminPassword)

  const admin = await prisma.superAdmin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      isActive: true,
    },
  })
  console.log(`✅ Super Admin: ${admin.email}`)

  // 2. Create Default Trading Symbols
  const symbols = [
    {
      name: 'EURUSD',
      displayName: 'EUR/USD',
      category: SymbolCategory.FOREX,
      baseCurrency: 'EUR',
      quoteCurrency: 'USD',
      digits: 5,
      contractSize: 100000,
      minVolume: 0.01,
      maxVolume: 100.0,
      stepVolume: 0.01,
      rawSpread: 0.00010,
      rawCommission: 3.50,
      rawSwapLong: -5.50,
      rawSwapShort: 1.50,
      tradingSessionStart: '00:00',
      tradingSessionEnd: '23:59',
    },
    {
      name: 'GBPUSD',
      displayName: 'GBP/USD',
      category: SymbolCategory.FOREX,
      baseCurrency: 'GBP',
      quoteCurrency: 'USD',
      digits: 5,
      contractSize: 100000,
      minVolume: 0.01,
      maxVolume: 100.0,
      stepVolume: 0.01,
      rawSpread: 0.00015,
      rawCommission: 3.50,
      rawSwapLong: -6.50,
      rawSwapShort: 2.00,
      tradingSessionStart: '00:00',
      tradingSessionEnd: '23:59',
    },
    {
      name: 'USDJPY',
      displayName: 'USD/JPY',
      category: SymbolCategory.FOREX,
      baseCurrency: 'USD',
      quoteCurrency: 'JPY',
      digits: 3,
      contractSize: 100000,
      minVolume: 0.01,
      maxVolume: 100.0,
      stepVolume: 0.01,
      rawSpread: 0.015,
      rawCommission: 3.50,
      rawSwapLong: -3.50,
      rawSwapShort: 0.50,
      tradingSessionStart: '00:00',
      tradingSessionEnd: '23:59',
    },
    {
      name: 'XAUUSD',
      displayName: 'Gold / USD',
      category: SymbolCategory.CFD,
      baseCurrency: 'XAU',
      quoteCurrency: 'USD',
      digits: 2,
      contractSize: 100,
      minVolume: 0.01,
      maxVolume: 50.0,
      stepVolume: 0.01,
      rawSpread: 0.15,
      rawCommission: 5.00,
      rawSwapLong: -12.50,
      rawSwapShort: 6.00,
      tradingSessionStart: '00:00',
      tradingSessionEnd: '23:59',
    },
  ]

  const seededSymbols = []
  for (const s of symbols) {
    const sym = await prisma.tradingSymbol.upsert({
      where: { name: s.name },
      update: {},
      create: {
        name: s.name,
        displayName: s.displayName,
        category: s.category,
        baseCurrency: s.baseCurrency,
        quoteCurrency: s.quoteCurrency,
        digits: s.digits,
        contractSize: s.contractSize,
        minVolume: s.minVolume,
        maxVolume: s.maxVolume,
        stepVolume: s.stepVolume,
        rawSpread: s.rawSpread,
        rawCommission: s.rawCommission,
        rawSwapLong: s.rawSwapLong,
        rawSwapShort: s.rawSwapShort,
        tradingSessionStart: s.tradingSessionStart,
        tradingSessionEnd: s.tradingSessionEnd,
        isActive: true,
      },
    })
    seededSymbols.push(sym)
  }
  console.log('✅ Default symbols seeded')

  // 3. Create Execution Account (LP pool backend)
  const execAcc = await prisma.executionAccount.create({
    data: {
      accountName: 'Liquidity Provider Pool Alpha',
      provider: 'MetaTrader 5 LP Gateway',
      accountNumber: '99021033',
      serverAddress: 'mt5.primeliquidfx.com:443',
      credentials: JSON.stringify({ apiToken: 'prod-sec-gw-token-55113' }),
      status: 'active',
      maxExposure: 5000000.0,
    },
  })
  console.log(`✅ Execution Account: ${execAcc.accountName}`)

  // 4. Create Active Broker
  const brokerEmail = 'broker@primeliquidfx.com'
  const brokerPassword = 'broker_password_123'
  const brokerPasswordHash = await argon2.hash(brokerPassword)

  const activeBroker = await prisma.broker.upsert({
    where: { email: brokerEmail },
    update: {},
    create: {
      email: brokerEmail,
      companyName: 'Apex FX Markets',
      contactName: 'John Doe',
      passwordHash: brokerPasswordHash,
      phone: '+1 415 990 2210',
      country: 'United Kingdom',
      regulatoryLicense: 'FCA License No. 448102',
      status: 'APPROVED',
      agreementAccepted: true,
      agreementAcceptedAt: new Date(),
      apiEnabled: true,
      executionAccountId: execAcc.id,
      approvedAt: new Date(),
    },
  })
  console.log(`✅ Active Broker: ${activeBroker.email}`)

  // 5. Create Pending Broker
  const pendingEmail = 'pending_broker@primeliquidfx.com'
  const pendingBroker = await prisma.broker.upsert({
    where: { email: pendingEmail },
    update: {},
    create: {
      email: pendingEmail,
      companyName: 'Prime FX Global',
      contactName: 'Alice Smith',
      passwordHash: brokerPasswordHash,
      phone: '+44 20 7946 0958',
      country: 'Cyprus',
      regulatoryLicense: 'CySEC License No. 902188',
      status: 'PENDING',
      agreementAccepted: false,
    },
  })
  console.log(`✅ Pending Broker: ${pendingBroker.email}`)

  // 6. Create Wallet & Transactions for Active Broker
  const activeWallet = await prisma.wallet.create({
    data: {
      brokerId: activeBroker.id,
      balanceUSDT: 150000.0,
      balanceBTC: 2.5,
      balanceETH: 15.0,
      balanceUSDC: 25000.0,
      totalCreditUSD: 50000.0,
      availableCreditUSD: 50000.0,
    },
  })

  // Pending Broker Wallet
  await prisma.wallet.create({
    data: {
      brokerId: pendingBroker.id,
      balanceUSDT: 0,
      totalCreditUSD: 0,
    },
  })

  // Wallet Transactions
  await prisma.walletTransaction.createMany({
    data: [
      {
        walletId: activeWallet.id,
        type: TransactionType.DEPOSIT,
        currency: Currency.USDT,
        amount: 100000.0,
        amountUSD: 100000.0,
        status: TransactionStatus.COMPLETED,
        txHash: '0x32ba...114f',
        processedBy: admin.id,
        processedAt: new Date(),
      },
      {
        walletId: activeWallet.id,
        type: TransactionType.DEPOSIT,
        currency: Currency.USDC,
        amount: 50000.0,
        amountUSD: 50000.0,
        status: TransactionStatus.COMPLETED,
        txHash: '0x99ef...aa1b',
        processedBy: admin.id,
        processedAt: new Date(),
      },
      {
        walletId: activeWallet.id,
        type: TransactionType.WITHDRAWAL,
        currency: Currency.USDT,
        amount: 5000.0,
        amountUSD: 5000.0,
        status: TransactionStatus.PENDING,
        adminNote: 'Waiting for compliance check.',
      },
    ],
  })

  // Credit Log
  await prisma.creditLog.create({
    data: {
      walletId: activeWallet.id,
      action: CreditAction.ALLOCATE,
      amount: 50000.0,
      reason: 'Standard credit cushion for new broker.',
      previousBalance: 0,
      newBalance: 50000.0,
      triggeredBy: admin.id,
    },
  })
  console.log('✅ Wallets & Transactions seeded')

  // 7. Create Pricing Profile for Active Broker
  const defaultProfile = await prisma.pricingProfile.create({
    data: {
      brokerId: activeBroker.id,
      name: 'Standard Spread Profile',
      spreadMarkup: 0.00002, // +0.2 pips
      commissionMarkup: 1.00,
      swapMarkupLong: 0.00,
      swapMarkupShort: 0.00,
      isDefault: true,
    },
  })

  // Symbol overrides in pricing profile
  const eurusdSymbol = seededSymbols.find(s => s.name === 'EURUSD')
  if (eurusdSymbol) {
    await prisma.profileSymbolOverride.create({
      data: {
        profileId: defaultProfile.id,
        symbolId: eurusdSymbol.id,
        spreadMarkup: 0.00001, // lower markup for EURUSD
        commissionOverride: 0.50,
      },
    })
  }
  console.log('✅ Pricing profiles seeded')

  // 8. Create Trading Clients
  const client1 = await prisma.tradingClient.create({
    data: {
      brokerId: activeBroker.id,
      externalClientId: 'MT5_100958',
      firstName: 'Michael',
      lastName: 'Jordan',
      email: 'mj@bulls.com',
      leverage: 200,
      accountType: 'raw_spread',
      currency: 'USD',
    },
  })

  const client2 = await prisma.tradingClient.create({
    data: {
      brokerId: activeBroker.id,
      externalClientId: 'MT5_100959',
      firstName: 'LeBron',
      lastName: 'James',
      email: 'kingjames@lakers.com',
      leverage: 100,
      accountType: 'standard',
      currency: 'USD',
    },
  })
  console.log('✅ Trading clients seeded')

  // 9. Orders & Positions
  const gbpusdSymbol = seededSymbols.find(s => s.name === 'GBPUSD')
  if (eurusdSymbol && gbpusdSymbol) {
    // Client 1 - Completed Order & Position
    const order1 = await prisma.order.create({
      data: {
        brokerId: activeBroker.id,
        clientId: client1.id,
        executionAccountId: execAcc.id,
        symbolId: eurusdSymbol.id,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        requestedVolume: 5.0,
        filledVolume: 5.0,
        requestedPrice: 1.08500,
        executionPrice: 1.08502,
        slippage: 0.2,
        status: OrderStatus.FILLED,
        priceValidationPassed: true,
        pricingProfileId: defaultProfile.id,
        openedAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    })

    await prisma.position.create({
      data: {
        brokerId: activeBroker.id,
        clientId: client1.id,
        symbolId: eurusdSymbol.id,
        executionAccountId: execAcc.id,
        orderId: order1.id,
        side: OrderSide.BUY,
        volume: 5.0,
        openPrice: 1.08502,
        currentPrice: 1.08545,
        floatingPnl: 215.00, // profit
        commission: -22.50,
        swap: -3.50,
        status: PositionStatus.OPEN,
        openedAt: new Date(Date.now() - 3600000),
      },
    })

    // Client 2 - Order & Short Position
    const order2 = await prisma.order.create({
      data: {
        brokerId: activeBroker.id,
        clientId: client2.id,
        executionAccountId: execAcc.id,
        symbolId: gbpusdSymbol.id,
        side: OrderSide.SELL,
        type: OrderType.MARKET,
        requestedVolume: 2.0,
        filledVolume: 2.0,
        requestedPrice: 1.26400,
        executionPrice: 1.26398,
        slippage: -0.2,
        status: OrderStatus.FILLED,
        priceValidationPassed: true,
        pricingProfileId: defaultProfile.id,
        openedAt: new Date(Date.now() - 7200000), // 2 hours ago
      },
    })

    await prisma.position.create({
      data: {
        brokerId: activeBroker.id,
        clientId: client2.id,
        symbolId: gbpusdSymbol.id,
        executionAccountId: execAcc.id,
        orderId: order2.id,
        side: OrderSide.SELL,
        volume: 2.0,
        openPrice: 1.26398,
        currentPrice: 1.26450,
        floatingPnl: -104.00, // loss
        commission: -10.00,
        swap: 0.50,
        status: PositionStatus.OPEN,
        openedAt: new Date(Date.now() - 7200000),
      },
    })

    // Closed position (historical)
    const closedOrder = await prisma.order.create({
      data: {
        brokerId: activeBroker.id,
        clientId: client1.id,
        executionAccountId: execAcc.id,
        symbolId: eurusdSymbol.id,
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        requestedVolume: 1.0,
        filledVolume: 1.0,
        requestedPrice: 1.08200,
        executionPrice: 1.08201,
        status: OrderStatus.FILLED,
        priceValidationPassed: true,
        openedAt: new Date(Date.now() - 86400000), // 1 day ago
        closedAt: new Date(Date.now() - 82800000),
      },
    })

    await prisma.position.create({
      data: {
        brokerId: activeBroker.id,
        clientId: client1.id,
        symbolId: eurusdSymbol.id,
        executionAccountId: execAcc.id,
        orderId: closedOrder.id,
        side: OrderSide.BUY,
        volume: 1.0,
        openPrice: 1.08201,
        currentPrice: 1.08351, // closed at 1.08351
        floatingPnl: 0.00,
        closedPnl: 150.00, // closed profit
        commission: -4.50,
        swap: -1.20,
        status: PositionStatus.CLOSED,
        openedAt: new Date(Date.now() - 86400000),
        closedAt: new Date(Date.now() - 82800000),
      },
    })
  }
  console.log('✅ Orders & Positions seeded')

  // 10. System Settings
  await prisma.systemSetting.createMany({
    data: [
      { key: 'global:risk:maxBrokerLeverage', value: '500', category: 'risk', updatedBy: admin.id },
      { key: 'global:risk:autoLiquidateLevel', value: '0.20', category: 'risk', updatedBy: admin.id },
      { key: 'global:risk:maxPositionSizeLots', value: '200', category: 'risk', updatedBy: admin.id },
      { key: 'global:markup:defaultSpreadPip', value: '0.00003', category: 'markup', updatedBy: admin.id },
    ],
  })

  // 11. Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        entityType: 'Broker',
        entityId: activeBroker.id,
        action: 'APPROVE',
        performedBy: admin.id,
        performedByRole: 'super_admin',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Console Seeder',
        newData: { status: 'APPROVED' },
      },
      {
        entityType: 'Wallet',
        entityId: activeWallet.id,
        action: 'CREDIT_ALLOCATE',
        performedBy: admin.id,
        performedByRole: 'super_admin',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 Console Seeder',
        newData: { amount: 50000.0 },
      },
    ],
  })
  console.log('✅ Audit & settings seeded')

  console.log('🎉 Seeding successfully completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
