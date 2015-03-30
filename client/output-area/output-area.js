angular.module('ipy.output-area', ['ipyng', 'templates', 'ng.lodash'])
  .directive('outputArea', function (ipyUtils) {
    return {
      templateUrl: 'output-area.tpl.html',
      restrict: 'E',
      scope: {
        output: '='
      },
      link: function (scope, element) {
        var div = element[0];
        scope.type = null;
        scope.$watch('output', function(output){
          if(!output) return;
          if(output.traceback){
            scope.type = 'error';
            var s = output.traceback.join('\n');
            scope.error = ipyUtils.fixConsole(s);
            return;
          }
          if(output.output_type == 'stream'){
            scope.type = 'text';
            scope.text = output.text;
            return
          }
          if(!output.data) return;
          if(output.data['text/html']){
            scope.type = 'html';
            scope.html = output.data['text/html'];
          }
          else if(output.data['image/png']){
            scope.type = 'image';
            scope.imgSrc = 'data:image/png;base64,' + output.data['image/png'];
          }
          else if(output.data['text/plain']){
            scope.type = 'text';
            scope.text = output.data['text/plain'];
          }
          else if(output.text){
            scope.type = 'text';
            scope.text = output.text;
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
