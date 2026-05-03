// Weekly sign-up digest for Chordpad.
// Runs on a pg_cron schedule, queries auth.users for the last 7 days, formats a
// small HTML table, and sends via Resend to hello@chordpad.app.
//
// Triggered via pg_cron (see ../../cron-schedule.sql). Auth model: this function
// has verify_jwt = false (set in the Supabase dashboard) and instead checks a
// shared CRON_SECRET header — keeps the JWT/Vault setup off the critical path.
//
// Env vars (set in Supabase dashboard → Project Settings → Edge Functions → Secrets):
//   RESEND_API_KEY  — from https://resend.com/api-keys
//   CRON_SECRET     — any long random string; same value goes in the cron SQL
//   DIGEST_FROM     — sender, e.g. "Chordpad Reports <reports@chordpad.app>"
//   DIGEST_TO       — recipient, e.g. "hello@chordpad.app"
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase — no
// need to set them as secrets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
}

Deno.serve(async (req: Request) => {
  // Auth: require the shared cron secret. Verify before doing any work so a
  // misconfigured caller doesn't get a free user-list query.
  const wantSecret = Deno.env.get("CRON_SECRET");
  const gotSecret = req.headers.get("x-cron-secret");
  if (!wantSecret || wantSecret !== gotSecret) {
    return new Response("forbidden", { status: 403 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const digestFrom = Deno.env.get("DIGEST_FROM") ?? "Chordpad Reports <reports@chordpad.app>";
  const digestTo = Deno.env.get("DIGEST_TO") ?? "hello@chordpad.app";
  if (!supabaseUrl || !serviceRoleKey) return new Response("missing supabase env", { status: 500 });
  if (!resendKey) return new Response("missing RESEND_API_KEY", { status: 500 });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Page through admin.listUsers — 1000 is the default cap per page; we paginate
  // for safety once you cross that. Sort newest first locally so we don't depend
  // on the order Supabase returns.
  const all: Array<{ email?: string | null; created_at: string }> = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("listUsers failed:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    const users = data?.users ?? [];
    if (!users.length) break;
    all.push(...users.map((u) => ({ email: u.email, created_at: u.created_at })));
    if (users.length < 1000) break;
    page++;
  }

  const totalUsers = all.length;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newUsers = all
    .filter((u) => new Date(u.created_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const rows = newUsers
    .map((u) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${esc(u.email ?? "(no email)")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:13px;white-space:nowrap;">${new Date(u.created_at).toUTCString()}</td>
      </tr>`)
    .join("");

  const subject = `Chordpad weekly digest — ${newUsers.length} new sign-up${newUsers.length === 1 ? "" : "s"}`;
  const html = `<!doctype html><html><body style="margin:0;background:#fbfaf7;">
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:28px 24px;background:#fff;">
      <h2 style="margin:0 0 4px 0;font-family:Georgia,serif;color:#14161a;">Chordpad weekly sign-up digest</h2>
      <p style="color:#6b7180;margin:0 0 24px 0;font-size:14px;">
        ${newUsers.length} new sign-up${newUsers.length === 1 ? "" : "s"} in the last 7 days · ${totalUsers} total user${totalUsers === 1 ? "" : "s"}
      </p>
      ${newUsers.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr style="text-align:left;border-bottom:2px solid #e7e3d8;">
            <th style="padding:8px 12px;font-weight:600;">Email</th>
            <th style="padding:8px 12px;font-weight:600;">Joined (UTC)</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      ` : `<p style="color:#999;">No new sign-ups this week.</p>`}
      <p style="margin-top:32px;color:#999;font-size:12px;">Sent by the weekly-signup-digest Supabase Edge Function. Adjust the cadence in the cron schedule.</p>
    </div></body></html>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: digestFrom, to: [digestTo], subject, html }),
  });

  if (!r.ok) {
    const body = await r.text();
    console.error("Resend send failed:", r.status, body);
    return new Response(JSON.stringify({ error: body }), { status: 502 });
  }

  return new Response(JSON.stringify({ sent: true, new: newUsers.length, total: totalUsers }), {
    headers: { "Content-Type": "application/json" },
  });
});
