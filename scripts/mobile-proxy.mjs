import http from "node:http";

const frontendTarget = new URL(process.env.FRONTEND_TARGET ?? "http://127.0.0.1:3000");
const backendTarget = new URL(process.env.BACKEND_TARGET ?? "http://127.0.0.1:8000");
const listenPort = Number(process.env.MOBILE_PROXY_PORT ?? 3001);
const backendPrefix = "/backend";

function selectTarget(pathname = "/") {
  if (pathname === backendPrefix || pathname.startsWith(`${backendPrefix}/`)) {
    return backendTarget;
  }

  return frontendTarget;
}

function rewritePath(pathname = "/") {
  if (pathname === backendPrefix) return "/";
  if (pathname.startsWith(`${backendPrefix}/`)) {
    return pathname.slice(backendPrefix.length);
  }

  return pathname;
}

const server = http.createServer((req, res) => {
  const target = selectTarget(req.url ? new URL(req.url, "http://127.0.0.1").pathname : "/");
  const incomingUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const targetUrl = new URL(target.origin);
  targetUrl.pathname = rewritePath(incomingUrl.pathname);
  targetUrl.search = incomingUrl.search;

  const proxyReq = http.request(
    targetUrl,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.statusMessage, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "proxy_error",
        message: error.message,
        target: target.origin,
      })
    );
  });

  req.pipe(proxyReq);
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`Mobile proxy listening on http://127.0.0.1:${listenPort}`);
  console.log(`Frontend target: ${frontendTarget.origin}`);
  console.log(`Backend target: ${backendTarget.origin} via ${backendPrefix}`);
});
