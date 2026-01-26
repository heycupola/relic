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
            <svg
              width="97"
              height="41"
              viewBox="0 0 388 165"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={logo}
              role="img"
              aria-label="Relic"
            >
              <title>Relic</title>
              <path
                d="M0 165V48.4727H23.4464V62.1818H27.1607C29.0179 57.297 31.9583 53.7515 35.9821 51.5455C40.1607 49.1818 45.2679 48 51.3036 48H65V69.9818H50.375C42.6369 69.9818 36.2917 72.1879 31.3393 76.6C26.3869 80.8545 23.9107 87.4727 23.9107 96.4545V165H0Z"
                fill="#1a1a1a"
              />
              <path
                d="M131.884 165C120.107 165 109.822 162.56 101.029 157.681C92.2355 152.645 85.3265 145.641 80.3017 136.67C75.4339 127.541 73 116.996 73 105.035V102.202C73 90.0825 75.4339 79.5374 80.3017 70.5662C85.1694 61.4376 91.9215 54.4338 100.558 49.5547C109.351 44.5182 119.479 42 130.942 42C142.091 42 151.826 44.5182 160.149 49.5547C168.628 54.4338 175.223 61.2802 179.934 70.094C184.645 78.9079 187 89.2169 187 101.021V110.228H97.7314C98.0455 120.459 101.421 128.643 107.86 134.781C114.455 140.762 122.62 143.752 132.355 143.752C141.463 143.752 148.293 141.706 152.847 137.614C157.558 133.522 161.169 128.8 163.682 123.449L183.702 133.837C181.504 138.244 178.285 142.887 174.045 147.766C169.963 152.645 164.545 156.737 157.793 160.042C151.041 163.347 142.405 165 131.884 165ZM97.9669 91.5777H162.269C161.64 82.7639 158.5 75.9175 152.847 71.0384C147.194 66.0019 139.814 63.4837 130.707 63.4837C121.599 63.4837 114.141 66.0019 108.331 71.0384C102.678 75.9175 99.2231 82.7639 97.9669 91.5777Z"
                fill="#1a1a1a"
              />
              <path d="M195 165V0H220V165H195Z" fill="#1a1a1a" />
              <path
                d="M232.683 165V48.7929H258.07V165H232.683ZM245.5 33C240.57 33 236.38 31.5071 232.93 28.5214C229.643 25.3786 228 21.3714 228 16.5C228 11.6286 229.643 7.7 232.93 4.71429C236.38 1.57143 240.57 0 245.5 0C250.594 0 254.784 1.57143 258.07 4.71429C261.357 7.7 263 11.6286 263 16.5C263 21.3714 261.357 25.3786 258.07 28.5214C254.784 31.5071 250.594 33 245.5 33Z"
                fill="#1a1a1a"
              />
              <path
                d="M330.559 165C319.416 165 309.294 162.639 300.191 157.917C291.245 153.196 284.105 146.349 278.769 137.378C273.59 128.407 271 117.626 271 105.035V101.965C271 89.3743 273.59 78.6718 278.769 69.858C284.105 60.8868 291.245 54.0403 300.191 49.3186C309.294 44.4395 319.416 42 330.559 42C341.702 42 351.197 44.0461 359.044 48.1382C366.891 52.2303 373.169 57.6603 377.877 64.428C382.742 71.1958 385.881 78.6718 387.294 86.856L363.753 91.8138C362.968 86.62 361.32 81.8983 358.809 77.6488C356.298 73.3992 352.767 70.0154 348.215 67.4971C343.664 64.9789 337.936 63.7198 331.03 63.7198C324.282 63.7198 318.161 65.2937 312.668 68.4415C307.332 71.4319 303.095 75.8388 299.956 81.6622C296.817 87.3282 295.247 94.2534 295.247 102.438V104.562C295.247 112.747 296.817 119.75 299.956 125.574C303.095 131.397 307.332 135.804 312.668 138.795C318.161 141.785 324.282 143.28 331.03 143.28C341.231 143.28 349 140.683 354.336 135.489C359.672 130.138 363.046 123.37 364.459 115.186L388 120.616C386.117 128.643 382.742 136.04 377.877 142.808C373.169 149.576 366.891 155.006 359.044 159.098C351.197 163.033 341.702 165 330.559 165Z"
                fill="#1a1a1a"
              />
            </svg>
            <Hr style={divider} />
            <Text style={heading}>Your grace period has ended</Text>
            <Text style={paragraph}>Hi {userName},</Text>
            <Text style={paragraph}>
              Your 7-day grace period has ended.
              {hasProjects && <> Your access to the following has been restricted:</>}
            </Text>
            {(ownedProjectCount > 0 || sharedProjectCount > 0) && (
              <Section style={warningBlock}>
                {ownedProjectCount > 0 && (
                  <Text style={listItem}>
                    {ownedProjectCount} {ownedProjectCount === 1 ? "project" : "projects"} (owned by
                    you)
                  </Text>
                )}
                {sharedProjectCount > 0 && (
                  <Text style={listItem}>
                    {sharedProjectCount} shared {sharedProjectCount === 1 ? "project" : "projects"}
                  </Text>
                )}
              </Section>
            )}
            <Text style={paragraph}>
              To regain access, please upgrade to Pro or archive some projects to fit within the
              Free plan limit (2 projects).
            </Text>
            <Button style={button} href={upgradeUrl}>
              Upgrade to Pro
            </Button>
          </Section>
          <Section style={footer}>
            <a href="https://cupo.la" style={footerLink}>
              <Text style={footerText}>Built by</Text>
              <Img
                src={`${process.env.SITE_URL || "https://relic.so"}/cupola-dark.svg`}
                alt="Cupola"
                width="100"
                height="20"
                style={cupolaLogo}
              />
            </a>
            <Text style={footerCopyright}>© 2025</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default AccessRestrictedEmail;

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

const warningBlock = {
  backgroundColor: "#fef2f2",
  border: "1px solid #fecaca",
  padding: "20px",
  marginBottom: "24px",
};

const listItem = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#404040",
  margin: "0 0 8px 0",
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

const footerLink = {
  textDecoration: "none",
  display: "block",
};

const cupolaLogo = {
  height: "20px",
  width: "auto",
  margin: "4px auto 8px",
  display: "block",
};
