import http from "node:http";

const restaurant = {
  id: "92000000-0000-4000-8000-000000000001",
  slug: "club-qa-preview",
  name: "Casa Oliva",
  logoUrl: null,
  accent: "#B45309",
  background: "#FFF8EC",
  bookingPath: "/restaurante/club-qa-preview",
};

http.createServer((request, response) => {
  response.setHeader("access-control-allow-origin", "http://127.0.0.1:3000");
  response.setHeader("access-control-allow-headers", "authorization,apikey,content-type,x-client-info");
  response.setHeader("content-type", "application/json");
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.url?.startsWith("/rest/v1/rpc/club_public_restaurant")) {
    response.end(JSON.stringify(restaurant));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ message: "preview endpoint not implemented" }));
}).listen(54321, "127.0.0.1", () => {
  console.log("Loyalty preview mock listening on 127.0.0.1:54321");
});
