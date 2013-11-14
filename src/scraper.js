/**
 * Scraping proceeds in a few steps.
 * 1. Grab the HTML file
 * 2. Grab each asset the HTML file references
 * 3. Rewrite all paths in the HTML file to the new local directory structure
 * 4. Save all the assets
 */
var Uri = require("jsuri");
var FetchUrl = require("fetch-url");
var _ = require("underscore");
var jsdom = require("jsdom");
var fs = require("fs");
var path = require("path");

/*
 * A save function can be 
 */
var LocalSaveFn = function(pathAndFilename, data, encoding, mime, cb) {
  var pathname = path.dirname(pathAndFilename);
  try {
    if (! fs.existsSync(pathname)) {
      fs.mkdirSync(pathname);
    }
    fs.writeFileSync(pathAndFilename, data, encoding);
    cb(null, pathAndFilename);
  } catch (e) {
    cb(e);
  }
};

var DontRenameFn = function(filename, data) {
  return filename;
};

/*
 * Required
 *
 *   opts.url       -  URL to scrape
 *
 * Optional
 *
 *   opts.filename  -  Name of html file to save to
 *   opts.basedir   -  Base directory in which to extract
 */
WebScraper = function(opts) {
  this.opts = opts;
  if (typeof this.opts.basedir == 'undefined') {
    this.opts.basedir = '.';
  }
  if (typeof this.opts.filename == 'undefined') {
    this.opts.filename = 'index.html';
  }
  if (typeof this.opts.saveFn == 'undefined') {
    this.opts.saveFn = LocalSaveFn;
  }
  if (typeof this.opts.renameFn == 'undefined') {
    this.opts.renameFn = DontRenameFn;
  }
  if (typeof this.opts.createBaseDir == 'undefined') {
    this.opts.createBaseDir = true;
  }

  this.urlsDownloaded = {};
  this.manifest = {};
};

WebScraper.prototype.endsWith = function(s, suffix) {
  return s.indexOf(suffix, s.length - suffix.length) !== -1;
};

WebScraper.prototype.startsWith = function(s, suffix) {
  return s.indexOf(suffix) === 0;
};

WebScraper.prototype.filenameForUrl = function(url, kind) {
  var uri = new Uri(url);
  var filename = uri.uriParts.file;
  if ((typeof filename == 'undefined') || (filename.length === 0)) {
    filename = uri.uriParts.host;
  }
  if (filename === null) {
    var d = new Date();
    filename = "AutoGen_" + d.getTime();
  }

  if ((kind == 'html') && (! this.endsWith(filename, '.html'))) {
    filename = filename + '.html';
  } else if ((kind == 'js') && (! this.endsWith(filename, '.js'))) {
    filename = filename + '.js';
  } else if ((kind == 'css') && (! this.endsWith(filename, '.css'))) {
    filename = filename + '.css';
  }

  return filename;
};

WebScraper.prototype.isCssLink = function(e) {
  return (
    (
       (! _.isNull(e.prop('type'))) && 
       (e.prop('type').indexOf('css') != -1)
    ) || (
       (! _.isUndefined(e.attr('rel'))) && 
       (e.attr('rel') == 'stylesheet')
    )
  );
};

WebScraper.prototype.isRssLink = function(e) {
  return (
      (! _.isNull(e.prop('type'))) && 
      (e.prop('type').indexOf('rss') != 1)
  );
};

/*
 * Given an HTML element that references a file, returns an object
 * with the following properties:
 *  url: The file url
 *  localUrl: A localized file url
 *  binary: true/false
 *  type: image, css, etc etc
 */
WebScraper.prototype.extractFilespec = function(jqElem, fixToo) {
  var ret = {};

  var self = this;
  var guessImageMime = function(fname) {
    if (self.endsWith(fname, 'png')) {
      return "image/png";
    } else if (self.endsWith(fname, 'gif')) {
      return "image/gif";
    } else if (self.endsWith(fname, 'jpg')) {
      return "image/jpg";
    } else if (self.endsWith(fname, 'jpeg')) {
      return "image/jpeg";
    } else if (self.endsWith(fname, 'bmp')) {
      return "image/bmp";
    } else {
      return "image/other";
    }
  }

  if (jqElem.is('link')) {
    ret.binary = false;
    ret.url = jqElem.attr('href');
    ret.linkedFrom = this.opts.url;
    ret.encoding = "utf8";

    // Determine type.
    if (this.isCssLink(jqElem)) {
      ret.type = 'css';
      ret.mimeType = "text/css";
      ret.localUrl = 'css/' + this.filenameForUrl(ret.url);
    } else if (this.isRssLink(jqElem)) {
      ret.type = 'rss';
      ret.mimeType = "application/xml";
      ret.localUrl = 'rss/' + this.filenameForUrl(ret.url);
    } else {
      // We're going to put it in the other category. But first we'll try some common
      // image formats.
      if ((this.endsWith(ret.url, 'png')) ||
          (this.endsWith(ret.url, 'jpg')) ||
          (this.endsWith(ret.url, 'gif'))) {
        ret.type = 'image';
        ret.localUrl = 'images/' + this.filenameForUrl(ret.url);
        ret.binary = true;
        ret.mimeType = guessImageMime(ret.url);
      } else {
        ret.type = 'other';
        ret.mimeType = "txt/plain";
        ret.localUrl = 'other/' + this.filenameForUrl(ret.url);
      }
    }
    if (fixToo) {
      jqElem.attr('href', ret.localUrl);
    }
  } else if (jqElem.is('img')) {
    ret.binary = true;
    ret.url = jqElem.attr('src');
    ret.type = 'image';
    ret.localUrl = 'images/' + this.filenameForUrl(ret.url);
    if (fixToo) {
      jqElem.attr('src', ret.localUrl);
    }
    ret.mimeType = guessImageMime(ret.url);
  } else if (jqElem.is('script')) {
    ret.binary = false;
    ret.url = jqElem.attr('src');
    if (_.isUndefined(ret.url) || ret.url === null || ret.url === '') {
      ret = null;
    } else {
      ret.mimeType = "application/javascript";
      ret.type = 'js';
      ret.localUrl = 'js/' + this.filenameForUrl(ret.url);
      if (fixToo) {
        jqElem.attr('src', ret.localUrl);
      }
    }
  }
  if (ret !== null) {
    ret.linkedFrom = this.opts.url;
    if (ret.binary) {
      ret.encoding = "binary";
    }
  }
  return ret;
};

/**
 * Rewrites HTML such that all images are
 */
WebScraper.prototype.queueAndSaveAssets = function(html, success, failure) {
  this.assetQueue = [];
  var self = this;

  var considerElement = function(jqelem) {
    var fileSpec = self.extractFilespec(jqelem, true);
    if (fileSpec !== null) {
      self.assetQueue.push(fileSpec);
    }
  };

  /*
   * Queue up all the assets to download
   */
  jsdom.env({
    html: html,
    scripts: ["http://ajax.googleapis.com/ajax/libs/jquery/2.0.0/jquery.min.js"],
    done: function(errors, window) {
      if (errors) {
        failure(errors);
      } else {
        // Walk the DOM and get each asset.
        var $ = window.$;
        _.each($('img'), function(elem) { considerElement($(elem)); });
        _.each($('script'), function(elem) { considerElement($(elem)); });
        _.each($('link'), function(elem) { considerElement($(elem)); });
        // Snag any asset URLs out of inline CSS
        _.each($('style'), function(elem) {
          var e = $(elem);
          e.html(self.fixCssAndQueueFurtherAssets(e.html(), true, self.opts.url));
        });
        // Stash 'em away. Thar be ajax acomin'.
        self.fixedHtml = window.document.documentElement.innerHTML;
        self.queueAndSaveSuccess = success;
        self.queueAndSaveFailure = failure;
        self.saveAsset();
      } // if no errors
    } // done
  });
};

WebScraper.prototype.saveAsset = function() {
  if (this.assetQueue.length === 0) {
    this.queueAndSaveSuccess(this.fixedHtml);
  } else {
    // pop one off
    var asset = this.assetQueue[0];
    if (this.urlsDownloaded[asset.url] === true) {
      this.assetQueue.shift();
      this.saveAsset();
    } else {
      FetchUrl(asset, this.downloadAssetSuccess, this.downloadAssetFailure, asset.binary, this);
    }
  }
};

WebScraper.prototype.downloadAssetSuccess = function(data) {
  var asset = this.assetQueue.shift();
  var self = this;
  try {
    if (asset.type == 'css') {
      data = this.fixCssAndQueueFurtherAssets(data, false, asset.url);
    }
    var filename = path.join(this.opts.basedir, asset.localUrl);
    var mimeType = null;

    self.opts.saveFn(filename, data, asset.encoding, asset.mimeType, function(err, res) {
      if (err) {
      }
      self.urlsDownloaded[asset.url] = true;
      self.saveAsset();
    });
  } catch (e) {
    //console.log("Failed to save asset to disk");
    console.log(e);
    this.saveAsset();
  }
};

/**
 * Finds any file references in the CSS and fixes them.
 */
WebScraper.prototype.fixCssAndQueueFurtherAssets = function(css, inlineCss, linkedFrom) {
  var copy = "" + css;
  var pat = /url\(([^\)]+)\)/g;
  var prefix = "../images/";
  if (inlineCss) {
    prefix = "images/";
  }
  var match = pat.exec(css);
  while (match) {
    var url = match[1];
    // Avoid images that are serialized inline.
    if (! this.startsWith(this.filenameForUrl(url), "png;base64,")) {
      var localUrl = path.join('images', this.filenameForUrl(url));
      var cssUrl = prefix + this.filenameForUrl(url);
      var fileSpec = {
        binary: true,
        type: 'image',
        localUrl: localUrl,
        url: url,
        linkedFrom: linkedFrom 
      };
      this.assetQueue.push(fileSpec);
      var before = "url(" + url + ")";
      var after = "url(" + cssUrl + ")";
      copy = copy.replace(before, after);
    }
    match = pat.exec(css);
  }
  return copy;
};

WebScraper.prototype.downloadAssetFailure = function(e) {
  // Well.. nothing much can be done. We're not going to
  // hard fail here because so many sites have broken links.
  //console.log("Failed to download asset");
  //console.log(e);
  this.assetQueue.shift();
  this.saveAsset();
};

WebScraper.prototype.savePage = function(html, cb) {
  var fullPath = path.join(this.opts.basedir, this.opts.filename);
  var self = this;
  this.opts.saveFn(fullPath, html, "utf8", "text/html", function(error, loc) {
    if (error) {
      cb(error);
    } else {
      self.manifest.url = loc;
      cb(null, loc);
    }
  });
};

WebScraper.prototype.scrape = function(cb) {
  this.manifest = {};

  // Create the Workspace directory if it doesn't exist
  if (this.opts.createBaseDir) {
    if (! fs.existsSync(this.opts.basedir)) {
      fs.mkdirSync(this.opts.basedir);
    }
  }

  FetchUrl(this.opts.url,
    function(html) {
      this.queueAndSaveAssets(html,
        function(fixedHtml) {
          this.savePage(fixedHtml, function(err, loc) {
            if (err) {
              cb(err);
            } else {
              cb(null, this.manifest);
            }
          });
        },
        function(err) {
          cb(err);
        }
      );
    }, function(err) {
      cb(err);
    },
    'utf-8',
    this
  );
};

module.exports = WebScraper;
