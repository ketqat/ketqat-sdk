"use client"

import { useState, useMemo } from "react"
import { QUANTUM_PROVIDERS } from "@/lib/cloud-providers"
import { ProviderCard } from "@/components/cloud/provider-card"
import { SearchBar } from "@/components/SearchBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

type PricingFilter = "all" | "Free Tier" | "Paid" | "Contact"

export default function CloudHubPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [selectedTab, setSelectedTab] = useState("all")
    const [pricingFilter, setPricingFilter] = useState<PricingFilter>("all")

    // Filter providers based on search, category, and pricing
    const filteredProviders = useMemo(() => {
        return QUANTUM_PROVIDERS.filter((provider) => {
            // Search filter - match name, description, or tags
            const searchLower = searchQuery.toLowerCase()
            const matchesSearch = searchQuery === "" ||
                provider.name.toLowerCase().includes(searchLower) ||
                provider.description.toLowerCase().includes(searchLower) ||
                provider.tags.some(tag => tag.toLowerCase().includes(searchLower))

            // Category filter
            const matchesCategory = selectedTab === "all" ||
                provider.category.toLowerCase() === selectedTab

            // Pricing filter
            const matchesPricing = pricingFilter === "all" ||
                provider.pricing === pricingFilter

            return matchesSearch && matchesCategory && matchesPricing
        })
    }, [searchQuery, selectedTab, pricingFilter])

    const pricingOptions: PricingFilter[] = ["all", "Free Tier", "Paid", "Contact"]

    return (
        <div className="container py-10 mx-auto">
            <div className="mb-8 space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Quantum Cloud Hub</h1>
                <p className="text-lg text-muted-foreground">
                    Connect and manage your quantum infrastructure in one place.
                </p>
            </div>

            {/* Search and Filters */}
            <div className="mb-6 space-y-4">
                <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search providers by name, description, or tags..."
                    className="max-w-md"
                />

                {/* Pricing Filter Pills */}
                <div className="flex flex-wrap gap-2">
                    <span className="text-sm text-muted-foreground mr-2 self-center">Pricing:</span>
                    {pricingOptions.map((option) => (
                        <Badge
                            key={option}
                            variant={pricingFilter === option ? "default" : "outline"}
                            className="cursor-pointer hover:bg-primary/80 transition-colors"
                            onClick={() => setPricingFilter(option)}
                        >
                            {option === "all" ? "All" : option}
                        </Badge>
                    ))}
                </div>
            </div>

            {/* Category Tabs */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                <TabsList className="mb-6">
                    <TabsTrigger value="all">
                        All Providers
                        <Badge variant="secondary" className="ml-2 text-xs">
                            {QUANTUM_PROVIDERS.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="hardware">Hardware</TabsTrigger>
                    <TabsTrigger value="software">Software</TabsTrigger>
                    <TabsTrigger value="cloud">Cloud</TabsTrigger>
                </TabsList>

                <TabsContent value={selectedTab} className="mt-0">
                    {filteredProviders.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredProviders.map((provider) => (
                                <ProviderCard key={provider.id} provider={provider} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">
                                No providers found matching your criteria.
                            </p>
                            <button
                                onClick={() => {
                                    setSearchQuery("")
                                    setPricingFilter("all")
                                }}
                                className="text-primary hover:underline mt-2"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Results count */}
            {searchQuery || pricingFilter !== "all" ? (
                <p className="text-sm text-muted-foreground mt-4">
                    Showing {filteredProviders.length} of {QUANTUM_PROVIDERS.length} providers
                </p>
            ) : null}
        </div>
    )
}
