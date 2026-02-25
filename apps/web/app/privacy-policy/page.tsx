import type { Metadata } from "next";
import Link from "next/link";
import { ContainerLines } from "@/components/container-lines";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export const metadata: Metadata = {
  title: "Privacy Policy - Relic",
  description:
    "Privacy Policy for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <ContainerLines />
      <Header />
      <main className="flex-1">
        <div className="border-b border-border">
          <div className="mx-auto max-w-6xl px-6 lg:px-12 py-16 md:py-20">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="mt-3 text-sm text-muted-foreground">Last updated: February 25, 2026</p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 lg:px-12">
          <div className="divide-y divide-border">
            <section className="py-10">
              <p className="text-sm text-foreground/70 leading-relaxed">
                Relic is a zero-knowledge secrets management platform operated by Cupola Labs, LLC.
                Our architecture is built so that your secrets are encrypted on your device before
                they ever reach our servers. We cannot access, read, or decrypt your secret values.
                This Privacy Policy explains what information we collect, how we use it, and your
                rights regarding your data.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Information We Collect</h2>

              <div className="mt-5">
                <h3 className="text-sm font-medium">Account Information</h3>
                <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                  When you create an account using Google or GitHub OAuth, we receive your email
                  address, name, and basic profile information as provided by the OAuth provider. We
                  do not create or store passwords.
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Encrypted Data</h3>
                <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                  Secret values are encrypted on your device using AES-256-GCM with keys derived via
                  Argon2id before transmission. We store only the encrypted ciphertext and cannot
                  decrypt your secret values. We also store project metadata such as project names,
                  environment names, folder names, and secret key identifiers. Encryption keys are
                  derived from your master password and are never transmitted to our servers.
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Usage Analytics</h3>
                <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                  We use PostHog to collect anonymized product analytics including feature usage
                  patterns, page views, and error events. Analytics data does not include your secret
                  values or encryption keys.
                </p>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Billing Information</h3>
                <p className="mt-2 text-sm text-foreground/70 leading-relaxed">
                  Payment processing is handled by Stripe through our billing provider Autumn. We do
                  not store credit card details on our servers. We retain subscription status and
                  billing history for account management purposes.
                </p>
              </div>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">How We Use Your Information</h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Provide, maintain, and improve the Service</li>
                <li>Authenticate your identity and manage your account</li>
                <li>Process payments and manage subscriptions</li>
                <li>
                  Store and transmit your encrypted data as necessary to operate the Service
                </li>
                <li>Analyze anonymized usage patterns to improve the product</li>
                <li>Communicate with you about your account or changes to the Service</li>
                <li>Enforce our Terms of Service and protect against misuse</li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Third-Party Services</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Relic relies on the following third-party services, each receiving only the minimum
                data necessary for its function:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Convex</span> — Backend
                  infrastructure and encrypted data storage (United States)
                </li>
                <li>
                  <span className="font-medium text-foreground">Google OAuth</span> — Account
                  authentication
                </li>
                <li>
                  <span className="font-medium text-foreground">GitHub OAuth</span> — Account
                  authentication
                </li>
                <li>
                  <span className="font-medium text-foreground">PostHog</span> — Anonymized product
                  analytics
                </li>
                <li>
                  <span className="font-medium text-foreground">Autumn / Stripe</span> — Payment
                  processing and subscription management
                </li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We do not sell, rent, or share your personal information with third parties for
                advertising or marketing purposes.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Data Storage and Security</h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  All data is stored on Convex infrastructure located in the United States
                </li>
                <li>
                  Secret values are encrypted client-side before transmission using AES-256-GCM
                </li>
                <li>Encryption keys are derived using Argon2id and never leave your device</li>
                <li>All network communication is encrypted in transit via TLS</li>
                <li>
                  We maintain audit logs of actions performed on your projects for security purposes
                </li>
                <li>OAuth authentication is handled through industry-standard protocols</li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Your Rights</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                You have the right to:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Access your data through the CLI, TUI, SDK, or web dashboard</li>
                <li>Export your secrets in multiple formats</li>
                <li>Delete your account and request removal of your associated data</li>
                <li>
                  Revoke OAuth connections through your Google or GitHub account settings at any time
                </li>
                <li>
                  Request information about what data we hold about you by contacting us at{" "}
                  <a href="mailto:can@relic.so" className="text-foreground underline">
                    can@relic.so
                  </a>
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Data Retention</h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Your account data is retained while your account is active</li>
                <li>
                  Upon account deletion, your encrypted data and account information are permanently
                  removed from our systems
                </li>
                <li>
                  Audit logs may be retained for a reasonable period for security and compliance
                  purposes
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Cookies</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We use essential cookies for authentication and session management. PostHog may set
                cookies for anonymized analytics purposes. We do not use advertising or tracking
                cookies.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Children&apos;s Privacy</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Relic is not intended for use by individuals under the age of 18. We do not knowingly
                collect personal information from anyone under 18. If we become aware that we have
                collected information from someone under 18, we will take steps to delete that
                information promptly.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Changes to This Policy</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of material
                changes by updating the &ldquo;Last updated&rdquo; date at the top of this page. For
                significant changes, we may provide additional notice through email or the Service.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Contact</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                For privacy-related questions or concerns, please contact us at{" "}
                <a href="mailto:can@relic.so" className="text-foreground underline">
                  can@relic.so
                </a>
                .
              </p>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">
                See also our{" "}
                <Link href="/terms-of-service" className="text-foreground underline">
                  Terms of Service
                </Link>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
