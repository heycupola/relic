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

interface CollaboratorAddedEmailProps {
  userName?: string;
  projectName?: string;
  ownerName?: string;
  dashboardUrl?: string;
}

export const CollaboratorAddedEmail = ({
  userName = "there",
  projectName = "a project",
  ownerName = "someone",
  dashboardUrl = `${process.env.SITE_URL || "https://relic.so"}/dashboard`,
}: CollaboratorAddedEmailProps) => (
  <Html>
    <Head />
    <Body style={main}>
      <Container style={container}>
        <Section style={section}>
          <Text style={logo}>RELIC</Text>
          <Hr style={divider} />
          <Text style={heading}>You've been added to a project</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            <strong>{ownerName}</strong> has added you as a collaborator on{" "}
            <strong>{projectName}</strong>.
          </Text>
          <Text style={paragraph}>
            You now have access to view and manage secrets in this project. All secrets are
            end-to-end encrypted and only accessible to authorized collaborators.
          </Text>
          <Text style={listHeading}>What you can do:</Text>
          <Section style={accessBlock}>
            <Text style={listItem}>View and edit secrets</Text>
            <Text style={listItem}>Create environments and folders</Text>
            <Text style={listItem}>Manage project structure</Text>
          </Section>
          <Section style={infoBlock}>
            <Text style={infoText}>
              Your access is controlled by the project owner. They can revoke access at any time.
            </Text>
          </Section>
          <Button style={button} href={dashboardUrl}>
            View Project
          </Button>
        </Section>
        <Section style={footer}>
          <Text style={footerText}>Relic from</Text>
          <Img
            src={`${process.env.SITE_URL || "https://relic.so"}/cupola-dark.svg`}
            alt="Cupola"
            width="100"
            height="20"
            style={cupolaLogo}
          />
          <Text style={footerCopyright}>© 2025</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default CollaboratorAddedEmail;

const main = {
  backgroundColor: "#f5f5f5",
  fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  padding: "40px 0",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "600px",
  border: "1px solid #e5e5e5",
};

const section = {
  padding: "40px",
};

const logo = {
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

const listHeading = {
  fontSize: "15px",
  lineHeight: "24px",
  color: "#1a1a1a",
  margin: "24px 0 16px 0",
  fontWeight: "600",
};

const accessBlock = {
  backgroundColor: "#fafafa",
  border: "1px solid #e5e5e5",
  padding: "20px",
  marginBottom: "24px",
};

const listItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#404040",
  margin: "0 0 8px 0",
};

const infoBlock = {
  backgroundColor: "#fafafa",
  border: "1px solid #e5e5e5",
  padding: "16px",
  marginBottom: "24px",
};

const infoText = {
  fontSize: "13px",
  lineHeight: "22px",
  color: "#525252",
  margin: "0",
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
  borderTop: "1px solid #e5e5e5",
  padding: "24px 40px",
  textAlign: "center" as const,
};

const footerText = {
  fontSize: "12px",
  color: "#737373",
  margin: "0 0 4px 0",
};

const footerCopyright = {
  fontSize: "12px",
  color: "#a3a3a3",
  margin: "0",
};

const cupolaLogo = {
  height: "20px",
  width: "auto",
  margin: "4px auto 8px",
  display: "block",
};
