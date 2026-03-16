import type { Metadata } from "next";
import Link from "next/link";
import { ContainerLines } from "@/components/container-lines";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { SITE_NAME, SITE_TWITTER_HANDLE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description:
    "Data Processing Agreement (DPA) for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
  alternates: {
    canonical: "/dpa",
  },
  openGraph: {
    type: "article",
    locale: "en_US",
    url: "/dpa",
    siteName: SITE_NAME,
    title: "Data Processing Agreement - relic",
    description:
      "Data Processing Agreement (DPA) for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
  },
  twitter: {
    card: "summary",
    title: "Data Processing Agreement - relic",
    description:
      "Data Processing Agreement (DPA) for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
    creator: SITE_TWITTER_HANDLE,
    site: SITE_TWITTER_HANDLE,
  },
};

export default function DpaPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <ContainerLines />
      <Header />
      <main className="flex-1">
        <div className="border-b border-border">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16 md:py-20 lg:px-12">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Data Processing Agreement
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:mt-3">
              Last updated: March 8, 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-12">
          <div className="divide-y divide-border">
            <section className="py-8 sm:py-10">
              <p className="text-sm text-foreground/70 leading-relaxed">
                This Data Processing Agreement (&ldquo;DPA&rdquo;) forms part of the agreement
                between Cupola Labs, LLC (&ldquo;Processor&rdquo;, &ldquo;we&rdquo;,
                &ldquo;us&rdquo;) and the entity or individual agreeing to these terms
                (&ldquo;Controller&rdquo;, &ldquo;you&rdquo;) for the use of Relic
                (&ldquo;Service&rdquo;). This DPA applies where and to the extent that we process
                Personal Data on your behalf in the course of providing the Service, and such
                processing is subject to applicable Data Protection Laws including the EU General
                Data Protection Regulation (GDPR), UK GDPR, and the California Consumer Privacy Act
                (CCPA).
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">1. Definitions</h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Personal Data</span> — any
                  information relating to an identified or identifiable natural person, as defined
                  under applicable Data Protection Laws
                </li>
                <li>
                  <span className="font-medium text-foreground">Processing</span> — any operation
                  performed on Personal Data, including collection, storage, use, disclosure, and
                  deletion
                </li>
                <li>
                  <span className="font-medium text-foreground">Data Protection Laws</span> — all
                  applicable laws relating to the processing of Personal Data, including GDPR, UK
                  GDPR, and CCPA
                </li>
                <li>
                  <span className="font-medium text-foreground">Sub-processor</span> — any third
                  party engaged by us to process Personal Data on your behalf
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">2. Scope and Purpose of Processing</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We process Personal Data solely for the purpose of providing the Service to you. The
                nature of processing includes:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Account authentication and session management</li>
                <li>
                  Storage and transmission of encrypted data (secret values are encrypted
                  client-side using AES-256-GCM before reaching our servers — we cannot access or
                  decrypt them)
                </li>
                <li>Subscription and billing management</li>
                <li>
                  Anonymized product analytics (only with consent for EU/EEA users, opt-out
                  available for CLI/TUI)
                </li>
              </ul>
              <div className="mt-6">
                <h3 className="text-sm font-medium">Categories of Personal Data</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>Name, email address, and profile image (from OAuth providers)</li>
                  <li>Subscription and billing status</li>
                  <li>Usage and audit log data</li>
                  <li>IP address (for analytics and security, where applicable)</li>
                </ul>
              </div>
              <div className="mt-6">
                <h3 className="text-sm font-medium">Categories of Data Subjects</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>Users of the Service (account holders)</li>
                  <li>Collaborators invited by account holders</li>
                </ul>
              </div>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">3. Obligations of the Processor</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">We shall:</p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  Process Personal Data only on your documented instructions, unless required by law
                </li>
                <li>
                  Ensure that persons authorized to process Personal Data are bound by
                  confidentiality obligations
                </li>
                <li>
                  Implement appropriate technical and organizational security measures, including
                  client-side encryption (AES-256-GCM + Argon2id), TLS in transit, and access
                  controls
                </li>
                <li>
                  Not engage another processor without your prior authorization (see Sub-processors
                  below)
                </li>
                <li>
                  Assist you in responding to data subject requests (access, rectification, erasure,
                  portability, restriction, and objection)
                </li>
                <li>
                  Assist you in ensuring compliance with breach notification obligations under
                  applicable law
                </li>
                <li>
                  Delete or return all Personal Data upon termination of the Service, at your
                  choice, unless retention is required by law
                </li>
                <li>
                  Make available all information necessary to demonstrate compliance and allow for
                  audits upon reasonable request
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">4. Sub-processors</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                You authorize us to engage the following sub-processors. We will notify you of any
                changes to sub-processors and provide you the opportunity to object.
              </p>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-6 font-medium text-foreground">Sub-processor</th>
                      <th className="py-2 pr-6 font-medium text-foreground">Purpose</th>
                      <th className="py-2 font-medium text-foreground">Location</th>
                    </tr>
                  </thead>
                  <tbody className="text-foreground/70">
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-6">Convex</td>
                      <td className="py-2.5 pr-6">
                        Backend infrastructure, encrypted data storage
                      </td>
                      <td className="py-2.5">United States</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-6">PostHog</td>
                      <td className="py-2.5 pr-6">Anonymized product analytics</td>
                      <td className="py-2.5">United States</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-6">Stripe</td>
                      <td className="py-2.5 pr-6">Payment processing</td>
                      <td className="py-2.5">United States</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-6">Autumn</td>
                      <td className="py-2.5 pr-6">Billing and subscription management</td>
                      <td className="py-2.5">United States</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2.5 pr-6">Resend</td>
                      <td className="py-2.5 pr-6">Transactional email delivery</td>
                      <td className="py-2.5">United States</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-6">Cloudflare</td>
                      <td className="py-2.5 pr-6">CDN, DNS, web application hosting</td>
                      <td className="py-2.5">Global</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">5. International Data Transfers</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Where Personal Data is transferred outside the EEA, UK, or Switzerland, we ensure
                that appropriate transfer mechanisms are in place, including Standard Contractual
                Clauses (SCCs) as approved by the European Commission, or other lawful transfer
                mechanisms under applicable Data Protection Laws.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">6. Security Measures</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We implement the following technical and organizational measures to protect Personal
                Data:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  Zero-knowledge architecture — secret values are encrypted on-device using
                  AES-256-GCM with keys derived via Argon2id before transmission
                </li>
                <li>Encryption keys never leave the user&apos;s device</li>
                <li>TLS encryption for all data in transit</li>
                <li>OAuth-based authentication via industry-standard providers</li>
                <li>Rate limiting and abuse prevention</li>
                <li>Audit logging of all data operations</li>
                <li>Role-based access with cryptographic key isolation per project</li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">7. Data Breach Notification</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                In the event of a Personal Data breach, we will notify you without undue delay and
                no later than 72 hours after becoming aware of the breach. The notification will
                include the nature of the breach, the categories and approximate number of data
                subjects affected, the likely consequences, and the measures taken or proposed to
                address the breach.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">8. Data Subject Requests</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We will assist you in fulfilling data subject requests under applicable Data
                Protection Laws. Users can exercise the following rights directly through the
                Service:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Access and portability</span> —
                  Export data via the CLI, TUI, or web dashboard
                </li>
                <li>
                  <span className="font-medium text-foreground">Erasure</span> — Delete account and
                  all associated data from the dashboard
                </li>
                <li>
                  <span className="font-medium text-foreground">Objection to analytics</span> —
                  Reject cookies via the consent banner (EU/EEA) or disable CLI/TUI telemetry
                </li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                For requests that cannot be handled self-service, contact us at{" "}
                <a href="mailto:support@relic.so" className="text-foreground underline">
                  support@relic.so
                </a>
                .
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">9. Term and Termination</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                This DPA remains in effect for the duration of our processing of Personal Data on
                your behalf. Upon termination of the Service agreement, we will delete all Personal
                Data in accordance with our{" "}
                <Link href="/privacy-policy" className="text-foreground underline">
                  Privacy Policy
                </Link>{" "}
                unless retention is required by applicable law.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">10. Contact</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                For questions about this DPA or to exercise any rights, contact us at{" "}
                <a href="mailto:support@relic.so" className="text-foreground underline">
                  support@relic.so
                </a>
                .
              </p>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">
                See also our{" "}
                <Link href="/privacy-policy" className="text-foreground underline">
                  Privacy Policy
                </Link>{" "}
                and{" "}
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
