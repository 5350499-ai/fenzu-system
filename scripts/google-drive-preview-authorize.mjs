import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const redirectUri = "http://localhost:42813/google-drive-preview/callback";
const outputPath = process.env.GOOGLE_DRIVE_PREVIEW_TOKEN_FILE || ".google-drive-preview-token.local";
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in the local shell environment.");
  process.exit(1);
}

const state = randomBytes(24).toString("hex");
const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorizationUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/drive.file",
  access_type: "offline",
  prompt: "consent",
  state
}).toString();

function finish(statusCode, body) {
  process.stdout.write(`${body}\n`);
  process.exitCode = statusCode === 0 ? 0 : 1;
  server.close();
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", redirectUri);
  if (requestUrl.pathname !== "/google-drive-preview/callback") {
    response.writeHead(404).end();
    return;
  }

  if (requestUrl.searchParams.get("state") !== state || requestUrl.searchParams.get("error")) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Google authorization was not completed. You can close this tab.");
    finish(1, "Google authorization was not completed; no token was saved.");
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: requestUrl.searchParams.get("code") || "",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokenPayload = await tokenResponse.json().catch(() => null);
    const refreshToken = tokenPayload && typeof tokenPayload === "object" && "refresh_token" in tokenPayload
      ? tokenPayload.refresh_token
      : null;
    if (!tokenResponse.ok || typeof refreshToken !== "string" || !refreshToken) {
      throw new Error("Google did not return a refresh token.");
    }

    await writeFile(outputPath, `${JSON.stringify({ GOOGLE_REFRESH_TOKEN: refreshToken })}\n`, { encoding: "utf8", mode: 0o600 });
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Authorization completed. You can close this tab.");
    finish(0, `Authorization completed. The refresh token was saved only to ${outputPath}.`);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Authorization failed. You can close this tab.");
    finish(1, "Google authorization failed; no token was saved.");
  }
});

server.listen(42813, "127.0.0.1", () => {
  console.log("Open this Google authorization URL in your browser:");
  console.log(authorizationUrl.toString());
  console.log("The script never prints the authorization code, access token, or refresh token.");
});
