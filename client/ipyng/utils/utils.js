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

    return {
      url_path_join : url_path_join,
      to_absolute_cursor_pos : to_absolute_cursor_pos,
      from_absolute_cursor_pos : from_absolute_cursor_pos
    };
  })
;