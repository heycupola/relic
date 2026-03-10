"use client";

import { api } from "@repo/backend";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InstallSection } from "@/components/install-section";
import { authClient } from "@/lib/auth";
import { trackWebEvent } from "@/lib/posthog";
import { authHeadingStyle, authSubtitleStyle } from "@/lib/styles";

type Source =
  | "google_search"
  | "github"
  | "reddit"
  | "x"
  | "youtube"
  | "discord"
  | "friend"
  | "blog_post"
  | "other";

type TeamSize = "1" | "2-5" | "6-20" | "21-50" | "50+";

const SOURCE_OPTIONS: { value: Source; label: string }[] = [
  { value: "google_search", label: "Google" },
  { value: "github", label: "GitHub" },
  { value: "reddit", label: "Reddit" },
  { value: "x", label: "X (Twitter)" },
  { value: "youtube", label: "YouTube" },
  { value: "discord", label: "Discord" },
  { value: "friend", label: "Friend / Colleague" },
  { value: "blog_post", label: "Blog / Article" },
  { value: "other", label: "Other" },
];

const TEAM_SIZE_OPTIONS: { value: TeamSize; label: string }[] = [
  { value: "1", label: "Just me" },
  { value: "2-5", label: "2\u20135" },
  { value: "6-20", label: "6\u201320" },
  { value: "21-50", label: "21\u201350" },
  { value: "50+", label: "50+" },
];

const TOTAL_STEPS = 3;

function StepBar({ currentStep }: { currentStep: number }) {
  const progress = (currentStep / TOTAL_STEPS) * 100;

  return (
    <div
      className="w-full h-0.5 bg-border"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-label={`Step ${currentStep} of ${TOTAL_STEPS}`}
    >
      <div
        className="h-full bg-foreground transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const userData = useQuery(api.user.getCurrentUser, session?.user ? {} : "skip");
  const completeOnboardingMutation = useMutation(api.user.completeOnboarding);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [sourceOther, setSourceOther] = useState("");
  const [selectedTeamSize, setSelectedTeamSize] = useState<TeamSize | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (userData === undefined) return;
    if (userData.hasCompletedOnboarding !== false) {
      router.replace("/dashboard");
    }
  }, [userData, router]);

  useEffect(() => {
    trackWebEvent("web_page_viewed", { page: "onboarding" });
  }, []);

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      trackWebEvent("web_onboarding_step_completed", { step: currentStep });
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboardingMutation({
        source: selectedSource ?? undefined,
        sourceOther: selectedSource === "other" ? sourceOther || undefined : undefined,
        teamSize: selectedTeamSize ?? undefined,
      });
      trackWebEvent("web_onboarding_completed", {
        source: selectedSource,
        teamSize: selectedTeamSize,
      });
      router.replace("/dashboard");
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      setIsSubmitting(false);
    }
  };

  if (userData === undefined) {
    return null;
  }

  if (userData.hasCompletedOnboarding !== false) {
    return null;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground flex items-center justify-center">
      <div className="w-full max-w-lg px-4 py-8 sm:px-6 sm:py-16">
        <div className="flex flex-col gap-8">
          <Link href="/" className="flex items-center">
            <Image
              src="/relic-logo-dark.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto dark:hidden"
            />
            <Image
              src="/relic-logo-light.svg"
              alt="Relic"
              width={40}
              height={40}
              className="h-10 w-auto hidden dark:block"
            />
          </Link>

          <StepBar currentStep={currentStep} />

          {currentStep === 1 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
                  How did you hear about us?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground" style={authSubtitleStyle}>
                  This helps us understand our community better.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SOURCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedSource(option.value)}
                    className={cn(
                      "px-3 py-2.5 text-sm font-medium border-2 transition-all",
                      selectedSource === option.value
                        ? "bg-foreground text-background border-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {selectedSource === "other" && (
                <input
                  type="text"
                  value={sourceOther}
                  onChange={(e) => setSourceOther(e.target.value)}
                  placeholder="Tell us more..."
                  className="w-full px-4 py-3 text-sm border-2 border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
                />
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!selectedSource}
                  className="flex-1 px-6 py-3 text-sm font-medium bg-foreground text-background border-2 border-foreground transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 text-sm font-medium text-muted-foreground border-2 border-border transition-all hover:text-foreground hover:border-foreground"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
                  What's your team size?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground" style={authSubtitleStyle}>
                  We'll tailor your experience accordingly.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TEAM_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedTeamSize(option.value)}
                    className={cn(
                      "px-3 py-2.5 text-sm font-medium border-2 transition-all",
                      selectedTeamSize === option.value
                        ? "bg-foreground text-background border-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 py-3 text-sm font-medium text-muted-foreground border-2 border-border transition-all hover:text-foreground hover:border-foreground"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!selectedTeamSize}
                  className="flex-1 px-6 py-3 text-sm font-medium bg-foreground text-background border-2 border-foreground transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-3 text-sm font-medium text-muted-foreground border-2 border-border transition-all hover:text-foreground hover:border-foreground"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="text-2xl font-medium text-foreground" style={authHeadingStyle}>
                  Install Relic
                </h1>
                <p className="mt-2 text-sm text-muted-foreground" style={authSubtitleStyle}>
                  Get started by installing the CLI on your machine.
                </p>
              </div>

              <InstallSection showWrapper={false} />

              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-6 py-3 text-sm font-medium text-muted-foreground border-2 border-border transition-all hover:text-foreground hover:border-foreground"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={isSubmitting}
                  className="flex-1 px-6 py-3 text-sm font-medium bg-foreground text-background border-2 border-foreground transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Completing\u2026" : "Go to Dashboard"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
