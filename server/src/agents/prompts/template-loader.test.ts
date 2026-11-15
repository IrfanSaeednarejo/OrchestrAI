// src/agents/prompts/template-loader.test.ts
// Phase 7: Unit tests for the prompt template loader.
// No external dependencies — purely in-memory object manipulation.

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  loadPrompt,
  validateTemplate,
  REQUIRED_SECTIONS,
  type PromptTemplate,
} from './template-loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid template with all 5 required sections. */
function makeValidTemplate(overrides: Partial<Record<string, string>> = {}): PromptTemplate {
  const sections: Record<string, string> = {
    Identity: 'I am a specialist.',
    Objective: 'Help customers.',
    Scope: 'Handle orders.',
    'Phased-Workflow': 'Step 1: greet. Step 2: resolve.',
    Guidelines: 'Be polite.',
    ...overrides,
  };
  return { sections };
}

// ---------------------------------------------------------------------------
// validateTemplate
// ---------------------------------------------------------------------------

describe('validateTemplate', () => {
  it('does not throw for a template that has all 5 required sections', () => {
    expect(() => validateTemplate(makeValidTemplate())).not.toThrow();
  });

  it('throws when Identity section is missing', () => {
    const t = makeValidTemplate();
    delete t.sections['Identity'];
    expect(() => validateTemplate(t)).toThrow(/Identity/);
  });

  it('throws when Objective section is missing', () => {
    const t = makeValidTemplate();
    delete t.sections['Objective'];
    expect(() => validateTemplate(t)).toThrow(/Objective/);
  });

  it('throws when Scope section is missing', () => {
    const t = makeValidTemplate();
    delete t.sections['Scope'];
    expect(() => validateTemplate(t)).toThrow(/Scope/);
  });

  it('throws when Phased-Workflow section is missing', () => {
    const t = makeValidTemplate();
    delete t.sections['Phased-Workflow'];
    expect(() => validateTemplate(t)).toThrow(/Phased-Workflow/);
  });

  it('throws when Guidelines section is missing', () => {
    const t = makeValidTemplate();
    delete t.sections['Guidelines'];
    expect(() => validateTemplate(t)).toThrow(/Guidelines/);
  });

  it('error message names ALL missing sections', () => {
    // Drop 3 at once
    const t: PromptTemplate = {
      sections: { Identity: 'x', Objective: 'y' },
    };
    expect(() => validateTemplate(t)).toThrow(/Scope/);
    expect(() => validateTemplate(t)).toThrow(/Phased-Workflow/);
    expect(() => validateTemplate(t)).toThrow(/Guidelines/);
  });

  it('allows extra sections beyond the required 5', () => {
    const t = makeValidTemplate({ 'Extra-Section': 'bonus content' });
    expect(() => validateTemplate(t)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// loadPrompt – happy path
// ---------------------------------------------------------------------------

describe('loadPrompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a non-empty string for a valid template with no params', () => {
    const result = loadPrompt(makeValidTemplate());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('contains all section names as headings in the output', () => {
    const result = loadPrompt(makeValidTemplate());
    for (const section of REQUIRED_SECTIONS) {
      expect(result).toContain(`## ${section}`);
    }
  });

  it('replaces {{key}} with the matching param value', () => {
    const t = makeValidTemplate({ Identity: 'Hello {{name}}, welcome.' });
    const result = loadPrompt(t, { name: 'Alice' });
    expect(result).toContain('Hello Alice, welcome.');
    expect(result).not.toContain('{{name}}');
  });

  it('replaces multiple distinct placeholders in the same section', () => {
    const t = makeValidTemplate({
      Identity: '{{role}} serving {{domain}}.',
    });
    const result = loadPrompt(t, { role: 'Agent', domain: 'payments' });
    expect(result).toContain('Agent serving payments.');
  });

  it('replaces the same placeholder that appears in multiple sections', () => {
    const t = makeValidTemplate({
      Identity: 'I am {{name}}.',
      Objective: 'My name is {{name}} and I help.',
    });
    const result = loadPrompt(t, { name: 'Bot' });
    expect(result.match(/Bot/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves unreplaced {{key}} verbatim and emits a console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = makeValidTemplate({ Objective: 'Your order {{orderId}} is ready.' });

    const result = loadPrompt(t, {}); // no params supplied

    expect(result).toContain('{{orderId}}');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain('{{orderId}}');
  });

  it('does NOT warn when all placeholders are replaced', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = makeValidTemplate({ Identity: 'Hello {{name}}.' });
    loadPrompt(t, { name: 'Alice' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns only once even when the same unreplaced key appears multiple times', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = makeValidTemplate({ Identity: '{{x}} and {{x}} again.' });
    loadPrompt(t, {});
    expect(warnSpy).toHaveBeenCalledOnce();
    // The warning should mention {{x}} exactly once (deduplicated)
    const msg = warnSpy.mock.calls[0]?.[0] as string;
    expect(msg.split('{{x}}').length - 1).toBe(1);
  });

  it('throws when the template is missing a required section', () => {
    const t: PromptTemplate = {
      sections: { Identity: 'x', Objective: 'y' },
    };
    expect(() => loadPrompt(t, {})).toThrow();
  });

  it('defaults params to an empty object when not provided', () => {
    expect(() => loadPrompt(makeValidTemplate())).not.toThrow();
  });
});
