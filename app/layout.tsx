import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/nav/header"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "KetQat - The Home for Quantum Computing",
  description: "An open-source platform to connect with quantum cloud providers, share algorithms, and collaborate on quantum computing research.",
  icons: {
    icon: "/favicon.png",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header />
        <main className="min-h-[calc(100vh-12rem)]">{children}</main>
        <footer className="border-t mt-20 py-8 bg-muted/30">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            <p className="font-medium">KetQat - The Home for Quantum Computing</p>
            <p className="mt-2">Open-source platform for quantum computing research and collaboration</p>
            <div className="mt-4 flex justify-center gap-6">
              <a
                href="https://github.com/ketqat/ketqat"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://discord.gg/KcJcRJv6pr"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                Discord
              </a>
              <a
                href="https://x.com/ketqat"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                X / Twitter
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
