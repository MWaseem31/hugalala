// netlify/edge-functions/list-files.js
// Called by the site as GET /api/list-files
// Lists .enc files LIVE from your GitHub repo folder — no manifest.json,
// no build step. Add a file to the repo folder and it appears immediately
// on next page load.
//
// Requires these Netlify environment variables (Site settings -> Environment variables):
//   GITHUB_TOKEN   - a GitHub personal access token with read access to the repo
//   GITHUB_OWNER   - your GitHub username/org, e.g. "asad123"
//   GITHUB_REPO    - repo name, e.g. "wedding-vault"
//   GITHUB_BRANCH  - branch name, e.g. "main" (optional, defaults to main)
//   GITHUB_PATH    - folder path inside the repo, e.g. "site/encrypted" (optional, defaults to that)

export default async (request, context) => {
  const token = Deno.env.get("GITHUB_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") || "main";
  const path = Deno.env.get("GITHUB_PATH") || "site/encrypted";

  if (!token || !owner || !repo) {
    return new Response(JSON.stringify({ error: "Missing GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "wedding-vault-site"
      }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "GitHub list failed", status: res.status }), {
        status: res.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const items = await res.json();
    const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];

    const manifest = (Array.isArray(items) ? items : [])
      .filter((it) => it.type === "file" && it.name.endsWith(".enc"))
      .map((it) => {
        const original = it.name.replace(/\.enc$/, "");
        const dot = original.lastIndexOf(".");
        const ext = dot >= 0 ? original.slice(dot).toLowerCase() : "";
        return { file: it.name, type: VIDEO_EXT.includes(ext) ? "video" : "image", title: original };
      });

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/api/list-files" };
