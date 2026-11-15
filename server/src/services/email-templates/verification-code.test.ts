// src/services/email-templates/verification-code.test.ts
import { describe, it, expect } from 'vitest';
import { renderVerificationCodeEmail, escapeHtml } from './verification-code.js';

describe('Verification Code Email Template', () => {
  it('subject never contains the verification code digits', () => {
    const rendered = renderVerificationCodeEmail({
      name: 'Alice',
      code: '849201',
      ttlMinutes: 10,
    });

    expect(rendered.subject).toBe('Your OrchestrAI verification code');
    expect(/\d/.test(rendered.subject)).toBe(false);
  });

  it('html and text both contain the code and ttlMinutes correctly', () => {
    const rendered = renderVerificationCodeEmail({
      name: 'Bob',
      code: '654321',
      ttlMinutes: 10,
    });

    // Code presence
    expect(rendered.html).toContain('654321');
    expect(rendered.text).toContain('654321');

    // TTL presence
    expect(rendered.html).toContain('10 minutes');
    expect(rendered.text).toContain('10 minutes');

    // Security guidance presence
    expect(rendered.html).toContain('Never share this code');
    expect(rendered.text).toContain('Never share this code');
  });

  it('name containing script tags or HTML entities is escaped', () => {
    const maliciousName = '<script>alert("hack")</script> & "Bob"';
    const rendered = renderVerificationCodeEmail({
      name: maliciousName,
      code: '112233',
      ttlMinutes: 5,
    });

    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;alert(&quot;hack&quot;)&lt;/script&gt; &amp; &quot;Bob&quot;');
    // Plain text should preserve the raw string
    expect(rendered.text).toContain(maliciousName);
  });

  it('contains no outbound links or external image tags in HTML', () => {
    const rendered = renderVerificationCodeEmail({
      name: 'Carol',
      code: '998877',
      ttlMinutes: 15,
    });

    expect(rendered.html.toLowerCase()).not.toContain('http');
    expect(rendered.html.toLowerCase()).not.toContain('<img');
    expect(rendered.html.toLowerCase()).not.toContain('<a');
  });

  it('throws a plain Error for invalid 6-digit codes', () => {
    expect(() =>
      renderVerificationCodeEmail({
        name: 'Dave',
        code: '12345', // 5 digits
        ttlMinutes: 10,
      })
    ).toThrow(/Invalid verification code/);

    expect(() =>
      renderVerificationCodeEmail({
        name: 'Dave',
        code: '1234567', // 7 digits
        ttlMinutes: 10,
      })
    ).toThrow(/Invalid verification code/);

    expect(() =>
      renderVerificationCodeEmail({
        name: 'Dave',
        code: 'abcdef', // letters
        ttlMinutes: 10,
      })
    ).toThrow(/Invalid verification code/);
  });

  it('throws a plain Error for non-positive or non-integer ttlMinutes', () => {
    expect(() =>
      renderVerificationCodeEmail({
        name: 'Dave',
        code: '123456',
        ttlMinutes: 0,
      })
    ).toThrow(/Invalid ttlMinutes/);

    expect(() =>
      renderVerificationCodeEmail({
        name: 'Dave',
        code: '123456',
        ttlMinutes: -5,
      })
    ).toThrow(/Invalid ttlMinutes/);

    expect(() =>
      renderVerificationCodeEmail({
        name: 'Dave',
        code: '123456',
        ttlMinutes: 10.5,
      })
    ).toThrow(/Invalid ttlMinutes/);
  });

  it('escapeHtml helper properly replaces special characters', () => {
    expect(escapeHtml('Hello & "World" <test> \'quoted\'')).toBe(
      'Hello &amp; &quot;World&quot; &lt;test&gt; &#039;quoted&#039;'
    );
  });
});

