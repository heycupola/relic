import type { Metadata } from "next";
import Link from "next/link";
import { ContainerLines } from "@/components/container-lines";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { SITE_NAME, SITE_TWITTER_HANDLE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
  alternates: {
    canonical: "/privacy-policy",
  },
  openGraph: {
    type: "article",
    locale: "en_US",
    url: "/privacy-policy",
    siteName: SITE_NAME,
    title: "Privacy Policy - relic",
    description:
      "Privacy Policy for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy - relic",
    description:
      "Privacy Policy for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
    creator: SITE_TWITTER_HANDLE,
    site: SITE_TWITTER_HANDLE,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <ContainerLines />
      <Header />
      <main className="flex-1">
        <div className="border-b border-border">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16 md:py-20 lg:px-12">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:mt-3">
              Last updated: March 8, 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
          <div className="divide-y divide-border">
            <section className="py-8 sm:py-10">
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
                  patterns, page views, and error events. Analytics data does not include your
                  secret values or encryption keys.
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
                <li>Store and transmit your encrypted data as necessary to operate the Service</li>
                <li>Analyze anonymized usage patterns to improve the product</li>
                <li>Communicate with you about your account or changes to the Service</li>
                <li>Enforce our Terms of Service and protect against misuse</li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Legal Basis for Processing (GDPR)</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                If you are located in the European Economic Area (EEA), United Kingdom, or
                Switzerland, we process your personal data under the following legal bases:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Contract performance</span> —
                  Account information, encrypted data storage, and service operation are necessary
                  to provide you with the Service
                </li>
                <li>
                  <span className="font-medium text-foreground">Consent</span> — Analytics cookies
                  (PostHog) are only set for EU/EEA users after explicit consent via our cookie
                  banner
                </li>
                <li>
                  <span className="font-medium text-foreground">Legitimate interest</span> —
                  Security audit logs and fraud prevention, service improvement based on anonymized
                  CLI/TUI telemetry (which can be opted out of via{" "}
                  <code className="text-foreground/90">relic telemetry disable</code>)
                </li>
                <li>
                  <span className="font-medium text-foreground">Legal obligation</span> — Retaining
                  billing records as required by applicable tax and financial regulations
                </li>
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
                <li>
                  <span className="font-medium text-foreground">Resend</span> — Transactional email
                  delivery
                </li>
                <li>
                  <span className="font-medium text-foreground">Cloudflare</span> — CDN, DNS, and
                  web application hosting (Global)
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
                <li>All data is stored on Convex infrastructure located in the United States</li>
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
                <li>Access your data through the CLI, TUI, or web dashboard</li>
                <li>Export your secrets in multiple formats</li>
                <li>
                  Delete your account and all associated data from your dashboard (Account &gt;
                  Danger zone &gt; Delete account)
                </li>
                <li>
                  Revoke OAuth connections through your Google or GitHub account settings at any
                  time
                </li>
                <li>
                  Request information about what data we hold about you by contacting us at{" "}
                  <a href="mailto:support@relic.so" className="text-foreground underline">
                    support@relic.so
                  </a>
                </li>
              </ul>
            </section>

            <section className="py-10" id="gdpr">
              <h2 className="text-lg font-semibold">
                Additional Rights for EU/EEA Residents (GDPR)
              </h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                If you are located in the European Economic Area, United Kingdom, or Switzerland,
                you have the following additional rights under the General Data Protection
                Regulation (GDPR):
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Right to rectification</span> —
                  Request correction of inaccurate personal data
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to erasure</span> — Request
                  deletion of your personal data (available via the dashboard or by contacting us)
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to data portability</span> —
                  Receive your data in a structured, machine-readable format (available via the CLI
                  export feature)
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to restrict processing</span>{" "}
                  — Request that we limit the processing of your personal data
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to object</span> — Object to
                  processing of your personal data based on legitimate interest
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to withdraw consent</span> —
                  Withdraw consent for analytics cookies at any time by clearing your browser
                  storage or rejecting cookies when prompted
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to lodge a complaint</span> —
                  File a complaint with your local data protection authority
                </li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                To exercise any of these rights, contact us at{" "}
                <a href="mailto:support@relic.so" className="text-foreground underline">
                  support@relic.so
                </a>
                . We will respond within 30 days.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">International Data Transfers</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Your data is stored on Convex infrastructure located in the United States. If you
                are located outside the United States, your data will be transferred to and
                processed in the United States. We rely on Standard Contractual Clauses (SCCs) and
                other appropriate safeguards as required by applicable data protection laws to
                ensure your data is protected during transfer. Our third-party processors (Convex,
                PostHog, Stripe, Autumn, Resend, and Cloudflare) each maintain their own data
                processing agreements and transfer mechanisms in compliance with GDPR requirements.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Data Retention</h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Your account data is retained while your account is active</li>
                <li>
                  Upon account deletion, your personal data (email, name, profile), encrypted
                  secrets, projects, API keys, and collaborator shares are permanently deleted
                </li>
                <li>
                  Audit logs are anonymized upon account deletion (your user ID is replaced with an
                  anonymous identifier) and may be retained for a reasonable period for security and
                  compliance purposes
                </li>
                <li>
                  A minimal anonymous record of account deletion is retained for legal purposes
                  (deletion date, plan status, deletion counts — no personal information)
                </li>
                <li>
                  Billing records held by Stripe are subject to Stripe&apos;s own retention policies
                  and applicable tax regulations
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Cookies</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We use the following types of cookies:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Essential cookies</span> —
                  Authentication, session management, and geo-detection for consent compliance.
                  These are strictly necessary and do not require consent.
                </li>
                <li>
                  <span className="font-medium text-foreground">Analytics cookies</span> — PostHog
                  product analytics. For EU/EEA users, these are only set after explicit consent via
                  our cookie banner. For users outside the EU/EEA, these are set by default.
                </li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We do not use advertising, marketing, or cross-site tracking cookies.
              </p>
            </section>

            <section className="py-10" id="ccpa">
              <h2 className="text-lg font-semibold">California Privacy Rights (CCPA)</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                If you are a California resident, the California Consumer Privacy Act (CCPA)
                provides you with additional rights regarding your personal information:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Right to know</span> — You may
                  request details about the categories and specific pieces of personal information
                  we have collected about you
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to delete</span> — You may
                  request deletion of your personal information (available via the dashboard or by
                  contacting us)
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to opt-out of sale</span> — We
                  do not sell your personal information to third parties. We never have and never
                  will.
                </li>
                <li>
                  <span className="font-medium text-foreground">Right to non-discrimination</span> —
                  We will not discriminate against you for exercising any of your CCPA rights
                </li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                To exercise your rights, delete your account from the dashboard or contact us at{" "}
                <a href="mailto:support@relic.so" className="text-foreground underline">
                  support@relic.so
                </a>
                . We will respond within 45 days as required by the CCPA.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Children&apos;s Privacy</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Relic is not intended for use by individuals under the age of 18. We do not
                knowingly collect personal information from anyone under 18. If we become aware that
                we have collected information from someone under 18, we will take steps to delete
                that information promptly.
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
                <a href="mailto:support@relic.so" className="text-foreground underline">
                  support@relic.so
                </a>
                .
              </p>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">
                See also our{" "}
                <Link href="/terms-of-service" className="text-foreground underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/dpa" className="text-foreground underline">
                  Data Processing Agreement
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
