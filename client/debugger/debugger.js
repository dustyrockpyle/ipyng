// The goal here is to create a generic debugger directive that can be configured
// to use different debug controllers for different languages.
// But... so far I've only bothered to write one for pdb.

angular.module('ipy.debugger', ['ipyng', 'ng.lodash', 'ui.codemirror', 'ipy.pdb', 'ipy.watch'])
  .constant('debugControllers', {
    python: 'pdbCtrl'
  })
  // I don't really know if this is a good idea, but it's easy to do and makes everything work nicely.
  .factory('ipyDebugPatch', function(ipyKernel, _){

    var patchedKernels = {};
    var originalEvaluate = ipyKernel.evaluate;
    ipyKernel.evaluate = function(kernelId, expressions) {
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
  .directive('debugger', function ($controller, debugControllers, ipyDebugPatch, $timeout) {
    return {
      templateUrl: 'debugger.tpl.html',
      restrict: 'E',
      require: '^kernel',
      $scope: {},
      link: function (scope, element, attrs, kernel) {
        var code = "def f(x):\n" +
          "    if x == 5:\n" +
          "        raise ValueError(5)\n" +
          "    return f(x+1)\n" +
          "f(1)";
        var controllerId = debugControllers[kernel.language_info.name];
        var controller = $controller(controllerId, {$scope: scope, kernel: kernel});
        kernel.execute(code)
          .then(function(result){
            return controller.start();
          });
        //controller.start(code);
        scope.goToFrame = function(index) {
          scope.currentFrame = index;
          $timeout(scope.refreshLocals, 100);
        };
        // controller.start(code);

        scope.$watch('debuggerStarted', function(started){
          if(started) ipyDebugPatch.patchKernel(kernel.id, controller);
          else ipyDebugPatch.unpatchKernel(kernel.id);
        });

        scope.$on('$destroy', function(){
          controller.quit();
          ipyDebugPatch.unpatchKernel(kernel.id);
        });

      }
    };
  })
;