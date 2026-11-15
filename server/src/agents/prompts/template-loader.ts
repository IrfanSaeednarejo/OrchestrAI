// src/agents/prompts/template-loader.ts
// Phase 7: Prompt template loader enforcing the 5 required specialist sections.
// Templates are plain in-memory objects — no file I/O in Phase 7.
// Concrete templates for each specialist arrive in Phase 9+.

// ---------------------------------------------------------------------------
// Required section contract
// ---------------------------------------------------------------------------

/** The five sections that every specialist prompt template must contain. */
export const REQUIRED_SECTIONS = [
  'Identity',
  'Objective',
  'Scope',
  'Phased-Workflow',
  'Guidelines',
] as const;

export type RequiredSection = (typeof REQUIRED_SECTIONS)[number];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A prompt template: a map from section name to its markdown content.
 * All five required sections must be present; additional sections are allowed.
 */
export interface PromptTemplate {
  sections: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Throws a descriptive `Error` if any required section is absent from the template.
 */
export function validateTemplate(template: PromptTemplate): void {
  const missing: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    if (!(section in template.sections)) {
      missing.push(section);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Prompt template is missing required section(s): ${missing.join(', ')}`
    );
  }
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/**
 * Renders all `{{key}}` placeholders in a string using the supplied params map.
 * Returns the rendered string and an array of unreplaced placeholder keys.
 */
function interpolateText(
  text: string,
  params: Record<string, string>
): { rendered: string; unreplaced: string[] } {
  const unreplaced: string[] = [];

  const rendered = text.replace(/\{\{(\w+)\}\}/g, (match, key: string): string => {
    const value: string | undefined = params[key];
    if (Object.prototype.hasOwnProperty.call(params, key) && value !== undefined) {
      return value;
    }
    unreplaced.push(key);
    return match; // keep placeholder verbatim
  });

  return { rendered, unreplaced };
}

// ---------------------------------------------------------------------------
// Main loader
// ---------------------------------------------------------------------------

/**
 * Renders all sections of the template, substituting `{{key}}` with values
 * from `params`, and concatenates them into a single prompt string.
 *
 * Logs a console warning (never throws) for any `{{key}}` that has no
 * corresponding entry in `params`, so callers notice missing substitutions
 * without crashing the agent.
 *
 * @throws {Error} if any required section is missing (via `validateTemplate`).
 */
export function loadPrompt(
  template: PromptTemplate,
  params: Record<string, string> = {}
): string {
  validateTemplate(template);

  const parts: string[] = [];
  const allUnreplaced: string[] = [];

  for (const [sectionName, sectionContent] of Object.entries(template.sections)) {
    const { rendered, unreplaced } = interpolateText(sectionContent, params);
    parts.push(`## ${sectionName}\n\n${rendered}`);
    allUnreplaced.push(...unreplaced);
  }

  if (allUnreplaced.length > 0) {
    const unique = [...new Set(allUnreplaced)];
    console.warn(
      `[loadPrompt] Unreplaced template variable(s): ${unique.map((k) => `{{${k}}}`).join(', ')}`
    );
  }

  return parts.join('\n\n');
}
