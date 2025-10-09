"use client";
// import Image, { type ImageProps } from "next/image";

// import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
// import { authClient } from "@/lib/auth";

import { Input } from "@repo/ui/components/input";

export default function Home() {
  return (
    <div className="w-screen h-screen flex flex-col justify-center items-center">
      <Input type="email" placeholder="Email" />
      <h1>This is heading.</h1>
      <p className="font-black text-blue-600">hellot</p>
    </div>
  );
}
