angular.module('test', [
  'ipyng',
  'templates',
  'ng.lodash',
  'ipy.codecell',
  'ipy.psutil',
  'ipy.watch',
  'ipy.debugger',
  'test.routes'
])
  .config(function($provide){
    $provide.decorator('ipyMessageHandler', function($delegate, $injector){
      var iopub = $delegate.handleIopubMessage;
      var shell = $delegate.handleShellReply;
      $delegate.handleIopubMessage = function(message){
        var $log = $injector.get('$log');
        var ipyMessage = $injector.get('ipyMessage');
        $log.log('Iopub ' + ipyMessage.getMessageType(message) + ' Message:');
        $log.log(message);
        return iopub(message);
      };
      $delegate.handleShellReply = function(message){
        var $log = $injector.get('$log');
        var ipyMessage = $injector.get('ipyMessage');
        $log.log('Shell ' + ipyMessage.getMessageType(message) + ' Message:');
        $log.log(message);
        return shell(message);
      };
      return $delegate;
    });
  });