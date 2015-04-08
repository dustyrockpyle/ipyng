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
    link: function(scope, element, attrs, ctrls){
      ctrls[0].init(ctrls[1]);
    },
    bindToController: true,
    controller: 'ipyCodeareaCtrl',
    controllerAs: 'ctrl'
  };
}

function ipyCodeareaCtrl ($scope, $document, $window, $element, ipyUtils, _) {
  var self = this;
  self.ready = false;
  self.completions = [];
  self.showCompletions = false;
  self.completionsStyle = '';
  self.init = init;

  var completeId = 0,
    completeResult,
    cursorPosition,
    resetFlag,
    completionMap,
    completionNode = _.last($element.find('ul')),
    cmNode;

  // Update position when window resizes
  $window.addEventListener('resize', applyUpdatePosition);
  // clean up the completion node from the document body and remove event listener
  $scope.$on('$destroy', function(){
    $document[0].body.removeChild(completionNode);
    $window.removeEventListener('resize', applyUpdatePosition)
  });

  function init(kernel){
    self.kernel = kernel;
    self.cmOptions = {
      mode: self.kernel.language_info.name,
      onLoad: onCodeMirrorLoad
    };
    resetCompletions();
    self.ready = true;
    $document[0].body.appendChild(completionNode);
  }

  function onCodeMirrorLoad (cm) {
    if(self.onLoad) self.onLoad({cm: cm});
    cmNode = $element.find('div')[1];
    self.cm = cm;
    cm.setOption('extraKeys', {
      'Ctrl-Space': function(event) {
        console.log('got to here');
        event.preventDefault();
        resetCompletions();
        fetchCompletions
          .then(updateDisplay);
      }
    });

    var change = false;
    cm.on('change', function(r, d){
      change = true;
      checkChange(d);
    });

    cm.on('blur', function(){
      resetCompletions();
    });

    // If there's a cursor event without an associated change, reset completions.
    cm.on('cursorActivity', function(){
      if(change) change = false;
      else resetCompletions();
    });
  }

  function checkChange(change) {
    cursorPosition = ipyUtils.to_absolute_cursor_pos(self.cm);

    // If the change wasn't an insertion or deletion, don't try to handle it
    if(change.origin != '+delete' && change.origin != '+input') {
      resetCompletions();
      return;
    }

    // If we've edited multiple lines, just reset all completion data
    if(change.text.length > 1 || change.removed.length > 1) {
      resetCompletions();
      return;
    }

    // Limit automatic updates to 100 results.
    var changeUpdate = _.partial(updateDisplay, 100, change);
    var text = change.text[0];
    var removed = change.removed[0];
    // when typing a space, or backspacing a bunch, reset completions, but don't update
    if(_.contains(text, ' ') || (completeResult && cursorPosition <= completeResult.cursor_start)) {
      resetCompletions();
    }
    // if we've typed a period, or backed up before the start of completion data
    // reset completions, get the new ones, and update the display.
    else if(_.contains(text, '.') || _.contains(removed, '.')) {
      resetCompletions();
      fetchCompletions()
        .then(changeUpdate);
    }
    // If we're reset, we need to get completions then update the display
    else if (resetFlag) {
      fetchCompletions()
        .then(changeUpdate);
    }
    // If we're not reset, then we can just update the display.
    else {
      changeUpdate();
    }
  }

  function resetCompletions () {
    completeResult = null;
    completionMap = {};
    self.showCompletions = false;
    self.completions = [];
    resetFlag = true;
  }

  function fetchCompletions () {
    resetFlag = false;
    completeId += 1;
    var thisId = completeId;
    return self.kernel.complete(self.cm.getValue(), cursorPosition)
      .then(function(result){
        // If this isn't the latest complete request,
        // or reset state has been set then don't update
        if(thisId != completeId || resetFlag) return;
        if(result.matches.length) {
          // Strip the dots from the completion
          var pIndex = result.matches[0].lastIndexOf('.');
          if(pIndex != -1){
            result.matches = _.map(result.matches, function(s) {
              return s.slice(pIndex+1);
            });
            result.cursor_start += pIndex + 1;
          }
        }
        completeResult = result;
      });
  }

  function updateDisplay () {
    if(!completeResult) {
      self.completions = [];
      self.showCompletions = false;
      return;
    }
    self.completions = getCompletions();
    if(self.completions.length == 0){
      self.showCompletions = false;
      return;
    }
    if(!self.showCompletions) {
      self.showCompletions = true;
      updatePosition();
    }
  }

  function getCompletions () {
    var fragment = self.cm.getValue().slice(completeResult.cursor_start, cursorPosition);
    // Prime the completion map if empty.
    if(_.size(completionMap) == 0) completionMap[''] = completeResult.matches;
    if(completionMap[fragment]) return completionMap[fragment];
    var keys = _.keys(completionMap);
    // Find the fragment that most closely matches
    var match = '';
    _.forEach(keys, function(key){
      if(key.length > fragment.length) return;
      if(key.length >= match.length && _.startsWith(fragment, key)) match = key;
    });
    var previousFragment = fragment.slice(0, match.length);
    _.forEach(fragment.slice(match.length), function(c){
      var newFragment = previousFragment + c;
      var newPos = newFragment.length - 1;
      completionMap[newFragment] = _.filter(completionMap[previousFragment], function(completion){
        return completion[newPos] == c;
      });
      previousFragment = newFragment;
    });
    return completionMap[fragment];
  }

  function updatePosition () {
    var cursor = ipyUtils.from_absolute_cursor_pos(self.cm, completeResult.cursor_start);
    var pos = self.cm.charCoords(cursor, 'window');
    self.completionsStyle = {
      position: 'absolute',
      top: pos.bottom + 'px',
      left: pos.left + 'px'
    };
  }

  function applyUpdatePosition (){
    if(self.showCompletions) {
      $scope.$apply(function(){
        updatePosition();
      });
    }
  }
}