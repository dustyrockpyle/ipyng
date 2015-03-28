angular.module('ipy.result-area', ['ipyng', 'templates', 'ng.lodash'])
  .directive('resultArea', function (ipyUtils) {
    return {
      templateUrl: 'result-area.tpl.html',
      restrict: 'E',
      scope: {
        result: '='
      },
      link: function (scope, element) {
        var div = element[0];
        scope.type = null;
        scope.$watch('result', function(result){
          if(!result) return;
          if(result.status == 'error'){
            scope.type = 'error';
            var s = result.traceback.join('\n');
            scope.error = ipyUtils.fixConsole(s);
            return;
          }
          if(!result.data) return;
          if(result.data['text/html']){
            scope.type = 'html';
            scope.html = result.data['text/html'];
          }
          else if(result.data['image/png']){
            scope.type = 'image';
            scope.imgSrc = 'data:image/png;base64,' + result.data['image/png'];
          }
          else if(result.data['text/plain']){
            scope.type = 'text';
            scope.text = result.data['text/plain'];
          }
          else{
            scope.type = '';
          }
        });
      }
    };
  })
  .directive('compileHtml', function($compile){
    return {
      template: '<div></div>',
      restrict: 'E',
      scope: {
        html: '='
      },
      link: function (scope, element) {
        scope.$watch('html', function(){
          if(!scope.html) return;
          element.html(scope.html);
          $compile(element.contents())(scope);
        });
      }
    };
  });
