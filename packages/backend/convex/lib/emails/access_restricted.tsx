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

interface AccessRestrictedEmailProps {
  userName?: string;
  ownedProjectCount?: number;
  sharedProjectCount?: number;
  upgradeUrl?: string;
}

const SITE_URL = process.env.SITE_URL || "https://relic.so";

export const AccessRestrictedEmail = ({
  userName = "there",
  ownedProjectCount = 0,
  sharedProjectCount = 0,
  upgradeUrl = `${SITE_URL}/dashboard?action=upgrade`,
}: AccessRestrictedEmailProps) => {
  const totalCount = ownedProjectCount + sharedProjectCount;
  const hasProjects = totalCount > 0;

  return (
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
            <Text style={heading}>Your access has been restricted</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              Your 7-day grace period has ended.
              {hasProjects && " Your access to the following has been restricted:"}
            </Text>
            {hasProjects && (
              <Section style={warningBlock}>
                {ownedProjectCount > 0 && (
                  <Text style={listItem}>
                    {ownedProjectCount} {ownedProjectCount === 1 ? "project" : "projects"} owned by
                    you
                  </Text>
                )}
                {sharedProjectCount > 0 && (
                  <Text
                    style={
                      sharedProjectCount > 0 && ownedProjectCount > 0 ? listItemLast : listItem
                    }
                  >
                    {sharedProjectCount} shared {sharedProjectCount === 1 ? "project" : "projects"}
                  </Text>
                )}
              </Section>
            )}
            <Text style={paragraph}>
              Upgrade to Pro to regain full access, or archive projects to fit within the Free plan
              limit.
            </Text>
            <Button style={button} href={upgradeUrl}>
              Upgrade to Pro
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
};

export default AccessRestrictedEmail;

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

const warningBlock = {
  backgroundColor: "#141414",
  border: "1px solid #2e2e2e",
  borderLeftColor: "#f87171",
  borderLeftWidth: "3px",
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
