"use client";

export function EmptyState() {
  return (
    <div className="border-2 border-border bg-card p-5 sm:p-8">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">Welcome to Relic</h2>
          <p className="text-sm text-foreground/60 max-w-md mx-auto text-pretty sm:text-base">
            Get started by installing the CLI and creating your first project.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="border-2 border-border p-4 space-y-4 sm:p-6">
            <p className="text-sm text-foreground/60">Quick start</p>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-foreground/40">1.</span>
                <div className="flex-1">
                  <p className="text-foreground">Create your first project</p>
                  <code className="mt-1 block font-mono text-xs text-foreground/50">
                    relic project create my-app
                  </code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-foreground/40">2.</span>
                <div className="flex-1">
                  <p className="text-foreground">Add an environment</p>
                  <code className="mt-1 block font-mono text-xs text-foreground/50">
                    relic env create production
                  </code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-foreground/40">3.</span>
                <div className="flex-1">
                  <p className="text-foreground">Store your first secret</p>
                  <code className="mt-1 block font-mono text-xs text-foreground/50">
                    relic secret set API_KEY
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-4">
            <p className="text-sm text-foreground/50">
              Or launch the TUI:{" "}
              <code className="font-mono text-foreground bg-muted/50 px-2 py-1 border border-border">
                relic
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
