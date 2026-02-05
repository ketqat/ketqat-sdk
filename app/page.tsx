"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { QUANTUM_PROVIDERS } from "@/lib/cloud-providers"
import { getTrendingDecoders } from "@/lib/mock-data"
import { ProviderCard } from "@/components/cloud/provider-card"
import { DecoderCard } from "@/components/DecoderCard"

import { ArrowRight, Github, Cloud, Code, Cpu, Zap, Star } from "lucide-react"

export default function HomePage() {
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState("all")
  const trendingDecoders = getTrendingDecoders(4)

  const allProviders = QUANTUM_PROVIDERS.slice(0, 8) // Show top 8 on homepage
  const hardwareProviders = QUANTUM_PROVIDERS.filter(provider => provider.category === "Hardware").slice(0, 8)
  const softwareProviders = QUANTUM_PROVIDERS.filter(provider => provider.category === "Software").slice(0, 8)
  const cloudProviders = QUANTUM_PROVIDERS.filter(provider => provider.category === "Cloud").slice(0, 8)

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Image
              src="/ketqat-icon.png"
              alt="KetQat"
              width={72}
              height={72}
              className="object-contain"
            />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-quantum-blue via-purple-500 to-quantum-orange bg-clip-text text-transparent">
              The Home for Quantum Computing
            </span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Discover cloud providers, explore QEC decoders, and collaborate on the future of quantum technology.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/cloud">
                <Cloud className="mr-2 h-5 w-5" />
                Explore Cloud Hub
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/decoders">
                <Code className="mr-2 h-5 w-5" />
                Browse Decoder Zoo
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card className="hover:shadow-lg transition-all hover:border-primary/50 group">
            <Link href="/cloud">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                    <Cpu className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="group-hover:text-primary transition-colors">
                      Quantum Cloud Hub
                    </CardTitle>
                    <CardDescription>Connect to {QUANTUM_PROVIDERS.length}+ providers</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Access IBM Quantum, AWS Braket, IonQ, and more from a single dashboard. Compare pricing, check status, and launch instantly.
                </p>
                <div className="flex gap-2 mt-4">
                  <Badge variant="secondary">Hardware</Badge>
                  <Badge variant="secondary">Software</Badge>
                  <Badge variant="secondary">Cloud</Badge>
                </div>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:shadow-lg transition-all hover:border-primary/50 group">
            <Link href="/decoders">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                    <Zap className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="group-hover:text-primary transition-colors">
                      Decoder Zoo
                    </CardTitle>
                    <CardDescription>Explore QEC decoders</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Discover quantum error correction decoders. From MWPM to neural network decoders, find the right tool for your research.
                </p>
                <div className="flex gap-2 mt-4">
                  <Badge variant="outline">Surface Code</Badge>
                  <Badge variant="outline">Color Code</Badge>
                  <Badge variant="outline">Bosonic</Badge>
                </div>
              </CardContent>
            </Link>
          </Card>
        </div>
      </section>

      {/* Quantum Cloud Hub Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">Quantum Cloud Hub</h2>
            <p className="text-muted-foreground mt-2">
              Connect and manage your quantum infrastructure.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => router.push("/cloud")}
            className="gap-2"
          >
            View All Providers
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="all">All Providers</TabsTrigger>
            <TabsTrigger value="hardware">Hardware</TabsTrigger>
            <TabsTrigger value="software">Software</TabsTrigger>
            <TabsTrigger value="cloud">Cloud</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {allProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="hardware" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {hardwareProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="software" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {softwareProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="cloud" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {cloudProviders.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Trending Decoders Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Star className="h-7 w-7 text-yellow-500" />
              Trending Decoders
            </h2>
            <p className="text-muted-foreground mt-2">
              Most popular QEC decoders from the community.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => router.push("/decoders")}
            className="gap-2"
          >
            View All Decoders
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {trendingDecoders.map((decoder) => (
            <DecoderCard key={decoder.id} decoder={decoder} />
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-12 bg-muted/50 rounded-lg my-12">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Why KetQat?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">🔬</div>
              <h3 className="text-xl font-semibold mb-2">Research-Focused</h3>
              <p className="text-muted-foreground">
                Built by researchers, for researchers. Share your latest QEC innovations.
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🌐</div>
              <h3 className="text-xl font-semibold mb-2">Open Source</h3>
              <p className="text-muted-foreground">
                All decoders and tools are open-source and freely available.
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-xl font-semibold mb-2">Collaborative</h3>
              <p className="text-muted-foreground">
                Collaborate with the global quantum computing community.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Get Involved Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Get Involved</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Fork us on GitHub and help build the future of quantum computing.
            Contributions welcome!
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Button
              size="lg"
              className="gap-2"
              asChild
            >
              <a
                href="https://github.com/ketqat/ketqat"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-5 w-5" />
                Fork on GitHub
              </a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              asChild
            >
              <a
                href="https://discord.gg/KcJcRJv6pr"
                target="_blank"
                rel="noopener noreferrer"
              >
                Join Discord
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
