/*
 * The command line main() routine for the web scraper
 */

fs = require('fs');
path = require('path');
optimist = require('optimist');
url = require('url');

BANNER = "Usage: scrape <OutputDir> <OutputFilename> <URL>";

/*
 *
 * create directory Workspace/ThemeName if it doesn't already exist.
 * Save to PageName
 * Save all the assets of to the directory, and
 * Rewrite html to point to them
 */
exports.run = function() {
  var argv = optimist.usage(BANNER).argv;
  if (argv._.length < 2) {
    optimist.showHelp();
    return false;
  }
  
  var outputDir = argv._[0];
  var pageName = argv._[1];
  var requestUrl = argv._[2];

  // Create the Workspace directory if it doesn't exist
  if (! fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }


  // Now we know that <Workspace Directory>/<Theme Directory> exists.

  var options = {
    FetchPages: true,
    FetchAssets: true,
    AnnotateDom: false,
    OutputFiles: true
  };

  var pipeline = new Jailbreak.Pipeline.Pipeline(options);

  /*
   * TODO(jason): Create a content map PROGRAMMATICALLY
   * see the file
   *    content-maps/testmap.json
   * as a guide
   */
  // We'll create this
  var contentMapConfig = { 
      name: "Single URL",
      // TODO(jason)
      // Parse out the domain from the URL
      // e.g. "people.csail.mit.edu"
      domain: url.parse(requestUrl, true).host,
      pages: [
        {
          name: pageName,
          // TODO(jason):
          // Parse out the path from the url variable.
          // e.g. "/karger"
          path: url.parse(requestUrl,true).pathname
        }
      ]
    };

  // TODO(jason):
  // I already modified the ContentMap constructor for you, so
  // you can just pass this JSON object you create above into it.
  // (I'd rather you spend time focusing on how the scraping pipeline works)
  var contentMap = new Jailbreak.ContentMap(contentMapConfig);
  var theme = new Jailbreak.Theme(themeName, themeDirectory, contentMap);
  pipeline.run(theme);
};
