const Express = require("express");
const cdn = Express.Router();
const config = require("config");
const cache = require("helper/express-disk-cache")(config.cache_directory, {
  minify: true,
  gzip: true,
});
const root = require("helper/rootDir");
const fs = require("fs-extra");
const { join } = require("path");
const { build } = require("esbuild");
const tmp = require("helper/tempDir")();

var documentation_static_files = join(root, "/app/views");
var static_files_directory = join(root, "/app/blog/static");

// This route is used by Blot's CDN (AWS Cloudfront) to retrieve
// static assets generated by Blot and serve them to your readers.
// A request to:
//
// https://blotcdn.com/{blogID}/path-to/file.jpg
//
// Will have its SSl terminated by Cloudfront close to the user.
// Cloudfront will then request the following URL from Blot's
// main server and send back the response:
//
// https://blot.im/static/{blogID}/path-to/file.jpg
//
// Cloudfront will store this response to server future requests

cdn.use(cache);

cdn

  // These files are generated by Blot and their paths contain GUIDs.
  // They never change and can be cached forever.
  .use(
    Express.static(config.blog_static_files_dir, {
      immutable: true,
      maxAge: "31536000",
      lastModified: false,
      etag: false,
    })
  )

  .get("/documentation/:cacheid/documentation.min.js", async (req, res) => {
    await build({
      entryPoints: [join(documentation_static_files, "js/documentation.js")],
      bundle: true,
      minify: true,
      // sourcemap: true,
      target: ["chrome58", "firefox57", "safari11", "edge16"],
      outfile: join(tmp, "documentation.min.js"),
    });

    const code = await fs.readFile(join(tmp, "documentation.min.js"), "utf-8");

    res.setHeader("Content-Type", "text/javascript");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.send(code);
  })

  .get("/documentation/:cacheid/style.min.css", async (req, res) => {
    // merge all css files together into one file
    const cssDir = join(documentation_static_files, "css");
    const cssFiles = (await fs.readdir(cssDir)).filter((i) =>
      i.endsWith(".css")
    );
    const cssContents = await Promise.all(
      cssFiles.map((name) => fs.readFile(join(cssDir, name), "utf-8"))
    );

    const mergedCSS = cssContents.join("\n\n");

    res.setHeader("Content-Type", "text/css");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.send(mergedCSS);
  })

  .use(
    "/documentation/:cacheid/",
    Express.static(documentation_static_files, {
      index: false, // Without 'index: false' this will server the index.html files inside
      redirect: false, // Without 'redirect: false' this will redirect URLs to existent directories
      maxAge: 86400000,
      setHeaders: function (res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      },
    })
  )

  .use(
    "/documentation/fonts/",
    Express.static(documentation_static_files + "/fonts", {
      index: false, // Without 'index: false' this will server the index.html files inside
      redirect: false, // Without 'redirect: false' this will redirect URLs to existent directories
      maxAge: 86400000,
      setHeaders: function (res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      },
    })
  )

  .use(
    Express.static(static_files_directory, {
      immutable: true,
      maxAge: "31536000",
      lastModified: false,
      etag: false,
      setHeaders: function (res) {
        res.setHeader("Access-Control-Allow-Origin", "*");
      },
    })
  )

  .use(function (req, res) {
    res.status(404).send("404: Not found");
  })

  .use(function (err, req, res, next) {
    res.status(400).send("400: Bad request");
  });

// It might be nice to add a route which can render CSS and JS
// on a particular template
module.exports = cdn;
