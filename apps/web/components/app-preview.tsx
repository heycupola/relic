import { SectionWrapper } from "./section-wrapper";

export function AppPreview() {
  return (
    <SectionWrapper label="Preview">
      <div className="mx-auto max-w-6xl px-4 sm:px-0">
        <div className="aspect-video w-full bg-muted">
          <video
            src="/videos/demo.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </SectionWrapper>
  );
}
