"use client";

import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { useState } from "react";

export function Hero() {
  const [email, setEmail] = useState("");

  return (
    <section className="px-8 py-8 space-y-8">
      <div className="space-y-2">
        <Badge variant="comingSoon">coming soon</Badge>

        <h1
          className="text-5xl font-medium"
          style={{
            fontFamily: "var(--font-space-grotesk, sans-serif)",
            lineHeight: "0.93",
            letterSpacing: "-0.08em",
          }}
        >
          reimagining how devs
          <br />
          manage secrets
        </h1>

        <p
          className="text-xl font-extralight text-soft-silver"
          style={{
            lineHeight: "0.93",
            letterSpacing: "-0.07em",
          }}
        >
          a zero-knowledge, type-safe, terminal-native
          <br />
          platform you fully control
        </p>
      </div>

      <div className="space-y-2">
        <p
          className="text-sm font-light text-soft-silver"
          style={{
            lineHeight: "0.93",
            letterSpacing: "-0.07em",
          }}
        >
          Join the waitlist for early access.
        </p>

        <div className="flex flex-col sm:flex-row items-start gap-3 max-w-md">
          <Input
            type="email"
            placeholder="hello@email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full sm:flex-1"
          />
          <Button
            variant="default"
            className="w-full sm:w-auto h-10 bg-bone-white text-carbon-black hover:bg-bone-white/90"
          >
            Subscribe
          </Button>
        </div>
      </div>
    </section>
  );
}
