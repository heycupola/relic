"use client";

import { cn } from "@repo/ui/lib/utils";
import { useState } from "react";
import { SectionWrapper } from "./section-wrapper";
import { SyntaxHighlighter } from "./syntax-highlighter";

const sdkExamples = {
  javascript: `import { Relic } from '@relic/sdk'

const relic = new Relic({
  projectId: 'my-app',
  environment: 'production'
})

const dbUrl = await relic.get('DATABASE_URL')`,
  python: `from relic import Relic

relic = Relic(
    project_id="my-app",
    environment="production"
)

db_url = relic.get("DATABASE_URL")`,
  go: `package main

import "github.com/relic/sdk-go"

func main() {
    r := relic.New(relic.Config{
        ProjectID:   "my-app",
        Environment: "production",
    })
    dbUrl, _ := r.Get("DATABASE_URL")
}`,
  rust: `use relic::Relic;

#[tokio::main]
async fn main() {
    let r = Relic::new("my-app", "production");
    let db_url = r.get("DATABASE_URL").await;
}`,
};

export function SDKSection() {
  const [activeLang, setActiveLang] = useState<keyof typeof sdkExamples>("javascript");

  return (
    <SectionWrapper label="SDK" id="sdk" showStripes>
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">Use it anywhere</h2>
        <p className="mt-2 text-foreground/60">
          Official SDKs for popular languages. Or use the REST API directly.
        </p>
        <div className="mt-6 overflow-hidden border-2 border-border">
          <div
            className="flex border-b-2 border-border bg-muted/30"
            role="tablist"
            aria-label="Programming languages"
          >
            {Object.keys(sdkExamples).map((lang) => (
              <button
                type="button"
                key={lang}
                onClick={() => setActiveLang(lang as keyof typeof sdkExamples)}
                role="tab"
                aria-selected={activeLang === lang}
                aria-controls={`sdk-panel-${lang}`}
                className={cn(
                  "px-6 py-3 font-mono text-xs uppercase tracking-wider transition-all focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring border-r-2 border-border",
                  activeLang === lang
                    ? "bg-foreground text-background font-bold"
                    : "text-foreground/60 hover:text-foreground hover:bg-muted",
                )}
              >
                {lang}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`sdk-panel-${activeLang}`}
            aria-label={`${activeLang} code example`}
          >
            <SyntaxHighlighter
              code={sdkExamples[activeLang]}
              language={activeLang}
              showLineNumbers
            />
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
