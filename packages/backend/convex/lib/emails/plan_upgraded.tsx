import { Body, Button, Container, Head, Html, Section, Text } from "@react-email/components";
import * as React from "react";

interface PlanUpgradedEmailProps {
  userName?: string;
  dashboardUrl?: string;
}

export const PlanUpgradedEmail = ({
  userName = "there",
  dashboardUrl = `${process.env.SITE_URL || "https://relic.so"}/dashboard`,
}: PlanUpgradedEmailProps) => (
  <Html>
    <Head />
    <Body style={main}>
      <Container style={container}>
        <Section style={section}>
          <Text style={label}>RELIC / PRO PLAN</Text>
          <Text style={heading}>Welcome to Pro</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            Thank you for upgrading to Relic Pro! You now have access to all premium features.
          </Text>
          <Text style={listHeading}>What's unlocked:</Text>
          <Text style={listItem}>→ Unlimited projects</Text>
          <Text style={listItem}>→ Share projects with your team</Text>
          <Text style={listItem}>→ Advanced access controls</Text>
          <Text style={listItem}>→ Priority support</Text>
          <Text style={paragraph}>
            All your secrets remain end-to-end encrypted. We never have access to your data.
          </Text>
          <Button style={button} href={dashboardUrl}>
            Go to Dashboard →
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

export default PlanUpgradedEmail;

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
