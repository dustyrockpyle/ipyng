(function(angular) {
  'use strict';

  angular.module('ipy.codearea', ['ipyng', 'templates', 'ui.codemirror', 'ng.lodash'])
    .directive('ipyCodearea', ipyCodeareaDirective)
    .controller('ipyCodeareaCtrl', ipyCodeareaCtrl);

  function ipyCodeareaDirective() {
    return {
      templateUrl: 'ipy-codearea.tpl.html',
      restrict: 'E',
      require: ['ipyCodearea', '^kernel'],
      scope: {
        source: '=',
        onLoad: '&?'
      },
      link: function (scope, element, attrs, ctrls) {
        ctrls[0].init(ctrls[1]);
      },
      bindToController: true,
      controller: 'ipyCodeareaCtrl',
      controllerAs: 'ctrl'
    };
  }

  function ipyCodeareaCtrl($scope, $document, $window, $element, $ipyUtils, _) {
    var self = this;
    self.ready = false;
    self.completions = [];
    self.showCompletions = false;
    self.completionsStyle = '';
    self.init = init;
    self.selected = 0;
    self.select = select;
    self.autocomplete = autocomplete;

    var completeId = 0,
      completeResult,
      cursorPosition,
      resetFlag,
      completionMap,
      completionNode = _.last($element.find('ul')),
      cmNode,
      autocompleteFlag,
      PAGE_JUMP = 6;

    function init(kernel) {
      self.kernel = kernel;
      self.cmOptions = {
        mode: self.kernel.language_info.name,
        onLoad: onCodeMirrorLoad
      };
      resetCompletions();
      self.ready = true;
      // Put the completion node on the document body so it overlays properly
      $document[0].body.appendChild(completionNode);
      // Update position when window resizes
      $window.addEventListener('resize', applyUpdatePosition);
      // Clean up the completion node from the document body and remove event listener on $destroy
      $scope.$on('$destroy', function () {
        $document[0].body.removeChild(completionNode);
        $window.removeEventListener('resize', applyUpdatePosition);
      });
    }

    function onCodeMirrorLoad(cm) {
      if (self.onLoad) self.onLoad({cm: cm});
      cmNode = $element.find('div')[1];
      self.cm = cm;
      cm.setOption('extraKeys', {
        'Ctrl-Space': function () {
          resetCompletions();
          fetchCompletions()
            .then(updateDisplay);
          return false;
        },
        'Up': function () {
          if (self.showCompletions) {
            selectPrevious();
            return false;
          }
          return $window.CodeMirror.Pass;
        },
        'Down': function () {
          if (self.showCompletions) {
            selectNext();
            return false;
          }
          return $window.CodeMirror.Pass;
        },
        'Tab': function () {
          if (self.showCompletions) {
            autocomplete();
            return false;
          }
          return $window.CodeMirror.Pass;
        },
        'Enter': function () {
          if (self.showCompletions) {
            autocomplete();
            return false;
          }
          return $window.CodeMirror.Pass;
        },
        'PageUp': function () {
          if (self.showCompletions) {
            selectPrevious(PAGE_JUMP);
            return false;
          }
          return $window.CodeMirror.Pass;
        },
        'PageDown': function () {
          if (self.showCompletions) {
            selectNext(PAGE_JUMP);
            return false;
          }
        }
      });

      cm.on('keydown', function (doc, event) {
        // Should probably be able to do this in a Keymap... but can't seem to get it to work properly
        // with ipy-notebook.
        if (event.keyCode == 27 && self.showCompletions) { // esc
          self.showCompletions = false;
          event.preventDefault();
          event.stopPropagation();
          $scope.$apply();
        }
      });

      cm.on('blur', function () {
        resetCompletions();
      });

      var changeFlag = false;
      cm.on('change', function (r, d) {
        changeFlag = true;
        checkChange(d);
      });

      // If there's a cursor event without an associated change, reset completions.
      cm.on('cursorActivity', function () {
        if (changeFlag) changeFlag = false;
        else resetCompletions();
      });
    }

    function checkChange(change) {
      cursorPosition = $ipyUtils.to_absolute_cursor_pos(self.cm);

      // if we just autocompleted, don't mess with the state it's set
      if (autocompleteFlag) {
        autocompleteFlag = false;
        return;
      }

      // If the change wasn't an insertion or deletion, don't try to handle it
      if (change.origin != '+delete' && change.origin != '+input') {
        resetCompletions();
        return;
      }

      // If we've edited multiple lines, just reset all completion data
      if (change.text.length > 1 || change.removed.length > 1) {
        resetCompletions();
        return;
      }

      var text = change.text[0];
      var removed = change.removed[0];
      // when typing a space, or backspacing a bunch, reset completions, but don't update
      if (_.contains(text, ' ') || (completeResult && cursorPosition <= completeResult.cursor_start)) {
        resetCompletions();
      }
      // if we've typed a period, or backed up before the start of completion data
      // reset completions, get the new ones, and update the display.
      else if (_.contains(text, '.') || _.contains(removed, '.')) {
        resetCompletions();
        fetchCompletions()
          .then(updateDisplay);
      }
      // If we're reset, we need to get completions then update the display
      else if (resetFlag) {
        fetchCompletions()
          .then(updateDisplay);
      }
      // If we're not reset, then we can just update the display.
      else {
        updateDisplay();
      }
    }

    function resetCompletions() {
      completeResult = null;
      completionMap = {};
      self.showCompletions = false;
      self.completions = [];
      resetFlag = true;
      autocompleteFlag = false;
      self.selected = 0;
    }

    function fetchCompletions() {
      resetFlag = false;
      completeId += 1;
      var thisId = completeId;
      return self.kernel.complete(self.cm.getValue(), cursorPosition)
        .then(function (result) {
          // If this isn't the latest complete request,
          // or reset state has been set then don't update
          if (thisId != completeId || resetFlag) return;
          if (result.matches.length) {
            // Strip the dots from the completion
            var pIndex = result.matches[0].lastIndexOf('.');
            if (pIndex != -1) {
              result.matches = _.map(result.matches, function (s) {
                return s.slice(pIndex + 1);
              });
              result.cursor_start += pIndex + 1;
            }
          }
          completeResult = result;
        });
    }

    function updateDisplay() {
      if (!completeResult) {
        self.completions = [];
        self.showCompletions = false;
        return;
      }
      self.fragment = self.cm.getValue().slice(completeResult.cursor_start, cursorPosition);
      self.completions = getCompletions(self.fragment);
      if (self.completions.length === 0) {
        self.showCompletions = false;
        return;
      }
      if (!self.showCompletions) {
        self.showCompletions = true;
        updatePosition();
      }
    }

    function getCompletions(fragment) {
      // Prime the completion map if empty.
      if (_.size(completionMap) === 0) completionMap[''] = completeResult.matches;
      if (completionMap[fragment]) return completionMap[fragment];
      var keys = _.keys(completionMap);
      // Find the fragment that most closely matches
      var match = '';
      _.forEach(keys, function (key) {
        if (key.length > fragment.length) return;
        if (key.length >= match.length && _.startsWith(fragment, key)) match = key;
      });
      // load the completion map with all fragments between match and fragment
      var previousFragment = fragment.slice(0, match.length);
      _.forEach(fragment.slice(match.length), function (ch) {
        var newFragment = previousFragment + ch;
        completionMap[newFragment] = _(completionMap[previousFragment])
          // Take only the completions where the next character match
          .filter(function (completion) {
            return completion[0] == ch;
          })
          // drop the first character to get the new completion
          .map(function (completion) {
            return completion.slice(1);
          })
          .value();
        previousFragment = newFragment;
      });
      return completionMap[fragment];
    }

    function updatePosition() {
      var cursor = $ipyUtils.from_absolute_cursor_pos(self.cm, completeResult.cursor_start);
      var pos = self.cm.charCoords(cursor, 'window');
      self.completionsStyle = {
        position: 'absolute',
        top: pos.bottom + 'px',
        left: pos.left + 'px'
      };
    }

    function applyUpdatePosition() {
      if (self.showCompletions) {
        $scope.$apply(function () {
          updatePosition();
        });
      }
    }

    function selectNext(num) {
      if (self.selected == self.completions.length - 1) select(0);
      else {
        num = num || 1;
        select(Math.min(self.completions.length - 1, self.selected + num));
      }
    }

    function selectPrevious(num) {
      if (self.selected === 0) select(self.completions.length - 1);
      else {
        num = num || 1;
        select(Math.max(0, self.selected - num));
      }
    }

    var selectTime = null;

    function select(index, $event) {
      // Don't handle the mouseenter selection if
      // it occurs immediately after a keyboard selection
      var newTime = Date.now();
      if ($event) {
        var diff = newTime - selectTime;
        selectTime = null;
        if (diff < 500) return;
      } else {
        selectTime = newTime;
      }
      self.selected = index;
      // scroll to the li if it's out of the visible range
      var li = completionNode.getElementsByTagName('li')[index];
      var liTop = li.offsetTop,
        liBottom = liTop + li.clientHeight,
        ulTop = completionNode.scrollTop,
        ulHeight = completionNode.clientHeight,
        ulBottom = ulTop + ulHeight;
      if (liTop < ulTop) {
        completionNode.scrollTop = liTop;
      } else if (liBottom > ulBottom) {
        completionNode.scrollTop = liBottom - ulHeight;
      }
    }

    function autocomplete($event) {
      if ($event) {
        // stop CodeMirror from losing focus when a completion is clicked.
        $event.preventDefault();
        $event.stopImmediatePropagation();
      }
      self.cm.replaceSelection(self.completions[self.selected]);
      autocompleteFlag = true;
      self.showCompletions = false;
    }
  }
})(angular);