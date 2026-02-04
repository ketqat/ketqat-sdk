"use client"

import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Cpu, Code, Cloud, Zap, CheckCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getProviderById, getRelatedProviders } from "@/lib/cloud-providers"
import { ProviderCard } from "@/components/cloud/provider-card"
import { useProviderStatus, getTimeSinceCheck } from "@/lib/hooks/use-provider-status"

interface ProviderDetailPageProps {
    params: {
        id: string
    }
}

export default function ProviderDetailPage({ params }: ProviderDetailPageProps) {
    const provider = getProviderById(params.id)

    if (!provider) {
        notFound()
    }

    const relatedProviders = getRelatedProviders(provider, 3)
    const { status, lastChecked } = useProviderStatus(provider.id, provider.status)

    const getIcon = (category: string) => {
        switch (category) {
            case "Hardware":
                return <Cpu className="h-8 w-8 text-blue-500" />
            case "Software":
                return <Code className="h-8 w-8 text-green-500" />
            case "Cloud":
                return <Cloud className="h-8 w-8 text-purple-500" />
            default:
                return <Zap className="h-8 w-8 text-yellow-500" />
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
            default:
                return "bg-gray-400"
        }
    }

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Back button */}
            <Link
                href="/cloud"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Cloud Hub
            </Link>

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 bg-muted rounded-xl">
                        {getIcon(provider.category)}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-3xl font-bold">{provider.name}</h1>
                            <Badge variant="secondary">{provider.category}</Badge>
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
                                <span className="text-sm text-muted-foreground capitalize">
                                    {status}
                                </span>
                            </div>
                        </div>
                        <p className="text-lg text-muted-foreground">{provider.description}</p>
                    </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {provider.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                            {tag}
                        </Badge>
                    ))}
                    <Badge variant={provider.pricing === "Free Tier" ? "default" : "secondary"}>
                        {provider.pricing}
                    </Badge>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                    <Button asChild>
                        <a href={provider.url} target="_blank" rel="noopener noreferrer">
                            Launch Platform
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="getting-started">Getting Started</TabsTrigger>
                    <TabsTrigger value="api">API Reference</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>About</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-muted-foreground">{provider.description}</p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-sm text-muted-foreground">Category</span>
                                        <p className="font-medium">{provider.category}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm text-muted-foreground">Pricing</span>
                                        <p className="font-medium">{provider.pricing}</p>
                                    </div>
                                    <div>
                                        <span className="text-sm text-muted-foreground">Status</span>
                                        <p className="font-medium capitalize flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${getStatusColor(status)}`} />
                                            {status}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-sm text-muted-foreground">Last Checked</span>
                                        <p className="font-medium">{getTimeSinceCheck(lastChecked)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Key Features</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    {provider.tags.map((tag) => (
                                        <li key={tag} className="flex items-center gap-2">
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                            <span>{tag}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="getting-started" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Getting Started with {provider.name}</CardTitle>
                            <CardDescription>Learn how to connect and start using this provider</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="font-semibold mb-2">1. Create an Account</h3>
                                <p className="text-muted-foreground">
                                    Visit the {provider.name} platform and create an account to get started.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2">2. Get API Credentials</h3>
                                <p className="text-muted-foreground">
                                    Once logged in, navigate to your account settings to generate API keys or tokens.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold mb-2">3. Connect via SDK</h3>
                                <p className="text-muted-foreground">
                                    Use the provider's official SDK or REST API to submit quantum circuits and retrieve results.
                                </p>
                            </div>
                            <Button asChild variant="outline">
                                <a href={provider.url} target="_blank" rel="noopener noreferrer">
                                    Visit {provider.name} Documentation
                                    <ExternalLink className="ml-2 h-4 w-4" />
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="api" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>API Reference</CardTitle>
                            <CardDescription>Provider data available via KetQat API</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
                                <p className="text-muted-foreground mb-2"># Get this provider's data</p>
                                <p>GET /api/providers/{provider.id}</p>
                            </div>
                            <p className="text-sm text-muted-foreground mt-4">
                                Full API documentation coming soon. For now, use the providers list endpoint at <code className="bg-muted px-1 py-0.5 rounded">/api/providers</code>.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Related Providers */}
            {relatedProviders.length > 0 && (
                <div className="mt-12">
                    <h2 className="text-2xl font-bold mb-6">Related {provider.category} Providers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {relatedProviders.map((related) => (
                            <ProviderCard key={related.id} provider={related} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
