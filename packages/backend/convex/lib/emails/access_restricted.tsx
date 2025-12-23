import { Body, Button, Container, Head, Html, Section, Text } from "@react-email/components";
import * as React from "react";

interface AccessRestrictedEmailProps {
  userName?: string;
  ownedProjectCount?: number;
  sharedProjectCount?: number;
  upgradeUrl?: string;
}

export const AccessRestrictedEmail = ({
  userName = "there",
  ownedProjectCount = 0,
  sharedProjectCount = 0,
  upgradeUrl = `${process.env.SITE_URL || "https://relic.so"}/upgrade`,
}: AccessRestrictedEmailProps) => {
  const totalCount = ownedProjectCount + sharedProjectCount;
  const hasProjects = totalCount > 0;

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={label}>RELIC / ACCESS RESTRICTION</Text>
            <Text style={heading}>Your grace period has ended</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              Your 7-day grace period has ended.
              {hasProjects && <> Your access to the following has been restricted:</>}
            </Text>
            {ownedProjectCount > 0 && (
              <Text style={paragraph}>
                • {ownedProjectCount} {ownedProjectCount === 1 ? "project" : "projects"} (owned by
                you)
              </Text>
            )}
            {sharedProjectCount > 0 && (
              <Text style={paragraph}>
                • {sharedProjectCount} shared {sharedProjectCount === 1 ? "project" : "projects"}
              </Text>
            )}
            <Text style={paragraph}>
              To regain access, please upgrade to Pro or archive some projects to fit within the
              Free plan limit (2 projects).
            </Text>
            <Button style={button} href={upgradeUrl}>
              Upgrade to Pro →
            </Button>
            <Text style={footer}>
              Built by Cupola Labs
              <br />© 2025
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default AccessRestrictedEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 0",
  maxWidth: "600px",
  border: "2px solid #e5e5e5",
};

const section = {
  padding: "0 40px 40px 40px",
};

const label = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "11px",
  letterSpacing: "0.5px",
  color: "#737373",
  margin: "0 0 24px 0",
  textTransform: "uppercase" as const,
};

const heading = {
  fontSize: "24px",
  fontWeight: "600",
  color: "#1a1a1a",
  margin: "0 0 24px 0",
  letterSpacing: "-0.02em",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#1a1a1a",
  margin: "0 0 16px 0",
};

const button = {
  backgroundColor: "#1a1a1a",
  border: "2px solid #1a1a1a",
  borderRadius: "0",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "500",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
  margin: "8px 0 24px 0",
  cursor: "pointer",
};

const footer = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "12px",
  color: "#737373",
  margin: "32px 0 0 0",
  lineHeight: "20px",
  borderTop: "2px solid #e5e5e5",
  paddingTop: "24px",
};
