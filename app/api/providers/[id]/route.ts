import { NextRequest, NextResponse } from "next/server"
import { getProviderById } from "@/lib/cloud-providers"

interface RouteParams {
    params: {
        id: string
    }
}

/**
 * GET /api/providers/[id]
 * 
 * Returns a single quantum provider by ID.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    const provider = getProviderById(params.id)

    if (!provider) {
        return NextResponse.json(
            { error: "Provider not found" },
            { status: 404 }
        )
    }

    return NextResponse.json({
        provider,
        timestamp: new Date().toISOString(),
    })
}
