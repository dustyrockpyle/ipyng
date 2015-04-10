// The goal here is to create a generic debugger directive that can be configured
// to use different debug controllers for different languages.
// But... so far I've only bothered to write one for pdb.

angular.module('ipy.debugger', ['ipyng', 'ng.lodash', 'ui.codemirror', 'ipy.pdb', 'ipy.watch'])
  .constant('debugControllers', {
    python: 'pdbCtrl'
  })
  // I don't really know if this is a good idea, but it's easy to do and makes everything work nicely.
  .factory('$ipyDebugPatch', function($ipyKernel){

    var patchedKernels = {};
    var originalEvaluate = $ipyKernel.evaluate;
    $ipyKernel.evaluate = function(kernelId, expressions) {
      var controller = patchedKernels[kernelId];

      if(controller) return controller.evaluate(expressions);
      return originalEvaluate(kernelId, expressions);
    };

    return {
      patchKernel: function(kernelId, controller) {
        patchedKernels[kernelId] = controller;
      },
      unpatchKernel: function(kernelId) {
        delete patchedKernels[kernelId];
      }
    };
  })
  .directive('ipyDebugger', function ($controller, debugControllers, $ipyDebugPatch, $q, $timeout, _) {
    return {
      templateUrl: 'ipy-debugger.tpl.html',
      restrict: 'E',
      require: '^kernel',
      $scope: {},
      link: function (scope, element, attrs, kernel) {
        var language = kernel.language_info.name;
        var controllerId = debugControllers[language];
        var controller = $controller(controllerId, {$scope: scope, kernel: kernel});
        var cmDeferred = $q.defer();
        var cmPromise = cmDeferred.promise;
        var context = {};
        scope.context = context;
        context.error = null;

        controller.start()
          .catch(function(error){
            context.error = error;
            return $q.reject(error);
          })
          .then(function(){
            context.error = null;
            scope.goToFrame(0);
          });
        scope.goToFrame = function(index) {
          controller.goToFrame(index)
            .then(function(){
              // refresh the locals watcher
              context.refreshLocals();
              // Wait for codemirror source to update... I'm sure there's an event in codemirror that I can listen
              // for and then resolve after the change, but 50ms seems to work for now.
              return $timeout(_.noop, 50);
            })
            .then(function(){
              scrollToCurrent();
            });
        };
        // controller.start(code);

        var onCodeMirrorLoad = function(instance) {
          cmDeferred.resolve(instance);
        };

        scope.cmOptions = {
          mode: language,
          lineNumbers: true,
          readOnly: true,
          onLoad: onCodeMirrorLoad
        };

        var highlightedLine = null;
        var scrollToCurrent = function(){
          cmPromise
            .then(function(cm){
              var d = scope.debugger;
              var line = d.stack[d.currentFrame].lineNumber - 1;
              var height = cm.getScrollInfo().clientHeight;
              var coords = cm.charCoords({line: line, ch: 0}, "local");
              var scrollPos = (coords.top + coords.bottom - height) / 2;
              if(highlightedLine) cm.removeLineClass(highlightedLine, 'background', null);
              cm.addLineClass(line, 'background', 'debugger-highlight');
              highlightedLine = line;
              cm.scrollTo(null, scrollPos);
            });
        };

        scope.$watch('debugger.started', function(started){
          if(started) $ipyDebugPatch.patchKernel(kernel.id, controller);
          else {
            $ipyDebugPatch.unpatchKernel(kernel.id);
            cmDeferred = $q.defer();
            cmPromise = cmDeferred.promise;
          }
        });

        scope.$on('$destroy', function(){
          controller.quit();
          $ipyDebugPatch.unpatchKernel(kernel.id);
        });

      }
    };
  })
;