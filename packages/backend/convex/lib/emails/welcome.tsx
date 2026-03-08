import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Section,
  Text,
} from "@react-email/components";

interface WelcomeEmailProps {
  userName?: string;
  dashboardUrl?: string;
}

const SITE_URL = process.env.SITE_URL || "https://relic.so";

export const WelcomeEmail = ({
  userName = "there",
  dashboardUrl = `${SITE_URL}/dashboard`,
}: WelcomeEmailProps) => (
  <Html>
    <Head />
    <Body style={main}>
      <Container style={container}>
        <Section style={section}>
          <Img
            src={`${SITE_URL}/relic-logo-dark.svg`}
            alt="Relic"
            width="40"
            height="40"
            style={logoImg}
          />
          <Hr style={divider} />
          <Text style={heading}>Welcome to Relic</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            Thanks for signing up. Relic encrypts your secrets on-device before anything reaches our
            servers. Not even we can read them.
          </Text>
          <Text style={subheading}>Get started</Text>
          <Section style={block}>
            <Text style={listItem}>Create your first project</Text>
            <Text style={listItem}>Set up environments (dev, staging, prod)</Text>
            <Text style={listItem}>Add your secrets</Text>
            <Text style={listItemLast}>
              Run <span style={code}>relic run -e dev npm start</span>
            </Text>
          </Section>
          <Button style={button} href={dashboardUrl}>
            Go to Dashboard
          </Button>
        </Section>
        <Section style={footer}>
          <Img
            src={`${SITE_URL}/cupola-light.svg`}
            alt="Cupola"
            width="80"
            height="16"
            style={cupolaLogo}
          />
          <Text style={footerText}>
            Built by Cupola Labs, LLC &middot; &copy; {new Date().getFullYear()}
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default WelcomeEmail;

const main = {
  backgroundColor: "#0E0E0E",
  fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  padding: "40px 0",
};

const container = {
  backgroundColor: "#1a1a1a",
  margin: "0 auto",
  maxWidth: "600px",
  border: "1px solid #2e2e2e",
};

const section = {
  padding: "40px",
};

const logoImg = {
  width: "40px",
  height: "40px",
  marginBottom: "16px",
};

const divider = {
  border: "none",
  borderTop: "1px solid #2e2e2e",
  margin: "0 0 24px 0",
};

const heading = {
  fontSize: "28px",
  fontWeight: "600",
  color: "#fafaf9",
  margin: "0 0 24px 0",
  letterSpacing: "-0.02em",
};

const subheading = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#fafaf9",
  margin: "24px 0 16px 0",
  fontWeight: "600",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "26px",
  color: "#a3a3a3",
  margin: "0 0 16px 0",
};

const block = {
  backgroundColor: "#141414",
  border: "1px solid #2e2e2e",
  padding: "20px",
  marginBottom: "24px",
};

const listItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#a3a3a3",
  margin: "0 0 8px 0",
};

const listItemLast = {
  ...listItem,
  margin: "0",
};

const code = {
  backgroundColor: "#0E0E0E",
  border: "1px solid #2e2e2e",
  padding: "2px 6px",
  fontSize: "13px",
  fontFamily: "'Geist Mono', 'SF Mono', Monaco, Consolas, monospace",
  color: "#e5e5e5",
};

const button = {
  backgroundColor: "#fafaf9",
  border: "2px solid #fafaf9",
  borderRadius: "0",
  color: "#0E0E0E",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "14px 28px",
};

const footer = {
  backgroundColor: "#141414",
  borderTop: "1px solid #2e2e2e",
  padding: "24px 40px",
  textAlign: "center" as const,
};

const cupolaLogo = {
  height: "16px",
  width: "auto",
  margin: "0 auto 8px",
  display: "block",
  opacity: "0.5",
};

const footerText = {
  fontSize: "12px",
  color: "#525252",
  margin: "0",
};
