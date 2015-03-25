// The goal here is to create a generic debugger directive that can be configured
// to use different debug controllers for different languages.
// But... so far I've only bothered to write one for pdb.

angular.module('ipy.debugger', ['ipyng', 'ng.lodash', 'ui.codemirror', 'ipy.pdb'])
  .constant('debugControllers', {
    python: 'pdbCtrl'
  })
  .directive('debugger', function ($controller, debugControllers) {
    return {
      templateUrl: 'debugger.tpl.html',
      restrict: 'E',
      require: '^kernel',
      $scope: {},
      link: function (scope, element, attrs, kernel) {
        console.log(kernel);
        var code = "def f(x):\n" +
          "    if x == 5:\n" +
          "        raise ValueError(5)\n" +
          "    return f(x+1)\n" +
          "f(1)";
        var controllerId = debugControllers[kernel.language_info.name];
        var controller = $controller(controllerId, {$scope: scope, kernel: kernel});
        kernel.execute(code)
          .then(function(result){
            controller.start();
          });
        //controller.start(code);
        scope.goToFrame = function(index) {
          scope.currentFrame = index;
        };
        // controller.start(code);
      }
    };
  })
;