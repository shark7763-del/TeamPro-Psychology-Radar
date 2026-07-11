const http = require("http");

const baseUrl = process.argv[2] || "http://127.0.0.1:4173/";
const targets = [
  { path: "#/", width: 375, height: 812 },
  { path: "#/", width: 390, height: 844 },
  { path: "#/", width: 430, height: 932 },
  { path: "#/coach/login", width: 390, height: 844 },
  { path: "#/coach/dashboard", width: 1280, height: 900 }
];

function requestJson(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: 9222, path, method }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function openTab() {
  const item = await requestJson(`/json/new?${encodeURIComponent("about:blank")}`, "PUT");
  return item.webSocketDebuggerUrl;
}

async function runCdp(wsUrl, actions) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else {
      events.push(message);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  function send(method, params = {}) {
    const messageId = ++id;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolve) => pending.set(messageId, resolve));
  }
  const result = await actions(send, events);
  ws.close();
  return result;
}

function waitForEvent(events, method, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (events.some((event) => event.method === method)) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${method}`));
      }
    }, 50);
  });
}

async function main() {
  const wsUrl = await openTab();
  const result = await runCdp(wsUrl, async (send, events) => {
    await send("Page.enable");
    await send("Runtime.enable");
    const consoleErrors = [];
    const originalPush = events.push.bind(events);
    events.push = (message) => {
      if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails.text || "exception");
      if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
        consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description || "").join(" "));
      }
      return originalPush(message);
    };
    const checks = [];
    for (const target of targets) {
      events.length = 0;
      await send("Emulation.setDeviceMetricsOverride", {
        width: target.width,
        height: target.height,
        deviceScaleFactor: 1,
        mobile: target.width < 700
      });
      await send("Page.navigate", { url: `${baseUrl}${target.path}` });
      await new Promise((resolve) => setTimeout(resolve, 900));
      const evaluation = await send("Runtime.evaluate", {
        returnByValue: true,
        expression: `(() => ({
          title: document.title,
          text: document.body.innerText,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          width: window.innerWidth,
          route: location.hash
        }))()`
      });
      checks.push(evaluation.result.result.value);
    }
    return { checks, consoleErrors };
  });
  const failures = [];
  for (const check of result.checks) {
    if (check.overflow) failures.push(`${check.route} overflows at ${check.width}px`);
    if (check.route === "#/" && (!check.text.includes("姓名") || !check.text.includes("運動項目"))) failures.push("home missing athlete fields");
    if (check.route === "#/coach/login" && !check.text.includes("教練帳號")) failures.push("coach login missing account field");
  }
  const dashboard = result.checks.find((check) => check.route === "#/coach/dashboard");
  if (dashboard && !dashboard.text.includes("教練帳號") && !dashboard.text.includes("今日心理狀態")) {
    failures.push("protected dashboard did not redirect or render");
  }
  if (result.consoleErrors.length) failures.push(`console errors: ${result.consoleErrors.join(" | ")}`);
  if (failures.length) {
    console.error(JSON.stringify(result.checks, null, 2));
    throw new Error(failures.join("\n"));
  }
  console.log("Browser smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
