import http from "k6/http";
import { check, sleep } from "k6";
export const options = {
  vus: 20,
  duration: "20s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};
export default function () {
  const response = http.get(
    `${__ENV.API_URL || "http://api:3000"}/api/events?limit=9`,
  );
  check(response, { "catalogue returns 200": (r) => r.status === 200 });
  sleep(0.1);
}
