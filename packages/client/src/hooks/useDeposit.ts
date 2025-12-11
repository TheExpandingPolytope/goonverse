import { useState, useCallback } from 'react'
import { useWriteContract } from 'wagmi'
import { parseEther, decodeEventLog } from 'viem'
import { useWallet } from './useWallet'
import { env } from '@/lib/env'
import { WorldAbi } from '@/lib/contracts/WorldAbi'
import { serverIdToBytes32 } from '@/lib/contracts/worldContract'

export type DepositState = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

export interface DepositResult {
  txHash: `0x${string}`
  depositId: `0x${string}`
  spawnAmount: bigint
  worldAmount: bigint
  rakeAmount: bigint
}

export interface UseDepositReturn {
  /** Current state of the deposit flow */
  state: DepositState
  /** Error message if state is 'error' */
  error: string | null
  /** The deposit result after successful deposit */
  result: DepositResult | null
  /** Execute a deposit transaction */
  deposit: (serverId: string, buyInEth: number) => Promise<DepositResult | null>
  /** Reset the state back to idle */
  reset: () => void
}

/**
 * Hook for executing deposit transactions on the World contract
 * 
 * Uses wagmi's useWriteContract for reliable transaction handling.
 */
export function useDeposit(): UseDepositReturn {
  const { activeAddress } = useWallet()
  const [state, setState] = useState<DepositState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DepositResult | null>(null)

  // wagmi hooks
  const { writeContractAsync } = useWriteContract()

  const deposit = useCallback(
    async (serverId: string, buyInEth: number): Promise<DepositResult | null> => {
      if (!activeAddress) {
        setError('No wallet connected')
        setState('error')
        return null
      }

      try {
        setState('confirming')
        setError(null)
        setResult(null)

        // Convert serverId to bytes32
        const serverIdBytes32 = serverIdToBytes32(serverId)
        
        // Convert ETH to wei
        const valueWei = parseEther(buyInEth.toString())

        // Send transaction using wagmi
        const hash = await writeContractAsync({
          address: env.worldContractAddress,
          abi: WorldAbi,
          functionName: 'deposit',
          args: [serverIdBytes32],
          value: valueWei,
        })

        console.log('[useDeposit] Deposit tx sent:', hash)
        setState('pending')

        // Wait for receipt manually since we need to parse it immediately
        const publicClient = (await import('wagmi/actions')).getPublicClient(
          (await import('@/lib/wagmiConfig')).wagmiConfig
        )
        
        const txReceipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
        })

        console.log('[useDeposit] Deposit tx confirmed:', txReceipt.status)

        if (txReceipt.status !== 'success') {
          throw new Error('Deposit transaction failed')
        }

        // Parse depositId from logs
        const depositResult = parseDepositEvent(txReceipt, hash)
        if (!depositResult) {
          throw new Error('Failed to parse Deposit event from transaction logs')
        }

        setState('success')
        setResult(depositResult)

        console.log('[useDeposit] Deposit successful:', depositResult)

        return depositResult
      } catch (err) {
        console.error('[useDeposit] Deposit failed:', err)

        // Handle user rejection
        if (err instanceof Error) {
          if (
            err.message.includes('User rejected') ||
            err.message.includes('user rejected') ||
            err.message.includes('User denied')
          ) {
            setError('Transaction was rejected')
          } else {
            setError(err.message)
          }
        } else {
          setError('Deposit failed')
        }

        setState('error')
        return null
      }
    },
    [activeAddress, writeContractAsync]
  )

  const reset = useCallback(() => {
    setState('idle')
    setError(null)
    setResult(null)
  }, [])

  return {
    state,
    error,
    result,
    deposit,
    reset,
  }
}

/**
 * Parse the Deposit event from a transaction receipt
 */
function parseDepositEvent(
  receipt: { logs: readonly { data: `0x${string}`; topics: readonly `0x${string}`[] }[] },
  txHash: `0x${string}`
): DepositResult | null {
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: WorldAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      })

      if (decoded.eventName === 'Deposit') {
        const args = decoded.args as {
          player: `0x${string}`
          serverId: `0x${string}`
          depositId: `0x${string}`
          amount: bigint
          spawnAmount: bigint
          worldAmount: bigint
          rakeAmount: bigint
        }

        return {
          txHash,
          depositId: args.depositId,
          spawnAmount: args.spawnAmount,
          worldAmount: args.worldAmount,
          rakeAmount: args.rakeAmount,
        }
      }
    } catch {
      // Not a Deposit event, continue
    }
  }

  return null
}
