# typed: false
# frozen_string_literal: true

# This formula is maintained in heycupola/homebrew-tap.
# Copy this file to that repo at Formula/relic.rb after creating it.

class Relic < Formula
  desc "End-to-end encrypted secret layer for developers"
  homepage "https://relic.so"
  version "0.1.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/heycupola/relic/releases/download/v#{version}/relic-darwin-arm64.tar.gz"
      sha256 "PLACEHOLDER_DARWIN_ARM64_SHA256"
    else
      url "https://github.com/heycupola/relic/releases/download/v#{version}/relic-darwin-x64.tar.gz"
      sha256 "PLACEHOLDER_DARWIN_X64_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/heycupola/relic/releases/download/v#{version}/relic-linux-x64.tar.gz"
      sha256 "PLACEHOLDER_LINUX_X64_SHA256"
    end
  end

  def install
    bin.install "relic"
    lib.install Dir["librelic_runner.*"]
    lib.install Dir["relic_runner.dll"] if OS.windows?
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/relic --version")
  end
end
