import rawConfig from "../config.yaml";

/**
 * Single source of truth for non-secret configuration, loaded from config.yaml.
 *
 * Secrets (auth tokens) stay in .env and are read straight from process.env where
 * needed — see requireAuth(). Everything non-secret (variants, model, port,
 * workspace root, protected branches) lives in config.yaml so it can change
 * without touching code.
 */

/** A variant before its persona markdown is assembled — see persona.ts. */
export interface VariantSpec {
  id: string;
  name: string;
  avatar: string;
}

export interface Config {
  workspaceRoot: string;
  model: string;
  port: number;
  defaultVariant: string;
  protectedBranches: string[];
  variants: VariantSpec[];
}

// The raw YAML uses snake_case keys; map them onto the camelCase Config shape.
interface RawConfig {
  workspace_root: string;
  model: string;
  port: number;
  default_variant: string;
  protected_branches: string[];
  variants: VariantSpec[];
}

const raw = rawConfig as RawConfig;

export const config: Config = {
  workspaceRoot: raw.workspace_root,
  model: raw.model,
  port: raw.port,
  defaultVariant: raw.default_variant,
  protectedBranches: raw.protected_branches,
  variants: raw.variants,
};

/**
 * Exit early with a clear message unless an auth credential is present. Either a
 * subscription OAuth token (from `claude setup-token`) or a pay-as-you-go API key
 * works; if both are set the API key wins, so prefer setting only one.
 */
export function requireAuth(): void {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Set CLAUDE_CODE_OAUTH_TOKEN (run `claude setup-token` to use your Claude\n" +
        "subscription) or ANTHROPIC_API_KEY (pay-as-you-go). See .env.example.",
    );
    process.exit(1);
  }
}
