import Link from "next/link";
import { ContainerLines } from "@/components/container-lines";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default function NotFound() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <ContainerLines />
      <div className="flex flex-col min-h-dvh">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6">
          <div className="max-w-2xl w-full text-center space-y-6">
            <div className="space-y-3">
              <h1 className="text-5xl font-bold text-foreground font-mono sm:text-6xl">404</h1>
              <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Page not found</h2>
              <p className="text-sm text-foreground/60 sm:text-base">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row sm:gap-4">
              <Link
                href="/"
                className="w-full px-6 py-3 border-2 border-foreground bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors text-center sm:w-auto"
              >
                Go home
              </Link>
              <Link
                href="/dashboard"
                className="w-full px-6 py-3 border-2 border-border bg-background text-foreground font-medium hover:bg-muted/50 transition-colors text-center sm:w-auto"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
