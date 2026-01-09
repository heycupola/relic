import { Body, Button, Container, Head, Hr, Html, Section, Text } from "@react-email/components";

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
          <Section style={terminalHeader}>
            <Text style={terminalDots}>
              <span style={dot} />
              <span style={dot} />
              <span style={dot} />
            </Text>
            <Text style={terminalTitle}>relic --grace-period</Text>
          </Section>
          <Section style={section}>
            <Text style={logo}>RELIC</Text>
            <Hr style={divider} />
            <Text style={heading}>Your plan has changed</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              You've been downgraded to the Free plan. You have {daysRemaining} days to keep access
              to all your projects.
            </Text>
            <Section style={warningBlock}>
              <Text style={warningText}>
                <span style={warningIcon}>!</span> After the grace period ends, you'll only have
                access to your 2 most recent projects.
              </Text>
            </Section>
            <Text style={listHeading}>What you can do:</Text>
            <Section style={terminalBlock}>
              <Text style={listItem}>
                <span style={prompt}>$</span> upgrade to Pro to keep all your projects
              </Text>
              <Text style={listItem}>
                <span style={prompt}>$</span> archive old projects to fit within Free plan limit
              </Text>
            </Section>
            <Button style={button} href={upgradeUrl}>
              Upgrade to Pro
            </Button>
          </Section>
          <Section style={footer}>
            <Text style={footerText}>Built by Cupola Labs</Text>
            <Text style={footerCopyright}>© 2025</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default GracePeriodStartedEmail;

const main = {
  backgroundColor: "#f5f5f5",
  fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  padding: "40px 0",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "600px",
  border: "2px solid #e5e5e5",
};

const terminalHeader = {
  backgroundColor: "#fafafa",
  borderBottom: "2px solid #e5e5e5",
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
};

const terminalDots = {
  margin: "0",
  padding: "0",
  lineHeight: "1",
};

const dot = {
  display: "inline-block",
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  backgroundColor: "#d4d4d4",
  marginRight: "6px",
};

const terminalTitle = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "12px",
  color: "#737373",
  margin: "8px 0 0 0",
};

const section = {
  padding: "32px 40px",
};

const logo = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "14px",
  fontWeight: "600",
  letterSpacing: "0.1em",
  color: "#1a1a1a",
  margin: "0 0 16px 0",
};

const divider = {
  border: "none",
  borderTop: "1px solid #e5e5e5",
  margin: "0 0 24px 0",
};

const heading = {
  fontSize: "28px",
  fontWeight: "600",
  color: "#1a1a1a",
  margin: "0 0 24px 0",
  letterSpacing: "-0.02em",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "26px",
  color: "#404040",
  margin: "0 0 16px 0",
};

const warningBlock = {
  backgroundColor: "#fefce8",
  border: "1px solid #fef08a",
  padding: "16px",
  marginBottom: "24px",
};

const warningText = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "13px",
  lineHeight: "22px",
  color: "#1a1a1a",
  margin: "0",
};

const warningIcon = {
  color: "#eab308",
  marginRight: "8px",
  fontWeight: "600",
};

const listHeading = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#1a1a1a",
  margin: "0 0 12px 0",
  fontWeight: "600",
};

const terminalBlock = {
  backgroundColor: "#fafafa",
  border: "1px solid #e5e5e5",
  padding: "16px",
  marginBottom: "24px",
};

const listItem = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "13px",
  lineHeight: "28px",
  color: "#1a1a1a",
  margin: "0",
};

const prompt = {
  color: "#22c55e",
  marginRight: "8px",
};

const button = {
  backgroundColor: "#1a1a1a",
  border: "2px solid #1a1a1a",
  borderRadius: "0",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "500",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "14px 28px",
  cursor: "pointer",
};

const footer = {
  backgroundColor: "#fafafa",
  borderTop: "2px solid #e5e5e5",
  padding: "24px 40px",
  textAlign: "center" as const,
};

const footerText = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "12px",
  color: "#737373",
  margin: "0 0 4px 0",
};

const footerCopyright = {
  fontFamily: "'Geist Mono', 'Courier New', monospace",
  fontSize: "12px",
  color: "#a3a3a3",
  margin: "0",
};
