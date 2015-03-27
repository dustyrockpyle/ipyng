angular.module('ipyng.utils', [])
  .factory('ipyUtils', function () {
    var url_path_join = function () {
      // join a sequence of url components with '/'
      var url = '';
      for (var i = 0; i < arguments.length; i++) {
        if (arguments[i] === '') {
          continue;
        }
        if (url.length > 0 && url[url.length-1] != '/') {
          url = url + '/' + arguments[i];
        } else {
          url = url + arguments[i];
        }
      }
      url = url.replace(/\/\/+/, '/');
      return url;
    };


    var to_absolute_cursor_pos = function (cm, cursor) {
      // get the absolute cursor position from CodeMirror's col, ch
      if (!cursor) {
        cursor = cm.getCursor();
      }
      var cursor_pos = cursor.ch;
      for (var i = 0; i < cursor.line; i++) {
        cursor_pos += cm.getLine(i).length + 1;
      }
      return cursor_pos;
    };

    var from_absolute_cursor_pos = function (cm, cursor_pos) {
      // turn absolute cursor postion into CodeMirror col, ch cursor
      var i, line;
      var offset = 0;
      for (i = 0, line=cm.getLine(i); line !== undefined; i++, line=cm.getLine(i)) {
        if (offset + line.length < cursor_pos) {
          offset += line.length + 1;
        } else {
          return {
            line : i,
            ch : cursor_pos - offset
          };
        }
      }
      // reached end, return endpoint
      return {
        ch : line.length - 1,
        line : i - 1
      };
    };

    /**
     * Splits a string into an array of strings using a regex or string
     * separator. Matches of the separator are not included in the result array.
     * However, if `separator` is a regex that contains capturing groups,
     * backreferences are spliced into the result each time `separator` is
     * matched. Fixes browser bugs compared to the native
     * `String.prototype.split` and can be used reliably cross-browser.
     * @param {String} str String to split.
     * @param {RegExp} separator Regex to use for separating
     *     the string.
     * @param {Number} [limit] Maximum number of items to include in the result
     *     array.
     * @returns {Array} Array of substrings.
     * @example
     *
     * // Basic use
     * regex_split('a b c d', ' ');
     * // -> ['a', 'b', 'c', 'd']
     *
     * // With limit
     * regex_split('a b c d', ' ', 2);
     * // -> ['a', 'b']
     *
     * // Backreferences in result array
     * regex_split('..word1 word2..', /([a-z]+)(\d+)/i);
     * // -> ['..', 'word', '1', ' ', 'word', '2', '..']
     */
    var regex_split = function (str, separator, limit) {
        var output = [],
            flags = (separator.ignoreCase ? "i" : "") +
                    (separator.multiline  ? "m" : "") +
                    (separator.extended   ? "x" : "") + // Proposed for ES6
                    (separator.sticky     ? "y" : ""), // Firefox 3+
            lastLastIndex = 0,
            separator2, match, lastIndex, lastLength;
        // Make `global` and avoid `lastIndex` issues by working with a copy
        separator = new RegExp(separator.source, flags + "g");

        var compliantExecNpcg = typeof(/()??/.exec("")[1]) === "undefined";
        if (!compliantExecNpcg) {
            // Doesn't need flags gy, but they don't hurt
            separator2 = new RegExp("^" + separator.source + "$(?!\\s)", flags);
        }
        /* Values for `limit`, per the spec:
         * If undefined: 4294967295 // Math.pow(2, 32) - 1
         * If 0, Infinity, or NaN: 0
         * If positive number: limit = Math.floor(limit); if (limit > 4294967295) limit -= 4294967296;
         * If negative number: 4294967296 - Math.floor(Math.abs(limit))
         * If other: Type-convert, then use the above rules
         */
        limit = typeof(limit) === "undefined" ?
            -1 >>> 0 : // Math.pow(2, 32) - 1
            limit >>> 0; // ToUint32(limit)
        for (match = separator.exec(str); match; match = separator.exec(str)) {
            // `separator.lastIndex` is not reliable cross-browser
            lastIndex = match.index + match[0].length;
            if (lastIndex > lastLastIndex) {
                output.push(str.slice(lastLastIndex, match.index));
                // Fix browsers whose `exec` methods don't consistently return `undefined` for
                // nonparticipating capturing groups
                if (!compliantExecNpcg && match.length > 1) {
                    match[0].replace(separator2, function () {
                        for (var i = 1; i < arguments.length - 2; i++) {
                            if (typeof(arguments[i]) === "undefined") {
                                match[i] = undefined;
                            }
                        }
                    });
                }
                if (match.length > 1 && match.index < str.length) {
                    Array.prototype.push.apply(output, match.slice(1));
                }
                lastLength = match[0].length;
                lastLastIndex = lastIndex;
                if (output.length >= limit) {
                    break;
                }
            }
            if (separator.lastIndex === match.index) {
                separator.lastIndex++; // Avoid an infinite loop
            }
        }
        if (lastLastIndex === str.length) {
            if (lastLength || !separator.test("")) {
                output.push("");
            }
        } else {
            output.push(str.slice(lastLastIndex));
        }
        return output.length > limit ? output.slice(0, limit) : output;
    };

    //============================================================================
    // End contributed Cross-browser RegEx Split
    //============================================================================


    var uuid = function () {
        /**
         * http://www.ietf.org/rfc/rfc4122.txt
         */
        var s = [];
        var hexDigits = "0123456789ABCDEF";
        for (var i = 0; i < 32; i++) {
            s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
        }
        s[12] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
        s[16] = hexDigits.substr((s[16] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01

        var uuid = s.join("");
        return uuid;
    };


    //Fix raw text to parse correctly in crazy XML
    function xmlencode(string) {
        return string.replace(/\&/g,'&'+'amp;')
            .replace(/</g,'&'+'lt;')
            .replace(/>/g,'&'+'gt;')
            .replace(/\'/g,'&'+'apos;')
            .replace(/\"/g,'&'+'quot;')
            .replace(/`/g,'&'+'#96;');
    }


    //Map from terminal commands to CSS classes
    var ansi_colormap = {
        "01":"ansibold",

        "30":"ansiblack",
        "31":"ansired",
        "32":"ansigreen",
        "33":"ansiyellow",
        "34":"ansiblue",
        "35":"ansipurple",
        "36":"ansicyan",
        "37":"ansigray",

        "40":"ansibgblack",
        "41":"ansibgred",
        "42":"ansibggreen",
        "43":"ansibgyellow",
        "44":"ansibgblue",
        "45":"ansibgpurple",
        "46":"ansibgcyan",
        "47":"ansibggray"
    };

    function _process_numbers(attrs, numbers) {
        // process ansi escapes
        var n = numbers.shift();
        if (ansi_colormap[n]) {
            if ( ! attrs["class"] ) {
                attrs["class"] = ansi_colormap[n];
            } else {
                attrs["class"] += " " + ansi_colormap[n];
            }
        } else if (n == "38" || n == "48") {
            // VT100 256 color or 24 bit RGB
            if (numbers.length < 2) {
                console.log("Not enough fields for VT100 color", numbers);
                return;
            }

            var index_or_rgb = numbers.shift();
            var r,g,b;
            if (index_or_rgb == "5") {
                // 256 color
                var idx = parseInt(numbers.shift(), 10);
                if (idx < 16) {
                    // indexed ANSI
                    // ignore bright / non-bright distinction
                    idx = idx % 8;
                    var ansiclass = ansi_colormap[n[0] + (idx % 8).toString()];
                    if ( ! attrs["class"] ) {
                        attrs["class"] = ansiclass;
                    } else {
                        attrs["class"] += " " + ansiclass;
                    }
                    return;
                } else if (idx < 232) {
                    // 216 color 6x6x6 RGB
                    idx = idx - 16;
                    b = idx % 6;
                    g = Math.floor(idx / 6) % 6;
                    r = Math.floor(idx / 36) % 6;
                    // convert to rgb
                    r = (r * 51);
                    g = (g * 51);
                    b = (b * 51);
                } else {
                    // grayscale
                    idx = idx - 231;
                    // it's 1-24 and should *not* include black or white,
                    // so a 26 point scale
                    r = g = b = Math.floor(idx * 256 / 26);
                }
            } else if (index_or_rgb == "2") {
                // Simple 24 bit RGB
                if (numbers.length > 3) {
                    console.log("Not enough fields for RGB", numbers);
                    return;
                }
                r = numbers.shift();
                g = numbers.shift();
                b = numbers.shift();
            } else {
                console.log("unrecognized control", numbers);
                return;
            }
            if (r !== undefined) {
                // apply the rgb color
                var line;
                if (n == "38") {
                    line = "color: ";
                } else {
                    line = "background-color: ";
                }
                line = line + "rgb(" + r + "," + g + "," + b + ");";
                if ( !attrs.style ) {
                    attrs.style = line;
                } else {
                    attrs.style += " " + line;
                }
            }
        }
    }

    function ansispan(str) {
        // ansispan function adapted from github.com/mmalecki/ansispan (MIT License)
        // regular ansi escapes (using the table above)
        var is_open = false;
        return str.replace(/\033\[(0?[01]|22|39)?([;\d]+)?m/g, function(match, prefix, pattern) {
            if (!pattern) {
                // [(01|22|39|)m close spans
                if (is_open) {
                    is_open = false;
                    return "</span>";
                } else {
                    return "";
                }
            } else {
                is_open = true;

                // consume sequence of color escapes
                var numbers = pattern.match(/\d+/g);
                var attrs = {};
                while (numbers.length > 0) {
                    _process_numbers(attrs, numbers);
                }

                var span = "<span ";
                Object.keys(attrs).map(function (attr) {
                    span = span + " " + attr + '="' + attrs[attr] + '"';
                });
                return span + ">";
            }
        });
    }

    // Transform ANSI color escape codes into HTML <span> tags with css
    // classes listed in the above ansi_colormap object. The actual color used
    // are set in the css file.
    function fixConsole(txt) {
        txt = xmlencode(txt);

        // Strip all ANSI codes that are not color related.  Matches
        // all ANSI codes that do not end with "m".
        var ignored_re = /(?=(\033\[[\d;=]*[a-ln-zA-Z]{1}))\1(?!m)/g;
        txt = txt.replace(ignored_re, "");

        // color ansi codes
        txt = ansispan(txt);
        return txt;
    }

    // Remove chunks that should be overridden by the effect of
    // carriage return characters
    function fixCarriageReturn(txt) {
        var tmp = txt;
        do {
            txt = tmp;
            tmp = txt.replace(/\r+\n/gm, '\n'); // \r followed by \n --> newline
            tmp = tmp.replace(/^.*\r+/gm, '');  // Other \r --> clear line
        } while (tmp.length < txt.length);
        return txt;
    }

    // Locate any URLs and convert them to a anchor tag
    function autoLinkUrls(txt) {
        return txt.replace(/(^|\s)(https?|ftp)(:[^'">\s]+)/gi,
            "$1<a target=\"_blank\" href=\"$2$3\">$2$3</a>");
    }

    var points_to_pixels = function (points) {
        /**
         * A reasonably good way of converting between points and pixels.
         */
        var test = $('<div style="display: none; width: 10000pt; padding:0; border:0;"></div>');
        $('body').append(test);
        var pixel_per_point = test.width()/10000;
        test.remove();
        return Math.floor(points*pixel_per_point);
    };

    var always_new = function (constructor) {
        /**
         * wrapper around contructor to avoid requiring `var a = new constructor()`
         * useful for passing constructors as callbacks,
         * not for programmer laziness.
         * from http://programmers.stackexchange.com/questions/118798
         */
        return function () {
            var obj = Object.create(constructor.prototype);
            constructor.apply(obj, arguments);
            return obj;
        };
    };


    return {
      url_path_join : url_path_join,
      to_absolute_cursor_pos : to_absolute_cursor_pos,
      from_absolute_cursor_pos : from_absolute_cursor_pos,
      fixConsole: fixConsole,
      fixCarriageReturn: fixCarriageReturn,
      autoLinkUrls: autoLinkUrls,
      xmlencode: xmlencode
    };
  })
  .directive('resizable', function($timeout){
    return {
      replace: true,
      restrict: 'A',
      link: function (scope, element) {
        // Resizable options. Should make this configurable.
        var options = {
          autoHide: true,
          aspectRatio: true
        };
        // wait 50 ms before applying resize so the element gets its original size
        $timeout(function(){
          element.resizable(options);
        }, 50);
      }
    };
  });
