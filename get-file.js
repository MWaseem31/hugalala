// netlify/edge-functions/get-file.js
// Called by the site as GET /api/file/<filename>.enc
// Streams the raw encrypted bytes directly from GitHub — no redeploy needed
// for new files, and no size copy held in memory (uses response streaming).

export default async (request, context) => {
  const token = Deno.env.get("GITHUB_TOKEN");
  const owner = Deno.env.get("GITHUB_OWNER");
  const repo = Deno.env.get("GITHUB_REPO");
  const branch = Deno.env.get("GITHUB_BRANCH") || "main";
  const basePath = Deno.env.get("GITHUB_PATH") || "site/encrypted";

  const name = context.params.name;
  if (!name || name.includes("..") || name.includes("/")) {
    return new Response("invalid file name", { status: 400 });
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${basePath}/${encodeURIComponent(name)}?ref=${branch}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.raw",
        "User-Agent": "wedding-vault-site"
      }
    });

    if (!res.ok) {
      return new Response(`fetch failed: ${res.status}`, { status: res.status });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
};

export const config = { path: "/api/file/:name" };
