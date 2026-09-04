import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Currency } from '@lp/shared-types'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name)

  // Configure public RPC nodes for Ethereum verification
  private readonly ethRpcUrl = 'https://cloudflare-eth.com'

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifies an on-chain transaction hash for the specified cryptocurrency,
   * checking the receiver wallet address, token contract (if ERC20), amount, and status.
   */
  async verifyTransaction(
    txHash: string,
    currency: Currency,
    expectedAmount: number,
    network?: string,
  ): Promise<{ verified: boolean; actualAmount: number }> {
    this.logger.log(`Starting on-chain verification for ${currency} (${network}) tx: ${txHash}`)

    // 1. Fetch deposit addresses from database
    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: ['usdt_trc20_address', 'usdt_erc20_address'] },
      },
    })
    const trc20Addr = settings.find((s) => s.key === 'usdt_trc20_address')?.value || ''
    const erc20Addr = settings.find((s) => s.key === 'usdt_erc20_address')?.value || ''

    try {
      if (currency === Currency.USDT) {
        if (network === 'TRC20') {
          if (!trc20Addr) throw new Error('TRC20 receiving address is not configured by administrator')
          return await this.verifyTronTRC20(txHash, trc20Addr, expectedAmount)
        } else {
          // Default to ERC20
          if (!erc20Addr) throw new Error('ERC20 receiving address is not configured by administrator')
          return await this.verifyEthereumERC20(
            txHash,
            erc20Addr,
            '0xdac17f958d2ee523a2206206994597c13d831ec7', // Standard ERC20 USDT Address
            6, // 6 decimals for USDT
            expectedAmount,
          )
        }
      }

      // Other fallback currencies
      const depositAddr = this.config.get<string>(`${currency}_DEPOSIT_ADDRESS`)
      if (!depositAddr) {
        throw new Error(`${currency} deposit address is not configured in settings or environment`)
      }

      switch (currency) {
        case Currency.USDC:
          return await this.verifyEthereumERC20(
            txHash,
            depositAddr,
            '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Standard ERC20 USDC Address
            6, // 6 decimals for USDC
            expectedAmount,
          )

        case Currency.ETH:
          return await this.verifyEthereumNative(txHash, depositAddr, expectedAmount)

        case Currency.BTC:
          return await this.verifyBitcoin(txHash, depositAddr, expectedAmount)

        default:
          throw new BadRequestException(`Unsupported deposit currency: ${currency}`)
      }
    } catch (err: any) {
      this.logger.error(`Blockchain verification failed for tx ${txHash}: ${err.message}`)
      throw new BadRequestException(`On-chain transaction verification failed: ${err.message}`)
    }
  }

  /**
   * Ethereum Native (ETH) Verification via standard JSON-RPC.
   */
  private async verifyEthereumNative(txHash: string, expectedTo: string, expectedAmount: number) {
    const tx = await this.queryEthRpc('eth_getTransactionByHash', [txHash])
    if (!tx || !tx.to) throw new Error('Transaction not found or invalid')

    const receipt = await this.queryEthRpc('eth_getTransactionReceipt', [txHash])
    if (!receipt) throw new Error('Transaction receipt not found')
    if (receipt.status !== '0x1') throw new Error('Transaction failed on-chain')

    // Verify receiver
    if (tx.to.toLowerCase() !== expectedTo.toLowerCase()) {
      throw new Error(`Receiver address mismatch. Expected ${expectedTo}, got ${tx.to}`)
    }

    // Convert hex value (wei) to ETH
    const wei = BigInt(tx.value)
    const actualAmount = Number(wei) / 1e18

    // For safety, allow small rounding diff
    if (Math.abs(actualAmount - expectedAmount) > 0.001) {
      throw new Error(`Amount mismatch. Expected ${expectedAmount} ETH, detected ${actualAmount} ETH`)
    }

    return { verified: true, actualAmount }
  }

  /**
   * Ethereum ERC-20 (USDT / USDC) Token Verification.
   * Parses Transfer logs (topic0: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef).
   */
  private async verifyEthereumERC20(txHash: string, expectedTo: string, contractAddress: string, decimals: number, expectedAmount: number) {
    const receipt = await this.queryEthRpc('eth_getTransactionReceipt', [txHash])
    if (!receipt) throw new Error('Transaction receipt not found')
    if (receipt.status !== '0x1') throw new Error('Transaction failed on-chain')

    // Verify contract address matches token
    if (receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
      throw new Error(`Token contract mismatch. Expected ${contractAddress}, got ${receipt.to}`)
    }

    // Find the standard Transfer log topic
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    const transferLog = receipt.logs?.find((log: any) => log.topics?.[0] === transferTopic)
    if (!transferLog) throw new Error('ERC20 Transfer event log not found in receipt')

    // Parse receiver from topic2 (indexed to)
    const receiverTopic = transferLog.topics[2]
    if (!receiverTopic) throw new Error('Receiver topic not found in Transfer log')
    const parsedReceiver = '0x' + receiverTopic.slice(-40)

    if (parsedReceiver.toLowerCase() !== expectedTo.toLowerCase()) {
      throw new Error(`Token receiver mismatch. Expected ${expectedTo}, got ${parsedReceiver}`)
    }

    // Parse transfer value from log data
    const rawVal = BigInt(transferLog.data)
    const actualAmount = Number(rawVal) / Math.pow(10, decimals)

    if (Math.abs(actualAmount - expectedAmount) > 0.01) {
      throw new Error(`Amount mismatch. Expected ${expectedAmount}, detected ${actualAmount}`)
    }

    return { verified: true, actualAmount }
  }

  /**
   * Bitcoin Verification using public Blockstream block explorer API.
   */
  private async verifyBitcoin(txHash: string, expectedTo: string, expectedAmount: number) {
    const res = await fetch(`https://blockstream.info/api/tx/${txHash}`)
    if (!res.ok) throw new Error(`Blockstream explorer request failed with status: ${res.status}`)

    const tx = await res.json() as any
    if (!tx || !tx.status?.confirmed) throw new Error('Bitcoin transaction is unconfirmed or invalid')

    // Find output destination matching our wallet
    const output = tx.vout?.find((out: any) => out.scriptpubkey_address === expectedTo)
    if (!output) throw new Error(`Bitcoin output matching destination address ${expectedTo} not found`)

    // Convert satoshis to BTC
    const actualAmount = output.value / 1e8

    if (Math.abs(actualAmount - expectedAmount) > 0.0001) {
      throw new Error(`BTC amount mismatch. Expected ${expectedAmount}, got ${actualAmount}`)
    }

    return { verified: true, actualAmount }
  }

  private async verifyTronTRC20(txHash: string, expectedTo: string, expectedAmount: number) {
    this.logger.log(`Querying Tronscan API for TRC20 verification: ${txHash}`)
    const res = await fetch(`https://apilist.tronscan.org/api/transaction-info?hash=${txHash}`)
    if (!res.ok) throw new Error(`Tronscan API request failed: ${res.status}`)

    const tx = await res.json() as any
    if (!tx) throw new Error('Transaction not found on Tron network')
    if (tx.contractRet !== 'SUCCESS') throw new Error('Tron transaction failed or reverted')
    if (!tx.confirmed) throw new Error('Tron transaction is not confirmed yet')

    // USDT contract address on Tron Mainnet is TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
    const USDT_TRON_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

    // Look for transfer details in trc20TransferInfo
    const transfers = tx.trc20TransferInfo || []
    const usdtTransfer = transfers.find((t: any) => 
      t.contract_address === USDT_TRON_CONTRACT &&
      t.to_address.toLowerCase() === expectedTo.toLowerCase()
    )

    if (!usdtTransfer) {
      throw new Error(`USDT transfer to address ${expectedTo} not found in Tron transaction`)
    }

    const decimals = usdtTransfer.decimals || 6
    const actualAmount = Number(usdtTransfer.amount_str) / Math.pow(10, decimals)

    if (Math.abs(actualAmount - expectedAmount) > 0.01) {
      throw new Error(`TRC20 amount mismatch. Expected ${expectedAmount}, detected ${actualAmount}`)
    }

    return { verified: true, actualAmount }
  }

  /**
   * Helper to query standard Ethereum JSON-RPC.
   */
  private async queryEthRpc(method: string, params: any[]): Promise<any> {
    const res = await fetch(this.ethRpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    if (!res.ok) throw new Error(`Ethereum RPC ${method} failed: ${res.statusText}`)
    const body = await res.json() as any
    if (body.error) throw new Error(`Ethereum RPC ${method} response error: ${body.error.message}`)
    return body.result
  }
}
