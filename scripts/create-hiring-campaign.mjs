import { pathToFileURL } from "node:url";
import { createSupabaseAdmin } from "../api/_lib/adapters/supabase.js";
import { readServerEnv } from "../api/_lib/env.js";
import { createOpaqueToken, hashToken } from "../api/_lib/tokens.js";
import { getRoleBySlug } from "../shared/hiring/roles.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createPrivateCampaign({
  roleSlug,
  label,
  days,
  siteUrl,
  now = new Date(),
  tokenFactory = () => createOpaqueToken(32)
}) {
  if (!getRoleBySlug(roleSlug)) throw new TypeError("Unknown hiring role.");
  if (typeof label !== "string" || !label.trim() || label.trim().length > 120) {
    throw new TypeError("Campaign label must contain 1 to 120 characters.");
  }
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new TypeError("Campaign days must be an integer from 1 to 90.");
  }

  const base = new URL(siteUrl);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new TypeError("Campaign site URL must be secure.");
  }
  const token = tokenFactory();
  const activeAt = new Date(now);
  const expiresAt = new Date(activeAt.getTime() + days * DAY_MS);
  const path = `apply/${encodeURIComponent(roleSlug)}/${encodeURIComponent(token)}`;

  return {
    privateUrl: new URL(path, base.toString().endsWith("/") ? base : `${base}/`).toString(),
    record: {
      label: label.trim(),
      token_hash: hashToken(token),
      active_at: activeAt.toISOString(),
      expires_at: expiresAt.toISOString()
    }
  };
}

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function issueCampaign() {
  const roleSlug = readFlag(process.argv, "--role");
  const label = readFlag(process.argv, "--label");
  const days = Number(readFlag(process.argv, "--days") ?? 14);
  const env = readServerEnv();
  if (env.HIRING_PROVIDER_MODE !== "live") {
    throw new Error("Campaign issuance requires live provider mode.");
  }

  const issued = createPrivateCampaign({
    roleSlug,
    label,
    days,
    siteUrl: env.PUBLIC_SITE_URL
  });
  const client = createSupabaseAdmin(env);
  const { data: role, error: roleError } = await client
    .from("hiring_roles")
    .select("id")
    .eq("slug", roleSlug)
    .eq("active", true)
    .maybeSingle();
  if (roleError || !role?.id) throw new Error("Active hiring role was not found.");

  const { error } = await client.from("hiring_campaigns").insert({
    role_id: role.id,
    ...issued.record
  });
  if (error) throw new Error("Private campaign could not be created.");

  console.log(`Private URL: ${issued.privateUrl}`);
  console.log(`Expires: ${issued.record.expires_at}`);
  console.log("The raw campaign token is shown only in the private URL above.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  issueCampaign().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
