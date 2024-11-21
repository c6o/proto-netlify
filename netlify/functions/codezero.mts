import type { Context } from "@netlify/functions";
import { request } from "https";
import { request as httpRequest } from "http";

export default async (req: Request, context: Context): Promise<Response> => {
  const proxyOptions = {
    hostname: process.env.C6O_TEAMSPACE_HOST,
    port: 8800,
    method: "CONNECT",
    path: "sample-project-core.sample-project.svc.cluster.local:3000",
    rejectUnauthorized: false, // Ignore SSL/TLS certificate issues
    headers: {
      // TODO: Only allow the process.env.C6O_TOKEN 
      // if the context is a valid logged in netlify user
      "Proxy-Authorization": process.env.C6O_TOKEN,
      "x-c6o-variant": "",
    },
  };

  return new Promise((resolve) => {
    const proxyReq = request(proxyOptions);

    proxyReq.on("connect", (res, socket, head) => {
      console.log("HTTP CONNECT successful with status:", res.statusCode);

      if (res.statusCode !== 200) {
        resolve(
          new Response(
            JSON.stringify({
              message: "Failed to establish proxy connection",
              statusCode: res.statusCode,
            }),
            { status: res.statusCode || 502, headers: { "Content-Type": "application/json" } }
          )
        );
        return;
      }

      console.log("Proxy connection established. Sending request to target server...");

      // Use the existing socket to send the HTTP request to the target server
      const targetOptions = {
        createConnection: () => socket, // Use the connected proxy socket
        method: req.method,
        headers: Object.fromEntries(req.headers), // Forward headers from the original request
        hostname: "sample-project-core.sample-project.svc.cluster.local",
        port: 3000,
        path: "/api", // Ensure the correct path is used
      };

      const targetReq = httpRequest(targetOptions, (targetRes) => {
        let data = "";

        console.log("Received response from target server:", {
          statusCode: targetRes.statusCode,
          headers: targetRes.headers,
        });

        targetRes.on("data", (chunk) => {
          console.log("Receiving data chunk from target server...");
          data += chunk;
        });

        targetRes.on("end", () => {
          console.log("Target server response fully received. Sending back to client.");
          resolve(
            new Response(data, {
              status: targetRes.statusCode || 200,
              headers: {
                "Content-Type": targetRes.headers["content-type"] || "application/json",
              },
            })
          );
        });
      });

      targetReq.on("error", (err) => {
        console.error("Error during request to target server:", err.message);
        resolve(
          new Response(
            JSON.stringify({
              error: "Request to target server failed",
              message: err.message,
            }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          )
        );
      });

      if (req.body) {
        console.log("Piping request body to target server...");
        req.body.pipe(targetReq);
      } else {
        console.log("No request body. Ending target request...");
        targetReq.end();
      }
    });

    proxyReq.on("error", (err) => {
      console.error("Error during HTTP CONNECT:", err.message);
      resolve(
        new Response(
          JSON.stringify({
            error: "Proxy connection failed",
            message: err.message,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      );
    });

    console.log("Sending HTTP CONNECT request...");
    proxyReq.end();
  });
};
