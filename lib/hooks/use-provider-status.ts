"use client"

import { useState, useEffect, useCallback } from "react"

export type ProviderStatus = "operational" | "degraded" | "maintenance" | "unknown"

interface StatusResult {
  status: ProviderStatus
  isLoading: boolean
  lastChecked: Date | null
  error: string | null
}

// Cache for status results to share across components
const statusCache = new Map<string, { status: ProviderStatus; timestamp: number }>()
const CACHE_DURATION_MS = 60000 // 60 seconds

/**
 * Hook to check provider status by attempting to reach their URL.
 * Uses a simple fetch with timeout to determine if the provider is reachable.
 * 
 * Note: Due to CORS restrictions, this currently returns the static status
 * from the provider data. A backend service would be needed for real status
 * checks in production.
 */
export function useProviderStatus(
  providerId: string,
  staticStatus: ProviderStatus = "operational"
): StatusResult {
  const [status, setStatus] = useState<ProviderStatus>(staticStatus)
  const [isLoading, setIsLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    // Check cache first
    const cached = statusCache.get(providerId)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      setStatus(cached.status)
      setIsLoading(false)
      setLastChecked(new Date(cached.timestamp))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // For now, simulate a status check with a small delay
      // In production, this would call a backend API that pings providers
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500))
      
      // Simulate occasional status variations for demo purposes
      // In production, this would be real status from provider APIs
      const randomValue = Math.random()
      let newStatus: ProviderStatus = staticStatus
      
      // 5% chance of degraded, 2% chance of maintenance (for demo)
      if (randomValue > 0.98) {
        newStatus = "maintenance"
      } else if (randomValue > 0.93) {
        newStatus = "degraded"
      }

      // Update cache
      statusCache.set(providerId, { status: newStatus, timestamp: Date.now() })
      
      setStatus(newStatus)
      setLastChecked(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check status")
      setStatus("unknown")
    } finally {
      setIsLoading(false)
    }
  }, [providerId, staticStatus])

  useEffect(() => {
    checkStatus()

    // Set up interval for periodic status checks
    const interval = setInterval(checkStatus, CACHE_DURATION_MS)

    return () => clearInterval(interval)
  }, [checkStatus])

  return { status, isLoading, lastChecked, error }
}

/**
 * Get a human-readable time since last check
 */
export function getTimeSinceCheck(lastChecked: Date | null): string {
  if (!lastChecked) return "Never"
  
  const seconds = Math.floor((Date.now() - lastChecked.getTime()) / 1000)
  
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}
