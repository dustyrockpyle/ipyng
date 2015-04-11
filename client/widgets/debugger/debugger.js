// The goal here is to create a generic debugger directive that can be configured
// to use different debug controllers for different languages.
// But... so far I've only bothered to write one for pdb.
(function(angular){
  'use strict';

  angular.module('ipy.debugger', ['ipyng', 'ng.lodash', 'ui.codemirror', 'ipy.pdb', 'ipy.watch'])
    .constant('debugControllers', {
      python: 'pdbCtrl'
    })
    .factory('$ipyDebugPatch', ipyDebugPatchFactory)
    .directive('ipyDebugger', ipyDebuggerDirective)
    .controller('ipyDebuggerCtrl', ipyDebuggerCtrl);


// I don't really know if this is a good idea, but it's easy to do and makes everything work nicely.
  function ipyDebugPatchFactory ($ipyKernel) {
    var $ipyDebugPatch = {
      patchKernel: patchKernel,
      unpatchKernel: unpatchKernel
    };

    var patchedKernels = {},
      originalEvaluate = $ipyKernel.evaluate;
    $ipyKernel.evaluate = evaluate;

    return $ipyDebugPatch;

    function evaluate (kernelId, expressions) {
      var controller = patchedKernels[kernelId];
      if(controller) return controller.evaluate(expressions);
      return originalEvaluate(kernelId, expressions);
    }

    function patchKernel (kernelId, controller) {
      patchedKernels[kernelId] = controller;
    }

    function unpatchKernel (kernelId) {
      delete patchedKernels[kernelId];
    }
  }

  function ipyDebuggerDirective ($controller, debugControllers, $ipyDebugPatch, $q, $timeout, _) {
    return {
      templateUrl: 'ipy-debugger.tpl.html',
      restrict: 'E',
      require: ['ipyDebugger', '^kernel'],
      $scope: {},
      link: function (scope, element, attrs, ctrls) {
        ctrls[0].init(ctrls[1]);
      },
      controller: 'ipyDebuggerCtrl',
      bindToController: true,
      controllerAs: 'ctrl'
    };
  }

  function ipyDebuggerCtrl ($scope, debugControllers, $controller, $ipyDebugPatch, $q, $timeout, _) {
    var self = this,
      debugCtrl,
      cmDeferred = $q.defer(),
      cmPromise = cmDeferred.promise,
      kernel;

    self.error = null;
    self.init = init;
    self.goToFrame = goToFrame;

    function init (kernel_) {
      kernel = kernel_;
      var language = kernel.language_info.name;
      self.cmOptions = {
        mode: language,
        lineNumbers: true,
        readOnly: true,
        onLoad: onCodeMirrorLoad
      };
      debugCtrl = $controller(debugControllers[language], {$scope: $scope, kernel: kernel});

      $scope.debugger = debugCtrl;
      $scope.$watch('debugger.started', onDebugStart);
      $scope.$on('$destroy', close);

      debugCtrl.start()
        .catch(function(error){
          self.error = error;
          return $q.reject(error);
        })
        .then(function(){
          self.error = null;
          goToFrame(0);
        });
    }

    function onCodeMirrorLoad (instance) {
      cmDeferred.resolve(instance);
    }

    function goToFrame (index) {
      debugCtrl.goToFrame(index)
        .then(function(){
          // refreshLocals binds to the locals watch
          self.refreshLocals();
          // Wait for codemirror source to update... I'm sure there's an event in codemirror that I can listen
          // for and then resolve after the change, but 50ms seems to work for now.
          return $timeout(_.noop, 50);
        })
        .then(function(){
          scrollToCurrent();
        });
    }

    var highlightedLine = null;
    function scrollToCurrent (){
      cmPromise
        .then(function(cm){
          var line = debugCtrl.stack[debugCtrl.currentFrame].lineNumber - 1,
            height = cm.getScrollInfo().clientHeight,
            coords = cm.charCoords({line: line, ch: 0}, "local"),
            scrollPos = (coords.top + coords.bottom - height) / 2;
          if(highlightedLine) cm.removeLineClass(highlightedLine, 'background', null);
          cm.addLineClass(line, 'background', 'debugger-highlight');
          highlightedLine = line;
          cm.scrollTo(null, scrollPos);
        });
    }

    function onDebugStart (started) {
      if(started) $ipyDebugPatch.patchKernel(kernel.id, debugCtrl);
      else {
        $ipyDebugPatch.unpatchKernel(kernel.id);
        cmDeferred = $q.defer();
        cmPromise = cmDeferred.promise;
      }
    }

    function close () {
      debugCtrl.quit();
      $ipyDebugPatch.unpatchKernel(kernel.id);
    }
  }
})(angular);