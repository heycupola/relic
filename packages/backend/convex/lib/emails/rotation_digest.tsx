import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Section,
  Text,
} from "@react-email/components";

export interface RotationDigestItem {
  key: string;
  projectName: string;
  environmentName: string;
  folderName?: string;
  ageDays: number;
  rotateEveryDays: number;
}

interface RotationDigestEmailProps {
  userName?: string;
  overdue?: RotationDigestItem[];
  overdueCount?: number;
  dueSoonCount?: number;
  dashboardUrl?: string;
  settingsUrl?: string;
}

const SITE_URL = process.env.SITE_URL || "https://withrelic.com";

export const RotationDigestEmail = ({
  userName = "there",
  overdue = [],
  overdueCount = overdue.length,
  dueSoonCount = 0,
  dashboardUrl = `${SITE_URL}/dashboard`,
  settingsUrl = `${SITE_URL}/dashboard/settings`,
}: RotationDigestEmailProps) => (
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
          <Text style={heading}>Secrets due for rotation</Text>
          <Text style={paragraph}>Hi {userName},</Text>
          <Text style={paragraph}>
            <strong style={bold}>
              {overdueCount} {overdueCount === 1 ? "secret is" : "secrets are"}
            </strong>{" "}
            past their rotation policy
            {dueSoonCount > 0 ? (
              <>
                , and <strong style={bold}>{dueSoonCount}</strong> more{" "}
                {dueSoonCount === 1 ? "is" : "are"} due soon
              </>
            ) : null}
            .
          </Text>
          <Section style={block}>
            {overdue.map((item, index) => (
              <Text
                key={`${item.projectName}-${item.environmentName}-${item.folderName ?? ""}-${item.key}`}
                style={index === overdue.length - 1 ? listItemLast : listItem}
              >
                <span style={mono}>{item.key}</span>
                <br />
                <span style={meta}>
                  {item.projectName} / {item.environmentName}
                  {item.folderName ? ` / ${item.folderName}` : ""} &middot; {item.ageDays}d old
                  &middot; every {item.rotateEveryDays}d
                </span>
              </Text>
            ))}
          </Section>
          {overdueCount > overdue.length ? (
            <Text style={paragraph}>And {overdueCount - overdue.length} more.</Text>
          ) : null}
          <Section style={infoBlock}>
            <Text style={infoText}>
              Only names and timestamps are included. Secret values stay encrypted on your devices.
            </Text>
          </Section>
          <Button style={button} href={dashboardUrl}>
            Open Dashboard
          </Button>
          <Text style={unsubscribe}>
            You&apos;re receiving this weekly digest because you turned it on.{" "}
            <Link href={settingsUrl} style={unsubscribeLink}>
              Manage notifications
            </Link>
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

export default RotationDigestEmail;

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

const bold = {
  color: "#fafaf9",
  fontWeight: "600" as const,
};

const block = {
  backgroundColor: "#141414",
  border: "1px solid #2e2e2e",
  padding: "20px",
  marginBottom: "24px",
};

const listItem = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#a3a3a3",
  margin: "0 0 12px 0",
};

const listItemLast = {
  ...listItem,
  margin: "0",
};

const mono = {
  fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  color: "#fafaf9",
};

const meta = {
  fontSize: "13px",
  color: "#737373",
};

const infoBlock = {
  backgroundColor: "#141414",
  border: "1px solid #2e2e2e",
  padding: "16px",
  marginBottom: "24px",
};

const infoText = {
  fontSize: "13px",
  lineHeight: "22px",
  color: "#737373",
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

const unsubscribe = {
  fontSize: "12px",
  lineHeight: "20px",
  color: "#525252",
  margin: "24px 0 0 0",
};

const unsubscribeLink = {
  color: "#737373",
  textDecoration: "underline",
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
