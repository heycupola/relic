import { SectionWrapper } from "./section-wrapper";

export function Features() {
  const features = [
    {
      command: "encrypt",
      title: "Client-side Encryption",
      description:
        "All secrets are encrypted on your machine before storage. Zero-knowledge architecture.",
    },
    {
      command: "cli",
      title: "Command Line Interface",
      description:
        "Powerful CLI for automation, scripts, and CI/CD pipelines. Manage secrets directly from your terminal.",
    },
    {
      command: "tui",
      title: "Terminal User Interface",
      description:
        "Interactive visual interface in your terminal. Navigate, search, and manage secrets with ease.",
    },
    {
      command: "sdk",
      title: "SDK Integration",
      description:
        "Official SDKs for JavaScript, Python, Go, and Rust. Access secrets programmatically in any language.",
    },
    {
      command: "organize",
      title: "Project Organization",
      description: "Organize secrets by project, environment (dev, staging, prod), and folders.",
    },
    {
      command: "structure",
      title: "Folder Structure",
      description:
        "Additional layer of organization with backend, frontend, or custom folder types.",
    },
  ];

  return (
    <SectionWrapper label="Features" id="features" showStripes>
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <div className="border-b-2 border-border pb-6">
          <h2 className="text-2xl font-semibold text-foreground">What is Relic?</h2>
          <p className="mt-2 max-w-2xl text-foreground/60">
            A terminal-native secret manager that encrypts and stores secrets on your behalf with
            complete security.
          </p>
        </div>
        <div className="mt-6 border-2 border-border bg-muted/30">
          <div className="border-b-2 border-border bg-muted px-4 py-2 flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-foreground/20" />
              <span className="w-3 h-3 rounded-full bg-foreground/20" />
              <span className="w-3 h-3 rounded-full bg-foreground/20" />
            </div>
            <span className="ml-2 font-mono text-xs text-foreground/50">relic --features</span>
          </div>
          <ul className="p-4 space-y-0 font-mono text-sm">
            {features.map((feature, index) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: features are static
                key={index}
                className="py-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors px-2 -mx-2"
              >
                <div className="flex items-start gap-3">
                  <span className="text-foreground/40 select-none shrink-0">$</span>
                  <div>
                    <span className="text-green-600 dark:text-green-400">{feature.command}</span>
                    <span className="text-foreground/40 mx-2">→</span>
                    <span className="font-sans font-medium text-foreground">{feature.title}</span>
                    <p className="mt-1 font-sans text-foreground/55 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionWrapper>
  );
}
