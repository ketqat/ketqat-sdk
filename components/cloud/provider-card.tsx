"use client"

import Link from "next/link"
import { ExternalLink, Cpu, Code, Cloud, Zap, Loader2, ArrowRight } from "lucide-react"
import { QuantumProvider } from "@/lib/cloud-providers"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useProviderStatus, getTimeSinceCheck } from "@/lib/hooks/use-provider-status"

interface ProviderCardProps {
    provider: QuantumProvider
}

export function ProviderCard({ provider }: ProviderCardProps) {
    const { status, isLoading, lastChecked } = useProviderStatus(provider.id, provider.status)

    const getIcon = (category: string) => {
        switch (category) {
            case "Hardware":
                return <Cpu className="h-5 w-5 text-blue-500" />
            case "Software":
                return <Code className="h-5 w-5 text-green-500" />
            case "Cloud":
                return <Cloud className="h-5 w-5 text-purple-500" />
            default:
                return <Zap className="h-5 w-5 text-yellow-500" />
        }
    }

    const getBadgeVariant = (category: string) => {
        switch (category) {
            case "Hardware":
                return "default"
            case "Software":
                return "secondary"
            default:
                return "outline"
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case "operational":
                return "bg-green-500"
            case "degraded":
                return "bg-yellow-500"
            case "maintenance":
                return "bg-red-500"
            case "unknown":
                return "bg-gray-400"
            default:
                return "bg-gray-500"
        }
    }

    const getStatusLabel = (status: string) => {
        return status.charAt(0).toUpperCase() + status.slice(1)
    }

    const getPricingVariant = (pricing: string) => {
        switch (pricing) {
            case "Free Tier":
                return "default"
            case "Paid":
                return "secondary"
            case "Contact":
                return "outline"
            default:
                return "outline"
        }
    }

    return (
        <Card className="flex flex-col h-full hover:shadow-lg transition-all hover:border-primary/50 relative group">
            {/* Status Indicator */}
            <div
                className="absolute top-4 right-4 flex items-center gap-1.5"
                title={`${getStatusLabel(status)} • Last checked: ${getTimeSinceCheck(lastChecked)}`}
            >
                {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                    <div className={cn("w-2 h-2 rounded-full", getStatusColor(status))} />
                )}
            </div>

            {/* Clickable card content */}
            <Link href={`/cloud/${provider.id}`} className="flex flex-col flex-1">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pr-8">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <div className="p-2 bg-muted rounded-full">
                            {getIcon(provider.category)}
                        </div>
                        {provider.name}
                    </CardTitle>
                    <Badge variant={getBadgeVariant(provider.category) as any}>
                        {provider.category}
                    </Badge>
                </CardHeader>
                <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed mb-3 line-clamp-2">
                        {provider.description}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {provider.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                            </Badge>
                        ))}
                    </div>

                    {/* Pricing */}
                    <div className="mt-auto">
                        <Badge variant={getPricingVariant(provider.pricing) as any} className="text-xs">
                            {provider.pricing}
                        </Badge>
                    </div>
                </CardContent>
            </Link>

            <CardFooter className="flex justify-between pt-4 border-t">
                <Button variant="outline" size="sm" className="gap-2" asChild>
                    <Link href={`/cloud/${provider.id}`}>
                        View Details
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                    <a href={provider.url} target="_blank" rel="noopener noreferrer">
                        Launch
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </Button>
            </CardFooter>
        </Card>
    )
}
