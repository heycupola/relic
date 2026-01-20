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
        <h2 className="text-2xl font-semibold text-foreground">What is Relic?</h2>
        <p className="mt-2 max-w-2xl text-foreground/60">
          A terminal-native secret manager that encrypts and stores secrets on your behalf with
          complete security.
        </p>
        <div className="mt-8 border-2 border-border divide-y-2 divide-border">
          {features.map((feature, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: features are static
              key={index}
              className="px-6 py-5 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-green-600 dark:text-green-400">
                  {feature.command}
                </span>
                <h3 className="font-semibold text-foreground">{feature.title}</h3>
              </div>
              <p className="mt-1.5 text-foreground/60 text-sm">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
