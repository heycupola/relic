import type { Metadata } from "next";
import Link from "next/link";
import { ContainerLines } from "@/components/container-lines";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { SITE_NAME, SITE_TWITTER_HANDLE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
  alternates: {
    canonical: "/terms-of-service",
  },
  openGraph: {
    type: "article",
    locale: "en_US",
    url: "/terms-of-service",
    siteName: SITE_NAME,
    title: "Terms of Service - relic",
    description:
      "Terms of Service for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
  },
  twitter: {
    card: "summary",
    title: "Terms of Service - relic",
    description:
      "Terms of Service for Relic, a zero-knowledge secrets management platform by Cupola Labs, LLC.",
    creator: SITE_TWITTER_HANDLE,
    site: SITE_TWITTER_HANDLE,
  },
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <ContainerLines />
      <Header />
      <main className="flex-1">
        <div className="border-b border-border">
          <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16 md:py-20 lg:px-12">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Terms of Service
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:mt-3">
              Last updated: March 8, 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-12">
          <div className="divide-y divide-border">
            <section className="py-10">
              <h2 className="text-lg font-semibold">Acceptance of Terms</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                By accessing or using Relic, you agree to be bound by these Terms of Service
                (&ldquo;Terms&rdquo;). If you do not agree to these Terms, you may not access or use
                the Service.
              </p>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">
                These Terms constitute a legally binding agreement between you and Cupola Labs, LLC
                (&ldquo;Cupola Labs,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
                &ldquo;our&rdquo;) regarding your use of Relic, a zero-knowledge secrets management
                platform, and all related services, tools, and interfaces (collectively, the
                &ldquo;Service&rdquo;). Relic is a product developed and operated by Cupola Labs,
                LLC.
              </p>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">
                By creating an account or otherwise using the Service, you confirm that you have
                read, understood, and agree to be bound by these Terms, as well as our{" "}
                <Link href="/privacy-policy" className="text-foreground underline">
                  Privacy Policy
                </Link>
                , which is incorporated herein by reference.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Description of Service</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Relic is a zero-knowledge secrets management platform that encrypts and stores
                secrets on your behalf. All encryption and decryption occurs on your device. The
                Service includes, but is not limited to:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Client-side encryption and decryption of secrets using AES-256-GCM</li>
                <li>Command Line Interface (CLI) for terminal-based secrets management</li>
                <li>Terminal User Interface (TUI) for interactive visual management</li>
                <li>Software Development Kits (SDKs) for programmatic access</li>
                <li>Web dashboard for account and project management</li>
                <li>Project organization across environments and folders</li>
                <li>Secure project sharing between authorized users</li>
                <li>API key management for programmatic access</li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We reserve the right to modify, suspend, or discontinue any aspect of the Service at
                any time, with or without notice.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">User Accounts</h2>

              <div className="mt-5">
                <h3 className="text-sm font-medium">Eligibility</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>You must be at least 18 years old to use the Service</li>
                  <li>
                    You must provide accurate and complete information when creating an account
                  </li>
                  <li>One individual may not maintain more than one account</li>
                </ul>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Account Security</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>You are responsible for all activity that occurs under your account</li>
                  <li>
                    You are solely responsible for maintaining the security of your encryption keys
                    and master password
                  </li>
                  <li>You must notify us immediately of any unauthorized access to your account</li>
                  <li>
                    We are not liable for any loss arising from your failure to secure your account,
                    encryption keys, or master password
                  </li>
                  <li>
                    Loss of your encryption keys or master password may result in permanent,
                    irrecoverable loss of access to your encrypted data. We cannot recover this data
                    for you.
                  </li>
                </ul>
              </div>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Acceptable Use</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">You agree not to:</p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Violate any applicable laws or regulations</li>
                <li>
                  Attempt to gain unauthorized access to the Service or its underlying
                  infrastructure
                </li>
                <li>Interfere with or disrupt the integrity or performance of the Service</li>
                <li>Reverse engineer, decompile, or disassemble any portion of the Service</li>
                <li>
                  Use the Service to store, transmit, or manage content that violates applicable
                  laws
                </li>
                <li>Circumvent usage limits, access controls, or security mechanisms</li>
                <li>
                  Resell, sublicense, or redistribute access to the Service without written
                  authorization
                </li>
                <li>
                  Use automated means to access the Service in a manner that exceeds reasonable use
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Payment Terms</h2>

              <div className="mt-5">
                <h3 className="text-sm font-medium">Subscription Plans</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>The Service offers Free and paid subscription plans</li>
                  <li>Paid subscriptions are billed in advance on a recurring basis</li>
                  <li>
                    We may change our pricing with 30 days&apos; advance notice; continued use after
                    the effective date constitutes acceptance of the new pricing
                  </li>
                </ul>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Refund Policy</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>All fees are non-refundable</li>
                  <li>
                    Refunds may be considered solely at the discretion of Cupola Labs, LLC in cases
                    of material service failures directly caused by us, such as prolonged outages or
                    critical defects resulting in verified data loss
                  </li>
                  <li>
                    Dissatisfaction with the Service, failure to use the Service, or changes in your
                    business needs do not qualify for a refund
                  </li>
                </ul>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Cancellation</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>You may cancel your subscription at any time</li>
                  <li>
                    Upon cancellation, you retain access until the end of your current billing
                    period
                  </li>
                  <li>
                    No partial refunds or credits are issued for unused time within a billing period
                  </li>
                </ul>
              </div>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Intellectual Property</h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  The Service, including its design, features, documentation, and branding, is owned
                  by Cupola Labs, LLC and protected by applicable intellectual property laws
                </li>
                <li>
                  Relic is open-source software; usage of the source code is subject to the
                  applicable open-source license
                </li>
                <li>
                  Your data remains yours. We claim no ownership over your secrets, content, or any
                  data you store through the Service
                </li>
                <li>
                  You grant us a limited, non-exclusive license to store and transmit your encrypted
                  data solely as necessary to provide the Service
                </li>
                <li>
                  If you provide feedback, suggestions, or ideas about the Service, you grant us a
                  perpetual, worldwide, royalty-free license to use and incorporate such feedback
                  without compensation or attribution
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Disclaimer of Warranties</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed font-medium uppercase">
                The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
                warranties of any kind, whether express or implied, including but not limited to
                implied warranties of merchantability, fitness for a particular purpose, and
                non-infringement.
              </p>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We do not warrant that:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>The Service will be uninterrupted, secure, or error-free</li>
                <li>Defects will be corrected within any particular timeframe</li>
                <li>The Service will meet your specific requirements</li>
                <li>Your encrypted data will be recoverable if you lose your encryption keys</li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed font-medium uppercase">
                You are solely responsible for maintaining backups of your encryption keys and
                master password. We cannot recover encrypted data on your behalf.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Limitation of Liability</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed font-medium uppercase">
                To the maximum extent permitted by applicable law, Cupola Labs, LLC shall not be
                liable for any indirect, incidental, special, consequential, or punitive damages,
                including but not limited to loss of profits, data, use, or goodwill, arising out of
                or related to your use of the Service.
              </p>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Our total aggregate liability shall not exceed the greater of (a) the total amounts
                paid by you to us in the twelve (12) months preceding the claim, or (b) one hundred
                dollars ($100).
              </p>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                These limitations apply to:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Loss of access to encrypted data</li>
                <li>Service interruptions or downtime</li>
                <li>Unauthorized access to your account</li>
                <li>Third-party service outages or changes</li>
                <li>Any other matter related to the Service</li>
              </ul>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Some jurisdictions do not permit the exclusion of certain warranties or limitation
                of liability. In such jurisdictions, our liability is limited to the fullest extent
                permitted by law.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Indemnification</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                You agree to indemnify, defend, and hold harmless Cupola Labs, LLC and its officers,
                directors, employees, and agents from and against any claims, damages, losses,
                liabilities, and expenses (including reasonable attorneys&apos; fees) arising out of
                or related to:
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>Your use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any applicable law or third-party rights</li>
                <li>Data or content stored or managed through your use of the Service</li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Termination</h2>

              <div className="mt-5">
                <h3 className="text-sm font-medium">Termination by You</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>You may terminate your account at any time</li>
                  <li>
                    We recommend exporting your data before termination, as we cannot recover it
                    afterward
                  </li>
                </ul>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Termination by Us</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>We may suspend or terminate your account for violation of these Terms</li>
                  <li>We may discontinue the Service with reasonable advance notice</li>
                </ul>
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-medium">Effect of Termination</h3>
                <ul className="mt-2 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                  <li>
                    Upon termination, all rights and licenses granted to you under these Terms cease
                    immediately
                  </li>
                  <li>You lose access to the Service and your stored encrypted data</li>
                  <li>
                    Provisions that by their nature should survive termination will survive,
                    including intellectual property rights, disclaimers, limitation of liability,
                    and indemnification
                  </li>
                </ul>
              </div>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Changes to Terms</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                We reserve the right to modify these Terms at any time. When we make material
                changes, we will update the &ldquo;Last updated&rdquo; date at the top of this page
                and may notify you via email or through the Service. Your continued use of the
                Service following any changes constitutes acceptance of the revised Terms. If you do
                not agree, you must discontinue use of the Service.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Governing Law</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                These Terms are governed by and construed in accordance with the laws of the State
                of Delaware, United States, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Dispute Resolution</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                Any dispute arising from or relating to these Terms or the Service shall be resolved
                through binding arbitration in accordance with the rules of the American Arbitration
                Association, conducted in the State of Delaware. Either party may seek injunctive or
                other equitable relief in any court of competent jurisdiction.
              </p>
              <p className="mt-3 text-sm text-foreground/70 leading-relaxed">
                You agree to waive any right to participate in a class action lawsuit or class-wide
                arbitration against Cupola Labs, LLC.
              </p>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">General Provisions</h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/70 list-disc pl-5 leading-relaxed">
                <li>
                  <span className="font-medium text-foreground">Entire Agreement:</span> These
                  Terms, together with the Privacy Policy and Data Processing Agreement, constitute
                  the entire agreement between you and Cupola Labs, LLC regarding the Service
                </li>
                <li>
                  <span className="font-medium text-foreground">Severability:</span> If any
                  provision is found to be unenforceable, the remaining provisions remain in full
                  force and effect
                </li>
                <li>
                  <span className="font-medium text-foreground">Waiver:</span> Our failure to
                  enforce any provision does not constitute a waiver of that provision
                </li>
                <li>
                  <span className="font-medium text-foreground">Assignment:</span> You may not
                  assign or transfer your rights under these Terms without our prior written
                  consent. We may assign our rights without restriction
                </li>
                <li>
                  <span className="font-medium text-foreground">Force Majeure:</span> We are not
                  liable for failures or delays caused by circumstances beyond our reasonable
                  control
                </li>
                <li>
                  <span className="font-medium text-foreground">Notices:</span> We may send notices
                  to you via the email associated with your account or through the Service
                </li>
              </ul>
            </section>

            <section className="py-10">
              <h2 className="text-lg font-semibold">Contact</h2>
              <p className="mt-4 text-sm text-foreground/70 leading-relaxed">
                For questions about these Terms, please contact us at{" "}
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
