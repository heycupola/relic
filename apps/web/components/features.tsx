import { SectionWrapper } from "./section-wrapper";

interface VideoFeature {
  title: string;
  badge: "Free" | "Pro";
  description: string;
  youtubeId: string;
}

interface CompactFeature {
  keyword: string;
  title: string;
  description: string;
}

const videoFeatures: VideoFeature[] = [
  {
    title: "Built-in Secret Editor",
    badge: "Free",
    description: "Paste your .env file or edit secrets directly in the TUI. No context switching.",
    youtubeId: "dQw4w9WgXcQ",
  },
  {
    title: "Collaboration",
    badge: "Pro",
    description:
      "Share projects with your team via email. Each person gets their own encryption keys.",
    youtubeId: "dQw4w9WgXcQ",
  },
  {
    title: "Run Anywhere",
    badge: "Free",
    description:
      "Inject secrets into any process with API keys. Works in GitHub Actions, GitLab CI, and more.",
    youtubeId: "dQw4w9WgXcQ",
  },
];

const compactFeatures: CompactFeature[] = [
  {
    keyword: "run",
    title: "Language Agnostic",
    description: "Any language, any framework. Secrets are injected as environment variables.",
  },
  {
    keyword: "init",
    title: "Quick Setup",
    description:
      "Run relic init to connect your project, then relic run to inject your secrets. Ready in seconds.",
  },
  {
    keyword: "organize",
    title: "Projects, Envs, Folders",
    description:
      "A clean hierarchy to keep your secrets structured, from project level down to individual folders.",
  },
  {
    keyword: "encrypt",
    title: "Encrypted by Default",
    description:
      "AES-256 + Argon2id. Your secrets are encrypted before they ever leave your machine.",
  },
];

function VideoCard({ feature }: { feature: VideoFeature }) {
  return (
    <div className="border-2 border-border bg-card flex flex-col hover:border-foreground/30 transition-colors">
      <div className="p-5 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">{feature.title}</h3>
          <span
            className={
              feature.badge === "Pro"
                ? "px-2 py-0.5 text-[10px] font-bold uppercase bg-foreground text-background"
                : "px-2 py-0.5 text-[10px] font-bold uppercase border border-border text-foreground/50"
            }
          >
            {feature.badge}
          </span>
        </div>
        <p className="mt-2 text-sm text-foreground/60 text-pretty">{feature.description}</p>
      </div>
      <div className="border-t-2 border-border bg-muted/20">
        <iframe
          src={`https://www.youtube.com/embed/${feature.youtubeId}?mute=1&loop=1&playlist=${feature.youtubeId}`}
          title={feature.title}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full aspect-video"
        />
      </div>
    </div>
  );
}

function CompactCard({ feature }: { feature: CompactFeature }) {
  return (
    <div className="border-2 border-border bg-card p-5 hover:border-foreground/30 transition-colors">
      <span className="font-mono text-xs text-electric-ink">{feature.keyword}</span>
      <h3 className="mt-1.5 font-semibold text-foreground text-sm">{feature.title}</h3>
      <p className="mt-2 text-sm text-foreground/60 text-pretty">{feature.description}</p>
    </div>
  );
}

export function Features() {
  return (
    <SectionWrapper label="Features" id="features">
      <div className="mx-auto max-w-6xl px-6 py-16 lg:px-12">
        <h2 className="text-2xl font-semibold text-foreground">Features</h2>
        <p className="mt-2 max-w-2xl text-foreground/60 text-pretty">
          Everything you need to manage secrets, from editing to sharing to deployment.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {videoFeatures.map((feature) => (
            <VideoCard key={feature.title} feature={feature} />
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {compactFeatures.map((feature) => (
            <CompactCard key={feature.keyword} feature={feature} />
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
