import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Rate } from "k6/metrics";

const validResponses = new Rate("valid_status_responses");

export const options = {
  stages: [
    { duration: "30s", target: 20 }, // Ramp up to 20 virtual users
    { duration: "1m", target: 50 }, // Ramp from 20 to 50 virtual users
    { duration: "20s", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<250"], // 95% of requests must complete below 250ms
    http_req_failed: ["rate<0.01"], // Error rate must be less than 1%
    valid_status_responses: ["rate>0.99"],
  },
};

const BASE_URL = __ENV.API_URL || "http://localhost:3000";

export function setup() {
  // Pre-authenticate as Administrator to obtain session cookie
  const loginRes = http.post(
    `${BASE_URL}/trpc/auth.login`,
    JSON.stringify({
      username: __ENV.ADMIN_USERNAME || "test_admin",
      password: __ENV.ADMIN_PASSWORD || "admin1234",
    }),
    { headers: { "Content-Type": "application/json" } },
  );

  const sessionCookie = loginRes.cookies["ulms_session"]?.[0]?.value || null;
  if (
    loginRes.status !== 200 ||
    loginRes.json("result.data.user.role") !== "admin" ||
    !sessionCookie
  ) {
    fail(
      "Load-test setup did not receive a successful admin login and session cookie",
    );
  }
  return { sessionCookie };
}

export default function (data) {
  const params = {
    headers: {
      "Content-Type": "application/json",
      ...(data && data.sessionCookie
        ? { Cookie: `ulms_session=${data.sessionCookie}` }
        : {}),
    },
  };

  // Query System Status endpoint via tRPC HTTP GET
  const res = http.get(`${BASE_URL}/trpc/admin.getSystemStatus`, params);

  let hasStatusData = false;
  try {
    hasStatusData =
      res.status === 200 &&
      res.json("result.data.database.state") !== undefined &&
      res.json("error") === undefined;
  } catch {
    // An HTML or malformed response must fail the API-response threshold too.
  }
  validResponses.add(hasStatusData);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "returns system-status data, not a tRPC error": () => hasStatusData,
    "latency is below 250ms": (r) => r.timings.duration < 250,
  });

  sleep(1);
}
