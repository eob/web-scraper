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

function WebScraper = function(opts) {
  self.opts = opts;
  if (typeof self.opts.basedir == 'undefined') {
    self.opts.basedir = '.';
  }
};

WebScraper.prototype.endsWith(s, suffix) {
  return s.indexOf(suffix, s.length - suffix.length) !== -1;
}

WebScraper.prototype.filenameForUrl = function(url, kind) {
  var uri = new WebScraper.Uri(url);
  var parts = uri.path().split("/");
  var filename = parts[parts.length - 1];
  if ((filename === null) || (filename.length === 0)) {
    var d = new Date();
    filename = "AutoGen_" + d.getTime();
  }

  if ((kind == 'html') && (! WebScraper.endsWith(filename, '.html'))) {
    filename = filename + '.html';
  } else if ((kind == 'js') && (! WebScraper.endsWith(filename, '.js'))) {
    filename = filename + '.js';
  } else if ((kind == 'css') && (! WebScraper.endsWith(filename, '.css'))) {
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
       (e.attr('rel') == 'stylesheets')
    )
  );
}

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
  if (jqElem.is('link')) {
    ret.binary = false;
    ret.url = jqElem.attr('href');

    // Determine type.
    if (WebScraper.isCssLink(jqElem)) {
      ret.type = 'css';
      ret.localUrl = 'css/' + WebScraper.filenameForUrl(ret.url);
    } else {
      ret.type = 'other';
      ret.localUrl = 'other/' = WebScraper.filenameForUrl(ret.url);
    }
    if (fixToo) {
      jqElem.attr('href', ret.localUrl);
    }
  } else if (jqElem.is('img')) {
    ret.binary = true;
    ret.url = jqElem.attr('src');
    ret.type = 'image';
    ret.localUrl = 'images/' + WebScraper.filenameForUrl(ret.url);
    if (fixToo) {
      jqElem.attr('src', ret.localUrl);
    }
  } else if (jqElem.is('script')) {
    ret.binary = false;
    ret.url = jqElem.attr('src');
    if (_.isUndefined(ret.url) || ret.url === null || ret.url == '') {
      ret = null;
    } else {
      ret.type = 'js';
      ret.localUrl = 'js/' + WebScraper.filenameForUrl(ret.url);
      if (fixToo) {
        jqElem.attr('src', ret.localUrl);
      }
    }
  }
  return ret;
}

/**
 * Rewrites HTML such that all images are
 */
WebScraper.prototype.queueAndSaveAssets = function(html, success, failure) {
  this.assetQueue = [];
  var self = this;

  var considerElement(elem) {
    var fileSpec = self.extractFilespec($(elem), true);
    if (fileSpec !== null) {
      self.assetQueue.push(fileSpec);
    }
  }

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
        _.each($('img'), function(elem) { considerElement(elem) });
        _.each($('script'), function(elem) { considerElement(elem) });
        _.each($('link'), function(elem) { considerElement(elem) });
        // Stash 'em away. Thar be ajax acomin'.
        self.fixedHtml = window.document.documentElement.innerHTML;
        self.queueAndSaveSuccess = success;
        self.queueAndSaveFailure = failure;
        self.saveAsset();
      } // if no errors
    } // done
  });
};

WebScraper.saveAsset = function() {
  if (this.assetQueue.length == 0) {
    this.queueAndSaveSuccess();
  } else {
    // pop one off
    var asset = this.assetQueue[0];
    FetchUrl(asset.url, this.saveAssetSuccess, this.saveAssetFailure, undefined, this);
  }
};

WebScraper.saveAssetSuccess = function(data) {
  var asset = this.assetQueue.shift();
  try {
    fs.writeFileSync(path.join(self.opts.basedir, asset.localUrl), data, "utf8");
  } catch (e) {
    // Soft failure
  }
  this.saveAsset();
};

WebScraper.saveAssetFailure = function() {
  // Well.. nothing much can be done. We're not going to
  // hard fail here because so many sites have broken links.
  this.assetQueue.shift();
  this.saveAsset();
}

WebScraper.prototype.savePage = function(html) {
  fs.writeFileSync(path.join(self.opts.basedir, self.opts.filename), html, "utf8");
};

/*
 * opts.filename  -  Name of html file to save to
 * opts.basedir   -  Base directory in which to extract
 */
WebScraper.prototype.scrape = function(succes, failure) {
  FetchUrl(self.opts.url,
    function(html) {
      this.queueAndSaveAssets(html,
        function(fixedHtml) {
          this.savePage(fixedHtml, opts);
          success();
        },
        function(err) {
          failure(err);
        }
      );
    }, function(err) {
      failure(err);
    },
    'utf-8',
    this
  );
};

module.exports = WebScraper;
