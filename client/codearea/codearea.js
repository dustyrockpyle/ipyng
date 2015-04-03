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

function ipyCodeareaCtrl ($scope, $element, ipyUtils, $q, _) {
  var self = this;
  self.ready = false;
  self.completions = [];
  self.showCompletions = false;
  self.completionsStyle = '';
  self.init = init;

  var fetchCount = 0,
    completeResult = [],
    fetchPosition = null,
    resetFlag = null;

  function init(kernel){
    self.kernel = kernel;
    self.cmOptions = {
      mode: self.kernel.language_info.name,
      onLoad: onCodeMirrorLoad
    };
    self.ready = true;
  }

  function onCodeMirrorLoad (cm) {
    if(self.onLoad) self.onLoad({cm: cm});
    self.cm = cm;
    cm.setOption('extraKeys', {
      'Ctrl-Space': function() {
        resetCompletions();
        updateCompletions();
      }
    });

    cm.on('change', function(r, d){
      checkChange(d);
    });
  }

  function checkChange(change) {
    console.log(change);
    // If we've edited multiple lines, just reset all completion data.
    if(change.text.length > 1 || change.removed.length > 1) {
      resetCompletions();
      return;
    }

    var text = change.text[0];
    var removed = change.removed[0];
    if(_.contains(text, ' ')) {
      resetCompletions();
    }

    if(_.contains(removed, ' ')) {
      resetCompletions();
      updateCompletions();
    }

    // if we've typed a period, reset the completions we have, and fetch new ones
    if(_.contains(text, '.') || _.contains(removed, '.')) {
      resetCompletions();
      updateCompletions();
    }
  }

  function resetCompletions () {
    fetchPosition = null;
    completeResult = null;
    self.showCompletions = false;
    self.completions = [];
    resetFlag = true;
  }

  function fetchCompletions () {
    fetchPosition = ipyUtils.to_absolute_cursor_pos(self.cm);
    fetchCount += 1;
    resetFlag = false;
    return self.kernel.complete(self.source, fetchPosition)
      .then(function(result){
        console.log(result);
        fetchCount -= 1;
        return result;
      });
  }

  function updateCompletions () {
    return fetchCompletions()
      .then(function(result){
        if(fetchCount != 0 || resetFlag) return;
        completeResult = result;
        updateDisplay();
      });
  }

  function updateDisplay () {
    if(!completeResult.matches.length) return;
    var first = completeResult.matches[0];
    var pieces = first.split(/\./g);

  }
}