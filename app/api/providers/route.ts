import { NextResponse } from "next/server"
import { QUANTUM_PROVIDERS } from "@/lib/cloud-providers"

/**
 * GET /api/providers
 * 
 * Returns the list of all quantum cloud providers as JSON.
 * This endpoint enables external tools and scripts to consume provider data.
 */
export async function GET() {
    return NextResponse.json({
        providers: QUANTUM_PROVIDERS,
        count: QUANTUM_PROVIDERS.length,
        timestamp: new Date().toISOString(),
    })
}
