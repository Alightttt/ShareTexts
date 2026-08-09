import * as OTPAuth from 'otpauth';

export function generateTOTP(secret: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: "ShareText",
    label: "Session",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: secret
  });
  return totp.generate();
}

export function getTOTPProgress(): number {
  const now = Date.now() / 1000;
  return (now % 30) / 30;
}

export function getTOTPRemainingSeconds(): number {
  const now = Date.now() / 1000;
  return 30 - (now % 30);
}
