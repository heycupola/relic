import { SectionWrapper } from "./section-wrapper";

export function AppPreview() {
  return (
    <SectionWrapper label="Preview">
      <div className="mx-auto max-w-6xl">
        <div className="aspect-video w-full bg-muted">
          <iframe
            src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&mute=1&loop=1&playlist=dQw4w9WgXcQ"
            title="App Preview"
            allow="autoplay; encrypted-media"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      </div>
    </SectionWrapper>
  );
}
