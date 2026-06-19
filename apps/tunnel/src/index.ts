import { spawn } from "node:child_process";
import { env } from "./env";

const originUrl = `http://localhost:${env.PORT}`;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function printWebhookInfo(publicUrl: string): void {
  const url = trimTrailingSlash(publicUrl);

  console.log("");
  console.log(`Cloudflare tunnel -> ${url}`);
  console.log(`Dodo webhook URL  -> ${url}/webhooks/dodo`);
  console.log(`OAuth proxy origin -> ${url}`);
  console.log("");
  console.log("Use these while developing:");
  console.log(`  Dodo webhook URL: ${url}/webhooks/dodo`);
  console.log(`  OAUTH_PROXY_ORIGIN: ${url}`);
  console.log("");
}

function getCloudflaredArgs(): string[] {
  return ["tunnel", "--no-autoupdate", "run", env.CLOUDFLARE_TUNNEL_NAME];
}

function main(): void {
  const args = getCloudflaredArgs();

  console.log("");
  console.log(`Starting Cloudflare named tunnel for ${originUrl}`);
  console.log(`Command: ${env.CLOUDFLARED_BIN} ${args.join(" ")}`);

  if (env.CLOUDFLARE_TUNNEL_PUBLIC_URL) {
    printWebhookInfo(env.CLOUDFLARE_TUNNEL_PUBLIC_URL);
  } else {
    console.log("");
    console.log("Using a configured Cloudflare Tunnel route.");
    console.log(
      "Set CLOUDFLARE_TUNNEL_PUBLIC_URL to print Dodo/OAuth callback values here.",
    );
    console.log("");
  }

  const tunnel = spawn(env.CLOUDFLARED_BIN, args, {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const handleOutput = (chunk: Buffer, stream: NodeJS.WriteStream) => {
    stream.write(chunk.toString());
  };

  tunnel.stdout.on("data", (chunk: Buffer) => {
    handleOutput(chunk, process.stdout);
  });
  tunnel.stderr.on("data", (chunk: Buffer) => {
    handleOutput(chunk, process.stderr);
  });

  tunnel.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        `Failed to start Cloudflare tunnel: ${env.CLOUDFLARED_BIN} was not found.`,
      );
      console.error(
        "Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
      );
    } else {
      console.error("Failed to start Cloudflare tunnel:", err);
    }
    process.exit(1);
  });

  tunnel.on("exit", (code, signal) => {
    if (signal) {
      process.exit(0);
    }
    process.exit(code ?? 0);
  });

  const stop = () => {
    tunnel.kill("SIGINT");
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main();
