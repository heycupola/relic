import { Body, Button, Container, Head, Html, Section, Text } from "@react-email/components";
import * as React from "react";

interface GracePeriodStartedEmailProps {
  userName?: string;
  daysRemaining?: number;
  upgradeUrl?: string;
}

export const GracePeriodStartedEmail = ({
  userName = "there",
  daysRemaining = 7,
  upgradeUrl = `${process.env.SITE_URL || "https://relic.so"}/upgrade`,
}: GracePeriodStartedEmailProps) => {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={label}>RELIC / GRACE PERIOD</Text>
            <Text style={heading}>Your plan has changed</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              You've been downgraded to the Free plan. You have {daysRemaining} days to keep access
              to all your projects.
            </Text>
            <Text style={paragraph}>
              After the grace period ends, you'll only have access to your 2 most recent projects.
              Any projects and shared access beyond that will be restricted.
            </Text>
            <Text style={listHeading}>What you can do:</Text>
            <Text style={listItem}>→ Upgrade to Pro to keep all your projects</Text>
            <Text style={listItem}>→ Archive old projects to fit within the Free plan limit</Text>
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

export default GracePeriodStartedEmail;

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

const listHeading = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#1a1a1a",
  margin: "8px 0 12px 0",
  fontWeight: "600",
};

const listItem = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "14px",
  lineHeight: "24px",
  color: "#1a1a1a",
  margin: "0 0 8px 0",
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
  margin: "16px 0 24px 0",
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
