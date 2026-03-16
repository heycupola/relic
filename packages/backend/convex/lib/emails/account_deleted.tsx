import { Body, Container, Head, Hr, Html, Img, Section, Text } from "@react-email/components";

interface AccountDeletedEmailProps {
  userName?: string;
  projectsDeleted?: number;
  sharesRevoked?: number;
}

const SITE_URL = process.env.SITE_URL || "https://relic.so";

export const AccountDeletedEmail = ({
  userName = "there",
  projectsDeleted = 0,
  sharesRevoked = 0,
}: AccountDeletedEmailProps) => (
  <Html>
    <Head />
    <Body style={main}>
      <Container style={container}>
        <Section style={section}>
          <Img
            src={`${SITE_URL}/relic-logo-dark.png`}
            alt="Relic"
            width="40"
            height="40"
            style={logoImg}
          />
          <Hr style={divider} />
          <Text style={heading}>Your account has been deleted</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            Your Relic account and all associated data have been permanently deleted as requested.
          </Text>
          {(projectsDeleted > 0 || sharesRevoked > 0) && (
            <Section style={block}>
              {projectsDeleted > 0 && (
                <Text style={listItem}>
                  {projectsDeleted} {projectsDeleted === 1 ? "project" : "projects"} deleted
                </Text>
              )}
              {sharesRevoked > 0 && (
                <Text style={sharesRevoked > 0 && projectsDeleted > 0 ? listItemLast : listItem}>
                  {sharesRevoked} {sharesRevoked === 1 ? "share" : "shares"} revoked
                </Text>
              )}
            </Section>
          )}
          <Section style={infoBlock}>
            <Text style={infoText}>
              This action is irreversible. Your encrypted secrets, projects, API keys, and all
              personal data have been removed from our systems. If you had an active subscription,
              it has been cancelled.
            </Text>
          </Section>
          <Text style={paragraph}>
            Thank you for using Relic. If you ever want to come back, you can create a new account
            at any time.
          </Text>
        </Section>
        <Section style={footer}>
          <Img
            src={`${SITE_URL}/cupola-light.png`}
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

export default AccountDeletedEmail;

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

const infoBlock = {
  backgroundColor: "#141414",
  border: "1px solid #2e2e2e",
  borderLeftColor: "#525252",
  borderLeftWidth: "3px",
  padding: "16px",
  marginBottom: "24px",
};

const infoText = {
  fontSize: "13px",
  lineHeight: "22px",
  color: "#737373",
  margin: "0",
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
