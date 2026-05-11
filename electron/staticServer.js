"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".vert": "text/plain; charset=utf-8",
  ".frag": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function resolveDistPath(rootDir, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const relative = decoded === "/" ? "/index.html" : decoded;
  const safePath = path.normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const absolute = path.join(rootDir, safePath);
  if (!absolute.startsWith(rootDir)) {
    return null;
  }
  return absolute;
}

function createStaticServer(rootDir) {
  const distRoot = path.resolve(rootDir);

  return new Promise(function (resolve, reject) {
    const server = http.createServer(function (req, res) {
      const target = resolveDistPath(distRoot, req.url || "/");
      if (!target) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.stat(target, function (err, stats) {
        if (err || !stats.isFile()) {
          const fallback = path.join(distRoot, "index.html");
          fs.readFile(fallback, function (fallbackErr, data) {
            if (fallbackErr) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(data);
          });
          return;
        }

        fs.readFile(target, function (readErr, data) {
          if (readErr) {
            res.writeHead(500);
            res.end("Read error");
            return;
          }
          res.writeHead(200, { "Content-Type": getMimeType(target) });
          res.end(data);
        });
      });
    });

    server.listen(0, "127.0.0.1", function () {
      const address = server.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: function () {
          return new Promise(function (resolveClose) {
            server.close(function () {
              resolveClose();
            });
          });
        },
      });
    });
    server.on("error", reject);
  });
}

module.exports = {
  createStaticServer,
};
