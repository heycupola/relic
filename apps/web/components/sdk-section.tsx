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

  const languages = Object.keys(sdkExamples) as Array<keyof typeof sdkExamples>;

  const handleKeyDown = (e: React.KeyboardEvent, currentLang: keyof typeof sdkExamples) => {
    const currentIndex = languages.indexOf(currentLang);
    let newIndex = currentIndex;

    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      newIndex = currentIndex > 0 ? currentIndex - 1 : languages.length - 1;
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      newIndex = currentIndex < languages.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === "Home") {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      newIndex = languages.length - 1;
    } else {
      return;
    }

    setActiveLang(languages[newIndex] ?? "javascript");
  };

  return (
    <SectionWrapper label="SDK" id="sdk" showStripes>
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">Use it anywhere</h2>
        <p className="mt-2 text-foreground/60 text-pretty">
          Official SDKs for popular languages. Or use the REST API directly.
        </p>
        <div className="mt-6 overflow-hidden border-2 border-border">
          <div
            className="flex border-b-2 border-border"
            role="tablist"
            aria-label="Programming languages"
          >
            {languages.map((lang) => (
              <button
                type="button"
                key={lang}
                onClick={() => setActiveLang(lang)}
                onKeyDown={(e) => handleKeyDown(e, lang)}
                role="tab"
                aria-selected={activeLang === lang}
                aria-controls={`sdk-panel-${lang}`}
                tabIndex={activeLang === lang ? 0 : -1}
                className={cn(
                  "px-6 py-3 font-mono text-xs uppercase transition-all focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring border-r-2 border-border",
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
